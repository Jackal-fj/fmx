'use server';

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

const MAX_APPEND = 10;

// FMX-037: tiny inline control on the defect detail page so an FM can set or
// change `defects.trade` without having to go through /update-defect (which
// insists on a status change + photo evidence). Used mainly to backfill the
// ~60 defects the FMX-021 classifier couldn't confidently tag.
export async function setDefectTrade(
  defectNumber: string,
  trade: string,
  secretKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) {
    return { ok: false, error: 'Not authorised.' };
  }
  const clean = (trade || '').trim();
  const { error } = await supabaseServer
    .from('defects')
    .update({ trade: clean || null })
    .eq('defect_number', defectNumber);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath(`/defects/${defectNumber}`);
  revalidatePath('/defects');
  return { ok: true };
}

// FMX-013: append photos to an existing defect (e.g. tenant-forwarded email
// defect that needs on-site evidence added later). Uploads to the shared
// defect-photos bucket and appends URLs to defects.photo_urls — never
// replaces existing photos. Resolved defects are read-only.
export async function appendDefectPhotos(
  formData: FormData,
): Promise<{ ok: boolean; added?: number; error?: string }> {
  const defectId = (formData.get('defect_id') as string || '').trim();
  const defectNumber = (formData.get('defect_number') as string || '').trim();
  const key = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) return { ok: false, error: 'Not authorised.' };
  if (!defectId) return { ok: false, error: 'Missing defect id.' };

  // Confirm the defect exists and isn't resolved (read-only once closed).
  const { data: defect, error: defErr } = await supabaseServer
    .from('defects')
    .select('id, defect_number, status, photo_urls')
    .eq('id', defectId)
    .maybeSingle();
  if (defErr || !defect) return { ok: false, error: 'Defect not found.' };
  if (defect.status === 'resolved') {
    return { ok: false, error: 'Resolved defects are read-only.' };
  }

  const files = formData.getAll('photos').filter(
    (v): v is File => v instanceof File && v.size > 0,
  );
  if (files.length === 0) return { ok: false, error: 'No photos selected.' };
  if (files.length > MAX_APPEND) return { ok: false, error: `Max ${MAX_APPEND} photos per upload.` };

  const existing: string[] = Array.isArray(defect.photo_urls) ? defect.photo_urls : [];
  const ts = Date.now();
  const added: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.type === 'image/png' ? 'png'
              : f.type === 'image/webp' ? 'webp'
              : 'jpg';
    const path = `${defect.id}/${ts}-${existing.length + i + 1}.${ext}`;
    const buffer = new Uint8Array(await f.arrayBuffer());
    const { error: upErr } = await supabaseServer.storage
      .from('defect-photos')
      .upload(path, buffer, { contentType: f.type, upsert: false });
    if (upErr) {
      console.error('Append-photo upload failed:', upErr);
      continue;
    }
    const { data: urlData } = supabaseServer.storage
      .from('defect-photos')
      .getPublicUrl(path);
    added.push(urlData.publicUrl);
  }

  if (added.length === 0) {
    return { ok: false, error: 'Upload failed for every photo.' };
  }

  const { error: patchErr } = await supabaseServer
    .from('defects')
    .update({ photo_urls: [...existing, ...added] })
    .eq('id', defect.id);
  if (patchErr) return { ok: false, error: patchErr.message };

  const num = defectNumber || defect.defect_number;
  revalidatePath(`/defects/${num}`);
  revalidatePath('/defects');
  revalidatePath('/');
  return { ok: true, added: added.length };
}

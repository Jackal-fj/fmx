'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';

type UpdateResult = {
  ok: boolean;
  error?: string;
  defect_number?: string;
};

// Server Action — receives FormData with photos already client-side-compressed.
// Validates secret key, uploads photos to Supabase Storage, writes audit row,
// flips defect status. Redirects to success on completion.
export async function updateDefect(formData: FormData): Promise<UpdateResult> {
  const defectId  = (formData.get('defect_id') as string || '').trim();
  const newStatus = (formData.get('new_status') as string || '').trim();
  const notes     = (formData.get('notes') as string || '').trim();
  const key       = (formData.get('key') as string || '').trim();

  // --- secret-key gate -----------------------------------------------------
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) {
    redirect('/');
  }

  // --- validation ----------------------------------------------------------
  if (!defectId) {
    return { ok: false, error: 'Missing defect id.' };
  }
  const allowedStatus = ['work_ordered', 'resolved'];
  if (!allowedStatus.includes(newStatus)) {
    return { ok: false, error: 'Status must be In Progress or Resolved.' };
  }
  if (newStatus === 'resolved' && !notes) {
    return { ok: false, error: 'Resolution notes are required when marking a defect Resolved.' };
  }

  // --- collect photo files -------------------------------------------------
  const photoFiles = formData.getAll('photos').filter(
    (v): v is File => v instanceof File && v.size > 0,
  );
  if (photoFiles.length < 1) {
    return { ok: false, error: 'At least one photo is required.' };
  }
  if (photoFiles.length > 5) {
    return { ok: false, error: 'Maximum 5 photos per update.' };
  }

  // --- fetch defect to confirm it exists + capture status_from -------------
  const { data: defect } = await supabaseServer
    .from('defects')
    .select('id, defect_number, status, photo_urls')
    .eq('id', defectId)
    .maybeSingle();
  if (!defect) {
    return { ok: false, error: 'Defect not found.' };
  }
  const statusFrom = defect.status;
  const existingPhotos: string[] = Array.isArray(defect.photo_urls) ? defect.photo_urls : [];

  // --- upload photos to Supabase Storage -----------------------------------
  const ts = Date.now();
  const uploadedUrls: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const ext = file.type === 'image/png' ? 'png'
              : file.type === 'image/webp' ? 'webp'
              : 'jpg';
    const path = `${defect.id}/${ts}-${i + 1}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadErr } = await supabaseServer
      .storage
      .from('defect-photos')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error('Photo upload failed:', uploadErr);
      return { ok: false, error: `Photo ${i + 1} failed to upload: ${uploadErr.message}` };
    }

    const { data: urlData } = supabaseServer
      .storage
      .from('defect-photos')
      .getPublicUrl(path);
    uploadedUrls.push(urlData.publicUrl);
  }

  // --- write audit row -----------------------------------------------------
  const { error: auditErr } = await supabaseServer
    .from('defect_updates')
    .insert({
      defect_id: defect.id,
      status_from: statusFrom,
      status_to: newStatus,
      notes: notes || null,
      photo_urls: uploadedUrls,
      source: 'quick_update',
    });
  if (auditErr) {
    console.error('Audit insert failed:', auditErr);
    return { ok: false, error: `Audit log failed: ${auditErr.message}` };
  }

  // --- flip defect status (+ resolution fields if resolved) ----------------
  const mergedPhotos = Array.from(new Set([...existingPhotos, ...uploadedUrls]));
  const updatePayload: Record<string, any> = {
    status: newStatus,
    photo_urls: mergedPhotos,
    updated_at: new Date().toISOString(),
  };
  if (newStatus === 'resolved') {
    updatePayload.resolved_at = new Date().toISOString();
    if (notes) updatePayload.resolution_notes = notes;
  }

  const { error: defectErr } = await supabaseServer
    .from('defects')
    .update(updatePayload)
    .eq('id', defect.id);
  if (defectErr) {
    console.error('Defect status update failed:', defectErr);
    return { ok: false, error: `Status update failed: ${defectErr.message}` };
  }

  redirect(`/update-defect/success?ref=${encodeURIComponent(defect.defect_number)}&status=${encodeURIComponent(newStatus)}&key=${encodeURIComponent(key)}`);
}

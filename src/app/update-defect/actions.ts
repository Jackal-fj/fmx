'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { queueStatusUpdatePush } from '@/lib/outbound-messaging/queue';

type UpdateResult = {
  ok: boolean;
  error?: string;
  defect_number?: string;
};

// FMX-061: JSON variant of the status-update flow for the write queue.
// Takes already-resolved photo URLs (uploaded via /api/defect-photo) and
// does the audit row + status flip + merge into defect.photo_urls. No
// redirect — the caller (queue handler) is a background worker.
export async function applyDefectStatusUpdate(input: {
  defect_id: string;
  defect_number: string;
  new_status: 'work_ordered' | 'resolved';
  notes: string;
  provider_id: string | null;
  photo_urls: string[];
  key: string;
}): Promise<{ ok: boolean; error?: string }> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || input.key !== required) return { ok: false, error: 'Not authorised' };
  if (!input.defect_id) return { ok: false, error: 'Missing defect id' };
  if (!['work_ordered', 'resolved'].includes(input.new_status)) {
    return { ok: false, error: 'Status must be In Progress or Resolved' };
  }
  if (input.new_status === 'resolved' && (input.notes || '').trim().length < 10) {
    return { ok: false, error: 'Resolution notes must be at least 10 characters when marking Resolved' };
  }
  if (!Array.isArray(input.photo_urls) || input.photo_urls.length === 0) {
    return { ok: false, error: 'At least one photo URL is required' };
  }

  const { data: defect } = await supabaseServer
    .from('defects')
    .select('id, status, photo_urls')
    .eq('id', input.defect_id)
    .maybeSingle();
  if (!defect) return { ok: false, error: 'Defect not found' };
  const statusFrom = defect.status;
  const existingPhotos: string[] = Array.isArray(defect.photo_urls) ? defect.photo_urls : [];

  const { error: auditErr } = await supabaseServer
    .from('defect_updates')
    .insert({
      defect_id: defect.id,
      status_from: statusFrom,
      status_to: input.new_status,
      notes: input.notes || null,
      photo_urls: input.photo_urls,
      provider_id: input.provider_id || null,
      source: 'quick_update',
    });
  if (auditErr) return { ok: false, error: `Audit log failed: ${auditErr.message}` };

  const mergedPhotos = Array.from(new Set([...existingPhotos, ...input.photo_urls]));
  const updatePayload: Record<string, any> = {
    status: input.new_status,
    photo_urls: mergedPhotos,
    updated_at: new Date().toISOString(),
  };
  if (input.new_status === 'resolved') {
    updatePayload.resolved_at = new Date().toISOString();
    if (input.notes) updatePayload.resolution_notes = input.notes;
  }

  const { error: defectErr } = await supabaseServer
    .from('defects')
    .update(updatePayload)
    .eq('id', defect.id);
  if (defectErr) return { ok: false, error: `Status update failed: ${defectErr.message}` };

  // FMX-080: queue a tenant-facing status push for FM approval. Only fire
  // when the transition is a real forward step — a repeat flip to the same
  // status would otherwise generate a second notification for the same work.
  if (statusFrom !== input.new_status) {
    await queueStatusUpdatePush(input.defect_id, input.new_status);
  }

  revalidatePath('/defects');
  revalidatePath(`/defects/${input.defect_number}`);
  revalidatePath('/update-defect');
  revalidatePath('/');
  revalidatePath('/maintenance');
  revalidatePath('/tenant-outbound');
  revalidatePath('/properties', 'layout');
  return { ok: true };
}

// Server Action — receives FormData with photos already client-side-compressed.
// Validates secret key, uploads photos to Supabase Storage, writes audit row,
// flips defect status. Redirects to success on completion.
export async function updateDefect(formData: FormData): Promise<UpdateResult> {
  const defectId   = (formData.get('defect_id') as string || '').trim();
  const newStatus  = (formData.get('new_status') as string || '').trim();
  const notes      = (formData.get('notes') as string || '').trim();
  const providerId = (formData.get('provider_id') as string || '').trim();
  const key        = (formData.get('key') as string || '').trim();

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
  if (newStatus === 'resolved' && notes.trim().length < 10) {
    return { ok: false, error: 'Resolution notes must be at least 10 characters when marking a defect Resolved.' };
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
      provider_id: providerId || null,
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

  // FMX-080: queue tenant status push for FM approval on real transitions.
  if (statusFrom !== newStatus && (newStatus === 'work_ordered' || newStatus === 'resolved')) {
    await queueStatusUpdatePush(defect.id, newStatus);
  }

  // Bust caches so the redirected pages show fresh data.
  revalidatePath('/defects');
  revalidatePath(`/defects/${defect.defect_number}`);
  revalidatePath('/update-defect');
  revalidatePath('/');   // dashboard shows recent defects widget
  revalidatePath('/maintenance');
  revalidatePath('/tenant-outbound');
  // Property page can't be pinpointed without a lookup — invalidate the parent.
  revalidatePath('/properties', 'layout');

  redirect(`/update-defect/success?ref=${encodeURIComponent(defect.defect_number)}&status=${encodeURIComponent(newStatus)}&key=${encodeURIComponent(key)}`);
}

'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type LogResult = { ok: boolean; error?: string };

const ALLOWED_CONDITION = ['excellent', 'good', 'adequate', 'marginal', 'poor', 'fair', 'failed'];

export async function logServiceEvent(formData: FormData): Promise<LogResult> {
  const assetId       = (formData.get('asset_id') as string || '').trim();
  const servicedAt    = (formData.get('serviced_at') as string || '').trim();
  const providerId    = (formData.get('provider_id') as string || '').trim();
  const servicedBy    = (formData.get('serviced_by') as string || '').trim();
  const conditionNew  = (formData.get('condition_after') as string || '').trim();
  const notes         = (formData.get('notes') as string || '').trim();
  const nextDueDate   = (formData.get('next_service_due_at') as string || '').trim();
  const eventType     = (formData.get('event_type') as string || 'service').trim();
  const key           = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  if (!assetId) return { ok: false, error: 'Missing asset id.' };
  if (!conditionNew || !ALLOWED_CONDITION.includes(conditionNew)) {
    return { ok: false, error: 'Condition rating after service is required.' };
  }

  const photoFiles = formData.getAll('photos').filter(
    (v): v is File => v instanceof File && v.size > 0,
  );
  if (photoFiles.length < 1) return { ok: false, error: 'At least one photo is required.' };
  if (photoFiles.length > 5) return { ok: false, error: 'Maximum 5 photos per service event.' };

  // fetch asset
  const { data: asset } = await supabaseServer
    .from('assets')
    .select('id, current_condition, service_interval_months')
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) return { ok: false, error: 'Asset not found.' };
  const conditionBefore = asset.current_condition;

  // determine timestamps
  const servicedAtIso = servicedAt
    ? new Date(servicedAt + 'T00:00:00').toISOString()
    : new Date().toISOString();

  // auto-compute next service due if not provided and interval is set
  let nextDueIso: string | null = nextDueDate || null;
  if (!nextDueIso && asset.service_interval_months) {
    const d = new Date(servicedAtIso);
    d.setMonth(d.getMonth() + asset.service_interval_months);
    nextDueIso = d.toISOString().slice(0, 10);
  }

  // upload photos
  const ts = Date.now();
  const photoUrls: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${asset.id}/${ts}-${i + 1}.${ext}`;
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabaseServer.storage
      .from('asset-photos')
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: `Photo ${i + 1} upload failed: ${upErr.message}` };
    const { data: urlData } = supabaseServer.storage.from('asset-photos').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  const allowedEventTypes = ['service', 'upgrade', 'replacement', 'inspection', 'incident'];
  const safeEventType = allowedEventTypes.includes(eventType) ? eventType : 'service';

  // write service event row
  const { error: eventErr } = await supabaseServer
    .from('asset_service_events')
    .insert({
      asset_id: asset.id,
      serviced_at: servicedAtIso,
      serviced_by: servicedBy || null,
      condition_before: conditionBefore,
      condition_after: conditionNew,
      notes: notes || null,
      photo_urls: photoUrls,
      provider_id: providerId || null,
      source: 'service_log',
      event_type: safeEventType,
    });
  if (eventErr) {
    console.error('Service event insert failed:', eventErr);
    return { ok: false, error: `Event log failed: ${eventErr.message}` };
  }

  // update asset
  const assetUpdate: Record<string, any> = {
    last_serviced_at: servicedAtIso.slice(0, 10),
    current_condition: conditionNew,
    updated_at: new Date().toISOString(),
  };
  if (nextDueIso) assetUpdate.next_service_due_at = nextDueIso;

  const { error: updateErr } = await supabaseServer
    .from('assets')
    .update(assetUpdate)
    .eq('id', asset.id);
  if (updateErr) {
    console.error('Asset post-service update failed:', updateErr);
    return { ok: false, error: `Asset update failed: ${updateErr.message}` };
  }

  revalidatePath(`/assets/${asset.id}`);
  revalidatePath('/assets');
  revalidatePath('/service-log');
  revalidatePath('/maintenance');

  redirect(`/service-log/success?asset_id=${encodeURIComponent(asset.id)}&key=${encodeURIComponent(key)}`);
}

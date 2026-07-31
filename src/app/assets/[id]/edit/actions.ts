'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type UpdateResult = { ok: boolean; error?: string };

const ALLOWED_CONDITION = ['excellent', 'good', 'adequate', 'marginal', 'poor', 'fair', 'failed'];

export async function updateAsset(formData: FormData): Promise<UpdateResult> {
  const assetId         = (formData.get('asset_id') as string || '').trim();
  const spaceId         = (formData.get('space_id') as string || '').trim();
  const name            = (formData.get('name') as string || '').trim();
  const assetType       = (formData.get('asset_type') as string || '').trim();
  const assetCode       = (formData.get('asset_code') as string || '').trim();
  const make            = (formData.get('make') as string || '').trim();
  const model           = (formData.get('model') as string || '').trim();
  const serialNumber    = (formData.get('serial_number') as string || '').trim();
  const installDate     = (formData.get('install_date') as string || '').trim();
  const warrantyDate    = (formData.get('warranty_expiry_date') as string || '').trim();
  const serviceInterval = (formData.get('service_interval_months') as string || '').trim();
  const condition       = (formData.get('current_condition') as string || '').trim();
  const replacementCost = (formData.get('replacement_cost_fjd') as string || '').trim();
  const notes           = (formData.get('notes') as string || '').trim();
  const activeStr       = (formData.get('active') as string || 'true').trim();
  const key             = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  if (!assetId) return { ok: false, error: 'Missing asset id.' };
  if (!name || !assetType) return { ok: false, error: 'Name and asset type are required.' };
  if (condition && !ALLOWED_CONDITION.includes(condition)) {
    return { ok: false, error: 'Invalid condition rating.' };
  }

  // photos to add (existing ones preserved)
  const newPhotoFiles = formData.getAll('photos').filter(
    (v): v is File => v instanceof File && v.size > 0,
  );
  if (newPhotoFiles.length > 5) {
    return { ok: false, error: 'Maximum 5 new photos per edit.' };
  }

  // fetch current to preserve existing photo_urls
  const { data: current } = await supabaseServer
    .from('assets')
    .select('id, photo_urls')
    .eq('id', assetId)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Asset not found.' };
  const existing: string[] = Array.isArray(current.photo_urls) ? current.photo_urls : [];

  const newUrls: string[] = [];
  const ts = Date.now();
  for (let i = 0; i < newPhotoFiles.length; i++) {
    const file = newPhotoFiles[i];
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${current.id}/${ts}-${i + 1}.${ext}`;
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabaseServer.storage
      .from('asset-photos')
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: `Photo ${i + 1} upload failed: ${upErr.message}` };
    const { data: urlData } = supabaseServer.storage.from('asset-photos').getPublicUrl(path);
    newUrls.push(urlData.publicUrl);
  }

  const payload: Record<string, any> = {
    name,
    asset_type: assetType,
    asset_code: assetCode || null,
    make: make || null,
    model: model || null,
    serial_number: serialNumber || null,
    install_date: installDate || null,
    warranty_expiry_date: warrantyDate || null,
    service_interval_months: serviceInterval ? parseInt(serviceInterval, 10) : null,
    current_condition: condition || null,
    replacement_cost_fjd: replacementCost ? parseFloat(replacementCost) : null,
    notes: notes || null,
    active: activeStr === 'true',
    space_id: spaceId || null,
    photo_urls: [...existing, ...newUrls],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseServer
    .from('assets')
    .update(payload)
    .eq('id', assetId);

  if (error) {
    console.error('Asset update failed:', error);
    return { ok: false, error: `Update failed: ${error.message}` };
  }

  // Bust caches so the redirect lands on fresh data
  revalidatePath(`/assets/${assetId}`);
  revalidatePath('/assets');

  redirect(`/assets/${encodeURIComponent(assetId)}?key=${encodeURIComponent(key)}&saved=1`);
}

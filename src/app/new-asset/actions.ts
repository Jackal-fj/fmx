'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type CreateResult = {
  ok: boolean;
  error?: string;
};

const ALLOWED_CONDITION = ['excellent', 'good', 'adequate', 'marginal', 'poor', 'fair', 'failed'];

export async function createAsset(formData: FormData): Promise<CreateResult> {
  const propertyCode    = (formData.get('property_code') as string || '').trim();
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
  const key             = (formData.get('key') as string || '').trim();

  // --- gate ---------------------------------------------------------------
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) {
    redirect('/');
  }

  // --- validation ---------------------------------------------------------
  if (!propertyCode || !name || !assetType) {
    return { ok: false, error: 'Property, name, and asset type are required.' };
  }
  if (condition && !ALLOWED_CONDITION.includes(condition)) {
    return { ok: false, error: 'Invalid condition rating.' };
  }

  // --- resolve property ---------------------------------------------------
  const { data: prop } = await supabaseServer
    .from('properties')
    .select('id, short_code, name')
    .eq('short_code', propertyCode)
    .maybeSingle();
  if (!prop) {
    return { ok: false, error: 'Property not found.' };
  }

  // --- upload photos to Supabase Storage ----------------------------------
  const photoFiles = formData.getAll('photos').filter(
    (v): v is File => v instanceof File && v.size > 0,
  );
  if (photoFiles.length > 5) {
    return { ok: false, error: 'Maximum 5 photos per asset.' };
  }

  const photoUrls: string[] = [];
  const ts = Date.now();
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `new/${ts}-${i + 1}.${ext}`;
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await supabaseServer
      .storage.from('asset-photos')
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadErr) {
      console.error('Asset photo upload failed:', uploadErr);
      return { ok: false, error: `Photo ${i + 1} failed to upload: ${uploadErr.message}` };
    }
    const { data: urlData } = supabaseServer
      .storage.from('asset-photos').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  // --- compose insert payload ---------------------------------------------
  const payload: Record<string, any> = {
    property_id: prop.id,
    name,
    asset_type: assetType,
    active: true,
    photo_urls: photoUrls,
  };
  if (spaceId) payload.space_id = spaceId;
  if (assetCode) payload.asset_code = assetCode;
  if (make) payload.make = make;
  if (model) payload.model = model;
  if (serialNumber) payload.serial_number = serialNumber;
  if (installDate) payload.install_date = installDate;
  if (warrantyDate) payload.warranty_expiry_date = warrantyDate;
  if (serviceInterval) {
    const n = parseInt(serviceInterval, 10);
    if (!Number.isNaN(n) && n > 0) payload.service_interval_months = n;
  }
  if (condition) payload.current_condition = condition;
  if (replacementCost) {
    const n = parseFloat(replacementCost);
    if (!Number.isNaN(n) && n >= 0) payload.replacement_cost_fjd = n;
  }
  if (notes) payload.notes = notes;

  // --- insert -------------------------------------------------------------
  const { data: asset, error } = await supabaseServer
    .from('assets')
    .insert(payload)
    .select('id, name')
    .single();
  if (error || !asset) {
    console.error('Asset insert failed:', error);
    return { ok: false, error: `Insert failed: ${error?.message || 'unknown'}` };
  }

  revalidatePath('/assets');

  redirect(`/new-asset/success?id=${encodeURIComponent(asset.id)}&name=${encodeURIComponent(asset.name)}&key=${encodeURIComponent(key)}`);
}

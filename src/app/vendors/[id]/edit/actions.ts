'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type Result = { ok: boolean; error?: string };

export async function updateVendor(formData: FormData): Promise<Result> {
  const id                = (formData.get('id') as string || '').trim();
  const name              = (formData.get('name') as string || '').trim();
  const trade             = (formData.get('trade') as string || '').trim();
  const contact_name      = (formData.get('contact_name') as string || '').trim();
  const whatsapp_number   = (formData.get('whatsapp_number') as string || '').trim();
  const email             = (formData.get('email') as string || '').trim();
  const address           = (formData.get('address') as string || '').trim();
  const website           = (formData.get('website') as string || '').trim();
  const registration_id   = (formData.get('registration_id') as string || '').trim();
  const hourly_rate_raw   = (formData.get('hourly_rate_fjd') as string || '').trim();
  const callout_fee_raw   = (formData.get('callout_fee_fjd') as string || '').trim();
  const insurance_expiry  = (formData.get('insurance_expiry') as string || '').trim();
  const certifications    = (formData.get('certifications') as string || '').trim();
  const rating_raw        = (formData.get('rating') as string || '').trim();
  const notes             = (formData.get('notes') as string || '').trim();
  const active_raw        = (formData.get('active') as string || 'true').trim();
  const key               = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  if (!id) return { ok: false, error: 'Missing vendor id.' };
  if (!name || !trade) return { ok: false, error: 'Name and trade are required.' };

  const hourly_rate_fjd = hourly_rate_raw ? parseFloat(hourly_rate_raw) : null;
  const callout_fee_fjd = callout_fee_raw ? parseFloat(callout_fee_raw) : null;
  const rating = rating_raw ? parseInt(rating_raw, 10) : null;
  if (rating != null && (rating < 1 || rating > 5)) {
    return { ok: false, error: 'Rating must be between 1 and 5.' };
  }

  const payload: Record<string, any> = {
    name,
    trade,
    contact_name: contact_name || null,
    whatsapp_number: whatsapp_number.replace(/\s+/g, '') || null,
    email: email || null,
    address: address || null,
    website: website || null,
    registration_id: registration_id || null,
    hourly_rate_fjd,
    callout_fee_fjd,
    insurance_expiry: insurance_expiry || null,
    certifications: certifications || null,
    rating,
    notes: notes || null,
    active: active_raw === 'true',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseServer
    .from('providers')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Vendor update failed:', error);
    return { ok: false, error: `Update failed: ${error.message}` };
  }

  revalidatePath(`/vendors/${id}`);
  revalidatePath('/vendors');

  redirect(`/vendors/${encodeURIComponent(id)}?saved=1`);
}

export async function deleteVendor(formData: FormData): Promise<Result> {
  const id  = (formData.get('id') as string || '').trim();
  const key = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');
  if (!id) return { ok: false, error: 'Missing vendor id.' };

  const { data: v } = await supabaseServer
    .from('providers')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!v) return { ok: false, error: 'Vendor not found.' };

  // Note: defect_updates, asset_service_events, whatsapp_messages, work_orders
  // and service_contracts reference provider_id. All use ON DELETE SET NULL
  // (schema default for these tables), so history survives the delete.
  const { error } = await supabaseServer
    .from('providers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Vendor delete failed:', error);
    return { ok: false, error: `Delete failed: ${error.message}` };
  }

  revalidatePath('/vendors');
  redirect(`/vendors?deleted=${encodeURIComponent(v.name)}`);
}

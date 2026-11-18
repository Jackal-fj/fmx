'use server';

// FMX-063: set / clear the default inspection template on a property or
// an asset. Writes to the FK columns added by the FMX-054 migration.
//
// Used by the <DefaultTemplatePicker/> on the property and asset detail
// pages, and read back by <StartInspectionButton/> to decide whether to
// render the Start button (FMX-064).

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

type Res = { ok: boolean; error?: string };

function auth(key: string): boolean {
  const required = process.env.QUICK_ADD_SECRET;
  return !!required && key === required;
}

export async function setPropertyDefaultTemplate(
  propertyShortCode: string,
  templateId: string | null,
  key: string,
): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!propertyShortCode) return { ok: false, error: 'Missing property short_code.' };
  const { error } = await supabaseServer
    .from('properties')
    .update({ default_inspection_template_id: templateId })
    .eq('short_code', propertyShortCode.toUpperCase());
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertyShortCode}`);
  return { ok: true };
}

export async function setAssetDefaultTemplate(
  assetId: string,
  templateId: string | null,
  key: string,
): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!assetId) return { ok: false, error: 'Missing asset id.' };
  const { error } = await supabaseServer
    .from('assets')
    .update({ default_inspection_template_id: templateId })
    .eq('id', assetId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/assets/${assetId}`);
  return { ok: true };
}

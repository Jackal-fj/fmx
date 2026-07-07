'use server';

import { supabaseServer } from '@/lib/supabase';

type ProviderPayload = {
  id: string;
  name: string;
  trade: string;
  whatsapp_number: string | null;
};

type CreateResult = {
  ok: boolean;
  error?: string;
  provider?: ProviderPayload;
};

export async function createProvider(formData: FormData): Promise<CreateResult> {
  const name           = (formData.get('name') as string || '').trim();
  const trade          = (formData.get('trade') as string || '').trim();
  const contactName    = (formData.get('contact_name') as string || '').trim();
  const whatsappRaw    = (formData.get('whatsapp_number') as string || '').trim();
  const email          = (formData.get('email') as string || '').trim();

  if (!name || !trade) {
    return { ok: false, error: 'Vendor name and trade are required.' };
  }

  // Normalise whatsapp to E.164-ish (leave to user for now; strip spaces).
  const whatsapp = whatsappRaw.replace(/\s+/g, '') || null;

  const { data, error } = await supabaseServer
    .from('providers')
    .insert({
      name,
      trade,
      contact_name: contactName || null,
      whatsapp_number: whatsapp,
      email: email || null,
      active: true,
    })
    .select('id, name, trade, whatsapp_number')
    .single();

  if (error || !data) {
    console.error('Provider insert failed:', error);
    return { ok: false, error: `Save failed: ${error?.message || 'unknown'}` };
  }

  return { ok: true, provider: data };
}

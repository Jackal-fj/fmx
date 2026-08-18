'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sendText, sendImage, isConfigured, normaliseE164 } from '@/lib/whatsapp';

type DispatchResult = { ok: boolean; error?: string };

export async function dispatchDefect(formData: FormData): Promise<DispatchResult> {
  const defectId   = (formData.get('defect_id') as string || '').trim();
  const providerId = (formData.get('provider_id') as string || '').trim();
  const message    = (formData.get('message') as string || '').trim();
  const includeAll = (formData.get('include_photos') as string || 'true') === 'true';
  const key        = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  if (!isConfigured()) {
    return { ok: false, error: 'WhatsApp integration not configured yet. Ask Carl.' };
  }
  if (!defectId || !providerId || !message) {
    return { ok: false, error: 'Defect, vendor, and message body are required.' };
  }
  if (message.length > 3800) {
    return { ok: false, error: 'Message body over 3800 characters. Trim it.' };
  }

  // Load vendor + defect in parallel
  const [{ data: provider }, { data: defect }] = await Promise.all([
    supabaseServer
      .from('providers')
      .select('id, name, whatsapp_number, active')
      .eq('id', providerId)
      .maybeSingle(),
    supabaseServer
      .from('defects')
      .select('id, defect_number, photo_urls')
      .eq('id', defectId)
      .maybeSingle(),
  ]);

  if (!provider) return { ok: false, error: 'Vendor not found.' };
  if (!provider.active) return { ok: false, error: 'Vendor is inactive.' };
  if (!provider.whatsapp_number) {
    return { ok: false, error: `Vendor ${provider.name} has no WhatsApp number on file. Edit the vendor first.` };
  }
  if (!defect) return { ok: false, error: 'Defect not found.' };

  const toE164 = normaliseE164(provider.whatsapp_number);
  const fromDisplay = process.env.WHATSAPP_PHONE_NUMBER_ID || 'CMS';
  const photos: string[] = (Array.isArray(defect.photo_urls) ? defect.photo_urls : []).slice(0, 5);
  const nowIso = new Date().toISOString();

  // --- Send text first -----------------------------------------------------
  const textResult = await sendText({ to: toE164, body: message });

  await supabaseServer.from('whatsapp_messages').insert({
    direction: 'outbound',
    from_number: fromDisplay,
    to_number: toE164,
    provider_id: provider.id,
    defect_id: defect.id,
    wa_message_id: textResult.wa_message_id,
    body: message,
    message_type: 'text',
    status: textResult.ok ? 'sent' : 'failed',
    error_message: textResult.error || null,
    metadata: textResult.raw,
    sent_at: textResult.ok ? nowIso : null,
  });

  if (!textResult.ok) {
    return { ok: false, error: `Text send failed: ${textResult.error}` };
  }

  // --- Then send each photo as a separate media message -------------------
  if (includeAll) {
    for (let i = 0; i < photos.length; i++) {
      const photoUrl = photos[i];
      const caption = i === 0
        ? `Photo ${i + 1}/${photos.length} — ${defect.defect_number}`
        : `Photo ${i + 1}/${photos.length}`;
      const imgResult = await sendImage({ to: toE164, imageUrl: photoUrl, caption });

      await supabaseServer.from('whatsapp_messages').insert({
        direction: 'outbound',
        from_number: fromDisplay,
        to_number: toE164,
        provider_id: provider.id,
        defect_id: defect.id,
        wa_message_id: imgResult.wa_message_id,
        body: caption,
        media_urls: [photoUrl],
        message_type: 'image',
        status: imgResult.ok ? 'sent' : 'failed',
        error_message: imgResult.error || null,
        metadata: imgResult.raw,
        sent_at: imgResult.ok ? new Date().toISOString() : null,
      });

      // Don't hard-fail if a photo fails — text is already through.
    }
  }

  revalidatePath(`/defects/${defect.defect_number}`);
  revalidatePath(`/vendors/${provider.id}`);
  revalidatePath('/defects');

  redirect(`/dispatch/success?ref=${encodeURIComponent(defect.defect_number)}&vendor=${encodeURIComponent(provider.name)}&key=${encodeURIComponent(key)}`);
}

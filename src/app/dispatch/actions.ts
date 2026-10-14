'use server';

// Click-to-chat dispatch — no Cloud API needed. The server action logs the
// dispatch intent, flips the defect to work_ordered, writes an audit row,
// then redirects the browser to a wa.me URL that opens WhatsApp with the
// vendor pre-selected and the composed message pre-typed. Carl taps Send
// inside WhatsApp.
//
// Trade-off vs the Cloud API path we had before: outgoing message isn't
// delivered programmatically (Carl taps Send), vendor replies don't flow
// back to FMX automatically. Zero Meta setup required.

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { normaliseE164 } from '@/lib/whatsapp';

type DispatchResult = { ok: boolean; error?: string };

export async function dispatchDefect(formData: FormData): Promise<DispatchResult> {
  const defectId   = (formData.get('defect_id') as string || '').trim();
  const providerId = (formData.get('provider_id') as string || '').trim();
  const message    = (formData.get('message') as string || '').trim();
  const key        = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  if (!defectId || !providerId || !message) {
    return { ok: false, error: 'Defect, vendor, and message body are required.' };
  }
  if (message.length > 3800) {
    return { ok: false, error: 'Message over 3800 characters — trim it.' };
  }

  // Load vendor + defect in parallel.
  const [{ data: provider }, { data: defect }] = await Promise.all([
    supabaseServer
      .from('providers')
      .select('id, name, whatsapp_number, active')
      .eq('id', providerId)
      .maybeSingle(),
    supabaseServer
      .from('defects')
      .select('id, defect_number, status')
      .eq('id', defectId)
      .maybeSingle(),
  ]);

  if (!provider) return { ok: false, error: 'Vendor not found.' };
  if (!provider.active) return { ok: false, error: 'Vendor is inactive.' };
  if (!provider.whatsapp_number) {
    return { ok: false, error: `Vendor ${provider.name} has no WhatsApp number. Edit the vendor first.` };
  }
  if (!defect) return { ok: false, error: 'Defect not found.' };

  const toE164 = normaliseE164(provider.whatsapp_number);

  // Log the dispatch intent to whatsapp_messages so the vendor-detail +
  // defect-detail pages still render the thread history consistently.
  await supabaseServer.from('whatsapp_messages').insert({
    direction: 'outbound',
    from_number: 'CMS (via wa.me link)',
    to_number: toE164,
    provider_id: provider.id,
    defect_id: defect.id,
    wa_message_id: null,       // no Meta ID — tapped in WhatsApp
    body: message,
    message_type: 'text',
    status: 'via_link',        // special status: Carl initiated via click-to-chat
    sent_at: new Date().toISOString(),
    metadata: { dispatch_method: 'wa.me' },
  });

  // Flip defect to work_ordered if currently open.
  if (defect.status === 'open') {
    await supabaseServer
      .from('defects')
      .update({
        status: 'work_ordered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', defect.id);

    await supabaseServer.from('defect_updates').insert({
      defect_id: defect.id,
      provider_id: provider.id,
      status_from: 'open',
      status_to: 'work_ordered',
      notes: `Dispatched to ${provider.name} via WhatsApp click-to-chat.`,
      source: 'dispatch_link',
    });
  }

  revalidatePath(`/defects/${defect.defect_number}`);
  revalidatePath(`/vendors/${provider.id}`);
  revalidatePath('/defects');

  // Build the wa.me URL and redirect the browser. On mobile this opens the
  // WhatsApp app directly with the vendor + message pre-filled; on desktop
  // it opens WhatsApp Web.
  const waUrl = `https://wa.me/${toE164}?text=${encodeURIComponent(message)}`;
  redirect(waUrl);
}

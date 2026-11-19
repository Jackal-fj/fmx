// FMX-080: outbound tenant message queue.
//
// On a defect status flip (`open → work_ordered` or `work_ordered → resolved`),
// this module stages an outbound tenant notification via the FMX-079 shared
// router's `lookupOutboundRoute`. Nothing is sent automatically — the FM
// approves each message on /tenant-outbound before it leaves the system,
// which preserves the "keep the gate on the first N" posture from the AC.
//
// Threading: when the matched route is Google Chat and the shared router
// resolves to a cached sender, we try to surface the most recent inbound
// thread so replies land in context for the tenant. WhatsApp is linear per
// wa_id so no threading is needed.
//
// Server-only.

import { supabaseServer } from '@/lib/supabase';
import { lookupOutboundRoute } from '@/lib/tenant-routing/resolve';
import { sendWhatsAppText } from '@/lib/whatsapp/client';
import { sendChatMessage } from '@/lib/google-chat/client';
import { logAudit } from '@/lib/audit/log';

type Trigger = 'work_ordered' | 'resolved';

/**
 * Queue a status-update push for a defect transition. Idempotent per
 * (defect_id, trigger) — repeated calls for the same transition no-op.
 * Called inline from the status-flip server actions, non-blocking so a
 * routing failure doesn't interfere with the actual defect write.
 */
export async function queueStatusUpdatePush(defectId: string, trigger: Trigger): Promise<void> {
  try {
    // Idempotency: if we already have a queued or sent message for this
    // (defect, trigger), skip. Protects against double-fires from retries.
    const { data: existing } = await supabaseServer
      .from('outbound_tenant_messages')
      .select('id, status')
      .eq('defect_id', defectId)
      .eq('trigger', trigger)
      .in('status', ['queued', 'sent'])
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const { data: defect } = await supabaseServer
      .from('defects')
      .select('id, defect_number, title, property_id, severity')
      .eq('id', defectId)
      .maybeSingle();
    if (!defect || !defect.property_id) return;

    const { data: prop } = await supabaseServer
      .from('properties')
      .select('short_code, tenant_name, tenant_contact_name')
      .eq('id', defect.property_id)
      .maybeSingle();

    const route = await lookupOutboundRoute(defect.property_id as string);

    // No route: log a 'no_route' row anyway so FM sees the missed notification
    // on /tenant-outbound and knows to add the tenant's contact details.
    const body = buildBody({
      trigger,
      defect_number: defect.defect_number as string,
      defect_title: defect.title as string,
      property_code: (prop?.short_code as string) || null,
      greeting_name:
        (prop?.tenant_contact_name as string | null) ||
        (prop?.tenant_name as string | null) ||
        null,
    });

    if (!route) {
      await supabaseServer
        .from('outbound_tenant_messages')
        .insert({
          defect_id: defectId,
          defect_number: defect.defect_number,
          property_id: defect.property_id,
          channel: 'email',           // nominal — rendered as "no route" in the UI
          target_sender_id: '',
          trigger,
          body,
          status: 'no_route',
        });
      return;
    }

    // For Chat, try to surface the most recent thread for this tenant so
    // replies land in-context. Pull from google_chat_inbound.
    let thread_name: string | null = null;
    if (route.channel === 'google_chat') {
      const { data: last } = await supabaseServer
        .from('google_chat_inbound')
        .select('raw_event')
        .eq('sender_email', route.sender_id)
        .eq('status', 'processed')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      thread_name = (last as any)?.raw_event?.message?.thread?.name || null;
    }

    await supabaseServer
      .from('outbound_tenant_messages')
      .insert({
        defect_id: defectId,
        defect_number: defect.defect_number,
        property_id: defect.property_id,
        channel: route.channel,
        target_sender_id: route.sender_id,
        thread_name,
        trigger,
        body,
        status: 'queued',
      });
  } catch (e: any) {
    // Never block the surrounding defect write on a push-queue failure.
    console.warn('[outbound] queueStatusUpdatePush failed:', e?.message);
  }
}

// ---------------------------------------------------------------------------
// FM approval actions
// ---------------------------------------------------------------------------

export type OutboundSendResult = { ok: true } | { ok: false; error: string };

/**
 * Actually send the queued message through its channel. Called from the
 * /tenant-outbound approve button. Marks the row sent/failed after the
 * attempt and stores the external message id for traceability.
 */
export async function sendQueuedOutbound(id: string): Promise<OutboundSendResult> {
  const { data: msg } = await supabaseServer
    .from('outbound_tenant_messages')
    .select('id, channel, target_sender_id, body, thread_name, status, property_id')
    .eq('id', id)
    .maybeSingle();
  if (!msg) return { ok: false, error: 'Message not found.' };
  if (msg.status !== 'queued') return { ok: false, error: `Message is already ${msg.status}.` };

  if (msg.channel === 'whatsapp') {
    const r = await sendWhatsAppText(msg.target_sender_id as string, msg.body as string);
    if (!r.ok) {
      await supabaseServer
        .from('outbound_tenant_messages')
        .update({ status: 'failed', error: r.error })
        .eq('id', id);
      return { ok: false, error: r.error };
    }
    await supabaseServer
      .from('outbound_tenant_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), external_message_id: r.message_id })
      .eq('id', id);
    await logAudit({
      actor_kind: 'fm_admin',
      action: 'tenant_message.sent',
      channel: 'whatsapp',
      target_table: 'outbound_tenant_messages',
      target_id: id,
      target_ref: msg.target_sender_id as string,
      property_id: msg.property_id as string,
      context: { external_message_id: r.message_id },
    });
    return { ok: true };
  }

  if (msg.channel === 'google_chat') {
    // Chat sends go to a space, not a direct sender id. We derive the space
    // from the cache / inbound events for this sender.
    const spaceName = await findSpaceForChatSender(msg.target_sender_id as string);
    if (!spaceName) {
      await supabaseServer
        .from('outbound_tenant_messages')
        .update({ status: 'failed', error: 'No known Chat space for this tenant.' })
        .eq('id', id);
      return { ok: false, error: 'No known Chat space for this tenant.' };
    }
    const r = await sendChatMessage(spaceName, msg.body as string, { threadName: msg.thread_name as string | null });
    if (!r.ok) {
      await supabaseServer
        .from('outbound_tenant_messages')
        .update({ status: 'failed', error: r.error })
        .eq('id', id);
      return { ok: false, error: r.error };
    }
    await supabaseServer
      .from('outbound_tenant_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), external_message_id: r.message_name })
      .eq('id', id);
    await logAudit({
      actor_kind: 'fm_admin',
      action: 'tenant_message.sent',
      channel: 'google_chat',
      target_table: 'outbound_tenant_messages',
      target_id: id,
      target_ref: msg.target_sender_id as string,
      property_id: msg.property_id as string,
      context: { external_message_id: r.message_name },
    });
    return { ok: true };
  }

  // Email (or future channel): not implemented here. Fail loudly so Carl
  // sees the row stuck at "failed" rather than silently dropped.
  await supabaseServer
    .from('outbound_tenant_messages')
    .update({ status: 'failed', error: `Channel ${msg.channel} not implemented yet.` })
    .eq('id', id);
  return { ok: false, error: `Channel ${msg.channel} not wired for outbound yet.` };
}

/**
 * Mark a queued row skipped (FM chose not to send). Keeps the row for audit.
 */
export async function skipQueuedOutbound(id: string): Promise<OutboundSendResult> {
  const { data: msg } = await supabaseServer
    .from('outbound_tenant_messages')
    .select('channel, target_sender_id, property_id')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabaseServer
    .from('outbound_tenant_messages')
    .update({ status: 'skipped', skipped_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'queued');
  if (error) return { ok: false, error: error.message };
  if (msg) {
    await logAudit({
      actor_kind: 'fm_admin',
      action: 'tenant_message.skipped',
      channel: msg.channel as any,
      target_table: 'outbound_tenant_messages',
      target_id: id,
      target_ref: msg.target_sender_id as string | null,
      property_id: (msg.property_id as string | null) ?? null,
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildBody(args: {
  trigger: Trigger;
  defect_number: string;
  defect_title: string;
  property_code: string | null;
  greeting_name: string | null;
}): string {
  const name = args.greeting_name ? ` ${args.greeting_name}` : '';
  const prop = args.property_code ? ` at ${args.property_code}` : '';
  const title = args.defect_title ? ` — ${args.defect_title}` : '';
  if (args.trigger === 'work_ordered') {
    return `Hi${name}, update on ${args.defect_number}${prop}${title}: our team has been dispatched. We'll be back in touch when the work is complete.`;
  }
  return `Hi${name}, ${args.defect_number}${prop}${title} has been resolved. If anything's not right please reply here and we'll re-open it.`;
}

async function findSpaceForChatSender(email: string): Promise<string | null> {
  // Look at the most recent processed google_chat_inbound row for this sender
  // to find the space they messaged us from.
  const { data } = await supabaseServer
    .from('google_chat_inbound')
    .select('space_name')
    .eq('sender_email', email)
    .not('space_name', 'is', null)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.space_name as string | null) ?? null;
}

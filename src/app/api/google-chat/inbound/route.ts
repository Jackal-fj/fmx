// FMX-078: Google Chat inbound webhook.
//
// Pattern mirrors /api/whatsapp/inbound and /api/email:
//   1. Verify Bearer JWT (iss = chat@system.gserviceaccount.com, aud = our configured audience)
//   2. Dedupe on Chat's message resource name
//   3. Dispatch by event type:
//        • MESSAGE          → create draft defect scoped to sender's property
//        • ADDED_TO_SPACE   → onboarding message naming the property matched (or asking for it)
//        • REMOVED_FROM_SPACE → log; no reply (we're gone)
//   4. Log every event to google_chat_inbound as audit trail first
//   5. Download any uploaded attachments via Chat Media API (needs SA)
//   6. Respond synchronously with a plain-text confirmation (threaded)
//
// Chat app configuration:
//   • Endpoint URL: https://<your-domain>/api/google-chat/inbound
//   • Authentication: bearer JWT, audience = your project number OR this URL
//     (whichever you set must match GOOGLE_CHAT_AUDIENCE).
//   • Scopes needed for attachment download (SA grants): chat.bot
//
// Everything is scoped to Fiji commercial tenants that live in Workspace
// (Ministry etc.). Private Gmail users can't be in a Workspace Chat space,
// so sender.email is always an org email we can match on
// properties.tenant_contact_email.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import {
  verifyChatJwt,
  downloadChatAttachment,
  chatTextReply,
} from '@/lib/google-chat/client';
import { classifyTrade } from '@/lib/trade/classify';
import { resolveTenantRoute } from '@/lib/tenant-routing/resolve';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // 1. Verify JWT. Fail-closed on missing audience env var.
  const auth = request.headers.get('authorization');
  const jwt = await verifyChatJwt(auth);
  if (!jwt) return new Response('Forbidden', { status: 403 });

  let event: any;
  try { event = await request.json(); }
  catch { return new Response('Bad JSON', { status: 400 }); }

  const type: string = event?.type || 'UNKNOWN';

  // Handle lifecycle events quickly, and only create defects for MESSAGE.
  if (type === 'ADDED_TO_SPACE') {
    await logLifecycle(event, 'ADDED_TO_SPACE');
    const spaceType = event?.space?.type || event?.space?.spaceType;
    const text = spaceType === 'DM'
      ? "Hi — I'm FMX. Message me a defect description with any photos and I'll log it against your property. (If I don't recognise your email yet, ask your FM to add it to your property record.)"
      : "Hi — I'm FMX. Message this space with a defect description (and photos if you have them) and I'll log it against the property this space is linked to.";
    return NextResponse.json(chatTextReply(text));
  }
  if (type === 'REMOVED_FROM_SPACE') {
    await logLifecycle(event, 'REMOVED_FROM_SPACE');
    return new Response(null, { status: 200 });
  }
  if (type !== 'MESSAGE') {
    // CARD_CLICKED and friends: log quietly, no reply yet.
    await logLifecycle(event, type);
    return new Response(null, { status: 200 });
  }

  // 2. MESSAGE path.
  const message = event?.message || {};
  const messageName: string | undefined = message?.name;        // "spaces/<s>/messages/<m>"
  const threadName: string | undefined = message?.thread?.name; // "spaces/<s>/threads/<t>"
  const sender = message?.sender || event?.user || {};
  const senderEmail: string | null = (sender?.email as string | undefined) || null;
  const senderDisplay: string | null = (sender?.displayName as string | undefined) || null;
  const text_body: string | null = (message?.text as string | undefined) || (message?.argumentText as string | undefined) || null;
  const attachments: any[] = Array.isArray(message?.attachment) ? message.attachment : [];
  const space = event?.space || {};
  const space_name: string | null = space?.name || null;
  const space_display_name: string | null = (space?.displayName as string | undefined) || null;
  const event_time: string | null = (event?.eventTime as string | undefined) || null;

  if (!messageName) {
    // Nothing to dedupe on — safer to drop than to risk double-processing.
    return NextResponse.json(chatTextReply("I couldn't read your message — please try again."));
  }

  // 3. Dedupe on message resource name.
  const { data: existing } = await supabaseServer
    .from('google_chat_inbound')
    .select('id')
    .eq('message_name', messageName)
    .maybeSingle();
  if (existing) {
    // Meta/Google occasionally retry; stay silent on the duplicate.
    return new Response(null, { status: 200 });
  }

  // 4. Match sender → property via the shared FMX-079 router. Writes the
  //    cache on hit so FMX-080 outbound has a reach-path, and reads the
  //    cache on repeat messages so the match short-circuits.
  const route = senderEmail
    ? await resolveTenantRoute({ channel: 'google_chat', sender_id: senderEmail, sender_display_name: senderDisplay })
    : null;
  const property = route?.matched ? route.property : null;
  const tradeGuess = classifyTrade(text_body || '', senderDisplay || '') || null;

  const classification = {
    sender_known:  !!property,
    property_code: property?.short_code || null,
    message_type:  type,
    attachment_count: attachments.length,
    trade_guess:   tradeGuess,
    sender_display: senderDisplay,
    space_display: space_display_name,
    space_type: space?.type || space?.spaceType || null,
  };

  // 5. Log audit row early.
  const { data: inboxRow, error: insErr } = await supabaseServer
    .from('google_chat_inbound')
    .insert({
      event_time,
      message_name: messageName,
      space_name,
      space_display_name,
      sender_email: senderEmail,
      sender_display_name: senderDisplay,
      message_type: type,
      text_body,
      attachment_refs: attachments as any,
      property_id: property?.id || null,
      trade: tradeGuess,
      classification,
      status: 'pending',
      raw_event: event as any,
    })
    .select('id')
    .single();
  if (insErr || !inboxRow) {
    console.error('[chat] inbound insert failed', insErr);
    return NextResponse.json(chatTextReply("Logged, but something went wrong on my side. Please check with your FM."), { status: 200 });
  }

  // 6. Unknown sender: nudge once per 7 days across both gateways (rule
  //    lives in the FMX-079 router). Chat doesn't need the silent "sent
  //    silently" update because every reply is synchronous — we either
  //    speak back on this HTTP response or we don't speak at all.
  if (!property) {
    // route is null only when senderEmail was blank; treat that as first-time
    // so the sender at least gets told to sign in with a real org email.
    const nudge = !route || (!route.matched && route.firstTimeUnknown);
    const replyText = senderDisplay
      ? `Hi ${senderDisplay} — I don't recognise your email on the FMX register yet. Please ask your Facility Manager to add ${senderEmail || 'your email'} to your property record and try again.`
      : `I don't recognise your email on the FMX register yet. Please ask your Facility Manager to add it to your property record and try again.`;
    await supabaseServer
      .from('google_chat_inbound')
      .update({
        status: 'unknown_sender',
        reply_text: nudge ? replyText : null,
        reply_sent_at: nudge ? new Date().toISOString() : null,
      })
      .eq('id', inboxRow.id);
    return nudge
      ? NextResponse.json(chatTextReply(replyText, threadName))
      : new Response(null, { status: 200 });
  }

  // 7. Known sender → create DRAFT defect.
  const title = (text_body || '(Chat message with no text)').trim().slice(0, 200);
  const description = [
    `(Imported from Google Chat — ${senderDisplay || senderEmail})`,
    property.tenant_name ? `Tenant: ${property.tenant_name}` : null,
    space_display_name ? `Space: ${space_display_name}` : null,
    '',
    text_body || '(no text)',
    attachments.length ? `\n[${attachments.length} attachment${attachments.length === 1 ? '' : 's'}]` : null,
  ].filter(Boolean).join('\n').slice(0, 4000);

  const { data: newDefect, error: dErr } = await supabaseServer
    .from('defects')
    .insert({
      title,
      description,
      severity: 'moderate',
      status: 'draft',
      property_id: property.id,
      trade: tradeGuess,
      identified_at: new Date().toISOString(),
    })
    .select('id, defect_number')
    .single();
  if (dErr || !newDefect) {
    console.error('[chat] draft defect insert failed', dErr);
    await supabaseServer
      .from('google_chat_inbound')
      .update({ status: 'pending', classification: { ...classification, error: dErr?.message || 'draft insert failed' } })
      .eq('id', inboxRow.id);
    return NextResponse.json(chatTextReply("I logged your message but couldn't open a defect. Your FM will pick it up from the inbox.", threadName));
  }

  // 8. Attachments → Supabase Storage → defect photo_urls. Needs the service
  //    account; silently skipped (with a note) if SA isn't configured.
  const persistedPhotos: string[] = [];
  for (const att of attachments) {
    const dl = await downloadChatAttachment(att);
    if (!dl) continue;
    const ext =
      dl.mimeType.includes('jpeg') ? 'jpg' :
      dl.mimeType.includes('png')  ? 'png' :
      dl.mimeType.includes('webp') ? 'webp' :
      dl.mimeType.includes('heic') ? 'heic' :
      dl.mimeType.includes('pdf')  ? 'pdf'  :
                                     'bin';
    const yearMonth = new Date().toISOString().slice(0, 7);
    const safeName = (dl.filename || 'attachment').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const storagePath = `${newDefect.defect_number}/${yearMonth}/chat-${Date.now()}-${safeName}.${ext}`;
    const { error: upErr } = await supabaseServer.storage
      .from('defect-photos')
      .upload(storagePath, dl.bytes, { contentType: dl.mimeType, upsert: false });
    if (!upErr) {
      const { data: pub } = supabaseServer.storage.from('defect-photos').getPublicUrl(storagePath);
      if (pub?.publicUrl) persistedPhotos.push(pub.publicUrl);
    } else {
      console.warn(`[chat] upload failed:`, upErr.message);
    }
  }
  if (persistedPhotos.length > 0) {
    await supabaseServer
      .from('defects')
      .update({ photo_urls: persistedPhotos })
      .eq('id', newDefect.id);
  }

  const replyText = `Thanks${senderDisplay ? ` ${senderDisplay}` : ''} — logged as ${newDefect.defect_number} for ${property.short_code}. Your FM will review and come back to you.`;
  await supabaseServer
    .from('google_chat_inbound')
    .update({
      defect_id: newDefect.id,
      photo_urls: persistedPhotos,
      status: 'processed',
      reply_text: replyText,
      reply_sent_at: new Date().toISOString(),
    })
    .eq('id', inboxRow.id);

  // FMX-081: audit event for the tenant-initiated defect.
  await logAudit({
    actor_kind: 'tenant',
    actor_id: senderEmail,
    actor_display: senderDisplay,
    action: 'tenant_message.received',
    channel: 'google_chat',
    target_table: 'defects',
    target_id: newDefect.id as string,
    target_ref: newDefect.defect_number as string,
    property_id: property.id,
    context: { attachments: attachments.length, trade: tradeGuess, space: space_name },
  });

  return NextResponse.json(chatTextReply(replyText, threadName));
}

// Sender match lives in `src/lib/tenant-routing/resolve.ts` (FMX-079).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logLifecycle(event: any, markerType: string): Promise<void> {
  const messageName = `lifecycle/${markerType}/${event?.space?.name || 'unknown'}/${event?.eventTime || Date.now()}`;
  const sender = event?.user || {};
  try {
    await supabaseServer.from('google_chat_inbound').insert({
      event_time: event?.eventTime || null,
      message_name: messageName,
      space_name: event?.space?.name || null,
      space_display_name: event?.space?.displayName || null,
      sender_email: sender?.email || null,
      sender_display_name: sender?.displayName || null,
      message_type: markerType,
      classification: { lifecycle: true },
      status: 'ignored',
      raw_event: event,
    });
  } catch (e: any) {
    // Lifecycle entries are nice-to-have audit — never block the response.
    console.warn('[chat] lifecycle insert failed', e?.message);
  }
}

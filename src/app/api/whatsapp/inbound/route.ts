// FMX-077: WhatsApp Cloud API inbound webhook.
//
// Pattern mirrors /api/email/route.ts:
//   1. Verify request (GET: hub.challenge; POST: X-Hub-Signature-256 HMAC)
//   2. Dedupe on Meta's wa_message_id — Meta retries aggressively
//   3. Resolve sender → tenant → property via normalised phone match
//   4. Log every message to `whatsapp_inbound` as audit trail first
//   5. Create a DRAFT defect scoped to the matched property (nothing opens
//      silently — Carl promotes from /email-inbox or /defects)
//   6. Download media to Supabase Storage, append to defect photo_urls
//   7. Send a confirmation reply to the sender inside Meta's 24h window
//   8. Unknown senders get a one-time "we don't recognise this number" reply
//      (idempotent: logged with status='unknown_sender' so we don't spam)
//
// Meta webhook URL to configure in the WhatsApp Business Platform dashboard:
//   https://<your-domain>/api/whatsapp/inbound
// Subscribe to: messages
// Verify token: whatever WHATSAPP_VERIFY_TOKEN env var is set to.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import {
  verifyMetaSignature,
  downloadWhatsAppMedia,
  sendWhatsAppText,
  normalisePhoneDigits,
} from '@/lib/whatsapp/client';
import { classifyTrade } from '@/lib/trade/classify';
import { resolveTenantRoute } from '@/lib/tenant-routing/resolve';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// GET — webhook verification handshake (Meta's initial subscribe challenge).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    // Meta expects the challenge echoed as a bare string.
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new Response('Forbidden', { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — incoming message events.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // 1. Signature verify over the *raw* body. Next.js's req.json() reparses,
  //    so read text first and keep it for the HMAC.
  const rawBody = await request.text();
  const sig = request.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(rawBody, sig)) {
    console.warn('[whatsapp] Bad or missing X-Hub-Signature-256');
    return new Response('Forbidden', { status: 403 });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response('Bad JSON', { status: 400 }); }

  if (payload?.object !== 'whatsapp_business_account') {
    // Not our webhook. Reply 200 so Meta doesn't retry.
    return NextResponse.json({ ok: true, ignored: 'not a whatsapp_business_account event' });
  }

  // 2. Walk every message in every change. Meta batches, so there can be
  //    several per POST. Each message is processed independently so one
  //    failure doesn't poison the batch.
  const results: Array<{ wa_message_id?: string; ok: boolean; note?: string }> = [];

  for (const entry of (payload.entry || [])) {
    for (const change of (entry.changes || [])) {
      const value = change?.value;
      if (!value) continue;
      const phoneNumberId = value?.metadata?.phone_number_id || null;
      const contacts = value?.contacts || [];
      const messages = value?.messages || [];

      // Index contacts by wa_id for name lookup.
      const nameByWaId = new Map<string, string>();
      for (const c of contacts) {
        if (c?.wa_id && c?.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
      }

      for (const msg of messages) {
        try {
          const result = await handleMessage(msg, {
            phoneNumberId,
            fromName: nameByWaId.get(msg?.from) || null,
            rawPayload: payload,
          });
          results.push({ wa_message_id: msg?.id, ...result });
        } catch (e: any) {
          console.error('[whatsapp] message handler threw', e?.message);
          results.push({ wa_message_id: msg?.id, ok: false, note: e?.message });
        }
      }
    }
  }

  // Meta only needs a 200 — retries happen on non-2xx, which we want to avoid
  // once we've acknowledged by inserting into whatsapp_inbound.
  return NextResponse.json({ ok: true, processed: results.length, results });
}

// ---------------------------------------------------------------------------
// Per-message handler.
// ---------------------------------------------------------------------------

type MsgCtx = {
  phoneNumberId: string | null;
  fromName: string | null;
  rawPayload: unknown;
};

async function handleMessage(msg: any, ctx: MsgCtx): Promise<{ ok: boolean; note?: string }> {
  const wa_message_id = msg?.id as string | undefined;
  const from = msg?.from as string | undefined;          // digits, no +
  const type = (msg?.type as string | undefined) || 'unknown';
  if (!wa_message_id || !from) return { ok: false, note: 'missing id or sender' };

  // 3. Dedupe on wa_message_id. Meta retries; we insert once and ignore the rest.
  const { data: existing } = await supabaseServer
    .from('whatsapp_inbound')
    .select('id')
    .eq('wa_message_id', wa_message_id)
    .maybeSingle();
  if (existing) return { ok: true, note: 'deduped' };

  // 4. Pull text + media ids out of the message envelope. Meta nests these
  //    differently by type; this keeps the extraction tight to the types we
  //    actually accept at this stage.
  const text_body: string | null =
    msg?.text?.body ??
    msg?.image?.caption ??
    msg?.document?.caption ??
    msg?.video?.caption ??
    null;

  const mediaIds: string[] = [];
  if (msg?.image?.id)    mediaIds.push(msg.image.id);
  if (msg?.document?.id) mediaIds.push(msg.document.id);
  if (msg?.video?.id)    mediaIds.push(msg.video.id);   // we persist as attachment, not inline thumb

  // 5. Sender → tenant → property via the shared FMX-079 router. Normalises
  //    the wa_id, checks the route cache, falls back to live phone match,
  //    and writes the cache on hit so FMX-080 outbound has a reach-path.
  const fromDigits = normalisePhoneDigits(from);
  const route = await resolveTenantRoute({
    channel: 'whatsapp',
    sender_id: fromDigits,
    sender_display_name: ctx.fromName,
  });
  const property = route.matched ? route.property : null;

  // Trade guess — same classifier email uses, so the register stays consistent.
  const tradeGuess = classifyTrade(text_body || '', ctx.fromName || '') || null;

  // Severity: no keyword mapping yet — tenant free-text rarely fits the
  // critical/major patterns, and promoting the draft is where Carl sets it
  // anyway. Default 'moderate' and let the FM override on promote.
  const severityGuess: string | null = null;

  const classification = {
    sender_known:  !!property,
    property_code: property?.short_code || null,
    message_type:  type,
    media_count:   mediaIds.length,
    trade_guess:   tradeGuess,
    from_name:     ctx.fromName,
  };

  // 6. Insert audit row early — even if steps below fail, we have a record.
  const { data: inboxRow, error: insErr } = await supabaseServer
    .from('whatsapp_inbound')
    .insert({
      wa_message_id,
      from_wa_id: from,
      from_name: ctx.fromName,
      phone_number_id: ctx.phoneNumberId,
      message_type: type,
      text_body,
      media_ids: mediaIds,
      property_id: property?.id || null,
      trade: tradeGuess,
      severity: severityGuess,
      classification,
      status: 'pending',
      raw_payload: ctx.rawPayload as any,
    })
    .select('id')
    .single();
  if (insErr || !inboxRow) {
    console.error('[whatsapp] inbound insert failed', insErr);
    return { ok: false, note: insErr?.message || 'insert failed' };
  }

  // 7. Unknown sender: one-time gentle reply (first-time-unknown rule lives
  //    in the shared router so the window is honoured across every gateway),
  //    mark the row, bail out.
  if (!property) {
    let reply_text: string | null = null;
    let reply_sent_at: string | null = null;
    if (!route.matched && route.firstTimeUnknown) {
      const copy =
        `Hi${ctx.fromName ? ` ${ctx.fromName}` : ''} — we don't recognise this number on the FMX register yet. ` +
        `Please ask your Facility Manager to add your contact number so your messages land on the right property.`;
      const r = await sendWhatsAppText(from, copy);
      if (r.ok) { reply_text = copy; reply_sent_at = new Date().toISOString(); }
    }
    await supabaseServer
      .from('whatsapp_inbound')
      .update({
        status: 'unknown_sender',
        reply_text,
        reply_sent_at,
      })
      .eq('id', inboxRow.id);
    return { ok: true, note: 'unknown_sender' };
  }

  // 8. Known sender → create DRAFT defect scoped to the matched property.
  //    Status stays 'draft' so Carl reviews via /email-inbox-style queue
  //    before it opens (promote-to-open is a separate step).
  const title = (text_body || '(WhatsApp message with no text)').trim().slice(0, 200);
  const descriptionParts: string[] = [
    `(Imported from WhatsApp — ${ctx.fromName || from})`,
    property.tenant_name ? `Tenant: ${property.tenant_name}` : null,
    '',
    text_body || '(no text)',
    mediaIds.length ? `\n[${mediaIds.length} media attachment${mediaIds.length === 1 ? '' : 's'}]` : null,
  ].filter(Boolean) as string[];
  const description = descriptionParts.join('\n').slice(0, 4000);

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
    console.error('[whatsapp] draft defect insert failed', dErr);
    await supabaseServer
      .from('whatsapp_inbound')
      .update({ status: 'pending', classification: { ...classification, error: dErr?.message || 'draft insert failed' } })
      .eq('id', inboxRow.id);
    return { ok: false, note: dErr?.message || 'draft insert failed' };
  }

  // 9. Media download → Supabase Storage → append to defect photo_urls.
  //    Image/video/doc all go to the defect-photos bucket at this stage; the
  //    bucket is unmoderated by filetype. (Reviewing non-image attachments
  //    separately would be a follow-up if the tenant pattern demands it.)
  const persistedPhotos: string[] = [];
  for (const mid of mediaIds) {
    const media = await downloadWhatsAppMedia(mid);
    if (!media) continue;
    const ext =
      media.mimeType.includes('jpeg') ? 'jpg' :
      media.mimeType.includes('png')  ? 'png' :
      media.mimeType.includes('webp') ? 'webp' :
      media.mimeType.includes('heic') ? 'heic' :
      media.mimeType.includes('heif') ? 'heif' :
      media.mimeType.includes('mp4')  ? 'mp4'  :
      media.mimeType.includes('pdf')  ? 'pdf'  :
                                         'bin';
    const yearMonth = new Date().toISOString().slice(0, 7);
    const storagePath = `${newDefect.defect_number}/${yearMonth}/whatsapp-${Date.now()}-${mid}.${ext}`;
    const { error: upErr } = await supabaseServer.storage
      .from('defect-photos')
      .upload(storagePath, media.bytes, { contentType: media.mimeType, upsert: false });
    if (!upErr) {
      const { data: pub } = supabaseServer.storage.from('defect-photos').getPublicUrl(storagePath);
      if (pub?.publicUrl) persistedPhotos.push(pub.publicUrl);
    } else {
      console.warn(`[whatsapp] upload failed for ${mid}:`, upErr.message);
    }
  }

  if (persistedPhotos.length > 0) {
    await supabaseServer
      .from('defects')
      .update({ photo_urls: persistedPhotos })
      .eq('id', newDefect.id);
  }

  // 10. Reply inside Meta's 24h service window — free-form text is allowed.
  const reply = `Thanks${ctx.fromName ? ` ${ctx.fromName}` : ''} — logged as ${newDefect.defect_number} for ${property.short_code}. Your FM will review and come back to you.`;
  const sent = await sendWhatsAppText(from, reply);
  const reply_sent_at = sent.ok ? new Date().toISOString() : null;

  await supabaseServer
    .from('whatsapp_inbound')
    .update({
      defect_id: newDefect.id,
      photo_urls: persistedPhotos,
      status: 'processed',
      reply_text: sent.ok ? reply : null,
      reply_sent_at,
    })
    .eq('id', inboxRow.id);

  // FMX-081: audit event for the tenant-initiated defect.
  await logAudit({
    actor_kind: 'tenant',
    actor_id: from,
    actor_display: ctx.fromName,
    action: 'tenant_message.received',
    channel: 'whatsapp',
    target_table: 'defects',
    target_id: newDefect.id as string,
    target_ref: newDefect.defect_number as string,
    property_id: property.id,
    context: { attachments: mediaIds.length, trade: tradeGuess, from_wa_id: from },
  });

  return { ok: true, note: `draft ${newDefect.defect_number} on ${property.short_code}` };
}

// Sender match + unknown-sender suppression live in `src/lib/tenant-routing/resolve.ts` (FMX-079).

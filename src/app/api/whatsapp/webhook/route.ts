// WhatsApp webhook endpoint. Meta calls this to:
//   1. Verify ownership (GET request with query params)
//   2. Deliver inbound messages (POST request with JSON body)
//
// Meta docs: https://developers.facebook.com/docs/graph-api/webhooks

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { verifyWebhookSignature, normaliseE164 } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// -------------------------------------------------------------------------
// GET — webhook verification handshake
// -------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && expected && token === expected) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// -------------------------------------------------------------------------
// POST — inbound message + status updates
// -------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Read raw body for signature verification, then parse.
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('WhatsApp webhook signature verification failed');
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // Meta delivers events wrapped in entry[].changes[].value
  const entries: any[] = payload?.entry || [];
  for (const entry of entries) {
    const changes: any[] = entry?.changes || [];
    for (const change of changes) {
      const value = change?.value || {};
      // Inbound messages
      for (const msg of value.messages || []) {
        try {
          await ingestInboundMessage(msg, value);
        } catch (e) {
          console.error('Failed to ingest inbound message', e, msg);
        }
      }
      // Status updates on our outbound messages (sent → delivered → read)
      for (const st of value.statuses || []) {
        try {
          await ingestStatus(st);
        } catch (e) {
          console.error('Failed to ingest status', e, st);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// -------------------------------------------------------------------------
async function ingestInboundMessage(msg: any, value: any) {
  const from = normaliseE164(msg.from || '');
  const waMessageId = msg.id;
  const type = msg.type || 'text';

  let body: string | null = null;
  let mediaUrls: string[] = [];

  switch (type) {
    case 'text':
      body = msg.text?.body || null;
      break;
    case 'image':
      body = msg.image?.caption || null;
      if (msg.image?.link) mediaUrls.push(msg.image.link);
      break;
    case 'video':
      body = msg.video?.caption || null;
      if (msg.video?.link) mediaUrls.push(msg.video.link);
      break;
    case 'document':
      body = msg.document?.caption || msg.document?.filename || null;
      if (msg.document?.link) mediaUrls.push(msg.document.link);
      break;
    case 'audio':
    case 'voice':
      if (msg.audio?.link || msg.voice?.link) {
        mediaUrls.push(msg.audio?.link || msg.voice?.link);
      }
      break;
    case 'button':
      body = msg.button?.text || null;
      break;
    case 'interactive':
      body = msg.interactive?.button_reply?.title
          || msg.interactive?.list_reply?.title
          || null;
      break;
    default:
      body = `[${type} message received]`;
  }

  // Try to link to a provider by WhatsApp number.
  let providerId: string | null = null;
  const { data: matchedProvider } = await supabaseServer
    .from('providers')
    .select('id')
    .eq('whatsapp_number', from.startsWith('+') ? from : `+${from}`)
    .maybeSingle();
  if (matchedProvider) providerId = matchedProvider.id;
  else {
    // Fallback: try without leading +
    const { data: alt } = await supabaseServer
      .from('providers')
      .select('id')
      .eq('whatsapp_number', from)
      .maybeSingle();
    if (alt) providerId = alt.id;
  }

  // Try to link to the most recent outbound defect thread with this vendor.
  let defectId: string | null = null;
  if (providerId) {
    const { data: lastOutbound } = await supabaseServer
      .from('whatsapp_messages')
      .select('defect_id')
      .eq('provider_id', providerId)
      .eq('direction', 'outbound')
      .not('defect_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastOutbound?.defect_id) defectId = lastOutbound.defect_id;
  }

  await supabaseServer.from('whatsapp_messages').insert({
    direction: 'inbound',
    from_number: from,
    to_number: process.env.WHATSAPP_PHONE_NUMBER_ID || 'FMX',
    provider_id: providerId,
    defect_id: defectId,
    wa_message_id: waMessageId,
    body,
    media_urls: mediaUrls,
    message_type: type,
    status: 'received',
    metadata: { message: msg, value_context: value?.contacts },
  });
}

// -------------------------------------------------------------------------
async function ingestStatus(st: any) {
  const waMessageId = st.id;
  const status = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
  const timestamp = st.timestamp ? new Date(parseInt(st.timestamp, 10) * 1000).toISOString() : new Date().toISOString();

  const patch: Record<string, any> = { status };
  if (status === 'delivered') patch.delivered_at = timestamp;
  if (status === 'read') patch.read_at = timestamp;
  if (status === 'failed') patch.error_message = st.errors?.[0]?.title || 'failed';

  await supabaseServer
    .from('whatsapp_messages')
    .update(patch)
    .eq('wa_message_id', waMessageId);
}

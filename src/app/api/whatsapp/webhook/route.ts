// WhatsApp webhook endpoint. Meta calls this to:
//   1. Verify ownership (GET request with query params)
//   2. Deliver inbound messages (POST request with JSON body)
//
// Meta docs: https://developers.facebook.com/docs/graph-api/webhooks

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import {
  verifyWebhookSignature,
  normaliseE164,
  fetchMediaBytes,
  extensionFor,
  sendText,
  isConfigured as isWhatsAppConfigured,
} from '@/lib/whatsapp';
import { uploadDefectPhotoToDropbox, isDropboxConfigured } from '@/lib/dropbox';

const MIN_PHOTOS_FOR_RESOLUTION = 2;

// -------------------------------------------------------------------------
// Status-change parsing — vendors reply in natural language. We treat clear
// progress signals as status transitions; anything ambiguous stays an open
// defect and Carl handles it manually.
// -------------------------------------------------------------------------
const RESOLVED_KEYWORDS = [
  'done', 'resolved', 'fixed', 'completed', 'complete', 'finished',
  'repaired', 'sorted', 'closed', 'all good', 'sorted out',
];
const WORK_ORDERED_KEYWORDS = [
  'started', 'on it', 'en route', 'otw', 'on the way', 'on my way',
  'scheduled', 'booked', 'coming', 'attending', 'tomorrow', 'later today',
  'this afternoon', 'this morning', 'will attend', 'will come', 'will fix',
  'quote', 'quotation',
];

function detectStatusTransition(body: string | null): 'resolved' | 'work_ordered' | null {
  if (!body) return null;
  const text = body.toLowerCase();
  for (const kw of RESOLVED_KEYWORDS) {
    // word-boundary-ish — avoid matching 'undone' or 'closed-circuit'
    const re = new RegExp(`(^|[^a-z])${kw.replace(/\s/g, '\\s+')}($|[^a-z])`, 'i');
    if (re.test(text)) return 'resolved';
  }
  for (const kw of WORK_ORDERED_KEYWORDS) {
    const re = new RegExp(`(^|[^a-z])${kw.replace(/\s/g, '\\s+')}($|[^a-z])`, 'i');
    if (re.test(text)) return 'work_ordered';
  }
  return null;
}

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
  // Meta sends a media_id (not a public URL). We'll download the bytes after
  // provider+defect matching, then persist to Supabase Storage and (optionally)
  // mirror to Dropbox. The final persisted URLs land in mediaUrls.
  const mediaIds: { id: string; kind: 'image' | 'video' | 'document' | 'audio' }[] = [];

  switch (type) {
    case 'text':
      body = msg.text?.body || null;
      break;
    case 'image':
      body = msg.image?.caption || null;
      if (msg.image?.id) mediaIds.push({ id: msg.image.id, kind: 'image' });
      break;
    case 'video':
      body = msg.video?.caption || null;
      if (msg.video?.id) mediaIds.push({ id: msg.video.id, kind: 'video' });
      break;
    case 'document':
      body = msg.document?.caption || msg.document?.filename || null;
      if (msg.document?.id) mediaIds.push({ id: msg.document.id, kind: 'document' });
      break;
    case 'audio':
    case 'voice':
      if (msg.audio?.id || msg.voice?.id) {
        mediaIds.push({ id: msg.audio?.id || msg.voice?.id, kind: 'audio' });
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

  // ---------------------------------------------------------------------
  // Download + persist any attached media BEFORE we insert the message row,
  // so media_urls contains durable Supabase Storage URLs, not short-lived
  // Meta links. Also mirrors to Dropbox under the defect's property folder.
  // ---------------------------------------------------------------------
  const defectContext = defectId ? await loadDefectContext(defectId) : null;
  const mediaUrls: string[] = [];
  if (mediaIds.length > 0) {
    for (const m of mediaIds) {
      const persisted = await persistInboundMedia(m.id, m.kind, defectContext);
      if (persisted) mediaUrls.push(persisted);
    }
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

  // ---------------------------------------------------------------------
  // Auto-promote defect status if the vendor's message signals progress.
  // Only runs when we matched both a provider AND an open defect.
  // ---------------------------------------------------------------------
  if (providerId && defectId && defectContext) {
    const transition = detectStatusTransition(body);
    if (transition) {
      try {
        await maybePromoteDefect(defectContext, providerId, transition, body, mediaUrls, from);
      } catch (e) {
        console.error('Failed to promote defect status from WhatsApp', e);
      }
    } else if (mediaUrls.length > 0) {
      // Media without status language — attach to defect gallery.
      try {
        await appendDefectPhotos(defectContext, mediaUrls);
      } catch (e) {
        console.error('Failed to append defect photos', e);
      }
    }
  }
}

// -------------------------------------------------------------------------
// Load the defect + its property short_code once so we can route the Dropbox
// mirror to the right property folder.
// -------------------------------------------------------------------------
type DefectContext = {
  id: string;
  defect_number: string;
  status: string | null;
  photo_urls: string[];
  property_short_code: string;
};

async function loadDefectContext(defectId: string): Promise<DefectContext | null> {
  const { data } = await supabaseServer
    .from('defects')
    .select(`
      id, defect_number, status, photo_urls,
      property:property_id ( short_code )
    `)
    .eq('id', defectId)
    .maybeSingle();
  if (!data) return null;
  const prop = (data.property as unknown) as { short_code: string } | null;
  return {
    id: data.id,
    defect_number: data.defect_number,
    status: data.status,
    photo_urls: Array.isArray(data.photo_urls) ? data.photo_urls : [],
    property_short_code: prop?.short_code || 'KGF',
  };
}

// -------------------------------------------------------------------------
// Download a Meta-hosted media_id, upload to Supabase Storage, and mirror to
// Dropbox under the defect's property folder. Returns the public Supabase URL.
// -------------------------------------------------------------------------
async function persistInboundMedia(
  mediaId: string,
  kind: 'image' | 'video' | 'document' | 'audio',
  defect: DefectContext | null,
): Promise<string | null> {
  const fetched = await fetchMediaBytes(mediaId);
  if (!fetched.ok || !fetched.bytes) {
    console.warn(`[whatsapp] Media download failed for ${mediaId}:`, fetched.error);
    return null;
  }
  const ext = extensionFor(fetched.mimeType || '');
  const yearMonth = new Date().toISOString().slice(0, 7);  // YYYY-MM
  const defectNo = defect?.defect_number || 'unlinked';
  const filename = `${Date.now()}-${mediaId.slice(-8)}.${ext}`;
  const storagePath = `${defectNo}/${yearMonth}/${filename}`;

  // 1. Primary: upload to Supabase Storage (defect-photos bucket).
  const { error: upErr } = await supabaseServer.storage
    .from('defect-photos')
    .upload(storagePath, fetched.bytes, {
      contentType: fetched.mimeType,
      upsert: false,
    });
  if (upErr) {
    console.error(`[whatsapp] Supabase upload failed for ${storagePath}:`, upErr.message);
    return null;
  }

  const { data: pub } = supabaseServer.storage
    .from('defect-photos')
    .getPublicUrl(storagePath);
  const publicUrl = pub?.publicUrl || null;

  // 2. Best-effort Dropbox mirror → /KGF/{Property}/02_Photos/{YYYY-MM}/{DEF-xxxx}/
  if (defect && isDropboxConfigured()) {
    const mirror = await uploadDefectPhotoToDropbox(
      defect.property_short_code,
      defect.defect_number,
      yearMonth,
      filename,
      fetched.bytes,
      fetched.mimeType || 'application/octet-stream',
    );
    if (!mirror.ok) {
      console.warn(`[whatsapp] Dropbox photo mirror failed:`, mirror.error);
    } else {
      console.log(`[whatsapp] Dropbox photo mirror OK → ${mirror.path}`);
    }
  }

  return publicUrl;
}

// -------------------------------------------------------------------------
// Promote a defect's status based on vendor WhatsApp signal. Never downgrades
// (resolved stays resolved). Enforces the 2-photo soft gate on resolution:
// if the vendor says 'done' but fewer than MIN_PHOTOS_FOR_RESOLUTION photos
// are on file, we promote to work_ordered instead and WhatsApp back asking
// for the shortfall. Logs a defect_updates audit row either way.
// -------------------------------------------------------------------------
async function maybePromoteDefect(
  defect: DefectContext,
  providerId: string,
  requestedStatus: 'resolved' | 'work_ordered',
  notes: string | null,
  newMediaUrls: string[],
  vendorPhone: string,
) {
  // Guard rails: don't move backwards, don't thrash.
  if (defect.status === 'resolved') return;
  if (defect.status === 'work_ordered' && requestedStatus === 'work_ordered') return;

  // Combined photo count after this message's attachments.
  const combinedPhotos = [...defect.photo_urls, ...newMediaUrls];

  // 2-photo soft gate for resolve. If short, downgrade this transition to
  // work_ordered and ask the vendor for the remainder.
  let nextStatus = requestedStatus;
  let gatedForPhotos = false;
  if (requestedStatus === 'resolved' && combinedPhotos.length < MIN_PHOTOS_FOR_RESOLUTION) {
    nextStatus = 'work_ordered';
    gatedForPhotos = true;
  }

  // If the gated downgrade would be a no-op (already work_ordered), still
  // append photos but skip the status write.
  const skipStatusWrite = gatedForPhotos && defect.status === 'work_ordered';

  const now = new Date().toISOString();
  const patch: Record<string, any> = {};
  if (!skipStatusWrite) patch.status = nextStatus;
  if (nextStatus === 'resolved') {
    patch.resolved_at = now;
    patch.resolution_notes = notes || 'Resolved via WhatsApp reply from vendor.';
  }
  if (newMediaUrls.length > 0) {
    patch.photo_urls = combinedPhotos;
  }

  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await supabaseServer
      .from('defects')
      .update(patch)
      .eq('id', defect.id);
    if (upErr) {
      console.error('Defect status update failed:', upErr);
      return;
    }
  }

  // Audit trail — always log the vendor's intent + what we actually did.
  if (!skipStatusWrite || gatedForPhotos) {
    await supabaseServer.from('defect_updates').insert({
      defect_id: defect.id,
      provider_id: providerId,
      status_from: defect.status,
      status_to: skipStatusWrite ? defect.status : nextStatus,
      notes: gatedForPhotos
        ? `${notes || '(vendor signalled done)'} — gated: only ${combinedPhotos.length}/${MIN_PHOTOS_FOR_RESOLUTION} photos received`
        : (notes || null),
      photo_urls: newMediaUrls.length ? newMediaUrls : null,
      source: 'whatsapp_inbound',
    });
  }

  // Nudge the vendor if we gated for photos.
  if (gatedForPhotos && isWhatsAppConfigured()) {
    const needed = MIN_PHOTOS_FOR_RESOLUTION - combinedPhotos.length;
    try {
      await sendText({
        to: vendorPhone,
        body: `Thanks. Before I can close ${defect.defect_number}, please send ${needed} more photo${needed === 1 ? '' : 's'} (ideally a before/after). Reply "done" after sending.`,
      });
    } catch (e) {
      console.error('[whatsapp] Nudge send failed:', e);
    }
  }

  // Bust Vercel edge cache for every page that reads this defect's state.
  revalidatePath('/defects');
  revalidatePath(`/defects/${defect.defect_number}`);
  revalidatePath('/update-defect');
  revalidatePath('/');
  revalidatePath('/maintenance');
  revalidatePath('/properties', 'layout');

  console.log(
    `[whatsapp] Auto-promoted ${defect.defect_number}: ${defect.status} → ${nextStatus}`,
  );
}

async function appendDefectPhotos(defect: DefectContext, mediaUrls: string[]) {
  await supabaseServer
    .from('defects')
    .update({ photo_urls: [...defect.photo_urls, ...mediaUrls] })
    .eq('id', defect.id);
  revalidatePath(`/defects/${defect.defect_number}`);
  revalidatePath('/defects');
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

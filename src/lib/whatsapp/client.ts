// FMX-077: WhatsApp Cloud API helpers.
//
// This module is the single trust boundary between the webhook route and
// Meta's Graph API. It knows nothing about defects or properties — just
// how to verify a request came from Meta, how to download a media blob
// by id, and how to send a plain text reply back to a wa_id.
//
// Required env vars (set in Vercel + `.env.local`):
//   • WHATSAPP_VERIFY_TOKEN     — arbitrary string shared with Meta's webhook
//                                  verify flow. Returned as hub.challenge during
//                                  webhook registration.
//   • WHATSAPP_APP_SECRET       — the App Secret from the Meta app settings.
//                                  Used to verify the X-Hub-Signature-256 HMAC
//                                  on every POST.
//   • WHATSAPP_ACCESS_TOKEN     — System User access token with
//                                  whatsapp_business_messaging + whatsapp_business_management
//                                  scopes. Used to download media and send messages.
//   • WHATSAPP_PHONE_NUMBER_ID  — the WABA phone number id (NOT the +679 number).
//                                  Used as the path segment when sending messages.
//
// Graph API version is pinned locally so Meta-side upgrades don't silently
// change behaviour. Bump when a security/feature window opens.

import { createHmac, timingSafeEqual } from 'crypto';

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the X-Hub-Signature-256 header against the raw request body, using
 * the Meta App Secret. Meta sends `sha256=<hex>`; we recompute and
 * timing-safe-compare. On any missing input / mismatch / env-not-set we
 * return false — callers reject the request. Never log the secret or the
 * expected hash.
 */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Fail closed. If the ops person forgot to set the secret, better to drop
    // messages than to accept forgeries.
    console.warn('[whatsapp] WHATSAPP_APP_SECRET not set — refusing all webhooks');
    return false;
  }
  if (!header || !header.startsWith('sha256=')) return false;

  const provided = header.slice('sha256='.length).trim();
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  // Both must be the same length for timingSafeEqual.
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Media download
// ---------------------------------------------------------------------------

export type DownloadedMedia = {
  bytes: Buffer;
  mimeType: string;
  sha256?: string;
  filename?: string;
};

/**
 * Fetch a media blob by Meta media id. Two-step: lookup returns a short-lived
 * signed URL, then we download the bytes with the same bearer token. Returns
 * null on any failure; callers fall back to logging the media id in the audit
 * row so nothing is silently lost.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<DownloadedMedia | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    console.warn('[whatsapp] WHATSAPP_ACCESS_TOKEN not set — cannot download media');
    return null;
  }
  try {
    const metaRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.warn(`[whatsapp] media lookup failed for ${mediaId}: ${metaRes.status}`);
      return null;
    }
    const meta = await metaRes.json() as { url?: string; mime_type?: string; sha256?: string; file_size?: number };
    if (!meta.url) return null;

    const blobRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!blobRes.ok) {
      console.warn(`[whatsapp] media fetch failed for ${mediaId}: ${blobRes.status}`);
      return null;
    }
    const bytes = Buffer.from(await blobRes.arrayBuffer());
    return {
      bytes,
      mimeType: meta.mime_type || blobRes.headers.get('content-type') || 'application/octet-stream',
      sha256: meta.sha256,
    };
  } catch (e: any) {
    console.warn(`[whatsapp] media download threw for ${mediaId}:`, e?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outbound text reply
// ---------------------------------------------------------------------------

/**
 * Send a plain-text message to a wa_id. Returns the Meta message id on
 * success, or null on failure. Within Meta's 24h "service window" this works
 * freely; outside it, Meta requires a pre-approved template — FMX-080
 * handles that path. For FMX-077 we only reply inside the window (the
 * tenant just messaged us), so plain text is correct.
 */
export async function sendWhatsAppText(
  waId: string,
  body: string,
): Promise<{ ok: true; message_id: string } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set.' };
  try {
    const res = await fetch(`${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: waId,
        type: 'text',
        text: { body: body.slice(0, 4096) },   // Meta caps text at 4096 chars
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.warn('[whatsapp] send failed', json);
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    }
    const messageId = json?.messages?.[0]?.id as string | undefined;
    if (!messageId) return { ok: false, error: 'No message id returned.' };
    return { ok: true, message_id: messageId };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'send threw' };
  }
}

// ---------------------------------------------------------------------------
// Phone-number normalisation for tenant matching
// ---------------------------------------------------------------------------

/**
 * Normalise a phone number for matching across free-text tenant_contact_phone
 * values and WhatsApp wa_id. Strips every non-digit so "+679 777 1234",
 * "679 777 1234", "67977712 34" and "+6797771234" all collapse to the same
 * digit string. The caller still needs to decide whether to match on full
 * number or a suffix.
 */
export function normalisePhoneDigits(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\D+/g, '');
}

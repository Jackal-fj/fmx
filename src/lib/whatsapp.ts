// WhatsApp Cloud API wrapper — Meta Graph API v21.
//
// All calls are server-only (require WHATSAPP_ACCESS_TOKEN env var). Never
// import this module from a Client Component.
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

import crypto from 'crypto';

const API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;

export function isConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

function requireCredentials() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) {
    throw new Error(
      'WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN env vars.',
    );
  }
  return { phoneId, token };
}

// Normalise a phone number to E.164 digits-only for Meta API. Meta accepts
// numbers with or without a leading +, but rejects spaces/dashes. Fiji
// example: '+679 999 1234' → '6799991234'.
export function normaliseE164(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

type SendTextArgs = {
  to: string;                    // E.164 recipient (with or without +)
  body: string;                  // message text (max 4096 chars)
};

export async function sendText({ to, body }: SendTextArgs): Promise<{
  wa_message_id: string | null;
  raw: any;
  ok: boolean;
  error?: string;
}> {
  const { phoneId, token } = requireCredentials();
  const url = `${GRAPH_BASE}/${phoneId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normaliseE164(to),
      type: 'text',
      text: { body, preview_url: false },
    }),
  });

  const raw = await res.json();
  const wa_message_id = raw?.messages?.[0]?.id || null;

  return {
    wa_message_id,
    raw,
    ok: res.ok,
    error: res.ok ? undefined : (raw?.error?.message || `HTTP ${res.status}`),
  };
}

type SendImageArgs = {
  to: string;
  imageUrl: string;              // public URL, must be reachable by Meta
  caption?: string;              // max 1024 chars
};

export async function sendImage({ to, imageUrl, caption }: SendImageArgs): Promise<{
  wa_message_id: string | null;
  raw: any;
  ok: boolean;
  error?: string;
}> {
  const { phoneId, token } = requireCredentials();
  const url = `${GRAPH_BASE}/${phoneId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normaliseE164(to),
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption ? { caption } : {}),
      },
    }),
  });

  const raw = await res.json();
  const wa_message_id = raw?.messages?.[0]?.id || null;

  return {
    wa_message_id,
    raw,
    ok: res.ok,
    error: res.ok ? undefined : (raw?.error?.message || `HTTP ${res.status}`),
  };
}

// -------------------------------------------------------------------------
// Media download — Meta's inbound-message media URLs are short-lived and
// auth-gated. Two-step flow:
//   1. GET /{media_id}         → returns { url, mime_type, sha256, file_size }
//   2. GET that url            → returns the raw bytes (both calls use Bearer token)
// Caller then persists the bytes to Supabase Storage for permanent access.
// -------------------------------------------------------------------------
export async function fetchMediaBytes(mediaId: string): Promise<{
  ok: boolean;
  bytes?: Buffer;
  mimeType?: string;
  error?: string;
}> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN not configured' };

  try {
    // 1. Look up the signed URL.
    const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      const text = await metaRes.text();
      return { ok: false, error: `Media lookup ${metaRes.status}: ${text.slice(0, 200)}` };
    }
    const meta: { url?: string; mime_type?: string } = await metaRes.json();
    if (!meta.url) return { ok: false, error: 'Media lookup returned no url' };

    // 2. Download the bytes (same bearer required).
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!binRes.ok) {
      return { ok: false, error: `Media download ${binRes.status}` };
    }
    const ab = await binRes.arrayBuffer();
    return {
      ok: true,
      bytes: Buffer.from(ab),
      mimeType: meta.mime_type || binRes.headers.get('content-type') || 'application/octet-stream',
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Media download failed' };
  }
}

// Extension for a given mime type, so we store sensible filenames.
export function extensionFor(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('aac')) return 'aac';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('pdf')) return 'pdf';
  return 'bin';
}

// Verify a webhook request came from Meta by checking the HMAC-SHA256
// signature in the `x-hub-signature-256` header against WHATSAPP_APP_SECRET.
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader),
    );
  } catch {
    return false;
  }
}

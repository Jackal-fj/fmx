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

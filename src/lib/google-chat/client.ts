// FMX-078: Google Chat helpers.
//
// This module is the trust boundary between the Chat webhook route and
// Google's identity + Chat APIs. It knows nothing about defects —
// just how to verify a bearer JWT came from the Chat service, and
// (optionally) how to download a message attachment with a service
// account.
//
// Required env vars (set in Vercel + `.env.local`):
//   • GOOGLE_CHAT_AUDIENCE      — the "aud" claim the Chat service signs
//                                  with. In practice this is your Chat app's
//                                  configured endpoint URL OR your GCP
//                                  project number, depending on how the
//                                  app's "Connection settings → Authentication
//                                  audience" are set. Whichever you chose in
//                                  the Chat app config, put it here.
//
// Optional env vars:
//   • GOOGLE_CHAT_SA_JSON       — full service-account JSON key. When set,
//                                  attachment download works (we mint a
//                                  short-lived OAuth token with scope
//                                  https://www.googleapis.com/auth/chat.bot
//                                  and GET the attachment via the Media
//                                  download endpoint). When unset, text and
//                                  metadata still flow through; attachment
//                                  URLs are noted but files aren't persisted.
//
// Chat's signing key:
//   Chat signs with the service account chat@system.gserviceaccount.com. Its
//   JWKS lives at:
//     https://www.googleapis.com/service_accounts/v1/jwk/chat@system.gserviceaccount.com
//   `jose`'s createRemoteJWKSet handles key rotation + caching for us.

import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose';

const CHAT_ISSUER = 'chat@system.gserviceaccount.com';
const CHAT_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/chat@system.gserviceaccount.com',
);

// Cached across requests inside a single serverless instance. jose handles
// key rotation internally via its default cache strategy.
const JWKS = createRemoteJWKSet(CHAT_JWKS_URL);

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

/**
 * Verify the Bearer JWT the Chat service sent on an event webhook. On
 * success returns the decoded payload; on any failure (missing token,
 * bad issuer, bad audience, bad signature, expired) returns null. Never
 * throw, never log the token.
 */
export async function verifyChatJwt(authorizationHeader: string | null): Promise<Record<string, unknown> | null> {
  const aud = process.env.GOOGLE_CHAT_AUDIENCE;
  if (!aud) {
    console.warn('[chat] GOOGLE_CHAT_AUDIENCE not set — refusing all webhooks');
    return null;
  }
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/.exec(authorizationHeader);
  if (!match) return null;
  const token = match[1].trim();
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: CHAT_ISSUER,
      audience: aud,
    });
    return payload as unknown as Record<string, unknown>;
  } catch (e: any) {
    console.warn('[chat] JWT verify failed:', e?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Service-account OAuth for Chat API calls (attachment download, async reply)
// ---------------------------------------------------------------------------

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function loadServiceAccount(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_CHAT_SA_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch (e: any) {
    console.warn('[chat] GOOGLE_CHAT_SA_JSON malformed:', e?.message);
    return null;
  }
}

// Short-lived token cache keyed by scope string. Serverless instance-local.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getServiceAccountAccessToken(scope: string): Promise<string | null> {
  const sa = loadServiceAccount();
  if (!sa) return null;

  const cached = tokenCache.get(scope);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  try {
    // Build JWT assertion for Google's OAuth 2.0 token endpoint.
    const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const alg = 'RS256';
    const key = await importPKCS8(sa.private_key, alg);
    const assertion = await new SignJWT({ scope })
      .setProtectedHeader({ alg, typ: 'JWT' })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience(tokenUri)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      console.warn('[chat] SA token exchange failed:', res.status, await res.text());
      return null;
    }
    const json = await res.json() as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    tokenCache.set(scope, {
      token: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600),
    });
    return json.access_token;
  } catch (e: any) {
    console.warn('[chat] SA token mint threw:', e?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Attachment download
// ---------------------------------------------------------------------------

export type ChatAttachmentDownload = {
  bytes: Buffer;
  mimeType: string;
  filename?: string;
};

/**
 * Download a Chat attachment's bytes. Needs the service account, since a
 * public URL isn't available.
 *
 * The Chat event's `attachment[*]` objects carry either
 *   { attachmentDataRef: { resourceName: "attachments/..." } }  (uploaded files)
 * or
 *   { driveDataRef: { driveFileId: "..." } }                    (Drive links)
 * Only `attachmentDataRef` is downloadable via the Chat Media API; drive
 * refs would need Drive API scope and a separate flow — out of scope here.
 */
export async function downloadChatAttachment(
  attachment: any,
): Promise<ChatAttachmentDownload | null> {
  const dataRef = attachment?.attachmentDataRef?.resourceName as string | undefined;
  if (!dataRef) return null;
  const token = await getServiceAccountAccessToken('https://www.googleapis.com/auth/chat.bot');
  if (!token) return null;
  try {
    const url = `https://chat.googleapis.com/v1/media/${encodeURIComponent(dataRef)}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.warn(`[chat] attachment fetch failed ${dataRef}:`, res.status);
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      bytes,
      mimeType: (attachment?.contentType as string) || res.headers.get('content-type') || 'application/octet-stream',
      filename: (attachment?.contentName as string) || undefined,
    };
  } catch (e: any) {
    console.warn('[chat] attachment download threw:', e?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Response builder
// ---------------------------------------------------------------------------

/**
 * Build a Chat response payload for a synchronous webhook reply. Plain text
 * (threaded to the triggering message) is enough for the "logged as DEF-###"
 * confirmation and keeps us compatible with both standalone chats and spaces.
 * Richer cards can come later when FMX-080 lands.
 */
export function chatTextReply(text: string, threadName?: string | null): object {
  const payload: Record<string, unknown> = { text };
  if (threadName) {
    payload.thread = { name: threadName };
  }
  return payload;
}

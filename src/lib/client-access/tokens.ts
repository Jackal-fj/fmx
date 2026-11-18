// FMX-074: client access tokens.
//
// A client viewer (today: Irene at KGF) gets a long, random URL. The plaintext
// token never touches the database — we store its sha256. Carl can mint
// several per client (one per contact, or one for a scheduled report
// recipient), label each, see when it was last used, and revoke any of
// them without affecting the others.
//
// This module is the trust boundary between the FM-admin side of the app
// (gated by QUICK_ADD_SECRET) and the signed-link client viewer side.
// Everything the client viewer sees flows through `resolveClientFromToken`,
// which is the only place a plaintext token turns into a client scope.

import { createHash, randomBytes } from 'crypto';
import { supabaseServer } from '@/lib/supabase';

// 32 bytes = 256 bits → 43-char urlsafe base64. Plenty of entropy against
// guessing even if the table size balloons.
const TOKEN_BYTES = 32;

export function generatePlaintextToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export type ClientScope = {
  client_id: string;
  client_short_code: string;
  client_name: string;
  token_id: string;
  token_label: string | null;
};

/**
 * Validate a plaintext token and return the client scope it grants, or null.
 * Bumps `last_used_at` + `last_used_ip` when valid so Carl can see activity
 * on the admin page. A revoked token returns null; a plaintext that doesn't
 * hash to anything in the table also returns null — identical shape so a
 * caller can't tell "wrong token" from "revoked".
 */
export async function resolveClientFromToken(
  plaintext: string,
  opts?: { ip?: string | null },
): Promise<ClientScope | null> {
  if (!plaintext) return null;
  const token_hash = hashToken(plaintext);

  const { data: token } = await supabaseServer
    .from('client_access_tokens')
    .select('id, client_id, label, revoked_at')
    .eq('token_hash', token_hash)
    .maybeSingle();
  if (!token || token.revoked_at) return null;

  const { data: client } = await supabaseServer
    .from('clients')
    .select('id, short_code, name')
    .eq('id', token.client_id)
    .maybeSingle();
  if (!client) return null;

  // Best-effort activity bump — never blocks the response.
  try {
    await supabaseServer
      .from('client_access_tokens')
      .update({ last_used_at: new Date().toISOString(), last_used_ip: opts?.ip ?? null })
      .eq('id', token.id);
  } catch (e) {
    console.warn('FMX-074 last_used bump failed', e);
  }

  return {
    client_id: client.id as string,
    client_short_code: client.short_code as string,
    client_name: client.name as string,
    token_id: token.id as string,
    token_label: (token.label as string | null) ?? null,
  };
}

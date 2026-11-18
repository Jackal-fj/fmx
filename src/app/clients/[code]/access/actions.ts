'use server';

// FMX-074: admin actions for client access tokens — mint and revoke.
// Mint returns the plaintext token and full URL once; the UI shows it,
// the DB stores only the hash. Revoke is a soft delete that keeps the
// row for the audit trail (last_used_at, who used it when).

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { generatePlaintextToken, hashToken } from '@/lib/client-access/tokens';

type MintResult =
  | { ok: true; url: string; token_id: string; plaintext: string }
  | { ok: false; error: string };

type OkErr = { ok: true } | { ok: false; error: string };

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/$/, '');
  return ''; // caller will see a bare path and know to prefix manually
}

export async function mintClientAccessToken(
  clientShortCode: string,
  label: string,
  secretKey: string,
): Promise<MintResult> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) return { ok: false, error: 'Not authorised.' };
  if (!clientShortCode) return { ok: false, error: 'Missing client.' };
  if (!label.trim()) return { ok: false, error: 'Label is required so you can tell tokens apart later.' };

  const { data: client, error: cErr } = await supabaseServer
    .from('clients')
    .select('id, short_code')
    .eq('short_code', clientShortCode)
    .maybeSingle();
  if (cErr || !client) return { ok: false, error: 'Client not found.' };

  const plaintext = generatePlaintextToken();
  const token_hash = hashToken(plaintext);

  const { data: inserted, error: iErr } = await supabaseServer
    .from('client_access_tokens')
    .insert({
      client_id: client.id,
      token_hash,
      label: label.trim().slice(0, 200),
    })
    .select('id')
    .single();
  if (iErr || !inserted) return { ok: false, error: iErr?.message || 'Mint failed.' };

  const base = appBaseUrl();
  const path = `/client/${client.short_code}?t=${encodeURIComponent(plaintext)}`;
  const url = base ? `${base}${path}` : path;

  revalidatePath(`/clients/${clientShortCode}/access`);
  return { ok: true, url, token_id: inserted.id as string, plaintext };
}

export async function revokeClientAccessToken(
  tokenId: string,
  clientShortCode: string,
  secretKey: string,
): Promise<OkErr> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) return { ok: false, error: 'Not authorised.' };
  if (!tokenId) return { ok: false, error: 'Missing token id.' };

  const { error } = await supabaseServer
    .from('client_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .is('revoked_at', null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${clientShortCode}/access`);
  return { ok: true };
}

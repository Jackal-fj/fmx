'use server';

// FMX-075: client-viewer-scoped server actions. Every write path through
// here first validates the plaintext token (via resolveClientFromToken),
// then checks that the resource being requested belongs to that token's
// client. No QUICK_ADD_SECRET is ever accepted here — this is the client
// surface, not the admin one.

import { supabaseServer } from '@/lib/supabase';
import { resolveClientFromToken } from '@/lib/client-access/tokens';
import { logAudit } from '@/lib/audit/log';

export async function getClientReportDownloadUrl(
  storagePath: string,
  plaintext: string,
  shortCode: string,
): Promise<{ url: string | null; error?: string }> {
  const scope = await resolveClientFromToken(plaintext);
  if (!scope) return { url: null, error: 'Not authorised.' };
  if (scope.client_short_code !== shortCode) return { url: null, error: 'Not authorised.' };

  // Check the report belongs to this client before we mint a signed URL.
  const { data: row } = await supabaseServer
    .from('report_runs')
    .select('id, client_id, property_id, storage_path')
    .eq('storage_path', storagePath)
    .maybeSingle();
  if (!row) return { url: null, error: 'Report not found.' };

  // Accept the report when either (a) it's a client-scope report tagged
  // to this client_id, or (b) it's a property report on a property owned
  // by this client.
  let allowed = row.client_id === scope.client_id;
  if (!allowed && row.property_id) {
    const { data: prop } = await supabaseServer
      .from('properties')
      .select('client_id')
      .eq('id', row.property_id)
      .maybeSingle();
    allowed = !!prop && (prop.client_id as string) === scope.client_id;
  }
  if (!allowed) return { url: null, error: 'Not authorised.' };

  const { data, error } = await supabaseServer.storage
    .from('reports')
    .createSignedUrl(storagePath, 60 * 60); // 1 hour
  if (error || !data) return { url: null, error: error?.message || 'Signed URL failed.' };

  // FMX-081: audit the report download request.
  await logAudit({
    actor_kind: 'client_viewer',
    actor_id: scope.token_id,
    actor_display: scope.token_label,
    action: 'client_viewer.report_download',
    channel: 'web',
    target_table: 'report_runs',
    target_id: row.id as string,
    target_ref: storagePath,
    client_id: scope.client_id,
    context: { storage_path: storagePath },
  });

  return { url: data.signedUrl };
}

// FMX-081: audit event logger.
//
// One thin insert per high-signal event. Callers pass what they already
// have — nothing is denormalised, nothing joined. Best-effort: audit
// failures never block the surrounding operation.
//
// What gets logged (not exhaustive, but representative):
//   • tenant_message.received — email / whatsapp / chat ingest with sender + target defect
//   • tenant_message.sent      — outbound push after FM approval
//   • tenant_message.skipped   — outbound push dismissed
//   • client_viewer.page_view  — client portal landing opened
//   • client_viewer.report_download — PDF download via signed URL
//   • defect.draft_created     — tenant-initiated draft defect created
//
// What is NOT logged here: FM-admin writes (defects CRUD, agreement edits,
// inspection results). Those already leave an audit trail in their own
// tables (defect_updates, write_conflicts) and are inside the trust
// boundary. Adding them later is cheap if a compliance ask arrives.

import { supabaseServer } from '@/lib/supabase';

export type ActorKind = 'tenant' | 'client_viewer' | 'fm_admin' | 'system' | 'provider';
export type Channel = 'email' | 'whatsapp' | 'google_chat' | 'web' | null;

export type AuditEvent = {
  actor_kind: ActorKind;
  actor_id?: string | null;
  actor_display?: string | null;
  action: string;
  channel?: Channel;
  target_table?: string | null;
  target_id?: string | null;
  target_ref?: string | null;
  property_id?: string | null;
  client_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  context?: Record<string, unknown> | null;
};

export async function logAudit(e: AuditEvent): Promise<void> {
  try {
    await supabaseServer.from('audit_events').insert({
      actor_kind: e.actor_kind,
      actor_id: e.actor_id ?? null,
      actor_display: e.actor_display ?? null,
      action: e.action,
      channel: e.channel ?? null,
      target_table: e.target_table ?? null,
      target_id: e.target_id ?? null,
      target_ref: e.target_ref ?? null,
      property_id: e.property_id ?? null,
      client_id: e.client_id ?? null,
      ip: e.ip ?? null,
      user_agent: e.user_agent ?? null,
      context: e.context ?? null,
    });
  } catch (err: any) {
    // Audit must never block the actual operation.
    console.warn('[audit] insert failed', err?.message);
  }
}

'use server';

// FMX-048: thin server-action helpers for the append-only tables.
// Every mutation is idempotent on the client-assigned uuid (upsert on id),
// so offline retries replay safely and FMX-046's queue doesn't need to
// de-dupe at the handler level.

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import type {
  InspectionSession, InspectionResult, ScanEvent, Reading,
} from './types';

function auth(key: string): boolean {
  const required = process.env.QUICK_ADD_SECRET;
  return !!required && key === required;
}

type Ok<T = undefined> = { ok: true; data?: T };
type Err = { ok: false; error: string };
type Res<T = undefined> = Ok<T> | Err;

// ---- inspection sessions ------------------------------------------------

export async function startSession(payload: InspectionSession, key: string): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!payload.id) return { ok: false, error: 'Missing session id.' };
  if (!payload.template_id) return { ok: false, error: 'Missing template id.' };
  if (!payload.started_at) return { ok: false, error: 'Missing started_at.' };

  const row = {
    id: payload.id,
    template_id: payload.template_id,
    property_id: payload.property_id ?? null,
    asset_id: payload.asset_id ?? null,
    inspector_name: payload.inspector_name ?? null,
    started_at: payload.started_at,
    source: payload.source ?? 'web',
  };
  const { error } = await supabaseServer
    .from('inspection_sessions')
    .upsert(row, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function completeSession(
  sessionId: string,
  patch: { completed_at: string; signature_data_url?: string | null; attendance_photo_url?: string | null; notes?: string | null },
  key: string,
): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!sessionId) return { ok: false, error: 'Missing session id.' };

  const { error } = await supabaseServer
    .from('inspection_sessions')
    .update({
      completed_at: patch.completed_at,
      signature_data_url: patch.signature_data_url ?? null,
      attendance_photo_url: patch.attendance_photo_url ?? null,
      notes: patch.notes ?? null,
    })
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/inspections');
  return { ok: true };
}

// ---- inspection results -------------------------------------------------

export async function recordResult(payload: InspectionResult, key: string): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!payload.id) return { ok: false, error: 'Missing result id.' };
  if (!payload.session_id) return { ok: false, error: 'Missing session id.' };
  if (!payload.template_item_id) return { ok: false, error: 'Missing template item id.' };
  if (!['yes_no','rating','number','text'].includes(payload.kind)) {
    return { ok: false, error: 'Invalid kind.' };
  }

  const row = {
    id: payload.id,
    session_id: payload.session_id,
    template_item_id: payload.template_item_id,
    sort_order: payload.sort_order,
    question: payload.question,
    kind: payload.kind,
    answer_bool: payload.answer_bool ?? null,
    answer_number: payload.answer_number ?? null,
    answer_text: payload.answer_text ?? null,
    photo_urls: payload.photo_urls ?? [],
    voice_note_url: payload.voice_note_url ?? null,
    failed: payload.failed ?? false,
    failure_reason: payload.failure_reason ?? null,
    defect_id: payload.defect_id ?? null,
    answered_at: payload.answered_at,
  };
  const { error } = await supabaseServer
    .from('inspection_results')
    .upsert(row, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---- scan events --------------------------------------------------------

export async function recordScan(payload: ScanEvent, key: string): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!payload.id) return { ok: false, error: 'Missing scan id.' };
  if (!payload.target_kind) return { ok: false, error: 'Missing target_kind.' };
  if (!payload.target_id) return { ok: false, error: 'Missing target_id.' };
  if (!payload.scanned_at) return { ok: false, error: 'Missing scanned_at.' };

  const row = {
    id: payload.id,
    target_kind: payload.target_kind,
    target_id: payload.target_id,
    target_path: payload.target_path ?? null,
    scanned_by: payload.scanned_by ?? null,
    context: payload.context ?? null,
    session_id: payload.session_id ?? null,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    scanned_at: payload.scanned_at,
  };
  const { error } = await supabaseServer
    .from('scan_events')
    .upsert(row, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---- readings -----------------------------------------------------------

export async function recordReading(payload: Reading, key: string): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!payload.id) return { ok: false, error: 'Missing reading id.' };
  if (!payload.kind) return { ok: false, error: 'Missing reading kind.' };
  if (!payload.taken_at) return { ok: false, error: 'Missing taken_at.' };

  const row = {
    id: payload.id,
    asset_id: payload.asset_id ?? null,
    property_id: payload.property_id ?? null,
    kind: payload.kind,
    value_number: payload.value_number ?? null,
    value_text: payload.value_text ?? null,
    unit: payload.unit ?? null,
    session_id: payload.session_id ?? null,
    taken_by: payload.taken_by ?? null,
    photo_url: payload.photo_url ?? null,
    taken_at: payload.taken_at,
  };
  const { error } = await supabaseServer
    .from('readings')
    .upsert(row, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

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

// ---- fail → auto-raise defects from a session (FMX-056) ----------------
//
// On complete, scan the session's results for `failed = true` rows and
// create one `defect` per failed row that hasn't already been raised.
// Each new defect:
//   - title       = item question (prefixed with FAIL)
//   - description = failure reason + inspector text answer + session ref
//   - severity    = mapped from fail signal (critical for rating<2, major default for yes_no fails, moderate otherwise)
//   - trade       = template item's trade (falls back to NULL — Carl tags later via FMX-037)
//   - property_id = session's property_id
//   - photo_urls  = carried over from the failed result row
//   - status      = 'open'
// The new defect's id is backfilled onto `inspection_results.defect_id`
// so the audit trail round-trips. Idempotent: results that already carry
// a defect_id are skipped, so re-running after a partial failure is safe.

function deriveSeverity(result: {
  kind: string;
  answer_bool: boolean | null;
  answer_number: number | null;
  failure_reason: string | null;
}): 'critical' | 'major' | 'moderate' | 'minor' {
  if (result.kind === 'rating' && typeof result.answer_number === 'number') {
    if (result.answer_number <= 1) return 'critical';
    if (result.answer_number === 2) return 'major';
    return 'moderate';
  }
  if (result.kind === 'yes_no') return 'major';
  if (result.kind === 'number') return 'major';
  return 'moderate';
}

export async function raiseDefectsFromSession(
  sessionId: string,
  key: string,
): Promise<Res<{ created: number; skipped: number }>> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };

  // Session context — property for the defect assignment, plus session metadata.
  const { data: session } = await supabaseServer
    .from('inspection_sessions')
    .select('id, property_id, asset_id, template_id, inspector_name, started_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: 'Session not found.' };
  if (!session.property_id && !session.asset_id) {
    // No anchor to hang a defect on. Not fatal — tell the caller so the UI
    // can nudge the inspector to add scope on the session.
    return { ok: true, data: { created: 0, skipped: 0 } };
  }

  // Failed results that don't already carry a defect_id — pull the whole row
  // so we can copy photo_urls and the answer fields across.
  const { data: fails } = await supabaseServer
    .from('inspection_results')
    .select('id, template_item_id, question, kind, answer_bool, answer_number, answer_text, photo_urls, failure_reason, defect_id, sort_order')
    .eq('session_id', sessionId)
    .eq('failed', true)
    .is('defect_id', null)
    .order('sort_order');
  if (!fails || fails.length === 0) {
    return { ok: true, data: { created: 0, skipped: 0 } };
  }

  // Grab the per-item trade overrides in one go.
  const templateItemIds = Array.from(new Set(fails.map(f => f.template_item_id)));
  const { data: items } = await supabaseServer
    .from('inspection_template_items')
    .select('id, trade')
    .in('id', templateItemIds);
  const tradeByItem = new Map((items || []).map((i: any) => [i.id, i.trade as string | null]));

  // Fallback property_id for asset-only sessions: look up the asset's property.
  let propertyId = session.property_id as string | null;
  if (!propertyId && session.asset_id) {
    const { data: a } = await supabaseServer
      .from('assets')
      .select('property_id')
      .eq('id', session.asset_id)
      .maybeSingle();
    propertyId = (a?.property_id as string | null) ?? null;
  }
  if (!propertyId) {
    return { ok: true, data: { created: 0, skipped: fails.length } };
  }

  let created = 0;
  let skipped = 0;

  for (const r of fails) {
    const severity = deriveSeverity(r as any);
    const trade = tradeByItem.get(r.template_item_id) ?? null;
    const inspector = session.inspector_name || '—';
    const descriptionParts: string[] = [
      `Auto-raised from inspection on ${(session.started_at || '').slice(0, 10)}.`,
      r.failure_reason ? `Fail reason: ${r.failure_reason}` : null,
      r.answer_text ? `Answer: ${r.answer_text}` : null,
      inspector !== '—' ? `Inspector: ${inspector}` : null,
      `Inspection session: ${sessionId}`,
    ].filter(Boolean) as string[];

    const { data: inserted, error: insErr } = await supabaseServer
      .from('defects')
      .insert({
        property_id: propertyId,
        title: `FAIL — ${r.question}`.slice(0, 200),
        description: descriptionParts.join('\n'),
        severity,
        status: 'open',
        trade: trade || null,
        photo_urls: Array.isArray(r.photo_urls) ? r.photo_urls : [],
      })
      .select('id, defect_number')
      .single();
    if (insErr || !inserted) {
      skipped += 1;
      continue;
    }

    const { error: patchErr } = await supabaseServer
      .from('inspection_results')
      .update({ defect_id: inserted.id })
      .eq('id', r.id);
    if (patchErr) {
      // Defect was created; just couldn't backfill. Log and keep going —
      // the result row loses its link but the defect still exists.
      console.warn('raiseDefectsFromSession: backfill failed for result', r.id, patchErr.message);
    }
    created += 1;
  }

  // Bust caches on everything that reads the new defects.
  revalidatePath('/defects');
  revalidatePath('/');

  return { ok: true, data: { created, skipped } };
}

// ---- FMX-072: attach late-arriving photo URLs --------------------------
//
// The offline photo pipeline uploads a blob after its owning row has
// already been saved. These actions push the resolved URL back into the
// right target column so the UI eventually catches up.

export async function attachPhotoToResult(
  resultId: string,
  url: string,
  key: string,
): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!resultId || !url) return { ok: false, error: 'Missing result id or url.' };
  // Read-then-write — Postgres doesn't have an atomic array-append RPC
  // here without adding one, and these writes are rare + small.
  const { data: row } = await supabaseServer
    .from('inspection_results')
    .select('photo_urls')
    .eq('id', resultId)
    .maybeSingle();
  const existing: string[] = Array.isArray(row?.photo_urls) ? row!.photo_urls : [];
  if (existing.includes(url)) return { ok: true };   // idempotent
  const { error } = await supabaseServer
    .from('inspection_results')
    .update({ photo_urls: [...existing, url] })
    .eq('id', resultId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// FMX-067: attach the voice-note URL for an inspection result once the
// voice.upload handler has pushed the blob to Storage. Idempotent: last
// upload wins if two are queued (they shouldn't be — the runner stages
// one voice per item).
export async function attachVoiceToResult(
  resultId: string,
  url: string,
  key: string,
): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!resultId || !url) return { ok: false, error: 'Missing result id or url.' };
  const { error } = await supabaseServer
    .from('inspection_results')
    .update({ voice_note_url: url })
    .eq('id', resultId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function attachAttendancePhoto(
  sessionId: string,
  url: string,
  key: string,
): Promise<Res> {
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };
  if (!sessionId || !url) return { ok: false, error: 'Missing session id or url.' };
  const { error } = await supabaseServer
    .from('inspection_sessions')
    .update({ attendance_photo_url: url })
    .eq('id', sessionId);
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

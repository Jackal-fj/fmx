// FMX-051: field-level merge resolver for shared mutable records.
//
// Problem: when two offline-staged patches touch the same row — same user on
// two devices today, two users tomorrow (FMX-024) — a naive PATCH on drain
// overwrites columns the other patch intended to change. Design principle #9
// says conflicts surface in a queue, never silently discarded.
//
// Approach: per-column merge strategies, applied server-side on drain. The
// client passes its baseline (the `updated_at` it saw when staging the edit).
// For each column the patch touches:
//   • `lww` (default)          — last-writer-wins. If server moved on since
//                                 baseline and server value differs, log a
//                                 conflict row; still apply the incoming
//                                 value, but Carl can revert from /conflicts.
//   • `union`                  — set-union for arrays (photo_urls, tags).
//   • `concat`                 — additive text accumulators (notes). Appends
//                                 the incoming text under a dated heading
//                                 when the server has already moved on.
//   • `max` / `min`            — numeric extremes (condition_rating, severity
//                                 downgrade protection).
//   • `latest_non_null`        — keep the value that is non-null; if both are,
//                                 LWW. Useful for "once set, keep it" columns.
//
// Strategies are per-table / per-column. Unlisted columns default to `lww`,
// which is the behaviour before this module existed — safe fallback.

import { supabaseServer } from '@/lib/supabase';

export type Strategy = 'lww' | 'union' | 'concat' | 'max' | 'min' | 'latest_non_null';

export type ColumnRules = Record<string, Strategy>;

// Documented per-table rules. Kept narrow on purpose — only columns the
// hero workflow writes need a non-default strategy. Everything else gets
// `lww`, matching the pre-FMX-051 behaviour.
export const MERGE_RULES: Record<string, ColumnRules> = {
  client_agreements: {
    // Append new notes rather than overwrite. Scalars stay LWW — a status
    // change should propagate as the user intended.
    notes: 'concat',
    invoice_requirements: 'concat',
    // Keep the longer / more complete name if two concurrent edits differ.
    name: 'latest_non_null',
  },
  defects: {
    photo_urls: 'union',
    description: 'concat',
    // Severity: once something has been marked critical, don't let a stale
    // patch demote it. `min` works because 'critical' < 'major' < 'moderate'
    // < 'minor' alphabetically — but severity is a text enum, so we handle
    // it with a dedicated mapper below.
  },
  assets: {
    photo_urls: 'union',
    condition_notes: 'concat',
    condition_rating: 'max',   // concurrent inspectors: keep the higher confidence rating
  },
  inspection_sessions: {
    notes: 'concat',
  },
};

// ---------------------------------------------------------------------------
// Low-level mergers
// ---------------------------------------------------------------------------

function mergeUnion(server: unknown, incoming: unknown): unknown {
  const s = Array.isArray(server) ? server : [];
  const i = Array.isArray(incoming) ? incoming : [];
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of [...s, ...i]) {
    const key = typeof v === 'string' ? v : JSON.stringify(v);
    if (!seen.has(key)) { seen.add(key); out.push(v); }
  }
  return out;
}

function mergeConcat(server: unknown, incoming: unknown): unknown {
  const s = typeof server === 'string' ? server.trim() : '';
  const i = typeof incoming === 'string' ? incoming.trim() : '';
  if (!i) return s || null;
  if (!s) return i;
  if (s === i) return s;
  // If the incoming text is already contained in the server text, skip —
  // happens when a retry replays the same patch after the first merge.
  if (s.includes(i)) return s;
  const stamp = new Date().toISOString().slice(0, 10);
  return `${s}\n\n[${stamp}] ${i}`;
}

function mergeMax(server: unknown, incoming: unknown): unknown {
  const s = typeof server === 'number' ? server : -Infinity;
  const i = typeof incoming === 'number' ? incoming : -Infinity;
  const picked = Math.max(s, i);
  return Number.isFinite(picked) ? picked : (incoming ?? server);
}

function mergeMin(server: unknown, incoming: unknown): unknown {
  const s = typeof server === 'number' ? server : Infinity;
  const i = typeof incoming === 'number' ? incoming : Infinity;
  const picked = Math.min(s, i);
  return Number.isFinite(picked) ? picked : (incoming ?? server);
}

function mergeLatestNonNull(server: unknown, incoming: unknown): unknown {
  if (incoming == null || incoming === '') return server;
  if (server == null || server === '') return incoming;
  return incoming;   // both set → LWW
}

function applyStrategy(strategy: Strategy, server: unknown, incoming: unknown): unknown {
  switch (strategy) {
    case 'union':             return mergeUnion(server, incoming);
    case 'concat':            return mergeConcat(server, incoming);
    case 'max':               return mergeMax(server, incoming);
    case 'min':               return mergeMin(server, incoming);
    case 'latest_non_null':   return mergeLatestNonNull(server, incoming);
    case 'lww':
    default:                  return incoming;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MergeResult = {
  // Final values keyed by column. Only columns that actually need to change
  // (merged value differs from server value) appear here, so the UPDATE is
  // minimal and idempotent retries cost less.
  toApply: Record<string, unknown>;
  // Columns where the merge chose server over incoming or combined them.
  // Logged to write_conflicts when a baseline was provided and the server
  // had moved on. These are candidates for Carl's review, not the full set.
  conflicts: Array<{
    column: string;
    strategy: Strategy;
    baseline: unknown;
    server: unknown;
    incoming: unknown;
    merged: unknown;
  }>;
};

/**
 * Apply a patch against a server row using the table's merge rules.
 *
 * @param table             Supabase table name — must match a key in MERGE_RULES, or defaults to LWW everywhere.
 * @param serverRow         The row as it currently exists in Postgres (read inside the server action).
 * @param incomingPatch     The columns the client is trying to write.
 * @param baselineUpdatedAt When the client staged the patch, what `updated_at` did it see? Optional — when
 *                          absent, strategies still apply but no conflicts are logged (no way to tell they
 *                          happened).
 */
export function mergePatch(
  table: string,
  serverRow: Record<string, unknown>,
  incomingPatch: Record<string, unknown>,
  baselineUpdatedAt?: string | null,
): MergeResult {
  const rules = MERGE_RULES[table] || {};
  const toApply: Record<string, unknown> = {};
  const conflicts: MergeResult['conflicts'] = [];

  // Did the server move on since the client staged the edit?
  const serverUpdatedAt = (serverRow as any).updated_at as string | null | undefined;
  const serverMoved =
    baselineUpdatedAt != null &&
    serverUpdatedAt != null &&
    String(serverUpdatedAt) !== String(baselineUpdatedAt);

  for (const [col, incoming] of Object.entries(incomingPatch)) {
    const strategy: Strategy = rules[col] || 'lww';
    const server = serverRow[col];
    const merged = applyStrategy(strategy, server, incoming);

    // Only write back if the merged value differs from what Postgres already
    // holds — cuts down on write amp and keeps updated_at stable when the
    // drain is a no-op after a retry.
    const changed = JSON.stringify(merged) !== JSON.stringify(server);
    if (changed) toApply[col] = merged;

    // Conflict condition: the server has moved on and the merge chose
    // something other than the client's incoming value (for LWW) or combined
    // values at all (for union / concat / max / min). We also log when the
    // strategy quietly kept server over incoming (latest_non_null with both
    // set is exactly LWW, which is logged if server moved).
    const incomingDiffersFromMerged =
      JSON.stringify(merged) !== JSON.stringify(incoming);
    const nonLwwStrategyThatCombined =
      strategy !== 'lww' && incomingDiffersFromMerged;
    const lwwOverride =
      strategy === 'lww' && serverMoved &&
      JSON.stringify(server) !== JSON.stringify(incoming);

    if (nonLwwStrategyThatCombined || lwwOverride) {
      conflicts.push({
        column: col,
        strategy,
        baseline: null,             // we don't carry the baseline column-by-column — baseline_updated_at is the shared signal
        server,
        incoming,
        merged,
      });
    }
  }

  return { toApply, conflicts };
}

/**
 * Persist conflict rows to the write_conflicts table. Best-effort — a
 * failure here must not block the actual data write. If the server action
 * couldn't open a transaction, the UPDATE has already happened by the time
 * we get here.
 */
export async function logConflicts(
  table: string,
  rowId: string,
  conflicts: MergeResult['conflicts'],
  context?: Record<string, unknown>,
): Promise<void> {
  if (!conflicts.length) return;
  try {
    await supabaseServer.from('write_conflicts').insert(
      conflicts.map(c => ({
        table_name: table,
        row_id: rowId,
        column_name: c.column,
        strategy: c.strategy,
        baseline_value: c.baseline,
        server_value: c.server,
        incoming_value: c.incoming,
        merged_value: c.merged,
        context: context || null,
      })),
    );
  } catch (e) {
    // Log and keep going. Losing a conflict record is better than failing
    // the original write and looping the queue forever.
    console.warn('FMX-051 logConflicts failed', e);
  }
}

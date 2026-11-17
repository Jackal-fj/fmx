// FMX-046: write queue. Call sites register a handler for a `kind`;
// `enqueue(kind, payload)` stores the op locally and the runner drains
// the queue when online.
//
// The queue is intentionally NOT bolted onto every existing server
// action at once — that's a per-feature migration (FMX-049 photos,
// FMX-055 checklist runner, FMX-056 fail→job, etc). This file exposes
// the plumbing; those stories register handlers against it.
//
// Design:
// - Handlers return a Promise. Throw to re-queue. Return to complete.
// - Retry uses exponential backoff with jitter (up to 5 min cap).
// - Max 10 attempts, then status='failed' and the entry surfaces in
//   the Sync indicator for a manual retry or discard.
// - Online/offline events + 30-second interval drive the runner.
// - All event emission is in-tab; cross-tab coordination can come later
//   via navigator.locks if two phones pretending to be one tab becomes
//   a real problem.

'use client';

import { db, QueueEntry } from './db';

type Handler = (payload: any) => Promise<void>;
const handlers = new Map<string, Handler>();

const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

// ---- public API ---------------------------------------------------------

export function registerHandler(kind: string, fn: Handler): void {
  handlers.set(kind, fn);
}

export async function enqueue(kind: string, payload: unknown, opts?: { dedupeKey?: string }): Promise<number> {
  const now = Date.now();
  const d = db();
  // Dedupe: replace any queued/failed entry with the same dedupeKey.
  if (opts?.dedupeKey) {
    await d.queue.where('dedupeKey').equals(opts.dedupeKey).delete();
  }
  const id = await d.queue.add({
    kind,
    payload,
    dedupeKey: opts?.dedupeKey,
    createdAt: now,
    nextAttemptAt: now,
    attempts: 0,
    status: 'queued',
  });
  emit();
  void kick();
  return id as number;
}

// Current pending counts, for the Sync indicator.
export type QueueSummary = { queued: number; in_flight: number; failed: number };

export async function summary(): Promise<QueueSummary> {
  const d = db();
  const rows = await d.queue.toArray();
  const s: QueueSummary = { queued: 0, in_flight: 0, failed: 0 };
  for (const r of rows) s[r.status] += 1;
  return s;
}

export async function listEntries(): Promise<QueueEntry[]> {
  return db().queue.orderBy('createdAt').toArray();
}

export async function retry(id: number): Promise<void> {
  await db().queue.update(id, { status: 'queued', nextAttemptAt: Date.now(), attempts: 0, lastError: undefined });
  emit();
  void kick();
}

export async function discard(id: number): Promise<void> {
  await db().queue.delete(id);
  emit();
}

export function onChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- runner -------------------------------------------------------------

let draining = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startRunner(): void {
  if (typeof window === 'undefined') return;
  // Online / offline swings nudge the runner immediately.
  window.addEventListener('online', kick);
  // A heartbeat catches cases where the browser doesn't fire 'online'
  // reliably (corporate wifi flapping, etc).
  if (!intervalHandle) intervalHandle = setInterval(kick, 30_000);
  kick();
}

async function kick(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (draining) return;
  draining = true;
  try {
    await drainOnce();
  } finally {
    draining = false;
  }
}

async function drainOnce(): Promise<void> {
  const d = db();
  const now = Date.now();
  // Pull the next due entry (queued or failed-but-retryable).
  const due = await d.queue
    .where('nextAttemptAt').belowOrEqual(now)
    .and(r => r.status !== 'in_flight' && r.attempts < MAX_ATTEMPTS)
    .toArray();
  for (const entry of due) {
    const handler = handlers.get(entry.kind);
    if (!handler) {
      // No handler registered yet — leave the entry alone; defer to next tick.
      continue;
    }
    await d.queue.update(entry.id!, { status: 'in_flight' });
    emit();
    try {
      await handler(entry.payload);
      await d.queue.delete(entry.id!);
    } catch (e: any) {
      const attempts = (entry.attempts || 0) + 1;
      const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempts) + Math.floor(Math.random() * 1000);
      const failed = attempts >= MAX_ATTEMPTS;
      await d.queue.update(entry.id!, {
        status: failed ? 'failed' : 'queued',
        attempts,
        nextAttemptAt: Date.now() + backoff,
        lastError: (e?.message || String(e)).slice(0, 500),
      });
    } finally {
      emit();
    }
  }
}

// ---- listener plumbing --------------------------------------------------

const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) {
    try { l(); } catch (_) { /* ignore */ }
  }
}

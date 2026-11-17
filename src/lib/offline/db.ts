// FMX-046: client-side IndexedDB via Dexie. Holds the write queue + a
// generic key-value cache that future stories (sync cursors, per-record
// drafts) can lean on. The handler registry lives in ./queue.ts; this
// file is the raw storage layer.
//
// Import ONLY from client components / useEffect bodies — IndexedDB
// doesn't exist on the server.

'use client';

import Dexie, { Table } from 'dexie';

// --- queue entry shape ----------------------------------------------------
// A queued op is a serialisable RPC: a `kind` (registered in queue.ts)
// plus a JSON-safe `payload`. The queue runner finds the matching handler
// by kind and calls it. If the handler succeeds the entry is deleted; if
// it throws, the entry is rescheduled with exponential backoff.
//
// `dedupeKey` lets a caller replace an in-flight op with a newer one —
// e.g. two edits of the same defect's trade should collapse to one op.

export type QueueStatus = 'queued' | 'in_flight' | 'failed';

export type QueueEntry = {
  id?: number;             // auto-increment PK
  kind: string;            // handler key registered in queue.ts
  payload: unknown;        // JSON-serialisable args for the handler
  dedupeKey?: string;      // same key replaces an earlier queued entry
  createdAt: number;       // ms epoch
  nextAttemptAt: number;   // ms epoch — when the runner should try next
  attempts: number;        // how many times we've tried so far
  status: QueueStatus;
  lastError?: string;
};

// --- key-value cache for anything that isn't a write ---------------------
// Sync cursors, last-seen-online timestamps, per-entity drafts, etc.
export type KvEntry = {
  key: string;
  value: unknown;
  updatedAt: number;
};

class FmxDb extends Dexie {
  queue!: Table<QueueEntry, number>;
  kv!: Table<KvEntry, string>;

  constructor() {
    super('fmx');
    // Keep version bumps rare; only when the schema changes.
    this.version(1).stores({
      queue: '++id, kind, status, nextAttemptAt, dedupeKey',
      kv: 'key',
    });
  }
}

let _db: FmxDb | null = null;

// Lazy singleton. Called from the client only. Throws on SSR so callers
// learn to guard with a browser check.
export function db(): FmxDb {
  if (typeof indexedDB === 'undefined') {
    throw new Error('fmx-db: IndexedDB not available in this environment');
  }
  if (!_db) _db = new FmxDb();
  return _db;
}

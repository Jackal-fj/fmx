'use client';

// FMX-068: register FMX-046 queue handlers for the field-capture write
// paths. Called once at app boot from a <ClientBoot/> mount in the root
// layout, so any later `enqueue(kind, payload)` call resolves to the
// right server action when it drains.
//
// Scope for Phase A of FMX-068: record/complete/raise are queued. Photos
// still upload inline (see Notes in BACKLOG FMX-068) — future FMX-072
// moves photo blobs into the queue as well.

import { useEffect } from 'react';
import { registerHandler, startRunner } from '@/lib/offline/queue';
import {
  recordResult,
  completeSession,
  raiseDefectsFromSession,
  recordScan,
} from './actions';
import type {
  InspectionResult,
  ScanEvent,
} from './types';

type KeyBundle = { key: string };
type CompletePayload = KeyBundle & {
  session_id: string;
  patch: {
    completed_at: string;
    signature_data_url?: string | null;
    attendance_photo_url?: string | null;
    notes?: string | null;
  };
};
type RaisePayload = KeyBundle & { session_id: string };
type ResultPayload = KeyBundle & { result: InspectionResult };
type ScanPayload = KeyBundle & { scan: ScanEvent };

let registered = false;

function registerAll() {
  if (registered) return;
  registered = true;

  // inspection.recordResult — per-item answer row. Idempotent via the
  // client-assigned uuid (upsert on id inside the server action).
  registerHandler('inspection.recordResult', async (p: ResultPayload) => {
    const r = await recordResult(p.result, p.key);
    if (!r.ok) throw new Error(r.error);
  });

  // inspection.completeSession — stamps completed_at + signature + attendance.
  registerHandler('inspection.completeSession', async (p: CompletePayload) => {
    const r = await completeSession(p.session_id, p.patch, p.key);
    if (!r.ok) throw new Error(r.error);
  });

  // inspection.raiseDefects — fires the fail→job pipeline (FMX-056).
  // Sequenced to run after completeSession via the dedupeKey pattern in
  // the caller, not by the handler itself.
  registerHandler('inspection.raiseDefects', async (p: RaisePayload) => {
    const r = await raiseDefectsFromSession(p.session_id, p.key);
    if (!r.ok) throw new Error(r.error);
  });

  // scan.record — every QR scan from FMX-053. Handler is idempotent via
  // the client-assigned scan id, so retries are safe.
  registerHandler('scan.record', async (p: ScanPayload) => {
    const r = await recordScan(p.scan, p.key);
    if (!r.ok) throw new Error(r.error);
  });
}

// Mount in the root layout so the handlers are live before any
// field-capture action is enqueued.
export default function FieldCaptureBoot() {
  useEffect(() => {
    registerAll();
    startRunner();
  }, []);
  return null;
}

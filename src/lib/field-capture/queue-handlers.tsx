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
import { getBlob, deleteBlob } from '@/lib/offline/blobs';
import {
  recordResult,
  completeSession,
  raiseDefectsFromSession,
  recordScan,
  attachPhotoToResult,
  attachAttendancePhoto,
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

  // photo.upload — FMX-072. Reads the pending blob by id, uploads to
  // Supabase Storage via /api/inspection-photo, then attaches the URL to
  // its target row (inspection result or session attendance). Idempotent:
  // the attach actions dedupe URLs so a retry after a successful upload
  // just no-ops. On success the local blob is evicted.
  registerHandler('photo.upload', async (p: PhotoUploadPayload) => {
    const blob = await getBlob(p.blob_id);
    if (!blob) {
      // Blob is gone — nothing to retry with. Treat as success so the
      // queue clears rather than looping forever on a lost file.
      return;
    }
    // Build the same multipart payload /api/inspection-photo already accepts.
    const fd = new FormData();
    fd.append('photos', new File([blob], `${p.blob_id}.jpg`, { type: blob.type || 'image/jpeg' }));
    fd.set('session_id', p.session_id);
    fd.set('item_id', p.target === 'result' ? p.result_id : 'attendance');
    fd.set('key', p.key);
    const res = await fetch('/api/inspection-photo', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const body = await res.json();
    const url: string | undefined = Array.isArray(body.urls) ? body.urls[0] : undefined;
    if (!url) throw new Error('upload returned no url');
    // Attach to the right target.
    if (p.target === 'result') {
      const r = await attachPhotoToResult(p.result_id, url, p.key);
      if (!r.ok) throw new Error(r.error);
    } else {
      const r = await attachAttendancePhoto(p.session_id, url, p.key);
      if (!r.ok) throw new Error(r.error);
    }
    // Local blob no longer needed.
    await deleteBlob(p.blob_id);
  });
}

type PhotoUploadPayload = { key: string; blob_id: string; session_id: string }
  & ({ target: 'result'; result_id: string } | { target: 'attendance'; result_id?: never });

// Mount in the root layout so the handlers are live before any
// field-capture action is enqueued.
export default function FieldCaptureBoot() {
  useEffect(() => {
    registerAll();
    startRunner();
  }, []);
  return null;
}

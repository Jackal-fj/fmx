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
  attachVoiceToResult,
} from './actions';
// FMX-059/060/062: also wire the existing defect + agreement write paths.
import { setDefectTrade, appendDefectPhotos } from '@/app/defects/[number]/actions';
import { updateAgreement } from '@/app/clients/[code]/agreements/[agreement_code]/actions';
// FMX-061: update-defect status flip on top of the queue.
import { applyDefectStatusUpdate } from '@/app/update-defect/actions';
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
type RaisePayload = KeyBundle & {
  session_id: string;
  overrides?: Record<string, { severity?: 'critical' | 'major' | 'moderate' | 'minor'; trade?: string | null }>;
};
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
  // the caller, not by the handler itself. FMX-069: overrides per
  // template_item_id get threaded through to deriveSeverity+trade.
  registerHandler('inspection.raiseDefects', async (p: RaisePayload) => {
    const r = await raiseDefectsFromSession(p.session_id, p.key, p.overrides);
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

  // FMX-067: voice-note upload for an inspection result. Mirrors photo.upload
  // but single-blob + /api/inspection-voice + attachVoiceToResult. One voice
  // per result row (last upload wins; the runner stages one at a time).
  registerHandler('voice.upload', async (p: VoiceUploadPayload) => {
    const blob = await getBlob(p.blob_id);
    if (!blob) return;   // lost blob = treat as done rather than loop
    const fd = new FormData();
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    fd.append('voice', new File([blob], `${p.blob_id}.${ext}`, { type: blob.type || 'audio/webm' }));
    fd.set('session_id', p.session_id);
    fd.set('item_id', p.result_id);
    fd.set('key', p.key);
    const res = await fetch('/api/inspection-voice', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`voice upload ${res.status}`);
    const body = await res.json();
    const url: string | undefined = body?.url;
    if (!url) throw new Error('voice upload returned no url');
    const r = await attachVoiceToResult(p.result_id, url, p.key);
    if (!r.ok) throw new Error(r.error);
    await deleteBlob(p.blob_id);
  });

  // FMX-060: defect inline trade edit. Dedupe at the call site ensures the
  // last edit per defect wins.
  registerHandler('defect.trade.set', async (p: DefectTradePayload) => {
    const r = await setDefectTrade(p.defect_number, p.trade, p.key);
    if (!r.ok) throw new Error(r.error || 'trade save failed');
  });

  // FMX-062: agreement editor. One op per save; dedupe by agreement code.
  // FMX-051: baseline_updated_at carries the row's `updated_at` as the
  // client saw it at save time so the merge layer can detect server drift.
  registerHandler('agreement.update', async (p: AgreementUpdatePayload) => {
    const r = await updateAgreement(
      p.agreement_id,
      p.client_short_code,
      p.agreement_code,
      p.patch,
      p.key,
      p.baseline_updated_at,
    );
    if (!r.ok) throw new Error(r.error || 'agreement save failed');
  });

  // FMX-059: defect photo appender. Blobs stored locally via FMX-072's
  // helpers; handler reads each, rebuilds a FormData batch, hands it to
  // appendDefectPhotos (which already does the upload + append). Idempotent:
  // appendDefectPhotos appends on top of whatever is there, so a retry just
  // adds the same URL twice at worst. The handler tolerates that by evicting
  // the blob after success.
  registerHandler('defect.photos.append', async (p: DefectPhotosPayload) => {
    const fd = new FormData();
    fd.set('defect_id', p.defect_id);
    fd.set('defect_number', p.defect_number);
    fd.set('key', p.key);
    const kept: string[] = [];
    for (const blobId of p.blob_ids) {
      const b = await getBlob(blobId);
      if (!b) continue;
      fd.append('photos', new File([b], `${blobId}.jpg`, { type: b.type || 'image/jpeg' }));
      kept.push(blobId);
    }
    if (kept.length === 0) return;   // nothing to send; treat as done
    const r = await appendDefectPhotos(fd);
    if (!r.ok) throw new Error(r.error || 'append failed');
    for (const blobId of kept) await deleteBlob(blobId);
  });

  // FMX-061: update-defect status change + evidence photos.
  // Owns the whole sequence as one op so the status flip only lands once
  // the photos are up and the audit row has concrete URLs. Retry-safe:
  // if the status flip fails after photos uploaded, the retry re-uploads
  // the photos (tolerable — duplicates sink into photo_urls as unique set)
  // and re-flips the status (idempotent at the row level).
  registerHandler('defect.status.update', async (p: DefectStatusUpdatePayload) => {
    // 1. Upload each blob via /api/defect-photo, collect URLs.
    const fd = new FormData();
    fd.set('defect_id', p.defect_id);
    fd.set('key', p.key);
    const kept: string[] = [];
    for (const blobId of p.blob_ids) {
      const b = await getBlob(blobId);
      if (!b) continue;
      fd.append('photos', new File([b], `${blobId}.jpg`, { type: b.type || 'image/jpeg' }));
      kept.push(blobId);
    }
    if (kept.length === 0) {
      // No photos survived in local storage — can't satisfy the "at least
      // one photo" requirement of the status flip. Treat as done so the
      // queue clears rather than looping; the FM will see the update never
      // took and can redo it.
      return;
    }
    const res = await fetch('/api/defect-photo', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`defect-photo upload ${res.status}`);
    const body = await res.json();
    const photo_urls: string[] = Array.isArray(body.urls) ? body.urls : [];
    if (photo_urls.length === 0) throw new Error('No photos uploaded');

    // 2. Flip status + write audit row with those URLs.
    const r = await applyDefectStatusUpdate({
      defect_id: p.defect_id,
      defect_number: p.defect_number,
      new_status: p.new_status,
      notes: p.notes,
      provider_id: p.provider_id,
      photo_urls,
      key: p.key,
    });
    if (!r.ok) throw new Error(r.error || 'status update failed');

    // 3. Evict blobs on success.
    for (const blobId of kept) await deleteBlob(blobId);
  });
}

type PhotoUploadPayload = { key: string; blob_id: string; session_id: string }
  & ({ target: 'result'; result_id: string } | { target: 'attendance'; result_id?: never });

type DefectTradePayload = { key: string; defect_number: string; trade: string };

type DefectPhotosPayload = { key: string; defect_id: string; defect_number: string; blob_ids: string[] };

type AgreementUpdatePayload = {
  key: string;
  agreement_id: string;
  client_short_code: string;
  agreement_code: string;
  patch: Record<string, unknown>;
  // FMX-051: optional; omitted on older queued items from before this field
  // was threaded through, which keeps backwards-compat with pending queue
  // entries on devices that haven't reloaded since the deploy.
  baseline_updated_at?: string | null;
};

type DefectStatusUpdatePayload = {
  key: string;
  defect_id: string;
  defect_number: string;
  new_status: 'work_ordered' | 'resolved';
  notes: string;
  provider_id: string | null;
  blob_ids: string[];
};

type VoiceUploadPayload = { key: string; blob_id: string; session_id: string; result_id: string };

// Mount in the root layout so the handlers are live before any
// field-capture action is enqueued.
export default function FieldCaptureBoot() {
  useEffect(() => {
    registerAll();
    startRunner();
  }, []);
  return null;
}

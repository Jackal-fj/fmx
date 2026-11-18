'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { enqueue } from '@/lib/offline/queue';
import { storeBlob } from '@/lib/offline/blobs';
import SignaturePad, { SignaturePadHandle } from './signature-pad';

type Kind = 'yes_no' | 'rating' | 'number' | 'text';

type Item = {
  id: string;
  sort_order: number;
  question: string;
  kind: Kind;
  required: boolean;
  photo_required: boolean;
  trade: string | null;
  fail_if: any;
  notes: string | null;
};

type Draft = {
  answer_bool: boolean | null;
  answer_number: number | null;
  answer_text: string;
  photos: { file: File; dataUrl: string }[];
  failed: boolean;
};

const TARGET_MAX_PX = 2000;
const JPEG_QUALITY = 0.82;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const maxDim = Math.max(bitmap.width, bitmap.height);
  const scale = maxDim > TARGET_MAX_PX ? TARGET_MAX_PX / maxDim : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

function emptyDraft(): Draft {
  return { answer_bool: null, answer_number: null, answer_text: '', photos: [], failed: false };
}

// Given a template item's fail_if and the user's current answer, decide
// whether this item is a "fail" (auto-raised defect later in FMX-056).
function computeFailed(item: Item, d: Draft): boolean {
  const f = item.fail_if;
  if (!f) return false;
  if (item.kind === 'yes_no') {
    if (f.no === true && d.answer_bool === false) return true;
    if (f.yes === true && d.answer_bool === true) return true;
  }
  if (item.kind === 'rating' && typeof f.lt === 'number' && typeof d.answer_number === 'number') {
    return d.answer_number < f.lt;
  }
  if (item.kind === 'number') {
    if (typeof f.lt === 'number' && typeof d.answer_number === 'number' && d.answer_number < f.lt) return true;
    if (typeof f.gt === 'number' && typeof d.answer_number === 'number' && d.answer_number > f.gt) return true;
  }
  return false;
}

function hasAnswer(item: Item, d: Draft): boolean {
  if (item.kind === 'yes_no') return d.answer_bool !== null;
  if (item.kind === 'rating' || item.kind === 'number') return d.answer_number !== null;
  if (item.kind === 'text') return d.answer_text.trim().length > 0;
  return false;
}

export default function Runner({
  sessionId, templateName, headerLine, items, initialResults, completed, raisedDefects,
  signatureUrl, attendanceUrl, closingNote, secretKey,
}: {
  sessionId: string;
  templateName: string;
  headerLine: string;
  items: Item[];
  initialResults: Array<{ template_item_id: string; answer_bool: boolean | null; answer_number: number | null; answer_text: string | null; photo_urls: string[] }>;
  completed: boolean;
  raisedDefects: Array<{ defect_number: string; title: string; severity: string }>;
  signatureUrl: string | null;
  attendanceUrl: string | null;
  closingNote: string | null;
  secretKey: string;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [atClose, setAtClose] = useState(false);          // review → close screen
  // Close-screen state (FMX-057)
  const [attendancePhoto, setAttendancePhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [closeNoteInput, setCloseNoteInput] = useState('');
  const [sigEmpty, setSigEmpty] = useState(true);
  const sigRef = useRef<SignaturePadHandle | null>(null);
  const attendanceInputRef = useRef<HTMLInputElement | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const d: Record<string, Draft> = {};
    for (const it of items) {
      const prior = initialResults.find(r => r.template_item_id === it.id);
      d[it.id] = {
        answer_bool: prior?.answer_bool ?? null,
        answer_number: prior?.answer_number ?? null,
        answer_text: prior?.answer_text ?? '',
        photos: [],  // already-saved photos aren't editable here; new ones only
        failed: false,
      };
    }
    return d;
  });
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (items.length === 0) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-bold text-navy mb-2">{templateName}</h1>
        <p className="text-sm text-muted">This template has no items. Add some at <Link href="/inspections" className="text-navy underline">Inspections</Link>.</p>
      </div>
    );
  }

  const answered = Object.entries(drafts).filter(([id, d]) => {
    const it = items.find(x => x.id === id)!;
    return hasAnswer(it, d);
  }).length;

  if (completed) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-navy">{templateName}</h1>
          <div className="text-sm text-muted">{headerLine}</div>
          <div className="text-base text-green-700 font-semibold mt-3">✓ Inspection complete</div>
        </div>

        {(attendanceUrl || signatureUrl || closingNote) && (
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="px-4 py-2 border-b bg-gray-50 text-sm font-bold text-navy uppercase tracking-wide">Closed with</div>
            <div className="p-4 space-y-3">
              {attendanceUrl && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Attendance photo</div>
                  <img src={attendanceUrl} alt="attendance" className="w-full max-h-56 object-contain rounded border bg-gray-50" />
                </div>
              )}
              {signatureUrl && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Signature</div>
                  <img src={signatureUrl} alt="signature" className="w-full max-h-32 object-contain rounded border bg-white" />
                </div>
              )}
              {closingNote && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Note</div>
                  <p className="text-sm whitespace-pre-line">{closingNote}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {raisedDefects.length > 0 ? (
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="px-4 py-2 border-b bg-gray-50 flex items-baseline justify-between">
              <span className="text-sm font-bold text-navy uppercase tracking-wide">Defects raised</span>
              <span className="text-[11px] text-muted">{raisedDefects.length}</span>
            </div>
            <ul className="divide-y">
              {raisedDefects.map(d => (
                <li key={d.defect_number}>
                  <Link href={`/defects/${encodeURIComponent(d.defect_number)}`} className="block px-4 py-3 hover:bg-blue-50/40 min-h-[44px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-navy">{d.defect_number}</span>
                      <span className="text-[10px] uppercase tracking-wide border border-gray-300 rounded px-1.5 py-0.5 text-muted">{d.severity}</span>
                    </div>
                    <div className="text-sm text-navy mt-1">{d.title}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center text-sm text-muted">No fail items — nothing raised.</div>
        )}

        <div className="flex gap-2 justify-center">
          <Link href="/inspections" className="rounded-md border border-navy text-navy text-sm font-semibold px-4 py-2 min-h-[44px]">Templates</Link>
          <Link href="/" className="rounded-md bg-navy text-white text-sm font-semibold px-4 py-2 min-h-[44px]">Dashboard</Link>
        </div>
      </div>
    );
  }

  // Review / complete screen
  if (idx >= items.length) {
    const missing = items.filter(it => it.required && !hasAnswer(it, drafts[it.id]));
    const failures = items.filter(it => drafts[it.id].failed);
    return (
      <div>
        <ReviewHeader templateName={templateName} headerLine={headerLine} />
        <Progress total={items.length} answered={answered} />
        <h2 className="mt-6 text-lg font-bold text-navy">Review</h2>
        <ul className="mt-3 divide-y rounded-lg border bg-white overflow-hidden">
          {items.map((it, i) => {
            const d = drafts[it.id];
            const ok = hasAnswer(it, d);
            const fl = d.failed;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setIdx(i)}
                  className="block w-full text-left px-4 py-3 hover:bg-blue-50/40 min-h-[44px]"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-mono text-muted w-6 shrink-0">{i + 1}</span>
                    <span className="text-sm text-navy flex-1">{it.question}</span>
                    {!ok && it.required && <span className="text-[11px] text-red-700">missing</span>}
                    {fl && <span className="text-[11px] text-amber-800">fail</span>}
                    {ok && !fl && <span className="text-[11px] text-green-700">✓</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {missing.length > 0 && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {missing.length} required item{missing.length === 1 ? '' : 's'} still unanswered. Tap it to fill in.
          </div>
        )}
        {failures.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            {failures.length} item{failures.length === 1 ? '' : 's'} failed. Jobs are not raised automatically yet (that's FMX-056); for now these show up in the session record.
          </div>
        )}
        {err && <div className="mt-3 text-sm text-red-800">{err}</div>}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setIdx(items.length - 1)}
            className="rounded-md border border-gray-300 text-navy text-sm font-semibold px-4 py-3 min-h-[44px]"
          >Back</button>
          <button
            type="button"
            onClick={() => { setErr(null); setAtClose(true); }}
            disabled={isPending || missing.length > 0}
            className="flex-1 rounded-md bg-green-700 text-white text-base font-semibold py-3 disabled:opacity-50 min-h-[44px]"
          >
            Close & sign →
          </button>
        </div>
      </div>
    );
  }

  // --- CLOSE SCREEN -------------------------------------------------------
  // Shown after the review is clean. Signature + attendance photo required
  // by default; a "Close without evidence" escape exists but stamps the
  // notes so the gap is auditable.
  if (atClose) {
    async function onAttendance(e: React.ChangeEvent<HTMLInputElement>) {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f || !f.type.startsWith('image/')) return;
      const c = await compressImage(f);
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(c);
      });
      setAttendancePhoto({ file: c, dataUrl });
    }

    // FMX-072: stage the attendance photo to IndexedDB + enqueue the
    // upload. Session row commits with attendance_photo_url=null; the
    // handler fills it in on upload ACK.
    async function stageAttendancePhoto(): Promise<void> {
      if (!attendancePhoto) return;
      const blobId = await storeBlob(attendancePhoto.file);
      await enqueue('photo.upload', {
        key: secretKey,
        blob_id: blobId,
        session_id: sessionId,
        target: 'attendance',
      }, { dedupeKey: `photo.upload.${blobId}` });
    }

    function closeNow(withEvidence: boolean) {
      setErr(null);
      if (withEvidence) {
        if (!attendancePhoto) { setErr('Attendance photo is required.'); return; }
        if (sigEmpty) { setErr('Signature is required.'); return; }
      }
      startTransition(async () => {
        const signatureDataUrl = sigRef.current && !sigRef.current.isEmpty()
          ? sigRef.current.toDataURL()
          : null;
        const notes = withEvidence
          ? (closeNoteInput.trim() || null)
          : `CLOSED WITHOUT EVIDENCE — ${closeNoteInput.trim() || 'no reason given'}`;

        try {
          // FMX-068: completeSession lands with attendance_photo_url=null.
          // FMX-072: the attendance photo stages to Dexie + enqueues
          // photo.upload below; its handler attaches the URL on ACK.
          await enqueue('inspection.completeSession', {
            key: secretKey,
            session_id: sessionId,
            patch: {
              completed_at: new Date().toISOString(),
              signature_data_url: signatureDataUrl,
              attendance_photo_url: null,
              notes,
            },
          }, { dedupeKey: `inspection.completeSession.${sessionId}` });

          await stageAttendancePhoto();

          await enqueue('inspection.raiseDefects', {
            key: secretKey,
            session_id: sessionId,
          }, { dedupeKey: `inspection.raiseDefects.${sessionId}` });
        } catch (e: any) {
          setErr(`Could not close inspection: ${e?.message || e}`);
          return;
        }
        router.refresh();
      });
    }

    return (
      <div>
        <ReviewHeader templateName={templateName} headerLine={headerLine} />

        <div className="rounded-lg border bg-white p-4 mt-4 space-y-4">
          {/* Attendance photo */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-semibold text-navy">Attendance photo *</span>
              <button
                type="button"
                onClick={() => attendanceInputRef.current?.click()}
                className="text-xs rounded-md border border-navy text-navy font-semibold px-2 py-1 hover:bg-navy hover:text-white min-h-[44px]"
              >{attendancePhoto ? 'Replace' : '+ Photo'}</button>
              <input ref={attendanceInputRef} type="file" accept="image/*" capture="environment" onChange={onAttendance} className="hidden" />
            </div>
            {attendancePhoto ? (
              <img src={attendancePhoto.dataUrl} alt="attendance" className="w-full max-h-56 object-contain rounded border bg-gray-50" />
            ) : (
              <div className="text-xs text-muted">Snap a photo at the location so the record anchors to a real visit.</div>
            )}
          </div>

          {/* Signature */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-semibold text-navy">Signature *</span>
              <button
                type="button"
                onClick={() => { sigRef.current?.clear(); setSigEmpty(true); }}
                className="text-xs text-muted hover:text-navy"
              >Clear</button>
            </div>
            <SignaturePad ref={sigRef} onChange={(empty) => setSigEmpty(empty)} />
            <div className="text-xs text-muted mt-1">Sign above with your finger or a stylus.</div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Note (optional)</label>
            <textarea
              value={closeNoteInput}
              onChange={e => setCloseNoteInput(e.target.value)}
              rows={3}
              placeholder="Anything worth flagging — who you met, access notes, follow-ups…"
              className="w-full rounded-md border border-gray-300 p-3 text-sm bg-white"
            />
          </div>

          {err && <div className="text-sm text-red-800">{err}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAtClose(false); setErr(null); }}
              className="rounded-md border border-gray-300 text-navy text-sm font-semibold px-4 py-3 min-h-[44px]"
            >Back</button>
            <button
              type="button"
              onClick={() => closeNow(true)}
              disabled={isPending}
              className="flex-1 rounded-md bg-green-700 text-white text-base font-semibold py-3 disabled:opacity-50 min-h-[44px]"
            >
              {isPending ? 'Closing…' : 'Close inspection'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                if (!confirm('Close without attendance photo + signature? The session will be stamped as such in the audit trail.')) return;
                closeNow(false);
              }}
              disabled={isPending}
              className="text-xs text-muted hover:text-red-700 underline"
            >
              Close without evidence
            </button>
          </div>
        </div>
      </div>
    );
  }

  const item = items[idx];
  const draft = drafts[item.id];

  function setDraft(patch: Partial<Draft>) {
    setDrafts(prev => {
      const d = { ...prev[item.id], ...patch };
      d.failed = computeFailed(item, d);
      return { ...prev, [item.id]: d };
    });
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const next: Draft['photos'] = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const c = await compressImage(f);
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(c);
      });
      next.push({ file: c, dataUrl });
    }
    setDraft({ photos: [...draft.photos, ...next] });
  }

  function removePhoto(i: number) {
    setDraft({ photos: draft.photos.filter((_, j) => j !== i) });
  }

  async function saveCurrent(): Promise<boolean> {
    setErr(null);
    if (item.required && !hasAnswer(item, draft)) {
      setErr('This item is required.');
      return false;
    }
    if (item.photo_required && draft.photos.length === 0) {
      setErr('Photo required for this item.');
      return false;
    }

    // FMX-068/072: enqueue the answer first (no photo urls yet — they attach
    // later via photo.upload handlers). Dedupe-keyed by (session, item) so
    // re-answering an item collapses to one row.
    const resultId = crypto.randomUUID();
    try {
      await enqueue('inspection.recordResult', {
        key: secretKey,
        result: {
          id: resultId,
          session_id: sessionId,
          template_item_id: item.id,
          sort_order: item.sort_order,
          question: item.question,
          kind: item.kind,
          answer_bool: draft.answer_bool,
          answer_number: draft.answer_number,
          answer_text: draft.answer_text.trim() || null,
          photo_urls: [],                // photos attach via photo.upload
          failed: draft.failed,
          failure_reason: draft.failed ? 'Auto fail from fail_if rule' : null,
          answered_at: new Date().toISOString(),
        },
      }, { dedupeKey: `inspection.recordResult.${sessionId}.${item.id}` });
    } catch (e: any) {
      setErr(`Could not save answer: ${e?.message || e}`);
      return false;
    }

    // FMX-072: each photo → store the blob locally, enqueue photo.upload.
    // Handler uploads + attaches the URL back onto the result row.
    for (let i = 0; i < draft.photos.length; i++) {
      const p = draft.photos[i];
      try {
        const blobId = await storeBlob(p.file);
        await enqueue('photo.upload', {
          key: secretKey,
          blob_id: blobId,
          session_id: sessionId,
          target: 'result',
          result_id: resultId,
        }, { dedupeKey: `photo.upload.${blobId}` });
      } catch (e: any) {
        setErr(`Could not stage photo: ${e?.message || e}`);
        return false;
      }
    }

    // Clear the photo buffer so Back then Next doesn't re-stage the same files.
    setDraft({ photos: [] });
    return true;
  }

  async function next() {
    const ok = await saveCurrent();
    if (!ok) return;
    setIdx(i => i + 1);
  }

  async function back() {
    // Don't persist moving back — same as "skip saving".
    setIdx(i => Math.max(0, i - 1));
    setErr(null);
  }

  async function skip() {
    if (item.required) { setErr('Can\'t skip a required item.'); return; }
    setIdx(i => i + 1);
    setErr(null);
  }

  // (complete flow is on the close screen — see `closeNow()`.)

  return (
    <div>
      <ReviewHeader templateName={templateName} headerLine={headerLine} />
      <Progress total={items.length} answered={answered} currentIdx={idx} />

      <div className="mt-4 rounded-lg border bg-white p-4 min-h-[340px] flex flex-col">
        <div className="text-[11px] font-mono text-muted">{idx + 1} of {items.length}</div>
        <h2 className="text-lg font-bold text-navy mt-1 leading-snug">{item.question}</h2>
        <div className="text-[11px] text-muted mt-1">
          {item.required ? 'Required · ' : ''}{item.photo_required ? 'Photo required · ' : ''}{item.trade ? `${item.trade}` : ''}
        </div>

        <div className="mt-4 flex-1">
          {item.kind === 'yes_no' && (
            <div className="grid grid-cols-2 gap-3">
              <AnswerPill active={draft.answer_bool === true}  onClick={() => setDraft({ answer_bool: true })}  tone="good" label="Yes" />
              <AnswerPill active={draft.answer_bool === false} onClick={() => setDraft({ answer_bool: false })} tone="bad"  label="No" />
            </div>
          )}

          {item.kind === 'rating' && (
            <div className="flex gap-2 justify-between">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraft({ answer_number: n })}
                  className={`flex-1 h-16 rounded-md text-xl font-bold border-2 transition ${
                    draft.answer_number === n
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white text-navy border-gray-300 hover:border-navy'
                  }`}
                >{n}</button>
              ))}
            </div>
          )}

          {item.kind === 'number' && (
            <input
              type="number"
              inputMode="decimal"
              value={draft.answer_number ?? ''}
              onChange={e => setDraft({ answer_number: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="Enter a number"
              className="w-full rounded-md border border-gray-300 p-3 text-2xl text-center font-mono bg-white"
            />
          )}

          {item.kind === 'text' && (
            <textarea
              value={draft.answer_text}
              onChange={e => setDraft({ answer_text: e.target.value })}
              rows={4}
              placeholder="Type your answer…"
              className="w-full rounded-md border border-gray-300 p-3 text-base bg-white"
            />
          )}

          {/* Photos */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wide text-muted">Photos{item.photo_required ? ' *' : ''}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs rounded-md border border-navy text-navy font-semibold px-2 py-1 hover:bg-navy hover:text-white min-h-[44px]"
              >+ Photo</button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple onChange={onFiles} className="hidden" />
            </div>
            {draft.photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                {draft.photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.dataUrl} alt="" className="w-full h-20 object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 text-white w-5 h-5 text-xs leading-none flex items-center justify-center"
                      aria-label="Remove"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {draft.failed && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              ⚠ This answer meets the fail condition. A job will be auto-raised when FMX-056 lands; for now it's recorded as failed on this result.
            </div>
          )}
        </div>

        {err && <div className="mt-3 text-sm text-red-800">{err}</div>}

        {/* Thumb-zone action bar */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={back}
            disabled={idx === 0}
            className="rounded-md border border-gray-300 text-navy text-sm font-semibold px-4 py-3 disabled:opacity-40 min-h-[44px]"
          >Back</button>
          {!item.required && (
            <button
              type="button"
              onClick={skip}
              className="rounded-md border border-gray-300 text-muted text-sm font-semibold px-4 py-3 min-h-[44px]"
            >Skip</button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={isPending}
            className="flex-1 rounded-md bg-navy text-white text-base font-semibold py-3 disabled:opacity-50 min-h-[44px]"
          >{isPending ? 'Saving…' : (idx === items.length - 1 ? 'Review →' : 'Next →')}</button>
        </div>
      </div>
    </div>
  );
}

function ReviewHeader({ templateName, headerLine }: { templateName: string; headerLine: string }) {
  return (
    <div className="mb-2">
      <h1 className="text-xl font-bold text-navy">{templateName}</h1>
      {headerLine && <div className="text-xs text-muted mt-0.5">{headerLine}</div>}
    </div>
  );
}

function Progress({ total, answered, currentIdx }: { total: number; answered: number; currentIdx?: number }) {
  const pct = Math.min(100, Math.round(((currentIdx ?? answered) / total) * 100));
  return (
    <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
      <div className="h-full bg-navy transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function AnswerPill({ active, onClick, tone, label }: { active: boolean; onClick: () => void; tone: 'good' | 'bad'; label: string }) {
  const base = 'rounded-md h-16 text-xl font-bold border-2 transition';
  const palette = active
    ? (tone === 'good' ? 'bg-green-700 text-white border-green-700' : 'bg-red-700 text-white border-red-700')
    : 'bg-white text-navy border-gray-300 hover:border-navy';
  return (
    <button type="button" onClick={onClick} className={`${base} ${palette}`}>{label}</button>
  );
}

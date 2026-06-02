'use client';

import { useState, useTransition, useRef } from 'react';
import { updateDefect } from '../actions';

type DefectInfo = {
  id: string;
  defect_number: string;
  title: string;
  severity: string;
  status: string;
  property_short_code: string;
  property_name: string;
};

type Preview = {
  id: string;
  file: File;          // compressed file
  dataUrl: string;     // for thumbnail preview
  originalSize: number;
  compressedSize: number;
};

const MAX_PHOTOS = 5;
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

// Client-side compression: resize to max 1600px width, re-encode as JPEG.
// Typical phone photo: 8-12 MB → 300-800 KB after this.
async function compressImage(file: File): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Read failed'));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Image decode failed'));
    i.src = dataUrl;
  });

  // If already small enough, skip the canvas roundtrip and return original.
  if (img.width <= MAX_WIDTH && file.size < 800 * 1024) {
    return file;
  }

  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const targetW = Math.round(img.width * scale);
  const targetH = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

export default function UpdateDefectForm({
  defect,
  secretKey,
}: {
  defect: DefectInfo;
  secretKey: string;
}) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [newStatus, setNewStatus] = useState<'work_ordered' | 'resolved'>('resolved');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setErr(null);

    const remaining = MAX_PHOTOS - previews.length;
    if (files.length > remaining) {
      setErr(`Max ${MAX_PHOTOS} photos total. ${remaining} slot(s) remaining.`);
      e.target.value = '';
      return;
    }

    setBusy(true);
    try {
      const next: Preview[] = [];
      for (const f of files) {
        if (!f.type.startsWith('image/')) {
          setErr(`Skipped ${f.name}: not an image.`);
          continue;
        }
        const compressed = await compressImage(f);
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error('Preview read failed'));
          r.readAsDataURL(compressed);
        });
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: compressed,
          dataUrl,
          originalSize: f.size,
          compressedSize: compressed.size,
        });
      }
      setPreviews(p => [...p, ...next]);
    } catch (e: any) {
      setErr(e.message || 'Failed to process image.');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  function removePreview(id: string) {
    setPreviews(p => p.filter(x => x.id !== id));
    setErr(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (previews.length < 1) {
      setErr('At least one photo is required to change status.');
      return;
    }

    if (newStatus === 'resolved' && !notes.trim()) {
      setErr('Resolution notes are required when marking a defect Resolved. Describe briefly what was done.');
      return;
    }

    const fd = new FormData();
    fd.set('defect_id', defect.id);
    fd.set('new_status', newStatus);
    fd.set('notes', notes.trim());
    fd.set('key', secretKey);
    for (const p of previews) {
      fd.append('photos', p.file);
    }

    startTransition(async () => {
      try {
        const result = await updateDefect(fd);
        // On success, the server action redirects; we only see a result if it errored.
        if (result && !result.ok) {
          setErr(result.error || 'Update failed. Try again.');
        }
      } catch (e: any) {
        // Redirects throw a special NEXT_REDIRECT — let it propagate.
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Update failed. Try again.');
      }
    });
  }

  const canSubmit = previews.length >= 1 && !busy && !isPending;
  const submitting = busy || isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ---------- defect summary card ---------- */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-mono text-xs text-muted">{defect.defect_number}</span>
          <span className="text-xs text-muted">{defect.property_short_code}</span>
        </div>
        <div className="font-semibold text-navy mb-1">{defect.title}</div>
        <div className="text-xs text-muted">
          Severity: <span className="uppercase font-medium">{defect.severity}</span>
          {'  •  '}
          Current status: <span className="uppercase font-medium">{defect.status.replace('_', ' ')}</span>
        </div>
      </div>

      {/* ---------- new status ---------- */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          New status <span className="text-red-600">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={`rounded-md border p-3 text-center cursor-pointer text-sm ${newStatus === 'work_ordered' ? 'border-navy bg-navy text-white' : 'bg-white'}`}>
            <input
              type="radio"
              name="new_status"
              value="work_ordered"
              checked={newStatus === 'work_ordered'}
              onChange={() => setNewStatus('work_ordered')}
              className="sr-only"
            />
            In Progress
          </label>
          <label className={`rounded-md border p-3 text-center cursor-pointer text-sm ${newStatus === 'resolved' ? 'border-navy bg-navy text-white' : 'bg-white'}`}>
            <input
              type="radio"
              name="new_status"
              value="resolved"
              checked={newStatus === 'resolved'}
              onChange={() => setNewStatus('resolved')}
              className="sr-only"
            />
            Resolved
          </label>
        </div>
      </div>

      {/* ---------- photos ---------- */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Photo evidence <span className="text-red-600">*</span>
          <span className="text-xs font-normal text-muted ml-2">
            {previews.length}/{MAX_PHOTOS} attached
          </span>
        </label>

        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {previews.map(p => (
              <div key={p.id} className="relative group">
                <img
                  src={p.dataUrl}
                  alt="evidence"
                  className="w-full h-24 object-cover rounded border"
                />
                <button
                  type="button"
                  onClick={() => removePreview(p.id)}
                  className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 text-xs leading-none"
                  aria-label="Remove photo"
                >×</button>
                <div className="text-[10px] text-muted mt-1 text-center">
                  {(p.compressedSize / 1024).toFixed(0)} KB
                </div>
              </div>
            ))}
          </div>
        )}

        {previews.length < MAX_PHOTOS && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFiles}
              className="hidden"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full rounded-md border-2 border-dashed border-navy/40 bg-white py-4 text-navy font-medium hover:bg-navy/5 disabled:opacity-50"
            >
              {busy ? 'Processing…' : (previews.length === 0 ? '+ Add photo (camera or gallery)' : '+ Add another photo')}
            </button>
          </>
        )}

        <p className="text-xs text-muted mt-2">
          Tap to choose between camera and gallery. Photos are auto-compressed before upload.
        </p>
      </div>

      {/* ---------- notes ---------- */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          {newStatus === 'resolved' ? (
            <>Resolution notes <span className="text-red-600">*</span></>
          ) : (
            <>Notes <span className="text-xs font-normal text-muted">(optional)</span></>
          )}
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          required={newStatus === 'resolved'}
          placeholder={newStatus === 'resolved'
            ? 'Required. e.g. Contractor replaced ballast and tested. Light working normally.'
            : 'Optional. e.g. Dispatched Pacific Electrical. ETA Wednesday AM.'
          }
          className="w-full rounded-md border bg-white p-3 text-sm"
        />
        {newStatus === 'resolved' && (
          <p className="text-xs text-muted mt-1">
            Briefly describe what was done — this becomes part of the permanent record and the monthly report.
          </p>
        )}
      </div>

      {/* ---------- error ---------- */}
      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {/* ---------- submit ---------- */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Saving…' : `Update defect → ${newStatus === 'resolved' ? 'Resolved' : 'In Progress'}`}
      </button>

      <p className="text-xs text-muted text-center">
        This update will be logged with your photos as evidence and will appear in the next monthly report.
      </p>
    </form>
  );
}

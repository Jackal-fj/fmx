'use client';

import { useState, useTransition, useRef } from 'react';
import { enqueue } from '@/lib/offline/queue';
import { storeBlob } from '@/lib/offline/blobs';

const MAX_PHOTOS = 10;
const TARGET_MAX_PX = 2000;
const JPEG_QUALITY = 0.82;

type Preview = { id: string; file: File; dataUrl: string };

// Reuse the compression pattern from /new-defect so uploads stay small on
// 4G in Suva. Falls back to the original file if the canvas path fails.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const maxDim = Math.max(bitmap.width, bitmap.height);
  const scale = maxDim > TARGET_MAX_PX ? TARGET_MAX_PX / maxDim : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>(res =>
    canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export default function PhotoAppender({
  defectId,
  defectNumber,
  secretKey,
  existingCount,
}: {
  defectId: string;
  defectNumber: string;
  secretKey: string;
  existingCount: number;
}) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAfter = existingCount + previews.length;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setErr(null);
    if (previews.length + files.length > MAX_PHOTOS) {
      setErr(`Max ${MAX_PHOTOS} photos per upload. ${MAX_PHOTOS - previews.length} slot(s) left.`);
      return;
    }
    setBusy(true);
    try {
      const next: Preview[] = [];
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        const compressed = await compressImage(f);
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error('read failed'));
          r.readAsDataURL(compressed);
        });
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: compressed,
          dataUrl,
        });
      }
      setPreviews(p => [...p, ...next]);
    } catch (e: any) {
      setErr(e?.message || 'Could not process image.');
    } finally {
      setBusy(false);
    }
  }

  function removePreview(id: string) {
    setPreviews(p => p.filter(x => x.id !== id));
  }

  function submit() {
    if (previews.length === 0) {
      setErr('Pick at least one photo.');
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        // FMX-059: stage each blob locally then enqueue the append. The
        // handler batches them back into the existing appendDefectPhotos
        // FormData shape. Dedupe-keyed so a tap-happy Upload button
        // doesn't fire duplicate batches.
        const blobIds: string[] = [];
        for (const p of previews) blobIds.push(await storeBlob(p.file));
        await enqueue('defect.photos.append', {
          key: secretKey,
          defect_id: defectId,
          defect_number: defectNumber,
          blob_ids: blobIds,
        }, { dedupeKey: `defect.photos.append.${defectId}.${Date.now()}` });
        setPreviews([]);
      } catch (e: any) {
        setErr(e?.message || 'Upload failed.');
      }
    });
  }

  const submitting = busy || isPending;

  return (
    <div className="rounded-lg border bg-white p-4 mb-6">
      <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
        <div className="text-xs uppercase tracking-wide text-muted">Add photos</div>
        <span className="text-[11px] text-muted">
          {existingCount} on file · {previews.length} queued {previews.length > 0 ? `(${totalAfter} total after upload)` : ''}
        </span>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting || previews.length >= MAX_PHOTOS}
          className="rounded-md border border-navy text-navy text-sm font-semibold px-3 py-2 hover:bg-navy hover:text-white disabled:opacity-50 min-h-[44px]"
        >
          {previews.length === 0 ? '+ Photo' : '+ More'}
        </button>
        {previews.length > 0 && (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-2 hover:bg-blue-900 disabled:opacity-50 min-h-[44px]"
          >
            {isPending ? 'Uploading…' : `Upload ${previews.length}`}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      {previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
          {previews.map(p => (
            <div key={p.id} className="relative">
              <img src={p.dataUrl} alt="" className="w-full h-20 object-cover rounded border" />
              <button
                type="button"
                onClick={() => removePreview(p.id)}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white w-5 h-5 text-xs leading-none flex items-center justify-center"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">{err}</div>
      )}
    </div>
  );
}

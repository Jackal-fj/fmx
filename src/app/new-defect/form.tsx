'use client';

import { useState, useTransition, useRef } from 'react';
import { createDefect } from './actions';

type PropertyOption = { short_code: string; name: string };
type Preview = { id: string; file: File; dataUrl: string; compressedSize: number };

const MAX_PHOTOS = 5;
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

const SEVERITIES = ['minor', 'moderate', 'major', 'critical'];
const FLOORS     = ['External', 'G', 'L1', 'L2', 'L3', 'Roof'];
const AREAS = [
  'Lobby/Reception', 'Lift Lobby', 'Corridor', 'Stairwell',
  'Toilets - Mens', 'Toilets - Ladies', 'Toilets - Disabled',
  'Meeting Room', 'Kitchenette', 'Office', 'Open Office Area',
  'Storage', 'Comms/IT Room', 'Plant/Services Room',
  'Security/Guard Point', 'Site / Perimeter', 'Other',
];
const CATEGORIES = [
  'Doors/Locks/Access', 'Cleaning/Waste', 'Electrical/Lighting',
  'HVAC/Ventilation', 'Building Damage (walls/ceiling/floor)',
  'Plumbing/Drainage', 'Fire Services', 'Glazing/Windows',
  'Roofing/Stormwater', 'Pest/Hygiene', 'External/Site/Landscaping',
  'Signage/Wayfinding', 'Security/CCTV/Access Control',
  'Lifts/Conveyance', 'Furniture/Fittings', 'OHS/Compliance',
  'Communications/IT Infrastructure', 'Other',
];

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
    i.onerror = () => reject(new Error('Decode failed'));
    i.src = dataUrl;
  });
  if (img.width <= MAX_WIDTH && file.size < 800 * 1024) return file;
  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export default function NewDefectForm({
  properties,
  secretKey,
}: {
  properties: PropertyOption[];
  secretKey: string;
}) {
  const [propertyCode, setPropertyCode] = useState('');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('moderate');
  const [description, setDescription] = useState('');
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');
  const [category, setCategory] = useState('');
  const [previews, setPreviews] = useState<Preview[]>([]);
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
      setErr(`Max ${MAX_PHOTOS} photos. ${remaining} slot(s) remaining.`);
      e.target.value = '';
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
          r.onerror = () => rej(new Error('Preview read failed'));
          r.readAsDataURL(compressed);
        });
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: compressed,
          dataUrl,
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!propertyCode || !title.trim() || !severity) {
      setErr('Property, title, and severity are required.');
      return;
    }

    const fd = new FormData();
    fd.set('property_code', propertyCode);
    fd.set('title', title.trim());
    fd.set('severity', severity);
    fd.set('description', description.trim());
    fd.set('floor', floor);
    fd.set('area', area);
    fd.set('category', category);
    fd.set('key', secretKey);
    for (const p of previews) fd.append('photos', p.file);

    startTransition(async () => {
      try {
        const result = await createDefect(fd);
        if (result && !result.ok) setErr(result.error || 'Save failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Save failed.');
      }
    });
  }

  const submitting = busy || isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-navy mb-1">
          Property <span className="text-red-600">*</span>
        </label>
        <select
          value={propertyCode}
          onChange={e => setPropertyCode(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white focus:border-navy focus:outline-none"
        >
          <option value="" disabled>Select property…</option>
          {properties.map(p => (
            <option key={p.short_code} value={p.short_code}>{p.short_code} — {p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy mb-1">
          Title <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. L2 server room GPOs tripping again"
          className="w-full rounded-lg border border-gray-300 p-3 text-base focus:border-navy focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-navy mb-1">
          Severity <span className="text-red-600">*</span>
        </label>
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white focus:border-navy focus:outline-none"
        >
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional — context, who flagged it, what was tried"
          className="w-full rounded-lg border border-gray-300 p-3 text-base focus:border-navy focus:outline-none"
        />
      </div>

      {/* --- Photos ----------------------------------------------------- */}
      <div>
        <label className="block text-sm font-medium text-navy mb-1">
          Photo{previews.length === 1 ? '' : 's'}
          <span className="text-xs font-normal text-muted ml-2">{previews.length}/{MAX_PHOTOS} attached</span>
        </label>
        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {previews.map(p => (
              <div key={p.id} className="relative">
                <img src={p.dataUrl} alt="" className="w-full h-24 object-cover rounded border" />
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
              className="w-full rounded-lg border-2 border-dashed border-navy/40 bg-white py-3 text-navy font-medium hover:bg-navy/5 disabled:opacity-50"
            >
              {busy ? 'Processing…' : (previews.length === 0 ? '+ Add photo (optional)' : '+ Add another photo')}
            </button>
          </>
        )}
        <p className="text-xs text-muted mt-2">
          Optional but recommended — visual context helps when reviewing later or sending to a contractor.
        </p>
      </div>

      <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <summary className="text-sm font-medium text-navy cursor-pointer select-none">
          More detail (location, category)
        </summary>
        <div className="space-y-3 mt-3">
          <div>
            <label className="block text-sm font-medium text-navy mb-1">Floor</label>
            <select value={floor} onChange={e => setFloor(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white">
              <option value="">—</option>
              {FLOORS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy mb-1">Area</label>
            <select value={area} onChange={e => setArea(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white">
              <option value="">—</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white">
              <option value="">—</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </details>

      {err && (
        <div className="rounded-lg bg-red-50 ring-1 ring-red-200 text-red-800 p-3 text-sm">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-navy text-white font-semibold py-3 text-base hover:bg-blue-900 active:bg-blue-950 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Saving…' : 'Save defect'}
      </button>
      <p className="text-xs text-muted text-center">
        The new defect appears on the dashboard and in next month&apos;s report automatically.
      </p>
    </form>
  );
}

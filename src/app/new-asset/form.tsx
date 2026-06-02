'use client';

import { useState, useTransition, useRef, useMemo } from 'react';
import { createAsset } from './actions';

type PropertyOption = { id: string; short_code: string; name: string };
type SpaceOption = { id: string; property_id: string; name: string; short_code: string | null; space_type: string };

type Preview = {
  id: string;
  file: File;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
};

const MAX_PHOTOS = 5;
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

const ASSET_TYPES = [
  'AC Unit', 'HVAC Plant', 'Lift / Elevator', 'Generator',
  'Fire Panel', 'Fire Pump', 'Fire Hose Reel', 'Sprinkler System',
  'Smoke Detection', 'Emergency Lighting',
  'Solar PV', 'Solar Hot Water', 'Boiler / Hot Water',
  'CCTV / Security', 'Access Control',
  'Pool Plant', 'Pump (Other)', 'Tank (Water)',
  'Roof System', 'Roller Door', 'Other',
];

const CONDITIONS: Array<{ value: string; label: string }> = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good',      label: 'Good' },
  { value: 'adequate',  label: 'Adequate' },
  { value: 'marginal',  label: 'Marginal' },
  { value: 'poor',      label: 'Poor' },
  { value: 'failed',    label: 'Failed' },
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

export default function NewAssetForm({
  properties,
  spaces,
  secretKey,
}: {
  properties: PropertyOption[];
  spaces: SpaceOption[];
  secretKey: string;
}) {
  const [propertyCode, setPropertyCode] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [installDate, setInstallDate] = useState('');
  const [warrantyDate, setWarrantyDate] = useState('');
  const [serviceInterval, setServiceInterval] = useState('');
  const [condition, setCondition] = useState('good');
  const [replacementCost, setReplacementCost] = useState('');
  const [notes, setNotes] = useState('');

  const [previews, setPreviews] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProperty = useMemo(
    () => properties.find(p => p.short_code === propertyCode) || null,
    [propertyCode, properties],
  );
  const availableSpaces = useMemo(
    () => selectedProperty ? spaces.filter(s => s.property_id === selectedProperty.id) : [],
    [selectedProperty, spaces],
  );

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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!propertyCode || !name.trim() || !assetType.trim()) {
      setErr('Property, name, and asset type are required.');
      return;
    }

    const fd = new FormData();
    fd.set('property_code', propertyCode);
    fd.set('space_id', spaceId);
    fd.set('name', name.trim());
    fd.set('asset_type', assetType.trim());
    fd.set('asset_code', assetCode.trim());
    fd.set('make', make.trim());
    fd.set('model', model.trim());
    fd.set('serial_number', serialNumber.trim());
    fd.set('install_date', installDate);
    fd.set('warranty_expiry_date', warrantyDate);
    fd.set('service_interval_months', serviceInterval);
    fd.set('current_condition', condition);
    fd.set('replacement_cost_fjd', replacementCost);
    fd.set('notes', notes.trim());
    fd.set('key', secretKey);
    for (const p of previews) fd.append('photos', p.file);

    startTransition(async () => {
      try {
        const result = await createAsset(fd);
        if (result && !result.ok) setErr(result.error || 'Save failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Save failed.');
      }
    });
  }

  const submitting = busy || isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* property */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Property <span className="text-red-600">*</span>
        </label>
        <select
          value={propertyCode}
          onChange={e => { setPropertyCode(e.target.value); setSpaceId(''); }}
          required
          className="w-full rounded-md border bg-white p-3 text-sm"
        >
          <option value="">Select property…</option>
          {properties.map(p => (
            <option key={p.id} value={p.short_code}>{p.short_code} — {p.name}</option>
          ))}
        </select>
      </div>

      {/* space */}
      {availableSpaces.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-navy mb-2">
            Location <span className="text-xs font-normal text-muted">(optional)</span>
          </label>
          <select
            value={spaceId}
            onChange={e => setSpaceId(e.target.value)}
            className="w-full rounded-md border bg-white p-3 text-sm"
          >
            <option value="">— Unspecified —</option>
            {availableSpaces.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.space_type !== 'room' ? ` (${s.space_type})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* name */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Name <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          placeholder="e.g. AC Unit – Server Room or Generator #1"
          className="w-full rounded-md border bg-white p-3 text-sm"
        />
      </div>

      {/* asset type */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Asset type <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={assetType}
          onChange={e => setAssetType(e.target.value)}
          list="asset-type-list"
          required
          placeholder="Start typing or pick…"
          className="w-full rounded-md border bg-white p-3 text-sm"
        />
        <datalist id="asset-type-list">
          {ASSET_TYPES.map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      {/* condition */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Current condition
        </label>
        <select
          value={condition}
          onChange={e => setCondition(e.target.value)}
          className="w-full rounded-md border bg-white p-3 text-sm"
        >
          {CONDITIONS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* details — collapsible-feeling block */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted">Details (optional)</div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Make</label>
            <input type="text" value={make} onChange={e => setMake(e.target.value)}
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Model</label>
            <input type="text" value={model} onChange={e => setModel(e.target.value)}
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Serial number</label>
            <input type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value)}
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Asset code</label>
            <input type="text" value={assetCode} onChange={e => setAssetCode(e.target.value)}
                   placeholder="e.g. AC-12 or GEN-1"
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Install date</label>
            <input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)}
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Warranty expires</label>
            <input type="date" value={warrantyDate} onChange={e => setWarrantyDate(e.target.value)}
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Service interval (months)</label>
            <input type="number" min={0} step={1} value={serviceInterval}
                   onChange={e => setServiceInterval(e.target.value)}
                   placeholder="e.g. 6 or 12"
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Replacement cost (FJD)</label>
            <input type="number" min={0} step={1} value={replacementCost}
                   onChange={e => setReplacementCost(e.target.value)}
                   placeholder="e.g. 5500"
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
        </div>
      </div>

      {/* photos */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Photos <span className="text-xs font-normal text-muted ml-2">{previews.length}/{MAX_PHOTOS} attached</span>
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
              className="w-full rounded-md border-2 border-dashed border-navy/40 bg-white py-3 text-navy font-medium hover:bg-navy/5 disabled:opacity-50"
            >
              {busy ? 'Processing…' : (previews.length === 0 ? '+ Add photo (nameplate, serial, install)' : '+ Add another photo')}
            </button>
          </>
        )}
        <p className="text-xs text-muted mt-2">
          Optional. Useful: photo of nameplate/serial sticker, full unit, install location.
        </p>
      </div>

      {/* notes */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Notes <span className="text-xs font-normal text-muted">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Any context: install contractor, special access, known quirks…"
          className="w-full rounded-md border bg-white p-3 text-sm"
        />
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Saving…' : 'Add asset'}
      </button>
    </form>
  );
}

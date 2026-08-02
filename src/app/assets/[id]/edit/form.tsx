'use client';

import { useState, useTransition, useRef, useMemo } from 'react';
import { updateAsset, deleteAsset } from './actions';
import { suggestAssetCode } from '@/app/new-asset/actions';

type AssetData = {
  id: string;
  property_id: string;
  property_short_code: string;
  property_name: string;
  space_id: string | null;
  name: string;
  asset_type: string;
  asset_code: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  warranty_expiry_date: string | null;
  service_interval_months: number | null;
  current_condition: string | null;
  replacement_cost_fjd: number | null;
  notes: string | null;
  active: boolean;
  photo_urls: string[];
};

type SpaceOption = { id: string; property_id: string; name: string; short_code: string | null; space_type: string };
type Preview = { id: string; file: File; dataUrl: string; compressedSize: number };

const MAX_NEW_PHOTOS = 5;
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

const CONDITIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good',      label: 'Good' },
  { value: 'adequate',  label: 'Adequate' },
  { value: 'marginal',  label: 'Marginal' },
  { value: 'poor',      label: 'Poor' },
  { value: 'failed',    label: 'Failed' },
];

const ASSET_TYPES = [
  'AC Unit', 'HVAC Plant', 'Lift / Elevator', 'Generator',
  'Fire Panel', 'Fire Pump', 'Fire Hose Reel', 'Sprinkler System',
  'Smoke Detection', 'Emergency Lighting',
  'Solar PV', 'Solar Hot Water', 'Boiler / Hot Water',
  'CCTV / Security', 'Access Control',
  'Pool Plant', 'Pump (Other)', 'Tank (Water)',
  'Roof System', 'Roller Door', 'Other',
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

export default function EditAssetForm({
  asset,
  spaces,
  secretKey,
}: {
  asset: AssetData;
  spaces: SpaceOption[];
  secretKey: string;
}) {
  const [spaceId, setSpaceId] = useState(asset.space_id || '');
  const [name, setName] = useState(asset.name);
  const [assetType, setAssetType] = useState(asset.asset_type);
  const [assetCode, setAssetCode] = useState(asset.asset_code || '');
  const [make, setMake] = useState(asset.make || '');
  const [model, setModel] = useState(asset.model || '');
  const [serialNumber, setSerialNumber] = useState(asset.serial_number || '');
  const [installDate, setInstallDate] = useState((asset.install_date || '').slice(0, 10));
  const [warrantyDate, setWarrantyDate] = useState((asset.warranty_expiry_date || '').slice(0, 10));
  const [serviceInterval, setServiceInterval] = useState(asset.service_interval_months?.toString() || '');
  const [condition, setCondition] = useState(asset.current_condition || 'good');
  const [replacementCost, setReplacementCost] = useState(asset.replacement_cost_fjd?.toString() || '');
  const [notes, setNotes] = useState(asset.notes || '');
  const [active, setActive] = useState(asset.active);

  const [previews, setPreviews] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableSpaces = useMemo(
    () => spaces.filter(s => s.property_id === asset.property_id),
    [spaces, asset.property_id],
  );

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setErr(null);
    const remaining = MAX_NEW_PHOTOS - previews.length;
    if (files.length > remaining) {
      setErr(`Max ${MAX_NEW_PHOTOS} new photos per edit.`);
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
          file: compressed, dataUrl,
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
    if (!name.trim() || !assetType.trim()) {
      setErr('Name and asset type are required.');
      return;
    }
    const fd = new FormData();
    fd.set('asset_id', asset.id);
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
    fd.set('active', active ? 'true' : 'false');
    fd.set('key', secretKey);
    for (const p of previews) fd.append('photos', p.file);

    startTransition(async () => {
      try {
        const result = await updateAsset(fd);
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
      <div className="rounded-lg border bg-white p-3 text-xs text-muted">
        Property: <span className="font-medium text-navy">{asset.property_short_code} — {asset.property_name}</span>
        <span className="text-muted ml-2">(use Add Asset to move it to another property)</span>
      </div>

      {availableSpaces.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-navy mb-2">Location</label>
          <select value={spaceId} onChange={e => setSpaceId(e.target.value)}
                  className="w-full rounded-md border bg-white p-3 text-sm">
            <option value="">— Unspecified —</option>
            {availableSpaces.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.space_type !== 'room' ? ` (${s.space_type})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Name <span className="text-red-600">*</span></label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Asset type <span className="text-red-600">*</span></label>
        <input type="text" value={assetType} onChange={e => setAssetType(e.target.value)} list="asset-type-list-edit" required
               className="w-full rounded-md border bg-white p-3 text-sm" />
        <datalist id="asset-type-list-edit">
          {ASSET_TYPES.map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Current condition</label>
        <select value={condition} onChange={e => setCondition(e.target.value)}
                className="w-full rounded-md border bg-white p-3 text-sm">
          {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted">Details</div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Make" value={make} setValue={setMake} />
          <Input label="Model" value={model} setValue={setModel} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Serial number" value={serialNumber} setValue={setSerialNumber} />
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-xs text-muted">Asset code</label>
              <button
                type="button"
                onClick={async () => {
                  if (!assetType.trim()) return;
                  const suggested = await suggestAssetCode(asset.property_short_code, assetType.trim());
                  if (suggested) setAssetCode(suggested);
                }}
                disabled={!assetType.trim()}
                className="text-[11px] text-navy hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                Suggest
              </button>
            </div>
            <input type="text" value={assetCode} onChange={e => setAssetCode(e.target.value)}
                   className="w-full rounded border bg-white p-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Install date" value={installDate} setValue={setInstallDate} type="date" />
          <Input label="Warranty expires" value={warrantyDate} setValue={setWarrantyDate} type="date" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Service interval (months)" value={serviceInterval} setValue={setServiceInterval} type="number" />
          <Input label="Replacement cost (FJD)" value={replacementCost} setValue={setReplacementCost} type="number" />
        </div>
      </div>

      {/* existing photos */}
      {asset.photo_urls.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-navy mb-2">
            Existing photos <span className="text-xs font-normal text-muted">({asset.photo_urls.length})</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {asset.photo_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" className="w-full h-20 object-cover rounded border" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* add new photos */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Add new photos <span className="text-xs font-normal text-muted ml-2">{previews.length}/{MAX_NEW_PHOTOS}</span>
        </label>
        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {previews.map(p => (
              <div key={p.id} className="relative">
                <img src={p.dataUrl} alt="" className="w-full h-24 object-cover rounded border" />
                <button type="button" onClick={() => removePreview(p.id)}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 text-xs leading-none">×</button>
              </div>
            ))}
          </div>
        )}
        {previews.length < MAX_NEW_PHOTOS && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles}
                   className="hidden" disabled={busy} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
                    className="w-full rounded-md border-2 border-dashed border-navy/40 bg-white py-3 text-navy font-medium hover:bg-navy/5 disabled:opacity-50">
              {busy ? 'Processing…' : '+ Add photo'}
            </button>
          </>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <div className="rounded-lg border bg-white p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
                 className="w-4 h-4" />
          <span className="text-sm font-semibold">Active</span>
        </label>
        <p className="text-xs text-muted mt-1 ml-7">
          Uncheck to retire this asset. Retired assets stop appearing in default lists but stay in history.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <button type="submit" disabled={submitting}
              className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50">
        {submitting ? 'Saving…' : 'Save changes'}
      </button>

      {/* -------- Danger zone -------- */}
      <DeleteZone assetId={asset.id} assetName={asset.name} secretKey={secretKey} />
    </form>
  );
}

function DeleteZone({ assetId, assetName, secretKey }: {
  assetId: string;
  assetName: string;
  secretKey: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleDelete() {
    setErr(null);
    const fd = new FormData();
    fd.set('asset_id', assetId);
    fd.set('key', secretKey);
    startTransition(async () => {
      try {
        const result = await deleteAsset(fd);
        if (result && !result.ok) setErr(result.error || 'Delete failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Delete failed.');
      }
    });
  }

  return (
    <div className="mt-10 pt-6 border-t border-red-200">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-sm font-semibold text-red-900 mb-1">Danger zone</div>
        <p className="text-xs text-red-800 mb-3">
          Deleting removes this asset permanently. Service history is deleted with it. Any linked
          defects or work orders are preserved but lose their link to this asset. Retiring (via the
          Active checkbox above) is safer if you just want to hide the asset from default lists.
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-600 text-red-800 text-sm font-semibold px-3 py-1.5 hover:bg-red-600 hover:text-white"
          >
            Delete asset
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-900 font-medium">
              Really delete <span className="font-bold">{assetName}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md bg-red-700 text-white text-sm font-semibold px-3 py-1.5 hover:bg-red-800 disabled:opacity-50"
              >
                {isPending ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="rounded-md border border-gray-300 text-gray-700 text-sm px-3 py-1.5 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            {err && <div className="text-xs text-red-900 mt-2">{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Input({ label, value, setValue, type = 'text' }: {
  label: string;
  value: string;
  setValue: (s: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input type={type} value={value} onChange={e => setValue(e.target.value)}
             className="w-full rounded border bg-white p-2 text-sm" />
    </div>
  );
}

'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { logServiceEvent } from '../actions';
import VendorPicker, { type ProviderOption } from '@/components/vendor-picker';

type AssetInfo = {
  id: string;
  name: string;
  asset_type: string;
  current_condition: string | null;
  last_serviced_at: string | null;
  service_interval_months: number | null;
  property_short_code: string;
};

type Preview = { id: string; file: File; dataUrl: string; compressedSize: number };

const MAX_PHOTOS = 5;
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

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonthsToIso(iso: string, months: number): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EVENT_TYPES: Array<{ value: string; label: string; description: string }> = [
  { value: 'service',     label: 'Service',     description: 'Routine PM or repair to keep the asset running.' },
  { value: 'upgrade',     label: 'Upgrade',     description: 'Capability or spec improvement (e.g. capacity increase, control upgrade).' },
  { value: 'replacement', label: 'Replacement', description: 'Full swap — old unit removed, new unit installed in same role.' },
  { value: 'inspection',  label: 'Inspection',  description: 'Periodic checking or condition audit without service work.' },
  { value: 'incident',    label: 'Incident',    description: 'Damage or failure event and post-incident repair.' },
];

export default function ServiceLogForm({
  asset,
  providers,
  secretKey,
}: {
  asset: AssetInfo;
  providers: ProviderOption[];
  secretKey: string;
}) {
  const [eventType, setEventType] = useState('service');
  const [servicedAt, setServicedAt] = useState(todayIso());
  const [providerId, setProviderId] = useState('');
  const [servicedBy, setServicedBy] = useState('');
  const [conditionAfter, setConditionAfter] = useState(asset.current_condition || 'good');
  const [notes, setNotes] = useState('');
  const [nextDue, setNextDue] = useState(
    asset.service_interval_months ? addMonthsToIso(todayIso(), asset.service_interval_months) : '',
  );
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recompute next due whenever serviced date or interval-derived defaults change
  useEffect(() => {
    if (asset.service_interval_months && servicedAt) {
      setNextDue(addMonthsToIso(servicedAt, asset.service_interval_months));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicedAt, asset.service_interval_months]);

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
    if (previews.length < 1) {
      setErr('At least one photo is required.');
      return;
    }
    const fd = new FormData();
    fd.set('asset_id', asset.id);
    fd.set('event_type', eventType);
    fd.set('serviced_at', servicedAt);
    fd.set('provider_id', providerId);
    fd.set('serviced_by', servicedBy.trim());
    fd.set('condition_after', conditionAfter);
    fd.set('notes', notes.trim());
    fd.set('next_service_due_at', nextDue);
    fd.set('key', secretKey);
    for (const p of previews) fd.append('photos', p.file);

    startTransition(async () => {
      try {
        const result = await logServiceEvent(fd);
        if (result && !result.ok) setErr(result.error || 'Save failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Save failed.');
      }
    });
  }

  const submitting = busy || isPending;

  const activeEventType = EVENT_TYPES.find(t => t.value === eventType) || EVENT_TYPES[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-lg border bg-white p-4">
        <div className="text-xs text-muted mb-1">{asset.asset_type} · {asset.property_short_code}</div>
        <div className="font-semibold text-navy">{asset.name}</div>
        <div className="text-xs text-muted mt-1">
          Current condition: <span className="uppercase">{asset.current_condition || '—'}</span>
          {asset.last_serviced_at && <> · Last serviced {asset.last_serviced_at.slice(0, 10)}</>}
        </div>
      </div>

      {/* Event type selector — pick service / upgrade / replacement / inspection / incident */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Event type <span className="text-red-600">*</span>
        </label>
        <select
          value={eventType}
          onChange={e => setEventType(e.target.value)}
          className="w-full rounded-md border bg-white p-3 text-sm"
        >
          {EVENT_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted mt-1">{activeEventType.description}</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          {eventType === 'inspection' ? 'Inspection date' : eventType === 'incident' ? 'Incident date' : 'Event date'} <span className="text-red-600">*</span>
        </label>
        <input type="date" value={servicedAt} onChange={e => setServicedAt(e.target.value)} required
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <VendorPicker
        providers={providers}
        value={providerId}
        onChange={setProviderId}
        label="Vendor that serviced this asset"
      />

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Technician name <span className="text-xs font-normal text-muted">(optional)</span>
        </label>
        <input type="text" value={servicedBy} onChange={e => setServicedBy(e.target.value)}
               placeholder="e.g. Filipe (the person on site)"
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Condition after service <span className="text-red-600">*</span></label>
        <select value={conditionAfter} onChange={e => setConditionAfter(e.target.value)} required
                className="w-full rounded-md border bg-white p-3 text-sm">
          {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Next service due
          {asset.service_interval_months && (
            <span className="text-xs font-normal text-muted ml-2">
              (auto-calculated from {asset.service_interval_months}-month interval)
            </span>
          )}
        </label>
        <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)}
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Photos <span className="text-red-600">*</span>
          <span className="text-xs font-normal text-muted ml-2">{previews.length}/{MAX_PHOTOS}</span>
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
        {previews.length < MAX_PHOTOS && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles}
                   className="hidden" disabled={busy} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
                    className="w-full rounded-md border-2 border-dashed border-navy/40 bg-white py-4 text-navy font-medium hover:bg-navy/5 disabled:opacity-50">
              {busy ? 'Processing…' : (previews.length === 0 ? '+ Add photo (work performed, replaced parts, service report)' : '+ Add another photo')}
            </button>
          </>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Notes <span className="text-xs font-normal text-muted">(optional)</span>
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="What was done. Parts replaced. Faults noted. Next scope."
                  className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <button type="submit" disabled={submitting}
              className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50">
        {submitting ? 'Saving…' : `Log ${activeEventType.label.toLowerCase()} event`}
      </button>
    </form>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { promoteDraft, rejectDraft } from './actions';

type PropertyOption = { short_code: string; name: string };

const SEVERITIES = ['critical', 'major', 'moderate', 'minor'];
const FLOORS     = ['', 'External', 'G', 'L1', 'L2', 'L3', 'Roof'];
const AREAS = [
  '', 'Lobby/Reception', 'Lift Lobby', 'Corridor', 'Stairwell',
  'Toilets - Mens', 'Toilets - Ladies', 'Toilets - Disabled',
  'Meeting Room', 'Kitchenette', 'Office', 'Open Office Area',
  'Storage', 'Comms/IT Room', 'Plant/Services Room',
  'Security/Guard Point', 'Site / Perimeter', 'Other',
];
const CATEGORIES = [
  '', 'Doors/Locks/Access', 'Cleaning/Waste', 'Electrical/Lighting',
  'HVAC/Ventilation', 'Building Damage (walls/ceiling/floor)',
  'Plumbing/Drainage', 'Fire Services', 'Glazing/Windows',
  'Roofing/Stormwater', 'Pest/Hygiene', 'External/Site/Landscaping',
  'Signage/Wayfinding', 'Security/CCTV/Access Control',
  'Lifts/Conveyance', 'Furniture/Fittings', 'OHS/Compliance',
  'Communications/IT Infrastructure', 'Other',
];

type Props = {
  defect: {
    id: string;
    defect_number: string;
    title: string | null;
    description: string | null;
    severity: string | null;
    photo_count: number;
    source_email: {
      from: string | null;
      subject: string | null;
      received_at: string | null;
    } | null;
  };
  properties: PropertyOption[];
  initialProperty: string;      // best-guess short_code from ingestion
  secretKey: string;
};

export default function PromoteDraftForm({ defect, properties, initialProperty, secretKey }: Props) {
  const [title, setTitle] = useState(defect.title || '');
  const [description, setDescription] = useState(defect.description || '');
  const [severity, setSeverity] = useState(defect.severity || 'moderate');
  const [property, setProperty] = useState(initialProperty);
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');
  const [category, setCategory] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isRejecting, startRejectTransition] = useTransition();

  function submitPromote(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) {
      setErr('Title is required.');
      return;
    }
    const fd = new FormData();
    fd.set('defect_id', defect.id);
    fd.set('title', title.trim());
    fd.set('description', description.trim());
    fd.set('severity', severity);
    fd.set('property', property);
    fd.set('floor', floor);
    fd.set('area', area);
    fd.set('category', category);
    fd.set('key', secretKey);

    startTransition(async () => {
      try {
        const r = await promoteDraft(fd);
        if (!r.ok) setErr(r.error || 'Promote failed.');
      } catch (e: any) {
        setErr(`Failed: ${e?.message || 'Unknown error'}`);
      }
    });
  }

  function submitReject() {
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    const fd = new FormData();
    fd.set('defect_id', defect.id);
    fd.set('key', secretKey);
    startRejectTransition(async () => {
      try {
        const r = await rejectDraft(fd);
        if (!r.ok) setErr(r.error || 'Reject failed.');
      } catch (e: any) {
        setErr(`Failed: ${e?.message || 'Unknown error'}`);
      }
    });
  }

  return (
    <form onSubmit={submitPromote} className="space-y-4">
      {/* Source email context */}
      {defect.source_email && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <div className="font-semibold mb-0.5">Ingested from email</div>
          <div>From: {defect.source_email.from || '(unknown)'}</div>
          <div>Subject: {defect.source_email.subject || '(no subject)'}</div>
          <div>Received: {(defect.source_email.received_at || '').slice(0, 16).replace('T', ' ')}</div>
        </div>
      )}

      {defect.photo_count > 0 && (
        <div className="text-xs text-muted">
          {defect.photo_count} photo{defect.photo_count === 1 ? '' : 's'} already attached.
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Title <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          autoCapitalize="sentences"
          className="w-full rounded-md border bg-white p-3 text-base"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Property <span className="text-red-600">*</span>
        </label>
        <select
          value={property}
          onChange={e => setProperty(e.target.value)}
          required
          className="w-full rounded-md border bg-white p-3 text-base"
        >
          <option value="">— Select —</option>
          {properties.map(p => (
            <option key={p.short_code} value={p.short_code}>{p.short_code} — {p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Severity <span className="text-red-600">*</span>
        </label>
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          required
          className="w-full rounded-md border bg-white p-3 text-base"
        >
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Floor</label>
          <select value={floor} onChange={e => setFloor(e.target.value)} className="w-full rounded-md border bg-white p-2 text-sm">
            {FLOORS.map(f => <option key={f} value={f}>{f || '—'}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Area</label>
          <select value={area} onChange={e => setArea(e.target.value)} className="w-full rounded-md border bg-white p-2 text-sm">
            {AREAS.map(a => <option key={a} value={a}>{a || '—'}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-md border bg-white p-2 text-sm">
            {CATEGORIES.map(c => <option key={c} value={c}>{c || '—'}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={6}
          className="w-full rounded-md border bg-white p-3 text-base"
          placeholder="Clean up the email body here — vendors and your future self will read it"
        />
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || isRejecting}
          className="flex-1 rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50 text-base"
        >
          {isPending ? 'Promoting…' : 'Approve & Promote to Open'}
        </button>
      </div>

      <div className="pt-4 border-t">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">Danger zone</div>
        {!confirmReject ? (
          <button
            type="button"
            onClick={submitReject}
            className="w-full rounded-md border border-red-300 text-red-700 py-2 text-sm hover:bg-red-50"
          >
            Reject draft (delete)
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmReject(false)}
              className="flex-1 rounded-md border py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReject}
              disabled={isRejecting}
              className="flex-1 rounded-md bg-red-700 text-white py-2 text-sm disabled:opacity-50"
            >
              {isRejecting ? 'Rejecting…' : 'Yes, delete this draft'}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

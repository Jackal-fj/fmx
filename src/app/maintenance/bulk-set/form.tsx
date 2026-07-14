'use client';

import { useState, useTransition, useMemo } from 'react';
import { bulkSetInterval } from './actions';

type AssetRow = {
  id: string;
  name: string;
  asset_code: string | null;
  asset_type: string;
  service_interval_months: number | null;
  last_serviced_at: string | null;
  next_service_due_at: string | null;
  property_short_code: string;
  property_name: string;
};

const COMMON_INTERVALS = [
  { value: 1,  label: 'Monthly (1 mo)' },
  { value: 3,  label: 'Quarterly (3 mo)' },
  { value: 6,  label: 'Half-yearly (6 mo)' },
  { value: 12, label: 'Annual (12 mo)' },
  { value: 24, label: 'Two-yearly (24 mo)' },
  { value: 0,  label: 'Clear schedule (no PM)' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BulkSetForm({
  assets,
  secretKey,
}: {
  assets: AssetRow[];
  secretKey: string;
}) {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [interval, setInterval] = useState('6');
  const [anchor, setAnchor] = useState(todayIso());
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Derive filter options from the asset list
  const propertyOptions = useMemo(
    () => Array.from(new Set(assets.map(a => a.property_short_code))).sort(),
    [assets],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(assets.map(a => a.asset_type))).sort(),
    [assets],
  );

  const filtered = useMemo(
    () => assets.filter(a =>
      (!propertyFilter || a.property_short_code === propertyFilter) &&
      (!typeFilter || a.asset_type === typeFilter),
    ),
    [assets, propertyFilter, typeFilter],
  );

  function toggle(id: string) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(s => {
      const next = new Set(s);
      filtered.forEach(a => next.add(a.id));
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (selected.size === 0) {
      setErr('Select at least one asset.');
      return;
    }
    const fd = new FormData();
    fd.set('key', secretKey);
    fd.set('service_interval_months', interval);
    fd.set('anchor_date', anchor);
    selected.forEach(id => fd.append('asset_ids', id));

    startTransition(async () => {
      try {
        const result = await bulkSetInterval(fd);
        if (result && !result.ok) setErr(result.error || 'Update failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Update failed.');
      }
    });
  }

  const intervalNum = parseInt(interval, 10);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Interval selector */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-navy">1 · Choose the service interval</div>
        <div className="grid grid-cols-2 gap-2">
          {COMMON_INTERVALS.map(o => (
            <label key={o.value} className={`rounded border p-2 text-sm cursor-pointer text-center ${
              interval === String(o.value) ? 'border-navy bg-navy text-white' : 'bg-white'
            }`}>
              <input
                type="radio"
                name="interval"
                value={String(o.value)}
                checked={interval === String(o.value)}
                onChange={() => setInterval(String(o.value))}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Or custom (months)</label>
          <input
            type="number" min={0} max={120} step={1}
            value={interval}
            onChange={e => setInterval(e.target.value)}
            className="w-full rounded border bg-white p-2 text-sm"
          />
        </div>
        {intervalNum > 0 && (
          <div>
            <label className="block text-xs text-muted mb-1">
              Anchor date (next-due date will be calculated as anchor + {intervalNum} mo)
            </label>
            <input
              type="date"
              value={anchor}
              onChange={e => setAnchor(e.target.value)}
              className="w-full rounded border bg-white p-2 text-sm"
            />
            <p className="text-[11px] text-muted mt-1">
              Defaults to today. Use the date these assets were most recently serviced together, or the date
              from which the PM cycle should start.
            </p>
          </div>
        )}
      </div>

      {/* Filters + selection */}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-semibold text-navy mb-3">2 · Pick the assets</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-muted mb-1">Filter: Property</label>
            <select
              value={propertyFilter}
              onChange={e => setPropertyFilter(e.target.value)}
              className="w-full rounded border bg-white p-2 text-sm"
            >
              <option value="">All properties</option>
              {propertyOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Filter: Type</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full rounded border bg-white p-2 text-sm"
            >
              <option value="">All types</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs text-muted">
            Showing {filtered.length} · Selected {selected.size}
          </div>
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={selectAllFiltered} className="text-navy hover:underline">
              Select all filtered
            </button>
            <button type="button" onClick={clearAll} className="text-muted hover:text-navy">
              Clear
            </button>
          </div>
        </div>

        <div className="rounded border max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted text-center">No assets match these filters.</div>
          ) : filtered.map((a, i) => {
            const isSel = selected.has(a.id);
            return (
              <label
                key={a.id}
                className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 ${i > 0 ? 'border-t' : ''} ${isSel ? 'bg-blue-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggle(a.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-navy">
                    {a.name}
                    {a.asset_code && <span className="text-muted ml-2 text-xs font-mono">{a.asset_code}</span>}
                  </div>
                  <div className="text-[11px] text-muted">
                    {a.property_short_code} · {a.asset_type}
                    {a.service_interval_months
                      ? <span> · current: every {a.service_interval_months} mo</span>
                      : <span> · no schedule</span>}
                    {a.last_serviced_at && <span> · last {a.last_serviced_at.slice(0, 10)}</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <button
        type="submit"
        disabled={isPending || selected.size === 0}
        className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50"
      >
        {isPending
          ? 'Saving…'
          : intervalNum === 0
            ? `Clear PM schedule for ${selected.size} asset${selected.size === 1 ? '' : 's'}`
            : `Set ${intervalNum}-month interval on ${selected.size} asset${selected.size === 1 ? '' : 's'}`}
      </button>

      <p className="text-xs text-muted text-center">
        {intervalNum > 0
          ? `Next service due will be set to ${anchor} + ${intervalNum} months on every selected asset.`
          : `Clearing removes the interval and next-due date so they drop off the schedule.`}
      </p>
    </form>
  );
}

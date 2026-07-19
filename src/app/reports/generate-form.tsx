'use client';

import { useState, useTransition } from 'react';
import { generateReports } from './actions';

type PropertyOption = { short_code: string; name: string };

function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function GenerateForm({
  properties,
  secretKey,
}: {
  properties: PropertyOption[];
  secretKey: string;
}) {
  const [month, setMonth] = useState(currentMonthIso());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ALL_KEYS = [...properties.map(p => p.short_code), 'PORTFOLIO'];
  const isAllSelected = selected.size === ALL_KEYS.length;

  function toggle(scope: string) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(scope)) next.delete(scope); else next.add(scope);
      return next;
    });
  }

  function toggleAll() {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ALL_KEYS));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (selected.size === 0) {
      setErr('Pick at least one report to generate.');
      return;
    }
    const fd = new FormData();
    fd.set('month', month);
    fd.set('key', secretKey);
    selected.forEach(s => fd.append('scopes', s));

    startTransition(async () => {
      try {
        const result = await generateReports(fd);
        if (result && !result.ok) setErr(result.error || 'Generation failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Generation failed.');
      }
    });
  }

  const perReportSeconds = 5;
  const estSeconds = selected.size * perReportSeconds;

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4 mb-6 space-y-4">
      <div className="text-sm font-semibold text-navy">Generate report</div>

      <div>
        <label className="block text-xs text-muted mb-1">Report month</label>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded border bg-white p-2 text-sm"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="text-xs text-muted">Which reports?</label>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-navy hover:underline"
          >
            {isAllSelected ? 'Clear selection' : 'Select all'}
          </button>
        </div>
        <div className="space-y-1">
          {properties.map(p => {
            const on = selected.has(p.short_code);
            return (
              <label
                key={p.short_code}
                className={`flex items-center gap-3 rounded border p-2 text-sm cursor-pointer hover:bg-gray-50 ${on ? 'border-navy bg-blue-50' : 'border-gray-200'}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(p.short_code)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-medium text-navy">{p.name} <span className="text-muted font-normal">({p.short_code})</span></div>
                  <div className="text-[11px] text-muted">Per-property FM report</div>
                </div>
              </label>
            );
          })}
          <label
            className={`flex items-center gap-3 rounded border p-2 text-sm cursor-pointer hover:bg-gray-50 ${selected.has('PORTFOLIO') ? 'border-navy bg-blue-50' : 'border-gray-200'}`}
          >
            <input
              type="checkbox"
              checked={selected.has('PORTFOLIO')}
              onChange={() => toggle('PORTFOLIO')}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-medium text-navy">Portfolio roll-up</div>
              <div className="text-[11px] text-muted">Executive summary + cross-property comparison</div>
            </div>
          </label>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <button
        type="submit"
        disabled={isPending || selected.size === 0}
        className="w-full rounded-md bg-navy text-white text-sm font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending
          ? `Generating ${selected.size} report${selected.size === 1 ? '' : 's'}…`
          : selected.size === 0
            ? 'Pick reports to generate'
            : `Generate ${selected.size} report${selected.size === 1 ? '' : 's'} (~${estSeconds}s)`}
      </button>

      <p className="text-xs text-muted">
        Uses live data as of right now. Generating one at a time is safe on any Vercel tier;
        generating all four together is ~20s.
      </p>
    </form>
  );
}

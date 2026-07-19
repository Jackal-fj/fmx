'use client';

import { useState, useTransition } from 'react';
import { generateAllReports } from './actions';

function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function GenerateForm({ secretKey }: { secretKey: string }) {
  const [month, setMonth] = useState(currentMonthIso());
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData();
    fd.set('month', month);
    fd.set('key', secretKey);

    startTransition(async () => {
      try {
        const result = await generateAllReports(fd);
        if (result && !result.ok) setErr(result.error || 'Generation failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Generation failed.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4 mb-6">
      <div className="text-sm font-semibold text-navy mb-3">Generate new reports</div>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-muted mb-1">Report month</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded border bg-white p-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-navy text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          {isPending ? 'Generating (30–60s)…' : 'Generate 4 reports'}
        </button>
      </div>
      <p className="text-xs text-muted mt-2">
        Produces one Word document per KGF property (Gunu, Korobasaga, Naibati) plus a portfolio roll-up.
        Uses live data as of right now — including any backdated defects.
      </p>
      {err && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}
    </form>
  );
}

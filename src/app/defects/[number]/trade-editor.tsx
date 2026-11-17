'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { setDefectTrade } from './actions';

export default function TradeEditor({
  defectNumber,
  initial,
  secretKey,
  suggestions,
}: {
  defectNumber: string;
  initial: string | null;
  secretKey: string;
  suggestions: string[];
}) {
  const [value, setValue] = useState(initial || '');
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function save() {
    setErr(null);
    startTransition(async () => {
      const r = await setDefectTrade(defectNumber, value, secretKey);
      if (!r.ok) setErr(r.error || 'Save failed');
      else setEditing(false);
    });
  }

  if (!editing) {
    const label = value || 'Set trade';
    const tone = value
      ? 'bg-white text-navy border-gray-300 hover:border-navy'
      : 'bg-amber-50 text-amber-800 border-amber-300 hover:border-amber-500';
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-xs px-2 py-1 rounded-full border transition ${tone}`}
        aria-label="Set trade"
      >
        {value ? `${label}` : '+ Set trade'}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        list="trade-suggestions-defect"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { setValue(initial || ''); setEditing(false); setErr(null); }
        }}
        placeholder="e.g. Electrical"
        maxLength={60}
        className="text-xs border border-navy rounded-full px-2 py-1 bg-white focus:outline-none w-36"
      />
      <datalist id="trade-suggestions-defect">
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="text-xs rounded-full bg-navy text-white px-2 py-1 hover:bg-blue-900 disabled:opacity-50"
      >
        {isPending ? '…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => { setValue(initial || ''); setEditing(false); setErr(null); }}
        className="text-xs rounded-full border border-gray-300 text-muted px-2 py-1 hover:text-navy"
      >
        Cancel
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}

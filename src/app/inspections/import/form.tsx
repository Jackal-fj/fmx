'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createTemplateWithItems } from '../actions';

// FMX-065: parse pasted plain-text into checklist items. Handles the
// shapes an FM's existing Word/Excel checklists come in:
//   - bullet-prefixed:   •  / -  /  *  / —
//   - numbered:          1.  / 1)  /  (1)  / 1:
//   - CSV-ish columns:   "Check item,Yes/No" — first column wins
//   - trailing severity hints like "— major" are kept in the question
function parseItems(raw: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const lines = raw.replace(/\r/g, '').split('\n');
  for (const line of lines) {
    let s = line.trim();
    if (!s) continue;
    // Strip common bullet prefixes.
    s = s.replace(/^[\s]*[•·●○◦▪▫*\-–—]+\s*/u, '');
    // Strip leading numbering: "1.", "1)", "(1)", "1:", "1 "
    s = s.replace(/^\(?\s*\d+\s*[\.\):]\s*/, '');
    s = s.replace(/^\d+\s+/, '');
    // Take first CSV cell only — Carl pastes Excel with "question,status" sometimes.
    if (s.includes(',')) {
      const cells = s.split(',').map(c => c.trim()).filter(Boolean);
      if (cells.length > 1) s = cells[0];
    }
    s = s.trim();
    if (s) out.push(s);
  }
  return out;
}

type Scope = 'property' | 'asset' | 'any';

export default function ImportForm({ secretKey }: { secretKey: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<Scope>('property');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = useMemo(() => parseItems(text), [text]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (parsed.length === 0) { setErr('No items parsed from the pasted text.'); return; }

    startTransition(async () => {
      const r = await createTemplateWithItems({
        name: name.trim(),
        description: description.trim() || null,
        scope,
        items: parsed.map(q => ({ question: q, kind: 'yes_no', required: false, photo_required: false })),
        key: secretKey,
      });
      if (!r.ok) { setErr(r.error || 'Import failed'); return; }
      if (r.id) router.push(`/inspections/${r.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Template name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          maxLength={200}
          placeholder="e.g. Monthly fire alarm walk"
          className="w-full rounded border border-gray-300 p-3 text-base bg-white"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Scope</label>
          <select value={scope} onChange={e => setScope(e.target.value as Scope)} className="w-full rounded border border-gray-300 p-3 text-base bg-white">
            <option value="property">Property</option>
            <option value="asset">Asset</option>
            <option value="any">Any</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Optional one-liner"
            className="w-full rounded border border-gray-300 p-3 text-base bg-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">
          Paste checklist (one item per line) *
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          required
          placeholder={'1. Fire alarm panel showing green\n2. Hose reels unobstructed\n3. All exit signs lit\n...'}
          className="w-full rounded border border-gray-300 p-3 text-sm bg-white font-mono"
        />
        <div className="text-[11px] text-muted mt-1">
          Bullet symbols (• - *), numbering (1. / 1)), and trailing CSV cells are stripped automatically.
        </div>
      </div>

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="rounded-lg border bg-white">
          <div className="px-4 py-2 border-b bg-gray-50 flex items-baseline justify-between">
            <span className="text-xs font-bold text-navy uppercase tracking-wide">Preview</span>
            <span className="text-[11px] text-muted">{parsed.length} item{parsed.length === 1 ? '' : 's'}</span>
          </div>
          <ol className="divide-y">
            {parsed.map((q, i) => (
              <li key={i} className="px-4 py-2 flex items-baseline gap-2">
                <span className="text-[11px] font-mono text-muted w-6 shrink-0">{i + 1}</span>
                <span className="text-sm text-navy flex-1">{q}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {err && <div className="text-sm text-red-800">{err}</div>}

      <button
        type="submit"
        disabled={isPending || parsed.length === 0 || !name.trim()}
        className="w-full rounded-md bg-navy text-white text-base font-semibold py-3 disabled:opacity-50 min-h-[44px]"
      >
        {isPending ? 'Creating…' : `Create template with ${parsed.length || 0} item${parsed.length === 1 ? '' : 's'}`}
      </button>
    </form>
  );
}

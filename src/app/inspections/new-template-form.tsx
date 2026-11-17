'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTemplate } from './actions';

export default function NewTemplateForm({ secretKey }: { secretKey: string }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'property' | 'asset' | 'any'>('property');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData();
    fd.set('key', secretKey);
    fd.set('name', name.trim());
    fd.set('description', description.trim());
    fd.set('scope', scope);
    startTransition(async () => {
      const r = await createTemplate(fd);
      if (!r.ok) { setErr(r.error || 'Save failed'); return; }
      if (r.id) router.push(`/inspections/${r.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          maxLength={200}
          placeholder="e.g. Monthly fire alarm walk"
          className="w-full rounded border border-gray-300 p-2 text-sm bg-white"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Scope</label>
          <select value={scope} onChange={e => setScope(e.target.value as any)} className="w-full rounded border border-gray-300 p-2 text-sm bg-white">
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
            className="w-full rounded border border-gray-300 p-2 text-sm bg-white"
          />
        </div>
      </div>
      {err && <div className="text-xs text-red-800">{err}</div>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-2 disabled:opacity-50 min-h-[44px]"
      >
        {isPending ? 'Creating…' : 'Create template'}
      </button>
    </form>
  );
}

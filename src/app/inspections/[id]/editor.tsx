'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  updateTemplate, cloneTemplate, addItem, updateItem, deleteItem, reorderItem,
} from '../actions';

type Template = {
  id: string;
  name: string;
  description: string | null;
  scope: 'property' | 'asset' | 'any';
  active: boolean;
};

type Item = {
  id: string;
  template_id: string;
  sort_order: number;
  question: string;
  kind: 'yes_no' | 'rating' | 'number' | 'text';
  required: boolean;
  photo_required: boolean;
  trade: string | null;
  fail_if: any;
  notes: string | null;
};

const KIND_LABEL: Record<Item['kind'], string> = {
  yes_no: 'Yes / No',
  rating: 'Rating 1-5',
  number: 'Number',
  text: 'Text',
};

// Human description of the fail condition, for the item row.
function failSummary(item: Item): string {
  const f = item.fail_if;
  if (!f) return 'No fail condition';
  if (item.kind === 'yes_no' && f.no === true) return 'Fail on No';
  if (item.kind === 'yes_no' && f.yes === true) return 'Fail on Yes';
  if (item.kind === 'rating' && typeof f.lt === 'number') return `Fail if rating < ${f.lt}`;
  if (item.kind === 'number' && typeof f.lt === 'number') return `Fail if < ${f.lt}`;
  if (item.kind === 'number' && typeof f.gt === 'number') return `Fail if > ${f.gt}`;
  return 'Custom fail';
}

// Default fail condition when switching answer kinds.
function defaultFail(kind: Item['kind']): any {
  if (kind === 'yes_no') return { no: true };
  if (kind === 'rating') return { lt: 3 };
  if (kind === 'number') return { lt: 0 };
  return null;
}

export default function TemplateEditor({
  template,
  initialItems,
  secretKey,
}: {
  template: Template;
  initialItems: Item[];
  secretKey: string;
}) {
  const router = useRouter();
  const [editingHeader, setEditingHeader] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || '');
  const [scope, setScope] = useState<Template['scope']>(template.scope);
  const [active, setActive] = useState(template.active);
  const [hdrErr, setHdrErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [items, setItems] = useState<Item[]>(initialItems);
  const [newQuestion, setNewQuestion] = useState('');
  const [itemErr, setItemErr] = useState<string | null>(null);

  function saveHeader() {
    setHdrErr(null);
    startTransition(async () => {
      const r = await updateTemplate(template.id, {
        name: name.trim(),
        description: description.trim() || null,
        scope,
        active,
      }, secretKey);
      if (!r.ok) { setHdrErr(r.error || 'Save failed'); return; }
      setEditingHeader(false);
      router.refresh();
    });
  }

  function cancelHeader() {
    setName(template.name);
    setDescription(template.description || '');
    setScope(template.scope);
    setActive(template.active);
    setEditingHeader(false);
  }

  function addNewItem() {
    setItemErr(null);
    const q = newQuestion.trim();
    if (!q) { setItemErr('Question is required.'); return; }
    startTransition(async () => {
      const r = await addItem(template.id, q, secretKey);
      if (!r.ok) { setItemErr(r.error || 'Add failed'); return; }
      setNewQuestion('');
      router.refresh();
    });
  }

  function patchItem(it: Item, patch: Partial<Item>) {
    // Local optimistic apply so the UI feels instant.
    setItems(prev => prev.map(p => p.id === it.id ? { ...p, ...patch } : p));
    startTransition(async () => {
      const r = await updateItem(it.id, template.id, patch, secretKey);
      if (!r.ok) { setItemErr(r.error || 'Update failed'); return; }
    });
  }

  function onChangeKind(it: Item, kind: Item['kind']) {
    patchItem(it, { kind, fail_if: defaultFail(kind) });
  }

  function removeItem(it: Item) {
    if (!confirm(`Delete "${it.question}"?`)) return;
    startTransition(async () => {
      const r = await deleteItem(it.id, template.id, secretKey);
      if (!r.ok) { setItemErr(r.error || 'Delete failed'); return; }
      setItems(prev => prev.filter(p => p.id !== it.id));
    });
  }

  function move(it: Item, dir: 'up' | 'down') {
    startTransition(async () => {
      const r = await reorderItem(it.id, template.id, dir, secretKey);
      if (!r.ok) { setItemErr(r.error || 'Reorder failed'); return; }
      router.refresh();
    });
  }

  function clone() {
    startTransition(async () => {
      const r = await cloneTemplate(template.id, secretKey);
      if (!r.ok) { setItemErr(r.error || 'Clone failed'); return; }
      if (r.id) router.push(`/inspections/${r.id}`);
    });
  }

  return (
    <div>
      <div className="mb-2 text-sm">
        <Link href="/inspections" className="text-muted hover:text-navy">← Templates</Link>
      </div>

      {/* Header — view / edit toggle */}
      <section className="rounded-lg border bg-white p-4 mb-6">
        {!editingHeader ? (
          <>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-navy">{template.name}</h1>
                  <span className="text-[11px] uppercase tracking-wide text-muted border border-gray-300 rounded px-1.5 py-0.5">{template.scope}</span>
                  {!template.active && <span className="text-[11px] uppercase tracking-wide text-amber-800 border border-amber-300 rounded px-1.5 py-0.5">Archived</span>}
                </div>
                {template.description && <p className="text-sm text-muted mt-1">{template.description}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clone}
                  disabled={isPending}
                  className="rounded-md border border-gray-300 text-navy text-sm font-semibold px-3 py-2 hover:bg-gray-50 min-h-[44px]"
                >Clone</button>
                <button
                  type="button"
                  onClick={() => setEditingHeader(true)}
                  className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-2 hover:bg-blue-900 min-h-[44px]"
                >Edit</button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm bg-white" />
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
              <label className="flex items-center gap-2 pt-6">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-5 h-5" />
                <span className="text-sm text-navy">Active</span>
              </label>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm bg-white" />
            </div>
            {hdrErr && <div className="text-xs text-red-800">{hdrErr}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={saveHeader} disabled={isPending} className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-2 disabled:opacity-50 min-h-[44px]">Save</button>
              <button type="button" onClick={cancelHeader} className="rounded-md border border-gray-300 text-navy text-sm font-semibold px-3 py-2 min-h-[44px]">Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* Items */}
      <section className="rounded-lg border bg-white">
        <div className="px-4 py-3 border-b flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Items ({items.length})</h2>
          <span className="text-[11px] text-muted">5–8 items is the sweet spot</span>
        </div>

        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted text-center">No items yet. Add the first below.</div>
        ) : (
          <ul className="divide-y">
            {items.map((it, i) => (
              <li key={it.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 flex flex-col gap-1">
                    <button type="button" onClick={() => move(it, 'up')} disabled={i === 0 || isPending} className="text-muted hover:text-navy disabled:opacity-30 text-xs leading-none px-1" aria-label="Move up">▲</button>
                    <span className="text-[10px] text-muted text-center font-mono">{i + 1}</span>
                    <button type="button" onClick={() => move(it, 'down')} disabled={i === items.length - 1 || isPending} className="text-muted hover:text-navy disabled:opacity-30 text-xs leading-none px-1" aria-label="Move down">▼</button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      type="text"
                      value={it.question}
                      onChange={e => setItems(prev => prev.map(p => p.id === it.id ? { ...p, question: e.target.value } : p))}
                      onBlur={e => patchItem(it, { question: e.target.value })}
                      className="w-full rounded border border-gray-300 p-2 text-sm bg-white font-medium text-navy"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <select value={it.kind} onChange={e => onChangeKind(it, e.target.value as Item['kind'])} className="rounded border border-gray-300 p-1.5 text-xs bg-white">
                        {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-navy">
                        <input type="checkbox" checked={it.required} onChange={e => patchItem(it, { required: e.target.checked })} className="w-4 h-4" />
                        Required
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-navy">
                        <input type="checkbox" checked={it.photo_required} onChange={e => patchItem(it, { photo_required: e.target.checked })} className="w-4 h-4" />
                        Photo
                      </label>
                      <input
                        type="text"
                        value={it.trade || ''}
                        onChange={e => setItems(prev => prev.map(p => p.id === it.id ? { ...p, trade: e.target.value } : p))}
                        onBlur={e => patchItem(it, { trade: e.target.value.trim() || null })}
                        placeholder="Trade (optional)"
                        className="rounded border border-gray-300 p-1.5 text-xs bg-white"
                      />
                    </div>
                    <div className="text-[11px] text-muted">
                      {failSummary(it)}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeItem(it)} disabled={isPending} className="shrink-0 text-muted hover:text-red-700 text-sm" aria-label="Delete">✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newQuestion}
              onChange={e => setNewQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewItem(); } }}
              placeholder="New item question…"
              maxLength={300}
              className="flex-1 rounded border border-gray-300 p-2 text-sm bg-white"
            />
            <button type="button" onClick={addNewItem} disabled={isPending} className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-2 disabled:opacity-50 min-h-[44px]">+ Add</button>
          </div>
          {itemErr && <div className="text-xs text-red-800 mt-2">{itemErr}</div>}
        </div>
      </section>
    </div>
  );
}

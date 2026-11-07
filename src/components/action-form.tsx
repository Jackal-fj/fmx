'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Generic mobile-first form bound to a server action returning
// { ok, error?, redirectTo? }. Uncontrolled inputs; FormData goes straight
// to the action. Never leaves the button stuck: every path clears pending.

export type FieldOption = { value: string; label: string };

export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
  options?: FieldOption[];
  defaultValue?: string | number | boolean | null;
  required?: boolean;
  placeholder?: string;
  help?: string;
  wide?: boolean;          // span both columns on wider screens
  step?: string;           // number inputs
  blank?: string;          // label for the empty option in a select
};

type Result = { ok: boolean; error?: string; redirectTo?: string };

export default function ActionForm({
  action,
  fields,
  hidden = {},
  submitLabel = 'Save',
  resetOnSuccess = false,
  successText = 'Saved',
}: {
  action: (fd: FormData) => Promise<Result>;
  fields: Field[];
  hidden?: Record<string, string | null | undefined>;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  successText?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setDone(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const res = await action(fd);
        if (!res?.ok) { setErr(res?.error || 'Save failed.'); return; }
        if (res.redirectTo) { router.push(res.redirectTo); router.refresh(); return; }
        if (resetOnSuccess) formRef.current?.reset();
        setDone(true);
        router.refresh();
      } catch (e: any) {
        console.error('ActionForm submit threw:', e);
        setErr(`Save failed: ${e?.message || 'Unknown error. Please try again.'}`);
      }
    });
  }

  const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy bg-white';

  return (
    <form ref={formRef} onSubmit={onSubmit} onChange={() => done && setDone(false)} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => v != null && (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(f => {
          const id = `${f.name}-${Math.abs(hash(JSON.stringify(hidden) + f.name))}`;
          const dv = f.defaultValue == null ? '' : String(f.defaultValue);
          if (f.type === 'checkbox') {
            return (
              <label key={f.name} htmlFor={id} className={`flex items-center gap-2 py-2 ${f.wide ? 'sm:col-span-2' : ''}`}>
                <input id={id} type="checkbox" name={f.name} defaultChecked={!!f.defaultValue} className="h-5 w-5 accent-navy" />
                <span className="text-sm">{f.label}</span>
              </label>
            );
          }
          return (
            <div key={f.name} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <label htmlFor={id} className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                {f.label}{f.required && <span className="text-bad"> *</span>}
              </label>
              {f.type === 'select' ? (
                <select id={id} name={f.name} defaultValue={dv} required={f.required} className={inputCls}>
                  {(!f.required || !dv) && <option value="">{f.blank || '—'}</option>}
                  {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea id={id} name={f.name} defaultValue={dv} required={f.required} placeholder={f.placeholder} rows={3} className={inputCls} />
              ) : (
                <input
                  id={id}
                  name={f.name}
                  type={f.type === 'number' ? 'text' : (f.type || 'text')}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  defaultValue={dv}
                  required={f.required}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  className={inputCls}
                />
              )}
              {f.help && <p className="text-xs text-muted mt-1">{f.help}</p>}
            </div>
          );
        })}
      </div>

      {err && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-navy text-white text-base font-semibold px-4 py-2 hover:bg-blue-900 disabled:opacity-60"
        >
          {isPending ? 'Saving…' : submitLabel}
        </button>
        {done && <span className="text-sm text-good">✓ {successText}</span>}
      </div>
    </form>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

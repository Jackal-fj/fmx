'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  setPropertyDefaultTemplate, setAssetDefaultTemplate,
} from '@/app/inspections/assignment-actions';

type Template = { id: string; name: string };

// FMX-063 + FMX-064: picker + Start-inspection button as one unit.
// - When a default template is set, a primary "Start inspection" button
//   appears so a QR scan → property/asset page is one more tap to the
//   checklist runner.
// - A muted "Change" link flips into the picker for maintenance.
// - When unset, the picker is visible so Carl can wire it up in place.
export default function DefaultTemplatePicker({
  target,            // 'property' | 'asset'
  targetId,          // short_code for property, uuid for asset
  current,           // currently assigned template id, or null
  templates,
  secretKey,
  startHrefPrefix,   // e.g. '/inspect/new?template='
  startExtraQs,      // e.g. '&property=NH' — additional prefill
}: {
  target: 'property' | 'asset';
  targetId: string;
  current: string | null;
  templates: Template[];
  secretKey: string;
  startHrefPrefix: string;
  startExtraQs: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current || '');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentTemplate = templates.find(t => t.id === current);

  function save(v: string) {
    setErr(null);
    startTransition(async () => {
      const r = target === 'property'
        ? await setPropertyDefaultTemplate(targetId, v || null, secretKey)
        : await setAssetDefaultTemplate(targetId, v || null, secretKey);
      if (!r.ok) { setErr(r.error || 'Save failed'); return; }
      setEditing(false);
      router.refresh();
    });
  }

  const startHref = current
    ? `${startHrefPrefix}${encodeURIComponent(current)}${startExtraQs}&key=${encodeURIComponent(secretKey)}`
    : null;

  // Compact header: when set, show Start + the template name + Change.
  // When unset or editing, show the select.
  if (editing || !current) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Default inspection template</div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={isPending}
            className="flex-1 rounded border border-gray-300 p-2 text-sm bg-white min-w-0"
          >
            <option value="">— None —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            type="button"
            onClick={() => save(value)}
            disabled={isPending}
            className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-2 disabled:opacity-50 min-h-[44px]"
          >{isPending ? 'Saving…' : 'Save'}</button>
          {current && (
            <button
              type="button"
              onClick={() => { setValue(current); setEditing(false); setErr(null); }}
              className="rounded-md border border-gray-300 text-navy text-sm font-semibold px-3 py-2 min-h-[44px]"
            >Cancel</button>
          )}
        </div>
        {err && <div className="text-xs text-red-800 mt-2">{err}</div>}
        <div className="text-[11px] text-muted mt-2">
          Pick a template and a Start button appears here. No template? <Link href="/inspections" className="text-navy underline">Create one</Link>.
        </div>
      </div>
    );
  }

  // Set + not editing → Start button + Change link.
  return (
    <div className="rounded-lg border bg-white p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted">Default inspection</div>
        <div className="text-sm font-medium text-navy truncate">{currentTemplate?.name || '—'}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {startHref && (
          <Link
            href={startHref}
            className="rounded-md bg-green-700 text-white text-sm font-semibold px-4 py-2 hover:bg-green-800 min-h-[44px]"
          >
            Start inspection →
          </Link>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted hover:text-navy"
        >Change</button>
      </div>
    </div>
  );
}

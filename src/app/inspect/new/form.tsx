'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startSession } from '@/lib/field-capture/actions';

type Template = { id: string; name: string; scope: 'property' | 'asset' | 'any' };
type Property = { short_code: string; name: string };
type Asset = { id: string; asset_code: string | null; name: string; property?: { short_code: string } | null };

export default function NewSessionForm({
  templates, properties, assets, initial, secretKey,
}: {
  templates: Template[];
  properties: Property[];
  assets: Asset[];
  initial: { templateId: string; propertyCode: string; assetId: string };
  secretKey: string;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(initial.templateId);
  const [propertyCode, setPropertyCode] = useState(initial.propertyCode);
  const [assetId, setAssetId] = useState(initial.assetId);
  const [inspector, setInspector] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const template = templates.find(t => t.id === templateId);
  const scope = template?.scope ?? 'any';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!templateId) { setErr('Pick a template.'); return; }

    const propertyId = propertyCode
      ? properties.find(p => p.short_code === propertyCode)
      : null;

    const session = {
      id: crypto.randomUUID(),
      template_id: templateId,
      property_id: null as string | null,   // DB uses uuid; look it up via short_code server-side? We only have short_code here.
      asset_id: assetId || null,
      inspector_name: inspector.trim() || null,
      started_at: new Date().toISOString(),
      source: 'web' as const,
    };

    // Resolve property short_code → uuid on the server by rolling the lookup
    // into the session row via a tiny intermediate call. Cheaper: pass the
    // short_code through a helper that fetches the uuid. Done inline:
    startTransition(async () => {
      let resolvedPropertyId: string | null = null;
      if (propertyCode) {
        const res = await fetch(`/api/property-id?code=${encodeURIComponent(propertyCode)}`);
        if (res.ok) {
          const body = await res.json();
          resolvedPropertyId = body?.id || null;
        }
      }
      const r = await startSession({ ...session, property_id: resolvedPropertyId }, secretKey);
      if (!r.ok) { setErr(r.error || 'Could not start session.'); return; }
      router.push(`/inspect/${session.id}?key=${encodeURIComponent(secretKey)}`);
    });
  }

  const relevantAssets = assets.filter(a =>
    !propertyCode || a.property?.short_code === propertyCode
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Template *</label>
        <select
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          required
          className="w-full rounded border border-gray-300 p-3 text-base bg-white"
        >
          <option value="">— Pick a template —</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} {t.scope !== 'any' ? `· ${t.scope}` : ''}
            </option>
          ))}
        </select>
      </div>

      {(scope === 'property' || scope === 'any') && (
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">
            Property{scope === 'property' ? ' *' : ''}
          </label>
          <select
            value={propertyCode}
            onChange={e => { setPropertyCode(e.target.value); setAssetId(''); }}
            required={scope === 'property'}
            className="w-full rounded border border-gray-300 p-3 text-base bg-white"
          >
            <option value="">— None —</option>
            {properties.map(p => (
              <option key={p.short_code} value={p.short_code}>{p.short_code} — {p.name}</option>
            ))}
          </select>
        </div>
      )}

      {(scope === 'asset' || scope === 'any') && (
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">
            Asset{scope === 'asset' ? ' *' : ''}
          </label>
          <select
            value={assetId}
            onChange={e => setAssetId(e.target.value)}
            required={scope === 'asset'}
            className="w-full rounded border border-gray-300 p-3 text-base bg-white"
          >
            <option value="">— None —</option>
            {relevantAssets.map(a => (
              <option key={a.id} value={a.id}>
                {(a.asset_code ? `${a.asset_code} — ` : '') + a.name}{a.property?.short_code ? ` (${a.property.short_code})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">Inspector name</label>
        <input
          type="text"
          value={inspector}
          onChange={e => setInspector(e.target.value)}
          maxLength={120}
          placeholder="Who's running this (optional)"
          className="w-full rounded border border-gray-300 p-3 text-base bg-white"
        />
      </div>

      {err && <div className="text-xs text-red-800">{err}</div>}

      <button
        type="submit"
        disabled={isPending || !templateId}
        className="w-full rounded-md bg-navy text-white text-base font-semibold py-3 disabled:opacity-50 min-h-[44px]"
      >
        {isPending ? 'Starting…' : 'Start inspection →'}
      </button>
    </form>
  );
}

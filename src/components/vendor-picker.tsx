'use client';

import { useState } from 'react';
import { createProvider } from '@/app/vendors/actions';

export type ProviderOption = {
  id: string;
  name: string;
  trade: string;
  whatsapp_number: string | null;
};

const TRADE_SUGGESTIONS = [
  'Air Conditioning', 'Electrical', 'Plumbing', 'Fire Services',
  'Cleaning', 'Security', 'Lifts', 'Roofing', 'Glazing', 'Carpentry',
  'Painting', 'Pest Control', 'Landscaping', 'IT / Comms',
  'General Handyman', 'Other',
];

// Reusable vendor picker with inline add-new capability.
// Emits the selected provider_id via onChange. When "+ Add new vendor" is
// tapped, an inline mini-form appears; on save, the new provider is created,
// added to the local list, and auto-selected.
export default function VendorPicker({
  providers,
  value,
  onChange,
  label = 'Vendor / contractor',
  required = false,
  optional = true,
}: {
  providers: ProviderOption[];
  value: string;                       // provider_id (empty string = none selected)
  onChange: (providerId: string) => void;
  label?: string;
  required?: boolean;
  optional?: boolean;
}) {
  const [list, setList] = useState<ProviderOption[]>(providers);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // inline form state
  const [nName, setNName] = useState('');
  const [nTrade, setNTrade] = useState('');
  const [nContact, setNContact] = useState('');
  const [nWhatsapp, setNWhatsapp] = useState('');
  const [nEmail, setNEmail] = useState('');

  function resetInline() {
    setNName(''); setNTrade(''); setNContact('');
    setNWhatsapp(''); setNEmail(''); setErr(null);
  }

  async function handleSaveNew() {
    setErr(null);
    if (!nName.trim() || !nTrade.trim()) {
      setErr('Vendor name and trade are required.');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('name', nName.trim());
      fd.set('trade', nTrade.trim());
      fd.set('contact_name', nContact.trim());
      fd.set('whatsapp_number', nWhatsapp.trim());
      fd.set('email', nEmail.trim());
      const result = await createProvider(fd);
      if (!result.ok || !result.provider) {
        setErr(result.error || 'Failed to save vendor.');
        return;
      }
      const p = result.provider;
      setList(l => [...l, p].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(p.id);
      resetInline();
      setAdding(false);
    } catch (e: any) {
      setErr(e.message || 'Failed to save vendor.');
    } finally {
      setSaving(false);
    }
  }

  if (adding) {
    return (
      <div className="rounded-lg border-2 border-navy/40 bg-navy/5 p-3 space-y-2">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-semibold text-navy">New vendor</span>
          <button
            type="button"
            onClick={() => { resetInline(); setAdding(false); }}
            className="text-xs text-muted hover:text-navy"
          >Cancel</button>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Name <span className="text-red-600">*</span></label>
          <input
            type="text"
            value={nName}
            onChange={e => setNName(e.target.value)}
            placeholder="e.g. Pacific Refrigeration"
            className="w-full rounded border bg-white p-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Trade <span className="text-red-600">*</span></label>
          <input
            type="text"
            value={nTrade}
            onChange={e => setNTrade(e.target.value)}
            list="vendor-trade-list"
            placeholder="Pick or type"
            className="w-full rounded border bg-white p-2 text-sm"
          />
          <datalist id="vendor-trade-list">
            {TRADE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Contact name</label>
          <input
            type="text"
            value={nContact}
            onChange={e => setNContact(e.target.value)}
            placeholder="e.g. Filipe"
            className="w-full rounded border bg-white p-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted mb-1">WhatsApp</label>
            <input
              type="tel"
              value={nWhatsapp}
              onChange={e => setNWhatsapp(e.target.value)}
              placeholder="+679…"
              className="w-full rounded border bg-white p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Email</label>
            <input
              type="email"
              value={nEmail}
              onChange={e => setNEmail(e.target.value)}
              className="w-full rounded border bg-white p-2 text-sm"
            />
          </div>
        </div>

        {err && (
          <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2">
            {err}
          </div>
        )}

        <button
          type="button"
          onClick={handleSaveNew}
          disabled={saving || !nName.trim() || !nTrade.trim()}
          className="w-full rounded-md bg-navy text-white text-sm font-semibold py-2 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save vendor and select'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-navy mb-2">
        {label} {required && <span className="text-red-600">*</span>}
        {optional && !required && <span className="text-xs font-normal text-muted ml-2">(optional)</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full rounded-md border bg-white p-3 text-sm"
      >
        <option value="">— None / self —</option>
        {list.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}{p.trade ? ` — ${p.trade}` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-1 text-xs text-navy hover:underline"
      >
        + Add new vendor
      </button>
    </div>
  );
}

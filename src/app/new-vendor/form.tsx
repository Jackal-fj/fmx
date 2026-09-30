'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProvider } from '@/app/vendors/actions';

const TRADES = [
  'Air Conditioning', 'Electrical', 'Plumbing', 'Fire Services',
  'Cleaning', 'Security', 'Lifts', 'Roofing', 'Glazing', 'Carpentry',
  'Painting', 'Pest Control', 'Landscaping', 'IT / Comms',
  'General Handyman', 'Genset', 'Other',
];

export default function NewVendorForm({ secretKey }: { secretKey: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');
  const [tradeCustom, setTradeCustom] = useState('');
  const [contact, setContact] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const finalTrade = (trade === 'Other' ? tradeCustom : trade).trim();

    if (!name.trim()) {
      setErr('Vendor name is required.');
      return;
    }
    if (!finalTrade) {
      setErr('Please pick a trade (or type one if you picked Other).');
      return;
    }

    const fd = new FormData();
    fd.set('name', name.trim());
    fd.set('trade', finalTrade);
    fd.set('contact_name', contact.trim());
    fd.set('whatsapp_number', whatsapp.trim());
    fd.set('email', email.trim());

    startTransition(async () => {
      try {
        const result = await createProvider(fd);
        if (!result.ok) {
          setErr(result.error || 'Save failed.');
          return;
        }
        router.push('/vendors');
        router.refresh();
      } catch (e: any) {
        // Never let an exception silently leave the button stuck.
        console.error('createProvider threw:', e);
        setErr(`Save failed: ${e?.message || 'Unknown error. Please try again.'}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Vendor name <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          autoComplete="off"
          autoCapitalize="words"
          placeholder="e.g. Pacific Refrigeration"
          className="w-full rounded-md border bg-white p-3 text-base"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Trade <span className="text-red-600">*</span>
        </label>
        <select
          value={trade}
          onChange={e => setTrade(e.target.value)}
          required
          className="w-full rounded-md border bg-white p-3 text-base"
        >
          <option value="">— Select a trade —</option>
          {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {trade === 'Other' && (
          <input
            type="text"
            value={tradeCustom}
            onChange={e => setTradeCustom(e.target.value)}
            required
            placeholder="Type the trade"
            className="mt-2 w-full rounded-md border bg-white p-3 text-base"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Primary contact name</label>
        <input
          type="text"
          value={contact}
          onChange={e => setContact(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          placeholder="e.g. Filipe"
          className="w-full rounded-md border bg-white p-3 text-base"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">WhatsApp number</label>
        <input
          type="tel"
          value={whatsapp}
          onChange={e => setWhatsapp(e.target.value)}
          autoComplete="off"
          placeholder="+679…"
          className="w-full rounded-md border bg-white p-3 text-base"
        />
        <p className="text-xs text-muted mt-1">
          Use E.164 format (+679 for Fiji). Needed for WhatsApp dispatch.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="w-full rounded-md border bg-white p-3 text-base"
        />
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50 text-base"
      >
        {isPending ? 'Saving…' : 'Save vendor'}
      </button>
    </form>
  );
}

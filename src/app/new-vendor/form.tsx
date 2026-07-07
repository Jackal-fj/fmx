'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProvider } from '@/app/vendors/actions';

const TRADES = [
  'Air Conditioning', 'Electrical', 'Plumbing', 'Fire Services',
  'Cleaning', 'Security', 'Lifts', 'Roofing', 'Glazing', 'Carpentry',
  'Painting', 'Pest Control', 'Landscaping', 'IT / Comms',
  'General Handyman', 'Other',
];

export default function NewVendorForm({ secretKey }: { secretKey: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');
  const [contact, setContact] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !trade.trim()) {
      setErr('Name and trade are required.');
      return;
    }
    const fd = new FormData();
    fd.set('name', name.trim());
    fd.set('trade', trade.trim());
    fd.set('contact_name', contact.trim());
    fd.set('whatsapp_number', whatsapp.trim());
    fd.set('email', email.trim());

    startTransition(async () => {
      const result = await createProvider(fd);
      if (!result.ok) {
        setErr(result.error || 'Save failed.');
        return;
      }
      router.push('/vendors');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Vendor name <span className="text-red-600">*</span>
        </label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required
               placeholder="e.g. Pacific Refrigeration"
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Trade <span className="text-red-600">*</span>
        </label>
        <input type="text" value={trade} onChange={e => setTrade(e.target.value)} required list="trade-list"
               placeholder="Pick or type"
               className="w-full rounded-md border bg-white p-3 text-sm" />
        <datalist id="trade-list">
          {TRADES.map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Primary contact name</label>
        <input type="text" value={contact} onChange={e => setContact(e.target.value)}
               placeholder="e.g. Filipe"
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">WhatsApp number</label>
        <input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
               placeholder="+679…"
               className="w-full rounded-md border bg-white p-3 text-sm" />
        <p className="text-xs text-muted mt-1">
          Use E.164 format (+679 for Fiji). Needed for future WhatsApp dispatch integration.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <button type="submit" disabled={isPending}
              className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50">
        {isPending ? 'Saving…' : 'Save vendor'}
      </button>
    </form>
  );
}

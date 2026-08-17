'use client';

import { useState, useTransition } from 'react';
import { updateVendor, deleteVendor } from './actions';

type VendorData = {
  id: string;
  name: string;
  trade: string | null;
  contact_name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  registration_id: string | null;
  hourly_rate_fjd: number | null;
  callout_fee_fjd: number | null;
  insurance_expiry: string | null;
  certifications: string | null;
  rating: number | null;
  notes: string | null;
  active: boolean;
};

const TRADES = [
  'Air Conditioning', 'Electrical', 'Plumbing', 'Fire Services',
  'Cleaning', 'Security', 'Lifts', 'Roofing', 'Glazing', 'Carpentry',
  'Painting', 'Pest Control', 'Landscaping', 'IT / Comms',
  'General Handyman', 'Other',
];

export default function EditVendorForm({
  vendor,
  secretKey,
}: {
  vendor: VendorData;
  secretKey: string;
}) {
  const [name, setName] = useState(vendor.name);
  const [trade, setTrade] = useState(vendor.trade || '');
  const [contactName, setContactName] = useState(vendor.contact_name || '');
  const [whatsapp, setWhatsapp] = useState(vendor.whatsapp_number || '');
  const [email, setEmail] = useState(vendor.email || '');
  const [address, setAddress] = useState(vendor.address || '');
  const [website, setWebsite] = useState(vendor.website || '');
  const [registration, setRegistration] = useState(vendor.registration_id || '');
  const [hourlyRate, setHourlyRate] = useState(vendor.hourly_rate_fjd?.toString() || '');
  const [calloutFee, setCalloutFee] = useState(vendor.callout_fee_fjd?.toString() || '');
  const [insuranceExpiry, setInsuranceExpiry] = useState((vendor.insurance_expiry || '').slice(0, 10));
  const [certifications, setCertifications] = useState(vendor.certifications || '');
  const [rating, setRating] = useState(vendor.rating?.toString() || '');
  const [notes, setNotes] = useState(vendor.notes || '');
  const [active, setActive] = useState(vendor.active);

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
    fd.set('id', vendor.id);
    fd.set('name', name.trim());
    fd.set('trade', trade.trim());
    fd.set('contact_name', contactName.trim());
    fd.set('whatsapp_number', whatsapp.trim());
    fd.set('email', email.trim());
    fd.set('address', address.trim());
    fd.set('website', website.trim());
    fd.set('registration_id', registration.trim());
    fd.set('hourly_rate_fjd', hourlyRate);
    fd.set('callout_fee_fjd', calloutFee);
    fd.set('insurance_expiry', insuranceExpiry);
    fd.set('certifications', certifications.trim());
    fd.set('rating', rating);
    fd.set('notes', notes.trim());
    fd.set('active', active ? 'true' : 'false');
    fd.set('key', secretKey);

    startTransition(async () => {
      try {
        const result = await updateVendor(fd);
        if (result && !result.ok) setErr(result.error || 'Save failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Save failed.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Identity */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Vendor name <span className="text-red-600">*</span></label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required
               className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Trade <span className="text-red-600">*</span></label>
        <input type="text" value={trade} onChange={e => setTrade(e.target.value)} required list="trade-list"
               className="w-full rounded-md border bg-white p-3 text-sm" />
        <datalist id="trade-list">{TRADES.map(t => <option key={t} value={t} />)}</datalist>
      </div>

      {/* Contact */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted">Contact</div>
        <Input label="Primary contact" value={contactName} setValue={setContactName} placeholder="e.g. Filipe" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="WhatsApp" value={whatsapp} setValue={setWhatsapp} placeholder="+679…" />
          <Input label="Email" value={email} setValue={setEmail} type="email" />
        </div>
        <Input label="Address" value={address} setValue={setAddress} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Website" value={website} setValue={setWebsite} placeholder="https://…" />
          <Input label="Registration ID (ABN etc)" value={registration} setValue={setRegistration} />
        </div>
      </div>

      {/* Rates */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted">Rates</div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Hourly rate (FJD)" value={hourlyRate} setValue={setHourlyRate} type="number" />
          <Input label="Callout fee (FJD)" value={calloutFee} setValue={setCalloutFee} type="number" />
        </div>
      </div>

      {/* Compliance */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted">Compliance</div>
        <Input label="Insurance expiry" value={insuranceExpiry} setValue={setInsuranceExpiry} type="date" />
        <div>
          <label className="block text-xs text-muted mb-1">Certifications</label>
          <textarea value={certifications} onChange={e => setCertifications(e.target.value)} rows={2}
                    placeholder="e.g. EFL Certified Electrician, Fire Services Cert II"
                    className="w-full rounded border bg-white p-2 text-sm" />
        </div>
      </div>

      {/* Rating */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Rating (1–5) <span className="text-xs font-normal text-muted">(client's view of vendor quality)</span>
        </label>
        <select value={rating} onChange={e => setRating(e.target.value)}
                className="w-full rounded-md border bg-white p-3 text-sm">
          <option value="">— No rating —</option>
          <option value="1">★☆☆☆☆ 1 — Poor</option>
          <option value="2">★★☆☆☆ 2 — Below expectations</option>
          <option value="3">★★★☆☆ 3 — Meets expectations</option>
          <option value="4">★★★★☆ 4 — Above expectations</option>
          <option value="5">★★★★★ 5 — Excellent</option>
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  className="w-full rounded-md border bg-white p-3 text-sm" />
      </div>

      {/* Active toggle */}
      <div className="rounded-lg border bg-white p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
                 className="w-4 h-4" />
          <span className="text-sm font-semibold">Active</span>
        </label>
        <p className="text-xs text-muted mt-1 ml-7">
          Uncheck to hide this vendor from the picker but keep history intact.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <button type="submit" disabled={isPending}
              className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50">
        {isPending ? 'Saving…' : 'Save changes'}
      </button>

      <DeleteZone vendorId={vendor.id} vendorName={vendor.name} secretKey={secretKey} />
    </form>
  );
}

function Input({ label, value, setValue, type = 'text', placeholder }: {
  label: string; value: string; setValue: (s: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input type={type} value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder}
             className="w-full rounded border bg-white p-2 text-sm" />
    </div>
  );
}

function DeleteZone({ vendorId, vendorName, secretKey }: {
  vendorId: string; vendorName: string; secretKey: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleDelete() {
    setErr(null);
    const fd = new FormData();
    fd.set('id', vendorId);
    fd.set('key', secretKey);
    startTransition(async () => {
      try {
        const result = await deleteVendor(fd);
        if (result && !result.ok) setErr(result.error || 'Delete failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Delete failed.');
      }
    });
  }

  return (
    <div className="mt-10 pt-6 border-t border-red-200">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-sm font-semibold text-red-900 mb-1">Danger zone</div>
        <p className="text-xs text-red-800 mb-3">
          Deleting removes this vendor permanently. Any linked defect updates, service events, WhatsApp
          messages, work orders and service contracts are preserved but lose their link to this vendor
          (their history stays intact). Consider unchecking Active above instead if you just want to hide
          the vendor from the picker.
        </p>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)}
                  className="rounded-md border border-red-600 text-red-800 text-sm font-semibold px-3 py-1.5 hover:bg-red-600 hover:text-white">
            Delete vendor
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-900 font-medium">
              Really delete <span className="font-bold">{vendorName}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={handleDelete} disabled={isPending}
                      className="rounded-md bg-red-700 text-white text-sm font-semibold px-3 py-1.5 hover:bg-red-800 disabled:opacity-50">
                {isPending ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={isPending}
                      className="rounded-md border border-gray-300 text-gray-700 text-sm px-3 py-1.5 hover:bg-gray-50">
                Cancel
              </button>
            </div>
            {err && <div className="text-xs text-red-900 mt-2">{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

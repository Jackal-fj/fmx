'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateAgreement } from './actions';

type Agreement = {
  id: string;
  agreement_code: string;
  name: string;
  agreement_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  monthly_value_estimate: string | number | null;
  management_fee_pct: string | number | null;
  payment_terms_days: number | null;
  billing_cycle: string | null;
  billing_day: number | null;
  po_required: boolean | null;
  cpi_escalation_pct: string | number | null;
  bond_amount: string | number | null;
  float_amount: string | number | null;
  currency: string | null;
  invoice_requirements: string | null;
  notes: string | null;
};

const STATUSES = [
  { value: 'active',      label: 'Active' },
  { value: 'negotiation', label: 'Pending (negotiation)' },
  { value: 'tender',      label: 'Pending (tender)' },
  { value: 'suspended',   label: 'Suspended' },
  { value: 'ended',       label: 'Expired' },
  { value: 'lost',        label: 'Terminated' },
];
const TYPES = [
  { value: 'all_in_one',  label: 'All in one' },
  { value: 'fm_services', label: 'FM services' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'project',     label: 'Project' },
  { value: 'ad_hoc',      label: 'Ad hoc' },
];
const BILLING = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'per_job',     label: 'Per job' },
];

function toNumOrNull(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function toStrOrNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}
function toDateOrNull(v: string): string | null {
  return v || null;
}

export default function AgreementEditor({
  agreement,
  clientShortCode,
  secretKey,
}: {
  agreement: Agreement;
  clientShortCode: string;
  secretKey: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Local state, prefilled from the current agreement.
  const [name, setName] = useState(agreement.name || '');
  const [type, setType] = useState(agreement.agreement_type || 'all_in_one');
  const [status, setStatus] = useState(agreement.status || 'active');
  const [startDate, setStartDate] = useState((agreement.start_date || '').slice(0, 10));
  const [endDate, setEndDate] = useState((agreement.end_date || '').slice(0, 10));
  const [monthly, setMonthly] = useState(agreement.monthly_value_estimate == null ? '' : String(agreement.monthly_value_estimate));
  const [mgmtFee, setMgmtFee] = useState(agreement.management_fee_pct == null ? '' : String(agreement.management_fee_pct));
  const [terms, setTerms] = useState(agreement.payment_terms_days == null ? '' : String(agreement.payment_terms_days));
  const [billing, setBilling] = useState(agreement.billing_cycle || 'monthly');
  const [billingDay, setBillingDay] = useState(agreement.billing_day == null ? '' : String(agreement.billing_day));
  const [poRequired, setPoRequired] = useState(!!agreement.po_required);
  const [cpi, setCpi] = useState(agreement.cpi_escalation_pct == null ? '' : String(agreement.cpi_escalation_pct));
  const [bond, setBond] = useState(agreement.bond_amount == null ? '' : String(agreement.bond_amount));
  const [floatAmt, setFloatAmt] = useState(agreement.float_amount == null ? '' : String(agreement.float_amount));
  const [currency, setCurrency] = useState(agreement.currency || 'FJD');
  const [invoiceReq, setInvoiceReq] = useState(agreement.invoice_requirements || '');
  const [notes, setNotes] = useState(agreement.notes || '');

  function cancel() {
    router.replace(`/clients/${clientShortCode}/agreements/${encodeURIComponent(agreement.agreement_code)}`);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr('Name is required.'); return; }

    const patch = {
      name: name.trim(),
      agreement_type: type,
      status,
      start_date: toDateOrNull(startDate),
      end_date: toDateOrNull(endDate),
      monthly_value_estimate: toNumOrNull(monthly),
      management_fee_pct: toNumOrNull(mgmtFee),
      payment_terms_days: toNumOrNull(terms),
      billing_cycle: billing,
      billing_day: toNumOrNull(billingDay),
      po_required: poRequired,
      cpi_escalation_pct: toNumOrNull(cpi),
      bond_amount: toNumOrNull(bond),
      float_amount: toNumOrNull(floatAmt),
      currency: currency.trim() || 'FJD',
      invoice_requirements: toStrOrNull(invoiceReq),
      notes: toStrOrNull(notes),
    };

    startTransition(async () => {
      const r = await updateAgreement(agreement.id, clientShortCode, agreement.agreement_code, patch, secretKey);
      if (!r.ok) {
        setErr(r.error || 'Save failed.');
        return;
      }
      router.replace(`/clients/${clientShortCode}/agreements/${encodeURIComponent(agreement.agreement_code)}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="rounded-lg border bg-white p-4 space-y-4">
        <Row label="Name" required>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required maxLength={200} className="field" />
        </Row>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row label="Type">
            <select value={type} onChange={e => setType(e.target.value)} className="field">
              {TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          <Row label="Status">
            <select value={status} onChange={e => setStatus(e.target.value)} className="field">
              {STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          <Row label="Start date">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="field" />
          </Row>
          <Row label="End date">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="field" />
          </Row>
          <Row label="Monthly value">
            <input type="number" inputMode="decimal" min="0" step="0.01" value={monthly} onChange={e => setMonthly(e.target.value)} className="field" />
          </Row>
          <Row label="Currency">
            <input type="text" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={5} className="field" />
          </Row>
          <Row label="Management fee %">
            <input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={mgmtFee} onChange={e => setMgmtFee(e.target.value)} className="field" />
          </Row>
          <Row label="Payment terms (days)">
            <input type="number" inputMode="numeric" min="0" step="1" value={terms} onChange={e => setTerms(e.target.value)} className="field" />
          </Row>
          <Row label="Billing cycle">
            <select value={billing} onChange={e => setBilling(e.target.value)} className="field">
              {BILLING.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          <Row label="Billing day">
            <input type="number" inputMode="numeric" min="1" max="31" step="1" value={billingDay} onChange={e => setBillingDay(e.target.value)} className="field" />
          </Row>
          <Row label="CPI escalation %">
            <input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={cpi} onChange={e => setCpi(e.target.value)} className="field" />
          </Row>
          <Row label="PO required">
            <label className="flex items-center gap-2 h-full">
              <input type="checkbox" checked={poRequired} onChange={e => setPoRequired(e.target.checked)} className="w-5 h-5" />
              <span className="text-sm text-navy">{poRequired ? 'Yes' : 'No'}</span>
            </label>
          </Row>
          <Row label="Bond">
            <input type="number" inputMode="decimal" min="0" step="0.01" value={bond} onChange={e => setBond(e.target.value)} className="field" />
          </Row>
          <Row label="Float">
            <input type="number" inputMode="decimal" min="0" step="0.01" value={floatAmt} onChange={e => setFloatAmt(e.target.value)} className="field" />
          </Row>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-4">
        <Row label="Invoice requirements">
          <textarea value={invoiceReq} onChange={e => setInvoiceReq(e.target.value)} rows={5} className="field font-normal" />
        </Row>
        <Row label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="field font-normal" />
        </Row>
      </section>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      {/* Sticky save bar — mobile-first, thumb at the bottom */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white border-t flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-md bg-navy text-white text-sm font-semibold py-3 disabled:opacity-50 min-h-[44px]"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="rounded-md border border-gray-300 text-navy text-sm font-semibold px-4 py-3 min-h-[44px] hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>

      <style>{`
        .field {
          width: 100%;
          border-radius: 6px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          padding: 0.6rem 0.75rem;
          font-size: 0.95rem;
        }
        .field:focus { outline: none; border-color: #1a365d; }
      `}</style>
    </form>
  );
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-muted mb-1">
        {label}{required && <span className="text-red-600"> *</span>}
      </label>
      {children}
    </div>
  );
}

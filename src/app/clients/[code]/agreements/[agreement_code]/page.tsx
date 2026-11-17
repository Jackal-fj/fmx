import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import Badge from '@/components/badge';
import {
  AGREEMENT_TYPES, BILLING_CYCLES, agreementTone, agreementStatusLabel,
  fmtDate, fmtMoney, labelOf, withKey,
} from '@/lib/clients';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Permission check — gated edit per FMX-025.
// While FMX-024 (role model) is parked, any session that holds the
// QUICK_ADD_SECRET is treated as fm_admin. Flip to a role lookup when roles land.
function canEditAgreement(sessionHasKey: boolean): boolean {
  return sessionHasKey;
}

export default async function AgreementViewPage({
  params,
}: {
  params: { code: string; agreement_code: string };
}) {
  noStore();
  const sb = supabaseServer;
  const clientCode = decodeURIComponent(params.code).toUpperCase();
  const agreementCode = decodeURIComponent(params.agreement_code).toUpperCase();
  const key = process.env.QUICK_ADD_SECRET || '';
  const canEdit = canEditAgreement(!!key);

  const { data: client } = await sb.from('clients').select('id, short_code, name').eq('short_code', clientCode).maybeSingle();
  if (!client) return notFound();

  const { data: agreement } = await sb
    .from('client_agreements')
    .select('*')
    .eq('client_id', client.id)
    .eq('agreement_code', agreementCode)
    .maybeSingle();
  if (!agreement) return notFound();

  const { data: lines } = await sb
    .from('service_contracts')
    .select('id, line_no, contract_name, frequency, fee_basis, fee_amount, fee_currency, management_fee_pct, property:property_id ( short_code ), provider:provider_id ( name )')
    .eq('agreement_id', agreement.id)
    .eq('active', true)
    .order('line_no', { ascending: true, nullsFirst: false })
    .order('contract_name');

  const editHref = withKey(`/clients/${client.short_code}/manage?open=agreements`, key) + '#agreements';

  return (
    <div>
      {/* Breadcrumb */}
      <Link href={`/clients/${client.short_code}`} className="text-sm text-muted hover:text-navy">
        ← {client.name}
      </Link>

      {/* Header + Edit button */}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-navy">{agreement.name}</h1>
            <Badge tone={agreementTone(agreement.status)}>{agreementStatusLabel(agreement.status).toUpperCase()}</Badge>
          </div>
          <div className="text-sm text-muted mt-1">
            <span className="font-mono">{agreement.agreement_code}</span>
            {' · '}{labelOf(AGREEMENT_TYPES, agreement.agreement_type)}
            {' · '}View only
          </div>
        </div>
        {canEdit && (
          <Link
            href={editHref}
            className="shrink-0 rounded-md bg-navy text-white text-sm font-semibold px-4 py-2 hover:bg-blue-900 transition"
          >
            Edit
          </Link>
        )}
      </div>

      {/* Agreement detail grid */}
      <section className="mt-6 rounded-lg border bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Agreement</h2>
        </div>
        <dl className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <DT label="Start date" value={fmtDate(agreement.start_date)} />
          <DT label="End date" value={fmtDate(agreement.end_date)} />
          <DT label="Term" value={termLabel(agreement.start_date, agreement.end_date)} />
          <DT label="Monthly value" value={agreement.monthly_value_estimate != null ? fmtMoney(agreement.monthly_value_estimate, agreement.currency) : '—'} />
          <DT label="Management fee" value={agreement.management_fee_pct != null ? `${Number(agreement.management_fee_pct)}%` : '—'} />
          <DT label="Payment terms" value={agreement.payment_terms_days != null ? `${agreement.payment_terms_days} days` : '—'} />
          <DT label="Billing cycle" value={`${labelOf(BILLING_CYCLES, agreement.billing_cycle)}${agreement.billing_day ? `, day ${agreement.billing_day}` : ''}`} />
          <DT label="PO required" value={agreement.po_required ? 'Yes' : 'No'} />
          <DT label="CPI escalation" value={agreement.cpi_escalation_pct != null ? `${Number(agreement.cpi_escalation_pct)}%` : '—'} />
          <DT label="Bond" value={agreement.bond_amount != null ? fmtMoney(agreement.bond_amount, agreement.currency) : '—'} />
          <DT label="Float" value={agreement.float_amount != null ? fmtMoney(agreement.float_amount, agreement.currency) : '—'} />
          <DT label="Currency" value={agreement.currency || 'FJD'} />
        </dl>

        {agreement.invoice_requirements && (
          <div className="border-t px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Invoice requirements</div>
            <p className="text-sm whitespace-pre-line">{agreement.invoice_requirements}</p>
          </div>
        )}

        {agreement.notes && (
          <div className="border-t px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Notes</div>
            <p className="text-sm whitespace-pre-line">{agreement.notes}</p>
          </div>
        )}

        {agreement.drive_folder_path && (
          <div className="border-t px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Drive folder</div>
            <p className="text-sm font-mono text-navy break-all">{agreement.drive_folder_path}</p>
          </div>
        )}
      </section>

      {/* Linked service lines */}
      <section className="mt-6 rounded-lg border bg-white">
        <div className="flex items-baseline justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
            Linked service lines ({(lines || []).length})
          </h2>
        </div>
        {(lines || []).length === 0 ? (
          <div className="p-4 text-sm text-muted">No service lines linked to this agreement.</div>
        ) : (
          <ul className="divide-y">
            {(lines || []).map((l: any) => (
              <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-6 shrink-0 text-xs text-muted pt-0.5">{l.line_no ?? ''}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-navy">{l.contract_name}</div>
                  <div className="text-xs text-muted">
                    {[l.property?.short_code || 'All sites', l.frequency, l.provider?.name].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs whitespace-nowrap pt-0.5">
                  {l.fee_amount != null ? fmtMoney(l.fee_amount, l.fee_currency || 'FJD') : '—'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!canEdit && (
        <p className="mt-6 text-xs text-muted italic">
          Read-only view. Editing requires permission on this agreement.
        </p>
      )}
    </div>
  );
}

function DT({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5">{value || '—'}</dd>
    </div>
  );
}

function termLabel(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '—';
  const months = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months >= 12) {
    const years = (months / 12).toFixed(months % 12 === 0 ? 0 : 1);
    return `${years} year${years === '1' ? '' : 's'}`;
  }
  return `${months} month${months === 1 ? '' : 's'}`;
}

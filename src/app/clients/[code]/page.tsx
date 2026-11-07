import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import StatCard from '@/components/stat-card';
import Badge, { severityTone } from '@/components/badge';
import {
  AGREEMENT_STATUSES, AGREEMENT_TYPES, BILLING_CYCLES, CLIENT_TYPES, CONTACT_ROLES, FEE_BASES, WO_STATUSES,
  OPEN_WO_STATUSES, agreementTone, fmtDate, fmtMoney, labelOf, woTone, withKey,
} from '@/lib/clients';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const STATUS_ORDER: Record<string, number> = { active: 0, negotiation: 1, tender: 2, suspended: 3, ended: 4, lost: 5 };

export default async function ClientHub({ params }: { params: { code: string } }) {
  noStore();
  const sb = supabaseServer;
  const code = decodeURIComponent(params.code).toUpperCase();
  const key = process.env.QUICK_ADD_SECRET || '';

  const { data: client, error: clientErr } = await sb.from('clients').select('*').eq('short_code', code).maybeSingle();
  if (clientErr) throw new Error(`Could not load client ${code}: ${clientErr.message}`);
  if (!client) return notFound();

  const [
    { data: overview },
    { data: agreements },
    { data: contacts },
    { data: properties },
    { data: lines },
    { data: jobs },
    { data: reports },
  ] = await Promise.all([
    sb.from('client_overview').select('*').eq('id', client.id).maybeSingle(),
    sb.from('client_agreements').select('*').eq('client_id', client.id),
    sb.from('client_contacts').select('*').eq('client_id', client.id).eq('active', true).order('is_primary', { ascending: false }).order('name'),
    sb.from('properties').select('id, short_code, name, address, tenant_name, facility_type, gross_floor_area_m2').eq('client_id', client.id).eq('active', true).order('short_code'),
    sb.from('service_contracts')
      .select('id, agreement_id, line_no, contract_name, frequency, fee_basis, fee_amount, fee_currency, management_fee_pct, next_service_date, property:property_id ( short_code ), provider:provider_id ( name )')
      .eq('client_id', client.id).eq('active', true)
      .order('line_no', { ascending: true, nullsFirst: false }).order('contract_name'),
    sb.from('work_orders')
      .select('id, wo_number, title, status, priority, quote_ref, invoice_ref, cost_est_fjd, cost_actual_fjd, completed_at, closed_at, created_at, property:property_id ( short_code )')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }).limit(30),
    sb.from('report_runs').select('id, report_month, scope, short_code, filename').eq('client_id', client.id)
      .order('report_month', { ascending: false }).limit(6),
  ]);

  const propIds = (properties || []).map(p => p.id);
  const { data: defects } = propIds.length
    ? await sb.from('defects')
        .select('defect_number, title, severity, status, identified_at, property_id')
        .in('property_id', propIds)
        .in('status', ['open', 'work_ordered'])
        .order('identified_at', { ascending: false })
    : { data: [] as any[] };

  const openByProp = new Map<string, number>();
  for (const d of defects || []) openByProp.set(d.property_id, (openByProp.get(d.property_id) || 0) + 1);
  const propCode = new Map((properties || []).map(p => [p.id, p.short_code]));

  const sortedAgreements = [...(agreements || [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (b.created_at || '').localeCompare(a.created_at || ''),
  );
  const current = sortedAgreements[0];
  const openJobs = (jobs || []).filter(j => OPEN_WO_STATUSES.includes(j.status));
  const invoicedTotal = (jobs || []).reduce((s, j) => s + (Number(j.cost_actual_fjd) || 0), 0);

  // Group service lines under their agreement; unlinked lines last.
  const agName = new Map((agreements || []).map(a => [a.id, `${a.agreement_code} • ${a.name}`]));
  const lineGroups = new Map<string, any[]>();
  for (const l of lines || []) {
    const k = l.agreement_id || '';
    if (!lineGroups.has(k)) lineGroups.set(k, []);
    lineGroups.get(k)!.push(l);
  }
  const lineGroupKeys = Array.from(lineGroups.keys()).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0));

  const manage = (open: string) => withKey(`/clients/${client.short_code}/manage?open=${open}`, key) + `#${open}`;
  const singleProp = (properties || []).length === 1 ? properties![0].short_code : '';

  // --- "To complete" checklist ----------------------------------------------
  // Only rendered when at least one item is missing. Each row links to the
  // right /manage?open=section anchor so Carl can fix it in one tap.
  const todo: { label: string; href: string }[] = [];
  if (!(properties || []).length) {
    todo.push({ label: 'Add at least one site', href: manage('properties') });
  }
  if (!current) {
    todo.push({ label: 'Add master agreement (terms, fee, PO rule)', href: manage('agreements') });
  } else {
    if (!current.start_date)                    todo.push({ label: 'Agreement start date', href: manage('agreements') });
    if (current.monthly_value_estimate == null) todo.push({ label: 'Agreement monthly fee', href: manage('agreements') });
    if (current.management_fee_pct == null)     todo.push({ label: 'Management fee %', href: manage('agreements') });
    if (current.payment_terms_days == null)     todo.push({ label: 'Payment terms (days)', href: manage('agreements') });
    if (!current.invoice_requirements)          todo.push({ label: 'Invoice requirements / PO handling', href: manage('agreements') });
    if (current.bond_amount == null && current.float_amount == null) {
      todo.push({ label: 'Bond or float amount (or mark none)', href: manage('agreements') });
    }
  }
  const primaryContact = (contacts || []).find(c => c.is_primary);
  const invoiceContact = (contacts || []).find(c => c.receives_invoices);
  if (!primaryContact) todo.push({ label: 'Primary contact', href: manage('contacts') });
  if (!invoiceContact) todo.push({ label: 'Invoice recipient contact', href: manage('contacts') });
  const unlinkedLines = (lines || []).filter(l => !l.agreement_id).length;
  if (current && unlinkedLines > 0) {
    todo.push({ label: `Link ${unlinkedLines} service line${unlinkedLines === 1 ? '' : 's'} to ${current.agreement_code}`, href: manage('services') });
  }
  if (!client.xero_contact_id) {
    todo.push({ label: 'Xero contact ID (for invoice automation)', href: manage('client') });
  }
  if (!client.dropbox_folder) {
    todo.push({ label: 'Dropbox folder name (defaults to short code)', href: manage('client') });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <Link href="/clients" className="text-sm text-muted hover:text-navy">← Clients</Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mt-2">
          <h1 className="text-3xl font-bold text-navy">{client.name}</h1>
          <span className="text-muted font-mono">{client.short_code}</span>
        </div>
        <p className="text-muted mt-1 text-sm">
          {labelOf(CLIENT_TYPES, client.client_type)}
          {client.legal_name ? ` • ${client.legal_name}` : ''}
          {client.tin ? ` • TIN ${client.tin}` : ''}
          {!client.active && ' • Inactive'}
        </p>
      </div>

      {/* Quick actions: one tap to everything */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {key && <QA href={withKey(`/new-defect${singleProp ? `?property=${singleProp}` : ''}`, key)} primary>+ Log defect</QA>}
        {key && <QA href={manage('jobs')}>+ Job</QA>}
        {key && <QA href={manage('contacts')}>+ Contact</QA>}
        <QA href={`/defects?client=${encodeURIComponent(client.short_code)}`}>Defects</QA>
        <QA href={`/reports?client=${encodeURIComponent(client.short_code)}`}>Reports</QA>
        {key && <QA href={manage('client')}>Manage</QA>}
      </div>

      {/* To-complete checklist — only renders when gaps exist */}
      {key && todo.length > 0 && (
        <section className="mb-6 rounded-lg border-2 border-orange-300 bg-orange-50">
          <div className="flex items-baseline justify-between px-4 py-2.5 border-b border-orange-200">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
              To complete ({todo.length})
            </h2>
            <span className="text-xs text-muted">Finish setting up this client</span>
          </div>
          <ul className="divide-y divide-orange-200">
            {todo.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-orange-600 text-xs" aria-hidden>●</span>
                  <span className="text-sm text-navy truncate">{item.label}</span>
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 rounded-md border border-navy text-navy text-xs font-semibold px-2.5 py-1 hover:bg-navy hover:text-white"
                >
                  Set →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Sites" value={overview?.property_count ?? (properties || []).length} />
        <StatCard label="Open defects" value={overview?.open_defects ?? 0} tone={(overview?.critical_defects || 0) > 0 ? 'bad' : 'navy'}
          hint={(overview?.critical_defects || 0) > 0 ? `${overview!.critical_defects} critical` : undefined} />
        <StatCard label="Open jobs" value={openJobs.length} tone={openJobs.length ? 'warn' : 'navy'} />
        <StatCard label="Monthly value" value={current?.monthly_value_estimate != null ? Number(current.monthly_value_estimate).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
          hint={current ? 'FJD excl. VAT' : 'No agreement yet'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Agreement */}
          <Section title="Agreement" action={key ? <Link href={manage('agreements')} className="text-xs text-muted hover:text-navy">{current ? 'Edit' : '+ Add'} →</Link> : null}>
            {current ? (
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">{current.agreement_code}</span>
                  <Badge tone={agreementTone(current.status)}>{labelOf(AGREEMENT_STATUSES, current.status).toUpperCase()}</Badge>
                  <span className="text-xs text-muted">{labelOf(AGREEMENT_TYPES, current.agreement_type)}</span>
                </div>
                <div className="text-lg font-semibold mt-1">{current.name}</div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-3 text-sm">
                  <DT label="Term" value={
                    current.start_date || current.end_date
                      ? `${fmtDate(current.start_date)} to ${fmtDate(current.end_date)}`
                      : key ? <SetLink href={manage('agreements')} /> : '—'
                  } />
                  <DT label="Monthly value" value={
                    current.monthly_value_estimate != null
                      ? fmtMoney(current.monthly_value_estimate, current.currency)
                      : key ? <SetLink href={manage('agreements')} /> : '—'
                  } />
                  <DT label="Mgmt fee" value={
                    current.management_fee_pct != null
                      ? `${Number(current.management_fee_pct)}%`
                      : key ? <SetLink href={manage('agreements')} /> : '—'
                  } />
                  <DT label="Billing" value={`${labelOf(BILLING_CYCLES, current.billing_cycle)}${current.billing_day ? `, day ${current.billing_day}` : ''}`} />
                  <DT label="Terms" value={
                    current.payment_terms_days != null
                      ? `${current.payment_terms_days} days`
                      : key ? <SetLink href={manage('agreements')} /> : '—'
                  } />
                  <DT label="PO required" value={current.po_required ? 'Yes' : 'No'} />
                  <DT label="CPI" value={
                    current.cpi_escalation_pct != null
                      ? `${Number(current.cpi_escalation_pct)}%`
                      : key ? <SetLink href={manage('agreements')} /> : '—'
                  } />
                  <DT label="Bond" value={
                    current.bond_amount != null
                      ? fmtMoney(current.bond_amount, current.currency)
                      : key ? <SetLink href={manage('agreements')} /> : '—'
                  } />
                  <DT label="Float" value={
                    current.float_amount != null
                      ? fmtMoney(current.float_amount, current.currency)
                      : key ? <SetLink href={manage('agreements')} /> : '—'
                  } />
                </dl>
                {current.invoice_requirements ? (
                  <div className="mt-3 rounded-md bg-accent/50 px-3 py-2 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-navy">Invoicing: </span>
                    {current.invoice_requirements}
                  </div>
                ) : key ? (
                  <div className="mt-3 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-muted">
                    <span className="text-xs font-semibold uppercase tracking-wide text-navy mr-2">Invoicing: </span>
                    <Link href={manage('agreements')} className="text-navy hover:underline">Set invoice requirements / PO handling →</Link>
                  </div>
                ) : null}
                {sortedAgreements.length > 1 && (
                  <div className="mt-3 text-xs text-muted">
                    Also: {sortedAgreements.slice(1).map(a => `${a.agreement_code} (${labelOf(AGREEMENT_STATUSES, a.status)})`).join(', ')}
                  </div>
                )}
              </div>
            ) : <Empty>No agreement recorded.</Empty>}
          </Section>

          {/* Sites */}
          <Section title={`Sites (${(properties || []).length})`} action={key ? <Link href={manage('properties')} className="text-xs text-muted hover:text-navy">+ Add →</Link> : null}>
            {(properties || []).length ? (
              <div className="divide-y">
                {properties!.map(p => {
                  const open = openByProp.get(p.id) || 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                      <Link href={`/properties/${p.short_code}`} className="min-w-0 flex-1 group">
                        <div className="font-semibold group-hover:text-navy truncate">{p.name} <span className="text-xs font-mono text-muted">{p.short_code}</span></div>
                        <div className="text-xs text-muted truncate">{[p.address, p.tenant_name].filter(Boolean).join(' • ') || '—'}</div>
                      </Link>
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-bold ${open > 10 ? 'text-warn' : 'text-navy'}`}>{open}</div>
                        <div className="text-[10px] uppercase text-muted">open</div>
                      </div>
                      {key && (
                        <Link href={withKey(`/new-defect?property=${p.short_code}`, key)} className="shrink-0 rounded-md border border-navy text-navy text-xs font-semibold px-2 py-1.5 hover:bg-navy hover:text-white">
                          + Defect
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <Empty>No sites yet.</Empty>}
          </Section>

          {/* Jobs */}
          <Section title={`Jobs & work orders (${(jobs || []).length})`} action={key ? <Link href={manage('jobs')} className="text-xs text-muted hover:text-navy">+ Add / edit →</Link> : null}>
            {(jobs || []).length ? (
              <>
                <ul className="divide-y">
                  {jobs!.map((j: any) => (
                    <li key={j.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted">{j.wo_number}</span>
                          <Badge tone={woTone(j.status)}>{labelOf(WO_STATUSES, j.status).toUpperCase()}</Badge>
                        </div>
                        <div className="text-sm mt-0.5">{j.title}</div>
                        <div className="text-xs text-muted">{[j.property?.short_code, j.quote_ref, j.invoice_ref].filter(Boolean).join(' • ')}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs whitespace-nowrap pt-0.5">
                        {j.cost_actual_fjd != null ? fmtMoney(j.cost_actual_fjd) : j.cost_est_fjd != null ? <span className="text-muted">est {fmtMoney(j.cost_est_fjd)}</span> : '—'}
                      </div>
                    </li>
                  ))}
                </ul>
                {invoicedTotal > 0 && (
                  <div className="border-t px-4 py-2 text-right text-xs text-muted">Invoiced to date (listed jobs): <span className="font-semibold text-navy">{fmtMoney(invoicedTotal)}</span></div>
                )}
              </>
            ) : <Empty>No jobs recorded.</Empty>}
          </Section>

          {/* Service lines */}
          <Section title={`Service lines (${(lines || []).length})`} action={key ? <Link href={manage('services')} className="text-xs text-muted hover:text-navy">+ Add / edit →</Link> : null}>
            {(lines || []).length ? lineGroupKeys.map(k => (
              <div key={k || 'none'}>
                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-navy border-t first:border-t-0">{k ? agName.get(k) : 'Not linked to an agreement'}</div>
                <ul className="divide-y border-t">
                  {lineGroups.get(k)!.map((l: any) => (
                    <li key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="w-5 shrink-0 text-xs text-muted pt-0.5">{l.line_no ?? ''}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{l.contract_name}</div>
                        <div className="text-xs text-muted">
                          {[l.property?.short_code || 'All sites', l.frequency, l.provider?.name,
                            l.fee_basis ? `${labelOf(FEE_BASES, l.fee_basis)}${l.management_fee_pct != null ? ` +${Number(l.management_fee_pct)}%` : ''}` : null,
                          ].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs whitespace-nowrap pt-0.5">{l.fee_amount != null ? fmtMoney(l.fee_amount, l.fee_currency || 'FJD') : '—'}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )) : <Empty>No service lines.</Empty>}
          </Section>

          {/* Defects */}
          <Section title={`Open defects (${(defects || []).length})`} action={<Link href={`/defects?client=${encodeURIComponent(client.short_code)}`} className="text-xs text-muted hover:text-navy">View all →</Link>}>
            {(defects || []).length ? (
              <ul className="divide-y">
                {defects!.slice(0, 10).map((d: any) => (
                  <li key={d.defect_number}>
                    <Link href={`/defects/${d.defect_number}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-navy">{d.defect_number}</span>
                          <Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge>
                          <span className="text-xs text-muted">{propCode.get(d.property_id)}</span>
                        </div>
                        <div className="text-sm mt-0.5">{d.title}</div>
                      </div>
                      <span className="shrink-0 text-xs text-muted whitespace-nowrap pt-0.5">{fmtDate(d.identified_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No open defects.</Empty>}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Section title="Contacts" action={key ? <Link href={manage('contacts')} className="text-xs text-muted hover:text-navy">+ Add / edit →</Link> : null}>
            {(contacts || []).length ? (
              <div className="divide-y">
                {contacts!.map(c => (
                  <div key={c.id} className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{c.name}</span>
                      {c.is_primary && <Badge tone="ok">PRIMARY</Badge>}
                      {c.receives_invoices && <Badge tone="muted">INVOICES</Badge>}
                    </div>
                    <div className="text-xs text-muted">{[labelOf(CONTACT_ROLES, c.role), c.title].filter(Boolean).join(' • ')}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="rounded-md border px-2 py-1 text-xs text-navy hover:border-navy">📞 {c.phone}</a>}
                      {c.phone && <a href={`https://wa.me/${c.phone.replace(/[^\d]/g, '')}`} className="rounded-md border px-2 py-1 text-xs text-navy hover:border-navy" target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="rounded-md border px-2 py-1 text-xs text-navy hover:border-navy break-all">✉ {c.email}</a>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>
                {client.primary_contact_name && client.primary_contact_name !== 'TBD'
                  ? `Legacy contact: ${client.primary_contact_name}. Add full details under Manage.`
                  : 'No contacts yet.'}
              </Empty>
            )}
          </Section>

          <Section title="Reports" action={<Link href={`/reports?client=${encodeURIComponent(client.short_code)}`} className="text-xs text-muted hover:text-navy">Open →</Link>}>
            {(reports || []).length ? (
              <ul className="divide-y text-sm">
                {reports!.map(r => (
                  <li key={r.id} className="px-4 py-2 flex justify-between gap-2">
                    <span className="truncate">{r.scope === 'portfolio' ? 'Portfolio' : r.short_code}</span>
                    <span className="text-xs text-muted">{r.report_month}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No reports generated yet.</Empty>}
          </Section>

          <Section title="Details" action={key ? <Link href={manage('client')} className="text-xs text-muted hover:text-navy">Edit →</Link> : null}>
            <dl className="p-4 space-y-2 text-sm">
              <DT label="Address" value={client.address || (key ? <SetLink href={manage('client')} /> : '—')} />
              <DT label="Xero contact" value={client.xero_contact_id || (key ? <SetLink href={manage('client')} /> : '—')} />
              <DT label="Dropbox" value={
                client.dropbox_folder
                  ? `04_CLIENTS/${client.dropbox_folder}`
                  : (
                    <>
                      <span className="text-muted">04_CLIENTS/{client.short_code}</span>
                      {key && <> <SetLink href={manage('client')} /></>}
                    </>
                  )
              } />
              {client.billing_notes && <DT label="Billing notes" value={client.billing_notes} />}
              {client.notes && <DT label="Notes" value={client.notes} />}
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}

function QA({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
        primary ? 'bg-navy text-white hover:bg-blue-900' : 'border border-gray-300 bg-white text-navy hover:border-navy'
      }`}
    >
      {children}
    </Link>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white overflow-hidden">
      <div className="flex items-baseline justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DT({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-muted">{children}</div>;
}

// Inline placeholder shown in the Agreement DT grid when a field is empty.
// Tappable → jumps to the right manage page section to fill it.
function SetLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-orange-700 hover:text-orange-900 italic"
    >
      Set →
    </Link>
  );
}

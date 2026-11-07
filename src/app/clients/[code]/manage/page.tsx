import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import ActionForm from '@/components/action-form';
import Badge from '@/components/badge';
import {
  saveClient, saveAgreement, saveContact, saveProperty, saveServiceLine, saveWorkOrder,
} from '../../actions';
import {
  clientFields, agreementFields, contactFields, propertyFields, serviceLineFields, workOrderFields,
} from '../../fields';
import { AGREEMENT_STATUSES, CONTACT_ROLES, WO_STATUSES, agreementTone, fmtMoney, labelOf, woTone } from '@/lib/clients';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const SECTIONS = ['client', 'agreements', 'contacts', 'properties', 'services', 'jobs'] as const;

export default async function ManageClient({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { key?: string; open?: string };
}) {
  noStore();
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const sb = supabaseServer;
  const code = decodeURIComponent(params.code).toUpperCase();
  const { data: client, error: clientErr } = await sb.from('clients').select('*').eq('short_code', code).maybeSingle();
  if (clientErr) throw new Error(`Could not load client ${code}: ${clientErr.message}`);
  if (!client) return notFound();

  const open = (SECTIONS as readonly string[]).includes(searchParams.open || '') ? searchParams.open! : 'client';

  const [
    { data: agreements },
    { data: contacts },
    { data: properties },
    { data: lines },
    { data: jobs },
    { data: providers },
  ] = await Promise.all([
    sb.from('client_agreements').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
    sb.from('client_contacts').select('*').eq('client_id', client.id).order('active', { ascending: false }).order('is_primary', { ascending: false }).order('name'),
    sb.from('properties').select('*').eq('client_id', client.id).order('active', { ascending: false }).order('short_code'),
    sb.from('service_contracts').select('*').eq('client_id', client.id).order('active', { ascending: false }).order('line_no', { ascending: true, nullsFirst: false }).order('contract_name'),
    sb.from('work_orders').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(100),
    sb.from('providers').select('id, name, trade').eq('active', true).order('name'),
  ]);

  const agOpts = (agreements || []).map(a => ({ value: a.id, label: `${a.agreement_code} • ${a.name}` }));
  const propOpts = (properties || []).filter(p => p.active).map(p => ({ value: p.id, label: `${p.short_code} • ${p.name}` }));
  const provOpts = (providers || []).map(p => ({ value: p.id, label: p.trade ? `${p.name} (${p.trade})` : p.name }));
  const base = { key, client_id: client.id };

  return (
    <div className="max-w-3xl mx-auto">
      <Link href={`/clients/${client.short_code}`} className="text-sm text-muted hover:text-navy">← {client.name}</Link>
      <h1 className="text-2xl font-bold text-navy mt-2">Manage {client.short_code}</h1>
      <p className="text-sm text-muted mb-4">Everything for this client on one page. Tap a section to open it.</p>

      {/* Jump bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sticky top-14 bg-white/95 backdrop-blur z-10 py-2">
        {[
          ['client', 'Details'], ['agreements', 'Agreements'], ['contacts', 'Contacts'],
          ['properties', 'Sites'], ['services', 'Services'], ['jobs', 'Jobs'],
        ].map(([id, label]) => (
          <Link key={id} href={`/clients/${client.short_code}/manage?key=${encodeURIComponent(key)}&open=${id}#${id}`}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm border whitespace-nowrap ${open === id ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-gray-300 hover:border-navy'}`}>
            {label}
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        <Block id="client" title="Client details" open={open === 'client'}>
          <ActionForm action={saveClient} hidden={{ key, id: client.id }} fields={clientFields(client)} submitLabel="Save client" />
        </Block>

        <Block id="agreements" title={`Agreements (${(agreements || []).length})`} open={open === 'agreements'}>
          {(agreements || []).map(a => (
            <Item key={a.id} summary={<>
              <span className="font-mono text-xs text-muted">{a.agreement_code}</span>
              <Badge tone={agreementTone(a.status)}>{labelOf(AGREEMENT_STATUSES, a.status).toUpperCase()}</Badge>
              <span className="font-medium">{a.name}</span>
            </>}>
              <ActionForm action={saveAgreement} hidden={{ ...base, id: a.id }} fields={agreementFields(a)} submitLabel="Save agreement" />
            </Item>
          ))}
          <AddNew label="Add agreement" defaultOpen={open === 'agreements'}>
            <ActionForm action={saveAgreement} hidden={base} fields={agreementFields(undefined)} submitLabel="Add agreement" resetOnSuccess successText="Added" />
          </AddNew>
        </Block>

        <Block id="contacts" title={`Contacts (${(contacts || []).filter(c => c.active).length})`} open={open === 'contacts'}>
          {(contacts || []).map(c => (
            <Item key={c.id} muted={!c.active} summary={<>
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted">{labelOf(CONTACT_ROLES, c.role)}</span>
              {c.is_primary && <Badge tone="ok">PRIMARY</Badge>}
              {!c.active && <Badge tone="muted">ARCHIVED</Badge>}
            </>}>
              <ActionForm action={saveContact} hidden={{ ...base, id: c.id }} fields={contactFields(c)} submitLabel="Save contact" />
            </Item>
          ))}
          <AddNew label="Add contact" defaultOpen={open === 'contacts'}>
            <ActionForm action={saveContact} hidden={base} fields={contactFields(undefined)} submitLabel="Add contact" resetOnSuccess successText="Added" />
          </AddNew>
        </Block>

        <Block id="properties" title={`Sites (${(properties || []).filter(p => p.active).length})`} open={open === 'properties'}>
          {(properties || []).map(p => (
            <Item key={p.id} muted={!p.active} summary={<>
              <span className="font-mono text-xs text-muted">{p.short_code}</span>
              <span className="font-medium">{p.name}</span>
              {!p.active && <Badge tone="muted">INACTIVE</Badge>}
            </>}>
              <ActionForm action={saveProperty} hidden={{ ...base, id: p.id }} fields={propertyFields(p)} submitLabel="Save site" />
            </Item>
          ))}
          <AddNew label="Add site" defaultOpen={open === 'properties'}>
            <ActionForm action={saveProperty} hidden={base} fields={propertyFields(undefined)} submitLabel="Add site" resetOnSuccess successText="Added" />
          </AddNew>
        </Block>

        <Block id="services" title={`Service lines (${(lines || []).filter(l => l.active).length})`} open={open === 'services'}>
          {(lines || []).map(l => (
            <Item key={l.id} muted={!l.active} summary={<>
              {l.line_no != null && <span className="text-xs text-muted">{l.line_no}.</span>}
              <span className="font-medium">{l.contract_name}</span>
              {l.fee_amount != null && <span className="text-xs text-muted">{fmtMoney(l.fee_amount, l.fee_currency || 'FJD')}</span>}
              {!l.active && <Badge tone="muted">INACTIVE</Badge>}
            </>}>
              <ActionForm action={saveServiceLine} hidden={{ ...base, id: l.id }} fields={serviceLineFields(l, agOpts, propOpts, provOpts)} submitLabel="Save line" />
            </Item>
          ))}
          <AddNew label="Add service line" defaultOpen={open === 'services'}>
            <ActionForm action={saveServiceLine} hidden={base}
              fields={serviceLineFields(agOpts.length === 1 ? { agreement_id: agOpts[0].value } : undefined, agOpts, propOpts, provOpts)}
              submitLabel="Add line" resetOnSuccess successText="Added" />
          </AddNew>
        </Block>

        <Block id="jobs" title={`Jobs & work orders (${(jobs || []).length})`} open={open === 'jobs'}>
          <AddNew label="Add job" defaultOpen={open === 'jobs'}>
            <ActionForm action={saveWorkOrder} hidden={base}
              fields={workOrderFields(propOpts.length === 1 ? { property_id: propOpts[0].value } : undefined, propOpts, provOpts)}
              submitLabel="Add job" resetOnSuccess successText="Added" />
          </AddNew>
          {(jobs || []).map(j => (
            <Item key={j.id} summary={<>
              <span className="font-mono text-xs text-muted">{j.wo_number}</span>
              <Badge tone={woTone(j.status)}>{labelOf(WO_STATUSES, j.status).toUpperCase()}</Badge>
              <span className="font-medium">{j.title}</span>
            </>}>
              <ActionForm action={saveWorkOrder} hidden={{ ...base, id: j.id }} fields={workOrderFields(j, propOpts, provOpts)} submitLabel="Save job" />
            </Item>
          ))}
        </Block>
      </div>
    </div>
  );
}

function Block({ id, title, open, children }: { id: string; title: string; open: boolean; children: React.ReactNode }) {
  return (
    <details id={id} open={open} className="rounded-lg border bg-white group scroll-mt-28">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-bold text-navy uppercase tracking-wide">{title}</span>
        <span className="text-muted text-xs group-open:rotate-180 transition">▼</span>
      </summary>
      <div className="border-t p-4 space-y-3">{children}</div>
    </details>
  );
}

function Item({ summary, children, muted }: { summary: React.ReactNode; children: React.ReactNode; muted?: boolean }) {
  return (
    <details className={`rounded-md border ${muted ? 'opacity-70' : ''}`}>
      <summary className="cursor-pointer list-none px-3 py-2.5 flex flex-wrap items-center gap-2 hover:bg-gray-50">
        {summary}
        <span className="ml-auto text-xs text-muted">Edit</span>
      </summary>
      <div className="border-t p-3">{children}</div>
    </details>
  );
}

function AddNew({ label, children, defaultOpen }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-md border border-dashed border-navy/40 bg-blue-50/30">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-navy">+ {label}</summary>
      <div className="border-t border-dashed border-navy/30 p-3">{children}</div>
    </details>
  );
}

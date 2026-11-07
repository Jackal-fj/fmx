import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import Badge from '@/components/badge';
import { AGREEMENT_STATUSES, CLIENT_TYPES, agreementTone, fmtMoney, labelOf, withKey } from '@/lib/clients';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function ClientsPage({ searchParams }: { searchParams: { all?: string } }) {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  const showAll = searchParams.all === '1';

  let q = supabaseServer.from('client_overview').select('*').order('short_code');
  if (!showAll) q = q.eq('active', true);
  const { data: clients, error } = await q;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Clients</h1>
          <p className="text-sm text-muted mt-1">Every client, their agreement, sites and open work in one place.</p>
        </div>
        {key && (
          <Link href={withKey('/clients/new', key)} className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-2 hover:bg-blue-900 whitespace-nowrap">
            + New client
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load clients: {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(clients || []).map((c: any) => (
          <Link
            key={c.id}
            href={`/clients/${c.short_code}`}
            className="rounded-lg border bg-white p-5 hover:border-navy hover:shadow-sm transition block"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-mono text-muted">{c.short_code}</div>
                <h2 className="text-lg font-bold text-navy truncate">{c.name}</h2>
                <div className="text-xs text-muted">{labelOf(CLIENT_TYPES, c.client_type)}{!c.active && ' • Inactive'}</div>
              </div>
              {c.agreement_status && (
                <Badge tone={agreementTone(c.agreement_status)}>{labelOf(AGREEMENT_STATUSES, c.agreement_status).toUpperCase()}</Badge>
              )}
            </div>
            {c.agreement_name && (
              <div className="mt-3 text-sm">
                <span className="font-medium">{c.agreement_name}</span>
                {c.monthly_value_estimate != null && <span className="text-muted"> • {fmtMoney(c.monthly_value_estimate)}/mth</span>}
              </div>
            )}
            <div className="grid grid-cols-4 gap-2 mt-4 text-center">
              <Mini label="Sites" value={c.property_count} />
              <Mini label="Open defects" value={c.open_defects} tone={c.critical_defects ? 'bad' : undefined} />
              <Mini label="Open jobs" value={c.open_work_orders} />
              <Mini label="Services" value={c.service_line_count} />
            </div>
            <div className="mt-4 text-xs text-muted truncate">
              {c.primary_contact_name ? `Contact: ${c.primary_contact_name}` : 'No primary contact yet'}
              {c.primary_contact_phone ? ` • ${c.primary_contact_phone}` : ''}
            </div>
          </Link>
        ))}
      </div>

      {(clients || []).length === 0 && !error && (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">No clients yet.</div>
      )}

      <div className="mt-6 text-xs text-muted">
        {showAll
          ? <Link href="/clients" className="hover:text-navy">Hide inactive clients</Link>
          : <Link href="/clients?all=1" className="hover:text-navy">Show inactive clients</Link>}
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number | null; tone?: 'bad' }) {
  return (
    <div className="rounded-md bg-gray-50 py-2">
      <div className={`text-lg font-bold ${tone === 'bad' ? 'text-bad' : 'text-navy'}`}>{value ?? 0}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted leading-tight">{label}</div>
    </div>
  );
}

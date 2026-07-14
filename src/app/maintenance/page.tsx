import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

type Bucket = 'overdue' | 'this_month' | 'next_60' | 'later' | 'unscheduled';

function bucketFor(days: number | null): Bucket {
  if (days == null) return 'unscheduled';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'this_month';
  if (days <= 60) return 'next_60';
  return 'later';
}

const BUCKET_META: Record<Bucket, { label: string; ring: string; textAccent: string; description: string }> = {
  overdue:     { label: 'Overdue',             ring: 'ring-red-300 bg-red-50',       textAccent: 'text-red-800',    description: 'Past due date — dispatch or log service now' },
  this_month:  { label: 'Due within 30 days',  ring: 'ring-orange-300 bg-orange-50', textAccent: 'text-orange-800', description: 'Schedule this month' },
  next_60:     { label: 'Due within 60 days',  ring: 'ring-yellow-300 bg-yellow-50', textAccent: 'text-yellow-800', description: 'Plan ahead' },
  later:       { label: 'Later',               ring: 'ring-gray-200 bg-white',       textAccent: 'text-muted',      description: 'More than 60 days out' },
  unscheduled: { label: 'No schedule set',     ring: 'ring-gray-300 bg-gray-50',     textAccent: 'text-muted',      description: 'No service interval defined — set one to bring into the schedule' },
};

export default async function MaintenanceDashboard() {
  const key = process.env.QUICK_ADD_SECRET || '';
  const quickAddEnabled = !!key;

  const [{ data: assets }, { data: contracts }, { data: properties }] = await Promise.all([
    supabaseServer
      .from('assets')
      .select(`
        id, asset_code, name, asset_type, current_condition,
        last_serviced_at, next_service_due_at, service_interval_months,
        property:property_id ( short_code, name )
      `)
      .eq('active', true)
      .order('next_service_due_at', { ascending: true, nullsFirst: false }),
    supabaseServer
      .from('service_contracts')
      .select(`
        id, contract_name, discipline, frequency, fee_amount, fee_currency,
        next_service_date, start_date, end_date,
        provider:provider_id ( id, name ),
        property:property_id ( short_code, name )
      `)
      .eq('active', true)
      .order('next_service_date', { ascending: true, nullsFirst: false }),
    supabaseServer
      .from('properties')
      .select('short_code, name')
      .eq('active', true)
      .order('short_code'),
  ]);

  // Bucket assets
  type AssetRow = any;
  const assetBuckets: Record<Bucket, AssetRow[]> = {
    overdue: [], this_month: [], next_60: [], later: [], unscheduled: [],
  };
  for (const a of assets || []) {
    const days = daysFromNow(a.next_service_due_at);
    const b = bucketFor(a.service_interval_months ? days : null);
    assetBuckets[b].push({ ...a, _days: days });
  }

  // Bucket contracts
  type ContractRow = any;
  const contractBuckets: Record<Bucket, ContractRow[]> = {
    overdue: [], this_month: [], next_60: [], later: [], unscheduled: [],
  };
  for (const c of contracts || []) {
    const days = daysFromNow(c.next_service_date);
    contractBuckets[bucketFor(days)].push({ ...c, _days: days });
  }

  const stat = (b: Bucket) => (assetBuckets[b].length + contractBuckets[b].length);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy">Preventative maintenance</h1>
          <p className="text-sm text-muted mt-1">
            Scheduled services grouped by due date. Actions link to the existing Log Service and Dispatch flows.
          </p>
        </div>
        {quickAddEnabled && (
          <Link
            href={`/maintenance/bulk-set?key=${encodeURIComponent(key)}`}
            className="text-sm px-3 py-1.5 rounded-md border border-navy text-navy hover:bg-navy hover:text-white"
          >
            Bulk-set intervals
          </Link>
        )}
      </div>

      {/* --- KPI strip -------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {(['overdue', 'this_month', 'next_60', 'later', 'unscheduled'] as Bucket[]).map(b => (
          <div key={b} className={`rounded-lg ring-1 ring-inset p-3 ${BUCKET_META[b].ring}`}>
            <div className={`text-xs font-semibold ${BUCKET_META[b].textAccent}`}>{BUCKET_META[b].label}</div>
            <div className="text-2xl font-bold text-navy mt-1">{stat(b)}</div>
          </div>
        ))}
      </div>

      {/* --- Buckets in priority order ---------------------------------- */}
      {(['overdue', 'this_month', 'next_60', 'unscheduled'] as Bucket[]).map(b => (
        <BucketSection
          key={b}
          bucket={b}
          assets={assetBuckets[b]}
          contracts={contractBuckets[b]}
          secretKey={key}
        />
      ))}

      {/* --- Later section (collapsed) ---------------------------------- */}
      {(assetBuckets.later.length + contractBuckets.later.length) > 0 && (
        <details className="mb-8">
          <summary className="cursor-pointer text-sm font-semibold text-muted mb-3">
            {BUCKET_META.later.label} ({assetBuckets.later.length + contractBuckets.later.length}) — show
          </summary>
          <BucketSection
            bucket="later"
            assets={assetBuckets.later}
            contracts={contractBuckets.later}
            secretKey={key}
            hideHeading
          />
        </details>
      )}
    </div>
  );
}

function BucketSection({
  bucket, assets, contracts, secretKey, hideHeading = false,
}: {
  bucket: Bucket;
  assets: any[];
  contracts: any[];
  secretKey: string;
  hideHeading?: boolean;
}) {
  const total = assets.length + contracts.length;
  if (total === 0) return null;
  const meta = BUCKET_META[bucket];
  const quickAddEnabled = !!secretKey;

  return (
    <section className="mb-8">
      {!hideHeading && (
        <div className="flex items-baseline justify-between mb-2">
          <h2 className={`text-sm font-bold uppercase tracking-wide ${meta.textAccent}`}>
            {meta.label} <span className="text-muted font-normal">({total})</span>
          </h2>
          <span className="text-xs text-muted">{meta.description}</span>
        </div>
      )}

      {/* Assets */}
      {assets.length > 0 && (
        <div className="rounded-lg border bg-white overflow-hidden mb-3">
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-muted uppercase">
            Assets ({assets.length})
          </div>
          <table className="w-full text-sm">
            <tbody>
              {assets.map(a => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <Link href={`/assets/${a.id}`} className="text-sm font-medium text-navy hover:underline">{a.name}</Link>
                      <span className="text-[11px] text-muted">{a.asset_type}</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      {a.property?.short_code || '—'}
                      {a.asset_code && <span> · {a.asset_code}</span>}
                      {a.service_interval_months && <span> · {a.service_interval_months} mo interval</span>}
                      {a.last_serviced_at && <span> · last {a.last_serviced_at.slice(0, 10)}</span>}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap text-right">
                    <DueChip days={a._days} bucket={bucket} />
                  </td>
                  <td className="p-3 whitespace-nowrap text-right">
                    {quickAddEnabled ? (
                      <Link
                        href={`/service-log/${a.id}?key=${encodeURIComponent(secretKey)}`}
                        className="text-xs px-2 py-1 rounded border border-navy text-navy hover:bg-navy hover:text-white"
                      >Log service</Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Service contracts */}
      {contracts.length > 0 && (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-muted uppercase">
            Service contracts ({contracts.length})
          </div>
          <table className="w-full text-sm">
            <tbody>
              {contracts.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 min-w-0">
                    <div className="text-sm font-medium text-navy">{c.contract_name}</div>
                    <div className="text-[11px] text-muted">
                      {c.property?.short_code || 'Portfolio'}
                      {c.discipline && <span> · {c.discipline}</span>}
                      {c.frequency && <span> · {c.frequency}</span>}
                      {c.provider?.name && <span> · {c.provider.name}</span>}
                      {c.fee_amount && <span> · {c.fee_currency || 'FJD'} {Number(c.fee_amount).toFixed(0)}</span>}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap text-right">
                    <DueChip days={c._days} bucket={bucket} />
                  </td>
                  <td className="p-3"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DueChip({ days, bucket }: { days: number | null; bucket: Bucket }) {
  if (bucket === 'unscheduled') return <span className="text-xs text-muted">No schedule</span>;
  if (days == null) return <span className="text-xs text-muted">—</span>;
  if (days < 0) return <span className="text-xs font-semibold text-red-800">Overdue {Math.abs(days)}d</span>;
  if (days === 0) return <span className="text-xs font-semibold text-orange-800">Due today</span>;
  return <span className={`text-xs ${bucket === 'this_month' ? 'text-orange-800' : bucket === 'next_60' ? 'text-yellow-800' : 'text-muted'}`}>Due in {days}d</span>;
}

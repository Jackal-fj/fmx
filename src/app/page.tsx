import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import StatCard from '@/components/stat-card';
import Badge, { ratingTone, severityTone } from '@/components/badge';
import { unstable_noStore as noStore } from 'next/cache';
import { AGREEMENT_STATUSES, agreementTone, labelOf } from '@/lib/clients';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function Dashboard() {
  noStore();
  const sb = supabaseServer;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Fire all 4 queries in parallel. Total time = slowest single query,
  // not sum of all. Was ~2s sequential; ~500ms in parallel.
  const [
    { data: properties },
    { data: defects },
    { data: recent },
    { data: fcas },
    { data: clients },
  ] = await Promise.all([
    sb.from('properties')
      .select('id, short_code, name, address, tenant_name, client_id')
      .eq('active', true)
      .order('short_code'),
    sb.from('defects')
      .select('property_id, status, severity')
      .neq('status', 'draft'),
    sb.from('defects')
      .select(`
        defect_number, title, severity, identified_at,
        property:property_id ( short_code, name )
      `)
      .neq('status', 'draft')
      .gte('identified_at', fourteenDaysAgo)
      .order('identified_at', { ascending: false })
      .limit(8),
    sb.from('condition_assessments')
      .select('property_id, overall_rating, numeric_score, assessed_at')
      .order('assessed_at', { ascending: false }),
    sb.from('client_overview')
      .select('id, short_code, name, agreement_status, property_count, open_defects, critical_defects, open_work_orders')
      .eq('active', true)
      .order('short_code'),
  ]);

  // Only count defects on active properties (keeps totals consistent with cards).
  const activePropIds = new Set((properties || []).map(p => p.id));
  const liveDefects = (defects || []).filter(d => activePropIds.has(d.property_id));
  const propsByClient = new Map<string, NonNullable<typeof properties>>();
  for (const p of properties || []) {
    if (!propsByClient.has(p.client_id)) propsByClient.set(p.client_id, []);
    propsByClient.get(p.client_id)!.push(p);
  }

  const totalOpen = liveDefects.filter(d =>
    d.status === 'open' || d.status === 'work_ordered',
  ).length;
  const totalCritical = liveDefects.filter(d =>
    (d.status === 'open' || d.status === 'work_ordered') && d.severity === 'critical',
  ).length;
  const totalMajor = liveDefects.filter(d =>
    (d.status === 'open' || d.status === 'work_ordered') && d.severity === 'major',
  ).length;

  // FCA latest per property
  const fcaByProp = new Map<string, { rating: string | null; score: number | null; date: string | null }>();
  for (const f of fcas || []) {
    if (!fcaByProp.has(f.property_id)) {
      fcaByProp.set(f.property_id, {
        rating: f.overall_rating,
        score: f.numeric_score == null ? null : Number(f.numeric_score),
        date: (f.assessed_at || '').slice(0, 10),
      });
    }
  }

  // Defect counts per property
  const defByProp = new Map<string, number>();
  for (const d of liveDefects) {
    if (d.status === 'open' || d.status === 'work_ordered') {
      defByProp.set(d.property_id, (defByProp.get(d.property_id) || 0) + 1);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy">Portfolio</h1>
        <p className="text-muted mt-1">
          {(clients || []).length} client{(clients || []).length === 1 ? '' : 's'}  •  {properties?.length ?? 0} sites  •  Fiji
        </p>
      </div>

      {/* Client strip: one tap into any client hub */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
        {(clients || []).map((c: any) => (
          <Link key={c.id} href={`/clients/${c.short_code}`}
            className="shrink-0 w-60 sm:w-auto rounded-lg border bg-white p-4 hover:border-navy hover:shadow-sm transition">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted">{c.short_code}</span>
              {c.agreement_status && <Badge tone={agreementTone(c.agreement_status)}>{labelOf(AGREEMENT_STATUSES, c.agreement_status).toUpperCase()}</Badge>}
            </div>
            <div className="font-bold text-navy truncate mt-1">{c.name}</div>
            <div className="text-xs text-muted mt-1">
              {c.property_count} site{c.property_count === 1 ? '' : 's'}  •  {c.open_defects} open defects{c.critical_defects ? ` (${c.critical_defects} critical)` : ''}  •  {c.open_work_orders} jobs
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Sites" value={properties?.length ?? 0} hint="Active under FMX" />
        <StatCard label="Open defects" value={totalOpen} tone={totalOpen > 30 ? 'warn' : 'navy'} />
        <StatCard label="Critical open" value={totalCritical} tone={totalCritical ? 'bad' : 'navy'} />
        <StatCard label="Major open" value={totalMajor} tone={totalMajor ? 'warn' : 'navy'} />
      </div>

      {(recent && recent.length > 0) && (
        <div className="mb-8 rounded-lg border bg-white">
          <div className="flex items-baseline justify-between p-4 border-b">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Recent defects — last 14 days</h2>
            <Link href="/defects" className="text-xs text-muted hover:text-navy">View all →</Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {recent.map((d: any) => (
                <tr key={d.defect_number} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-muted whitespace-nowrap">{d.defect_number}</td>
                  <td className="px-3 py-2"><Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                    {d.property ? (
                      <Link href={`/properties/${d.property.short_code}`} className="hover:text-navy">{d.property.short_code}</Link>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">{d.title}</td>
                  <td className="px-4 py-2 text-xs text-muted whitespace-nowrap">{(d.identified_at || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(clients || []).filter((c: any) => propsByClient.has(c.id)).map((c: any) => (
      <section key={c.id} className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">{c.name}</h2>
          <Link href={`/clients/${c.short_code}`} className="text-xs text-muted hover:text-navy">Client hub →</Link>
        </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {propsByClient.get(c.id)!.map((p) => {
          const fca = fcaByProp.get(p.id);
          const open = defByProp.get(p.id) || 0;
          return (
            <Link
              href={`/properties/${p.short_code}`}
              key={p.id}
              className="rounded-lg border bg-white p-5 hover:border-navy hover:shadow-sm transition"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold">{p.name}</h2>
                <span className="text-sm text-muted whitespace-nowrap shrink-0 ml-2">{p.short_code}</span>
              </div>
              <p className="text-sm text-muted mb-4">{p.address}</p>
              <div className="text-xs text-muted">Tenant</div>
              <div className="text-sm mb-4">{p.tenant_name || '—'}</div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted mb-1">FCA</div>
                  {fca ? (
                    <div className="flex items-center gap-2">
                      <Badge tone={ratingTone(fca.rating)}>{(fca.rating || '—').toUpperCase()}</Badge>
                      <span className="text-sm font-bold">{fca.score?.toFixed(2) ?? '—'}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted">No record</span>
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted mb-1">Open defects</div>
                  <div className={`text-lg font-bold ${open > 10 ? 'text-warn' : 'text-navy'}`}>{open}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      </section>
      ))}
    </div>
  );
}

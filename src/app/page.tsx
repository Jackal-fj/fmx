import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import StatCard from '@/components/stat-card';
import Badge, { ratingTone, severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const sb = supabaseServer;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Fire all 4 queries in parallel. Total time = slowest single query,
  // not sum of all. Was ~2s sequential; ~500ms in parallel.
  const [
    { data: properties },
    { data: defects },
    { data: recent },
    { data: fcas },
  ] = await Promise.all([
    sb.from('properties')
      .select('id, short_code, name, address, tenant_name')
      .eq('active', true)
      .order('short_code'),
    sb.from('defects')
      .select('property_id, status, severity'),
    sb.from('defects')
      .select(`
        defect_number, title, severity, identified_at,
        property:property_id ( short_code, name )
      `)
      .gte('identified_at', fourteenDaysAgo)
      .order('identified_at', { ascending: false })
      .limit(8),
    sb.from('condition_assessments')
      .select('property_id, overall_rating, numeric_score, assessed_at')
      .order('assessed_at', { ascending: false }),
  ]);

  const totalOpen = (defects || []).filter(d =>
    d.status === 'open' || d.status === 'work_ordered',
  ).length;
  const totalCritical = (defects || []).filter(d =>
    (d.status === 'open' || d.status === 'work_ordered') && d.severity === 'critical',
  ).length;
  const totalMajor = (defects || []).filter(d =>
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
  for (const d of defects || []) {
    if (d.status === 'open' || d.status === 'work_ordered') {
      defByProp.set(d.property_id, (defByProp.get(d.property_id) || 0) + 1);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy">KGF Portfolio</h1>
        <p className="text-muted mt-1">
          Kinetic Growth Fund  •  3 properties  •  Suva, Fiji
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Properties" value={properties?.length ?? 0} hint="Active under FMX" />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(properties || []).map((p) => {
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
                <span className="text-sm text-muted">{p.short_code}</span>
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
    </div>
  );
}

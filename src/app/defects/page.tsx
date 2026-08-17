import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge, { severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

type Filter = 'open' | 'resolved' | 'all';

const FILTER_LABEL: Record<Filter, string> = {
  open: 'Open',
  resolved: 'Resolved',
  all: 'All',
};

function parseFilter(raw?: string): Filter {
  const v = (raw || '').toLowerCase();
  if (v === 'resolved') return 'resolved';
  if (v === 'all') return 'all';
  return 'open';   // default
}

export default async function DefectsList({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const filter = parseFilter(searchParams.status);

  // Build the defect query with the appropriate status filter
  let query = supabaseServer
    .from('defects')
    .select(`
      defect_number, title, severity, status, identified_at, resolved_at,
      property:property_id ( short_code, name )
    `)
    .order('identified_at', { ascending: false })
    .limit(500);

  if (filter === 'open') {
    query = query.in('status', ['open', 'work_ordered']);
  } else if (filter === 'resolved') {
    query = query.eq('status', 'resolved');
  }
  // filter === 'all' → no status constraint

  // Pull filter counts in parallel with the main query
  const [{ data: defects }, { data: countsRows }] = await Promise.all([
    query,
    supabaseServer.from('defects').select('status'),
  ]);

  const allRows = countsRows || [];
  const openCount = allRows.filter(r => r.status === 'open' || r.status === 'work_ordered').length;
  const resolvedCount = allRows.filter(r => r.status === 'resolved').length;
  const allCount = allRows.length;

  const counts: Record<Filter, number> = {
    open: openCount,
    resolved: resolvedCount,
    all: allCount,
  };

  const displayed = defects || [];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-navy">Defects</h1>
        <div className="text-xs text-muted">
          Showing {displayed.length} {filter === 'all' ? '' : filter} defect{displayed.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(['open', 'resolved', 'all'] as Filter[]).map(f => {
          const active = f === filter;
          const href = f === 'open' ? '/defects' : `/defects?status=${f}`;
          return (
            <Link
              key={f}
              href={href}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-muted border-gray-300 hover:border-navy hover:text-navy'
              }`}
            >
              {FILTER_LABEL[f]} ({counts[f]})
            </Link>
          );
        })}
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          {filter === 'open' && 'No open defects. Nothing needs attention right now.'}
          {filter === 'resolved' && 'No resolved defects on record.'}
          {filter === 'all' && 'No defects on record.'}
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent text-navy">
              <tr>
                <th className="text-left p-3">Ref</th>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">Severity</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Identified</th>
                {filter !== 'open' && <th className="text-left p-3">Resolved</th>}
              </tr>
            </thead>
            <tbody>
              {displayed.map((d: any) => (
                <tr key={d.defect_number} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">
                    <Link href={`/defects/${encodeURIComponent(d.defect_number)}`} className="text-navy hover:underline">
                      {d.defect_number}
                    </Link>
                  </td>
                  <td className="p-3">
                    {d.property ? (
                      <Link href={`/properties/${d.property.short_code}`} className="text-navy hover:underline">
                        {d.property.short_code}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    <Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge>
                  </td>
                  <td className="p-3">
                    <Link href={`/defects/${encodeURIComponent(d.defect_number)}`} className="text-navy hover:underline">
                      {d.title}
                    </Link>
                  </td>
                  <td className="p-3 text-muted">{(d.status || '').replace('_', ' ')}</td>
                  <td className="p-3 text-muted text-xs">{(d.identified_at || '').slice(0, 10)}</td>
                  {filter !== 'open' && (
                    <td className="p-3 text-muted text-xs">
                      {d.resolved_at ? d.resolved_at.slice(0, 10) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

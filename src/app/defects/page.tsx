import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge, { severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

type StatusFilter = 'open' | 'resolved' | 'all';
type SeverityFilter = 'all' | 'critical' | 'major' | 'moderate' | 'minor';

const STATUS_LABEL: Record<StatusFilter, string> = { open: 'Open', resolved: 'Resolved', all: 'All' };
const SEVERITY_LABEL: Record<SeverityFilter, string> = {
  all: 'All', critical: 'Critical', major: 'Major', moderate: 'Moderate', minor: 'Minor',
};

function parseStatus(raw?: string): StatusFilter {
  const v = (raw || '').toLowerCase();
  if (v === 'resolved') return 'resolved';
  if (v === 'all') return 'all';
  return 'open';
}
function parseSeverity(raw?: string): SeverityFilter {
  const v = (raw || '').toLowerCase();
  if (['critical', 'major', 'moderate', 'minor'].includes(v)) return v as SeverityFilter;
  return 'all';
}
function parseProperty(raw?: string, valid: string[] = []): string {
  const v = (raw || '').toUpperCase();
  if (valid.includes(v)) return v;
  return 'ALL';
}

// Build a URL string for /defects with the given filter set, preserving defaults
function buildHref(f: { status: StatusFilter; property: string; severity: SeverityFilter }): string {
  const params = new URLSearchParams();
  if (f.status !== 'open') params.set('status', f.status);
  if (f.property !== 'ALL') params.set('property', f.property);
  if (f.severity !== 'all') params.set('severity', f.severity);
  const qs = params.toString();
  return qs ? `/defects?${qs}` : '/defects';
}

export default async function DefectsList({
  searchParams,
}: {
  searchParams: { status?: string; property?: string; severity?: string };
}) {
  // Fetch properties list first so we can validate the property filter
  const { data: properties } = await supabaseServer
    .from('properties')
    .select('short_code, name')
    .eq('active', true)
    .order('short_code');
  const propertyCodes = (properties || []).map(p => p.short_code);

  const status = parseStatus(searchParams.status);
  const severity = parseSeverity(searchParams.severity);
  const property = parseProperty(searchParams.property, propertyCodes);

  // Build the defect query with all three filters
  let query = supabaseServer
    .from('defects')
    .select(`
      defect_number, title, severity, status, identified_at, resolved_at,
      property:property_id ( short_code, name )
    `)
    .order('identified_at', { ascending: false })
    .limit(500);

  if (status === 'open') query = query.in('status', ['open', 'work_ordered']);
  else if (status === 'resolved') query = query.eq('status', 'resolved');
  if (severity !== 'all') query = query.eq('severity', severity);
  if (property !== 'ALL') {
    const propRow = (properties || []).find(p => p.short_code === property);
    if (propRow) {
      // Need to filter by property_id — do it via a separate lookup
      const { data: propIdRow } = await supabaseServer
        .from('properties')
        .select('id')
        .eq('short_code', property)
        .maybeSingle();
      if (propIdRow) query = query.eq('property_id', propIdRow.id);
    }
  }

  // Also pull all-status rows for count calculations
  const { data: allDefects } = await supabaseServer
    .from('defects')
    .select('status, severity, property:property_id ( short_code )');

  const { data: defects } = await query;
  const displayed = defects || [];

  // Compute counts respecting the OTHER active filters (so each filter row's
  // counts reflect what you'd get if you clicked that specific chip).
  const rows = (allDefects || []) as any[];
  function countBy(dim: 'status' | 'property' | 'severity', value: string): number {
    return rows.filter(r => {
      // Apply the OTHER two filters
      if (dim !== 'status') {
        if (status === 'open' && !(r.status === 'open' || r.status === 'work_ordered')) return false;
        if (status === 'resolved' && r.status !== 'resolved') return false;
      }
      if (dim !== 'severity') {
        if (severity !== 'all' && r.severity !== severity) return false;
      }
      if (dim !== 'property') {
        if (property !== 'ALL' && r.property?.short_code !== property) return false;
      }
      // Apply the value being counted for this dimension
      if (dim === 'status') {
        if (value === 'open') return r.status === 'open' || r.status === 'work_ordered';
        if (value === 'resolved') return r.status === 'resolved';
        return true;   // 'all'
      }
      if (dim === 'severity') {
        return value === 'all' ? true : r.severity === value;
      }
      // property
      return value === 'ALL' ? true : r.property?.short_code === value;
    }).length;
  }

  const hasActiveFilters = status !== 'open' || property !== 'ALL' || severity !== 'all';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-navy">Defects</h1>
        <div className="text-xs text-muted">
          Showing {displayed.length} defect{displayed.length === 1 ? '' : 's'}
          {hasActiveFilters && (
            <>
              {' · '}
              <Link href="/defects" className="text-navy hover:underline">Clear filters</Link>
            </>
          )}
        </div>
      </div>

      {/* --- Status filter --- */}
      <FilterRow label="Status">
        {(['open', 'resolved', 'all'] as StatusFilter[]).map(f => (
          <Chip
            key={f}
            href={buildHref({ status: f, property, severity })}
            active={status === f}
            label={`${STATUS_LABEL[f]} (${countBy('status', f)})`}
          />
        ))}
      </FilterRow>

      {/* --- Property filter --- */}
      <FilterRow label="Property">
        <Chip
          href={buildHref({ status, property: 'ALL', severity })}
          active={property === 'ALL'}
          label={`All (${countBy('property', 'ALL')})`}
        />
        {(properties || []).map(p => (
          <Chip
            key={p.short_code}
            href={buildHref({ status, property: p.short_code, severity })}
            active={property === p.short_code}
            label={`${p.short_code} (${countBy('property', p.short_code)})`}
          />
        ))}
      </FilterRow>

      {/* --- Severity filter --- */}
      <FilterRow label="Severity">
        {(['all', 'critical', 'major', 'moderate', 'minor'] as SeverityFilter[]).map(f => (
          <Chip
            key={f}
            href={buildHref({ status, property, severity: f })}
            active={severity === f}
            label={`${SEVERITY_LABEL[f]} (${countBy('severity', f)})`}
          />
        ))}
      </FilterRow>

      <div className="mb-2" />

      {displayed.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No defects match the current filter combination.
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
                {status !== 'open' && <th className="text-left p-3">Resolved</th>}
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
                  {status !== 'open' && (
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

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-muted w-16 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        active
          ? 'bg-navy text-white border-navy'
          : 'bg-white text-muted border-gray-300 hover:border-navy hover:text-navy'
      }`}
    >
      {label}
    </Link>
  );
}

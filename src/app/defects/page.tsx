import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import Badge, { severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type StatusFilter = 'open' | 'resolved' | 'all';
type SeverityFilter = 'all' | 'critical' | 'major' | 'moderate' | 'minor';
type GroupBy = 'none' | 'severity' | 'trade' | 'property' | 'month';
type SortBy = 'date_desc' | 'date_asc' | 'severity' | 'updated' | 'number';

const STATUS_LABEL: Record<StatusFilter, string> = { open: 'Open', resolved: 'Resolved', all: 'All' };
const SEVERITY_LABEL: Record<SeverityFilter, string> = {
  all: 'All', critical: 'Critical', major: 'Major', moderate: 'Moderate', minor: 'Minor',
};
const GROUP_LABEL: Record<GroupBy, string> = {
  none: 'None', severity: 'Severity', trade: 'Trade', property: 'Property', month: 'Month logged',
};
const SORT_LABEL: Record<SortBy, string> = {
  date_desc: 'Date logged (newest)', date_asc: 'Date logged (oldest)',
  severity: 'Severity (critical first)', updated: 'Last updated', number: 'Defect number',
};
const SEVERITY_ORDER: Record<string, number> = { critical: 0, major: 1, moderate: 2, minor: 3 };

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
function parseGroup(raw?: string): GroupBy {
  const v = (raw || '').toLowerCase();
  if (['severity', 'trade', 'property', 'month'].includes(v)) return v as GroupBy;
  return 'none';
}
function parseSort(raw?: string): SortBy {
  const v = (raw || '').toLowerCase();
  if (['date_asc', 'severity', 'updated', 'number'].includes(v)) return v as SortBy;
  return 'date_desc';
}

type Filters = {
  status: StatusFilter; property: string; severity: SeverityFilter; client: string;
  group: GroupBy; sort: SortBy;
};
function buildHref(f: Filters): string {
  const params = new URLSearchParams();
  if (f.client !== 'ALL') params.set('client', f.client);
  if (f.status !== 'open') params.set('status', f.status);
  if (f.property !== 'ALL') params.set('property', f.property);
  if (f.severity !== 'all') params.set('severity', f.severity);
  if (f.group !== 'none') params.set('group', f.group);
  if (f.sort !== 'date_desc') params.set('sort', f.sort);
  const qs = params.toString();
  return qs ? `/defects?${qs}` : '/defects';
}

export default async function DefectsList({
  searchParams,
}: {
  searchParams: { status?: string; property?: string; severity?: string; client?: string; group?: string; sort?: string };
}) {
  noStore();   // hard opt-out of Data Cache for every request

  const quickAddKey = process.env.QUICK_ADD_SECRET || '';
  const canDispatch = !!quickAddKey;
  const keyParam = canDispatch ? `?key=${encodeURIComponent(quickAddKey)}` : '';

  // Fetch clients + properties for the filter chips
  const [{ data: clients }, { data: allProperties }] = await Promise.all([
    supabaseServer
      .from('clients')
      .select('short_code, name')
      .eq('active', true)
      .order('short_code'),
    supabaseServer
      .from('properties')
      .select('short_code, name, client:client_id ( short_code )')
      .eq('active', true)
      .order('short_code'),
  ]);

  const clientCodes = (clients || []).map(c => c.short_code);
  const client = (searchParams.client || 'ALL').toUpperCase();
  const clientFilter = clientCodes.includes(client) ? client : 'ALL';

  // Properties scoped to the selected client (or all if ALL).
  const properties = (allProperties || []).filter((p: any) =>
    clientFilter === 'ALL' || (p.client as { short_code: string } | null)?.short_code === clientFilter,
  );
  const propertyCodes = properties.map(p => p.short_code);

  const status = parseStatus(searchParams.status);
  const severity = parseSeverity(searchParams.severity);
  const property = parseProperty(searchParams.property, propertyCodes);
  const group = parseGroup(searchParams.group);
  const sort = parseSort(searchParams.sort);

  // Build the defect query with all four filters.
  // Drafts are hidden here — they live at /email-inbox until Carl promotes them.
  let query = supabaseServer
    .from('defects')
    .select(`
      defect_number, title, severity, status, identified_at, resolved_at, updated_at, trade,
      property:property_id ( short_code, name, client:client_id ( short_code ) )
    `)
    .neq('status', 'draft')
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

  // Also pull all-status rows for count calculations (drafts excluded).
  const { data: allDefects } = await supabaseServer
    .from('defects')
    .select('status, severity, property:property_id ( short_code, client:client_id ( short_code ) )')
    .neq('status', 'draft');

  const { data: defects } = await query;
  // Apply client filter client-side (nested join filter in Supabase JS is awkward).
  const displayed = (defects || []).filter((d: any) => {
    if (clientFilter === 'ALL') return true;
    return (d.property?.client as { short_code: string } | null)?.short_code === clientFilter;
  });

  // Compute counts respecting the OTHER active filters (so each filter row's
  // counts reflect what you'd get if you clicked that specific chip).
  const rows = (allDefects || []) as any[];
  function matchesClient(r: any, value: string): boolean {
    if (value === 'ALL') return true;
    return (r.property?.client as { short_code: string } | null)?.short_code === value;
  }
  function countBy(dim: 'status' | 'property' | 'severity' | 'client', value: string): number {
    return rows.filter(r => {
      // Apply the OTHER three filters
      if (dim !== 'client') {
        if (!matchesClient(r, clientFilter)) return false;
      }
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
      if (dim === 'client') return matchesClient(r, value);
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

  const hasActiveFilters = clientFilter !== 'ALL' || status !== 'open' || property !== 'ALL' || severity !== 'all' || group !== 'none' || sort !== 'date_desc';

  // --- Sort the displayed defects per the `sort` selector ------------------
  const sortedDisplayed = displayed.slice().sort((a: any, b: any) => {
    if (sort === 'severity') {
      const sa = SEVERITY_ORDER[a.severity] ?? 9;
      const sb = SEVERITY_ORDER[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return (b.identified_at || '').localeCompare(a.identified_at || '');
    }
    if (sort === 'date_asc') return (a.identified_at || '').localeCompare(b.identified_at || '');
    if (sort === 'updated')  return (b.updated_at || b.identified_at || '').localeCompare(a.updated_at || a.identified_at || '');
    if (sort === 'number')   return a.defect_number.localeCompare(b.defect_number);
    return (b.identified_at || '').localeCompare(a.identified_at || '');   // date_desc default
  });

  // --- Group the sorted defects per the `group` selector -------------------
  function groupKey(d: any): string {
    if (group === 'severity') return (d.severity || '—').toUpperCase();
    if (group === 'trade')    return d.trade || '— Untagged';
    if (group === 'property') return d.property?.short_code || '—';
    if (group === 'month')    return (d.identified_at || '').slice(0, 7) || '—';
    return '';
  }
  const grouped = new Map<string, any[]>();
  for (const d of sortedDisplayed) {
    const k = groupKey(d);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(d);
  }
  // Order groups sensibly
  const groupOrder = Array.from(grouped.keys()).sort((a, b) => {
    if (group === 'severity') return (SEVERITY_ORDER[a.toLowerCase()] ?? 9) - (SEVERITY_ORDER[b.toLowerCase()] ?? 9);
    if (group === 'month')    return b.localeCompare(a);   // newest month first
    if (a === '— Untagged') return 1;
    if (b === '— Untagged') return -1;
    return a.localeCompare(b);
  });

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

      {/* --- Client filter --- */}
      {(clients || []).length > 1 && (
        <FilterRow label="Client">
          <Chip
            href={buildHref({ status, property: 'ALL', severity, client: 'ALL', group, sort })}
            active={clientFilter === 'ALL'}
            label={`All (${countBy('client', 'ALL')})`}
          />
          {(clients || []).map(c => (
            <Chip
              key={c.short_code}
              href={buildHref({ status, property: 'ALL', severity, client: c.short_code, group, sort })}
              active={clientFilter === c.short_code}
              label={`${c.short_code} (${countBy('client', c.short_code)})`}
            />
          ))}
        </FilterRow>
      )}

      {/* --- Status filter --- */}
      <FilterRow label="Status">
        {(['open', 'resolved', 'all'] as StatusFilter[]).map(f => (
          <Chip
            key={f}
            href={buildHref({ status: f, property, severity, client: clientFilter, group, sort })}
            active={status === f}
            label={`${STATUS_LABEL[f]} (${countBy('status', f)})`}
          />
        ))}
      </FilterRow>

      {/* --- Property filter --- */}
      <FilterRow label="Property">
        <Chip
          href={buildHref({ status, property: 'ALL', severity, client: clientFilter, group, sort })}
          active={property === 'ALL'}
          label={`All (${countBy('property', 'ALL')})`}
        />
        {(properties || []).map(p => (
          <Chip
            key={p.short_code}
            href={buildHref({ status, property: p.short_code, severity, client: clientFilter, group, sort })}
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
            href={buildHref({ status, property, severity: f, client: clientFilter, group, sort })}
            active={severity === f}
            label={`${SEVERITY_LABEL[f]} (${countBy('severity', f)})`}
          />
        ))}
      </FilterRow>

      {/* --- Group-by + Sort-by selectors --- */}
      <FilterRow label="Group by">
        {(['none', 'severity', 'trade', 'property', 'month'] as GroupBy[]).map(g => (
          <Chip
            key={g}
            href={buildHref({ status, property, severity, client: clientFilter, group: g, sort })}
            active={group === g}
            label={GROUP_LABEL[g]}
          />
        ))}
      </FilterRow>
      <FilterRow label="Sort by">
        {(['date_desc', 'date_asc', 'severity', 'updated', 'number'] as SortBy[]).map(s => (
          <Chip
            key={s}
            href={buildHref({ status, property, severity, client: clientFilter, group, sort: s })}
            active={sort === s}
            label={SORT_LABEL[s]}
          />
        ))}
      </FilterRow>

      <div className="mb-2" />

      {sortedDisplayed.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No defects match the current filter combination.
        </div>
      ) : group === 'none' ? (
        <div className="rounded-lg border bg-white overflow-hidden">
          {/* Mobile: list-cards (one per defect). Desktop: full table. */}
          <ul className="md:hidden divide-y">
            {sortedDisplayed.map((d: any) => {
              const isOpenState = d.status === 'open' || d.status === 'work_ordered';
              const highlightHref = `/defects/${encodeURIComponent(d.defect_number)}?highlight=1`;
              return (
                <li key={d.defect_number} className="relative">
                  <Link href={highlightHref} className="block px-4 py-3 hover:bg-blue-50/40 min-h-[44px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-navy">{d.defect_number}</span>
                      <Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge>
                      {d.property && <span className="text-xs text-muted">{d.property.short_code}</span>}
                      <span className="ml-auto text-[11px] text-muted whitespace-nowrap">
                        {(d.status || '').replace('_', ' ')} · {(d.identified_at || '').slice(0, 10)}
                      </span>
                    </div>
                    <div className="text-sm text-navy mt-1">{d.title}</div>
                    {status !== 'open' && d.resolved_at && (
                      <div className="text-[11px] text-muted mt-0.5">Resolved {d.resolved_at.slice(0, 10)}</div>
                    )}
                  </Link>
                  {canDispatch && isOpenState && (
                    <Link
                      href={`/dispatch/${encodeURIComponent(d.defect_number)}${keyParam}`}
                      className="absolute right-3 bottom-3 text-xs px-2.5 py-1 rounded-md bg-green-700 text-white hover:bg-green-800"
                    >
                      Raise WO
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-accent text-navy">
              <tr>
                <th className="text-left p-3">Ref</th>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">Severity</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Identified</th>
                {status !== 'open' && <th className="text-left p-3">Resolved</th>}
                {canDispatch && <th className="text-left p-3">Action</th>}
              </tr>
            </thead>
            <tbody>
              {sortedDisplayed.map((d: any) => {
                const isOpenState = d.status === 'open' || d.status === 'work_ordered';
                const highlightHref = `/defects/${encodeURIComponent(d.defect_number)}?highlight=1`;
                return (
                <tr key={d.defect_number} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">
                    <Link href={highlightHref} className="text-navy hover:underline">
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
                    <Link href={highlightHref} className="text-navy hover:underline">
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
                  {canDispatch && (
                    <td className="p-3 whitespace-nowrap">
                      {isOpenState ? (
                        <Link
                          href={`/dispatch/${encodeURIComponent(d.defect_number)}${keyParam}`}
                          className="text-xs px-2.5 py-1 rounded-md bg-green-700 text-white hover:bg-green-800 inline-block"
                        >
                          Raise WO
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grouped view — a card per group, list-cards inside each. */
        <div className="space-y-3">
          {groupOrder.map(k => {
            const rows = grouped.get(k) || [];
            return (
              <div key={k} className="rounded-lg border bg-white overflow-hidden">
                <div className="flex items-baseline justify-between px-4 py-2 border-b bg-gray-50">
                  <h2 className="text-sm font-bold text-navy">{k}</h2>
                  <span className="text-xs text-muted">{rows.length} defect{rows.length === 1 ? '' : 's'}</span>
                </div>
                <ul className="divide-y">
                  {rows.map((d: any) => {
                    const isOpenState = d.status === 'open' || d.status === 'work_ordered';
                    const highlightHref = `/defects/${encodeURIComponent(d.defect_number)}?highlight=1`;
                    return (
                      <li key={d.defect_number} className="relative">
                        <Link href={highlightHref} className="block px-4 py-3 hover:bg-blue-50/40 min-h-[44px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-navy">{d.defect_number}</span>
                            <Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge>
                            {d.property && <span className="text-xs text-muted">{d.property.short_code}</span>}
                            {d.trade && <span className="text-xs text-muted">· {d.trade}</span>}
                            <span className="ml-auto text-[11px] text-muted whitespace-nowrap">
                              {(d.status || '').replace('_', ' ')} · {(d.identified_at || '').slice(0, 10)}
                            </span>
                          </div>
                          <div className="text-sm text-navy mt-1">{d.title}</div>
                        </Link>
                        {canDispatch && isOpenState && (
                          <Link
                            href={`/dispatch/${encodeURIComponent(d.defect_number)}${keyParam}`}
                            className="absolute right-3 bottom-3 text-xs px-2.5 py-1 rounded-md bg-green-700 text-white hover:bg-green-800"
                          >
                            Raise WO
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
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

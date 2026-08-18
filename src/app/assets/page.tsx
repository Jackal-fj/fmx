import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone } from '@/components/badge';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type StatusFilter = 'active' | 'retired' | 'all';
type ConditionFilter = 'all' | 'excellent' | 'good' | 'adequate' | 'marginal' | 'poor' | 'failed';

const STATUS_LABEL: Record<StatusFilter, string> = { active: 'Active', retired: 'Retired', all: 'All' };
const CONDITION_LABEL: Record<ConditionFilter, string> = {
  all: 'All',
  excellent: 'Excellent',
  good: 'Good',
  adequate: 'Adequate',
  marginal: 'Marginal',
  poor: 'Poor',
  failed: 'Failed',
};

function parseStatus(raw?: string): StatusFilter {
  const v = (raw || '').toLowerCase();
  if (v === 'retired') return 'retired';
  if (v === 'all') return 'all';
  return 'active';
}
function parseCondition(raw?: string): ConditionFilter {
  const v = (raw || '').toLowerCase();
  if (['excellent', 'good', 'adequate', 'marginal', 'poor', 'failed'].includes(v)) {
    return v as ConditionFilter;
  }
  return 'all';
}
function parseProperty(raw?: string, valid: string[] = []): string {
  const v = (raw || '').toUpperCase();
  if (valid.includes(v)) return v;
  return 'ALL';
}
function parseType(raw: string | undefined, valid: string[]): string {
  const v = (raw || '').trim();
  if (v && valid.includes(v)) return v;
  return 'ALL';
}

function buildHref(f: {
  status: StatusFilter; property: string; condition: ConditionFilter; type: string;
}): string {
  const params = new URLSearchParams();
  if (f.status !== 'active') params.set('status', f.status);
  if (f.property !== 'ALL') params.set('property', f.property);
  if (f.condition !== 'all') params.set('condition', f.condition);
  if (f.type !== 'ALL') params.set('type', f.type);
  const qs = params.toString();
  return qs ? `/assets?${qs}` : '/assets';
}

export default async function AssetsList({
  searchParams,
}: {
  searchParams: {
    deleted?: string;
    status?: string;
    property?: string;
    condition?: string;
    type?: string;
  };
}) {
  noStore();

  const key = process.env.QUICK_ADD_SECRET || '';
  const quickAddEnabled = !!key;
  const deletedName = searchParams.deleted;

  // Fetch properties and pre-fetch all assets once for filter counts + type list
  const [{ data: properties }, { data: allAssets }] = await Promise.all([
    supabaseServer.from('properties').select('id, short_code, name').eq('active', true).order('short_code'),
    supabaseServer.from('assets').select(`active, asset_type, current_condition, property:property_id ( short_code )`),
  ]);

  const propertyCodes = (properties || []).map(p => p.short_code);
  const allRows = (allAssets || []) as any[];

  // Derive the distinct type list from all assets (so type chips only show types that exist)
  const typeSet = new Set<string>();
  for (const a of allRows) if (a.asset_type) typeSet.add(a.asset_type);
  const typeList = Array.from(typeSet).sort();

  const status    = parseStatus(searchParams.status);
  const property  = parseProperty(searchParams.property, propertyCodes);
  const condition = parseCondition(searchParams.condition);
  const type      = parseType(searchParams.type, typeList);

  // Build the main asset query with all four filters
  let query = supabaseServer
    .from('assets')
    .select(`
      id, asset_code, name, asset_type, make, model, current_condition, active, created_at,
      property:property_id ( short_code, name )
    `)
    .order('created_at', { ascending: false })
    .order('asset_code', { ascending: true, nullsFirst: false })
    .limit(500);

  if (status === 'active') query = query.eq('active', true);
  else if (status === 'retired') query = query.eq('active', false);
  if (condition !== 'all') query = query.eq('current_condition', condition);
  if (type !== 'ALL') query = query.eq('asset_type', type);
  if (property !== 'ALL') {
    const propId = (properties || []).find(p => p.short_code === property)?.id;
    if (propId) query = query.eq('property_id', propId);
  }

  const { data: assets } = await query;
  const displayed = assets || [];

  // Count helper — respects the OTHER active filters so counts reflect what you'd
  // get by clicking that specific chip.
  function countBy(dim: 'status' | 'property' | 'condition' | 'type', value: string): number {
    return allRows.filter(r => {
      if (dim !== 'status') {
        if (status === 'active' && r.active !== true) return false;
        if (status === 'retired' && r.active !== false) return false;
      }
      if (dim !== 'condition') {
        if (condition !== 'all' && r.current_condition !== condition) return false;
      }
      if (dim !== 'property') {
        if (property !== 'ALL' && r.property?.short_code !== property) return false;
      }
      if (dim !== 'type') {
        if (type !== 'ALL' && r.asset_type !== type) return false;
      }
      // Apply the value being counted for this dimension
      if (dim === 'status') {
        if (value === 'active') return r.active === true;
        if (value === 'retired') return r.active === false;
        return true;
      }
      if (dim === 'condition') {
        return value === 'all' ? true : r.current_condition === value;
      }
      if (dim === 'property') {
        return value === 'ALL' ? true : r.property?.short_code === value;
      }
      // type
      return value === 'ALL' ? true : r.asset_type === value;
    }).length;
  }

  const hasActiveFilters = status !== 'active' || property !== 'ALL' || condition !== 'all' || type !== 'ALL';

  return (
    <div>
      {deletedName && (
        <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-900 flex items-center gap-2">
          <span>Asset <span className="font-semibold">{deletedName}</span> deleted.</span>
        </div>
      )}
      <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-navy">Assets</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted">
            Showing {displayed.length} asset{displayed.length === 1 ? '' : 's'}
            {hasActiveFilters && (
              <>
                {' · '}
                <Link href="/assets" className="text-navy hover:underline">Clear filters</Link>
              </>
            )}
          </span>
          {quickAddEnabled && (
            <div className="flex gap-2">
              <Link href={`/service-log?key=${encodeURIComponent(key)}`}
                    className="text-sm px-3 py-1.5 rounded-md border border-navy text-navy hover:bg-navy hover:text-white">
                Service log
              </Link>
              <Link href={`/new-asset?key=${encodeURIComponent(key)}`}
                    className="text-sm px-3 py-1.5 rounded-md bg-navy text-white hover:bg-blue-900">
                + Add asset
              </Link>
            </div>
          )}
        </div>
      </div>

      <FilterRow label="Status">
        {(['active', 'retired', 'all'] as StatusFilter[]).map(f => (
          <Chip
            key={f}
            href={buildHref({ status: f, property, condition, type })}
            active={status === f}
            label={`${STATUS_LABEL[f]} (${countBy('status', f)})`}
          />
        ))}
      </FilterRow>

      <FilterRow label="Property">
        <Chip
          href={buildHref({ status, property: 'ALL', condition, type })}
          active={property === 'ALL'}
          label={`All (${countBy('property', 'ALL')})`}
        />
        {(properties || []).map(p => (
          <Chip
            key={p.short_code}
            href={buildHref({ status, property: p.short_code, condition, type })}
            active={property === p.short_code}
            label={`${p.short_code} (${countBy('property', p.short_code)})`}
          />
        ))}
      </FilterRow>

      <FilterRow label="Condition">
        {(['all', 'excellent', 'good', 'adequate', 'marginal', 'poor', 'failed'] as ConditionFilter[]).map(f => (
          <Chip
            key={f}
            href={buildHref({ status, property, condition: f, type })}
            active={condition === f}
            label={`${CONDITION_LABEL[f]} (${countBy('condition', f)})`}
          />
        ))}
      </FilterRow>

      <FilterRow label="Type">
        <Chip
          href={buildHref({ status, property, condition, type: 'ALL' })}
          active={type === 'ALL'}
          label={`All (${countBy('type', 'ALL')})`}
        />
        {typeList.map(t => {
          const count = countBy('type', t);
          if (count === 0 && type !== t) return null;   // hide zero-count types
          return (
            <Chip
              key={t}
              href={buildHref({ status, property, condition, type: t })}
              active={type === t}
              label={`${t} (${count})`}
            />
          );
        })}
      </FilterRow>

      <div className="mb-2" />

      {displayed.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No assets match the current filter combination.
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent text-navy">
              <tr>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Make / Model</th>
                <th className="text-left p-3">Condition</th>
                {status !== 'active' && <th className="text-left p-3">Status</th>}
              </tr>
            </thead>
            <tbody>
              {displayed.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">
                    <Link href={`/assets/${a.id}${quickAddEnabled ? `?key=${encodeURIComponent(key)}` : ''}`}
                          className="text-navy hover:underline">
                      {a.asset_code || '—'}
                    </Link>
                  </td>
                  <td className="p-3">
                    {a.property ? (
                      <Link href={`/properties/${a.property.short_code}`} className="text-navy hover:underline">
                        {a.property.short_code}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    <Link href={`/assets/${a.id}${quickAddEnabled ? `?key=${encodeURIComponent(key)}` : ''}`}
                          className="text-navy hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted">{a.asset_type}</td>
                  <td className="p-3 text-muted">
                    {a.make || ''}{a.make && a.model ? ' ' : ''}{a.model || ''}
                    {!a.make && !a.model ? '—' : ''}
                  </td>
                  <td className="p-3">
                    <Badge tone={ratingTone(a.current_condition)}>
                      {(a.current_condition || '—').toUpperCase()}
                    </Badge>
                  </td>
                  {status !== 'active' && (
                    <td className="p-3 text-muted text-xs">
                      {a.active ? 'Active' : 'Retired'}
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
    <div className="flex items-start gap-3 mb-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-muted w-16 flex-shrink-0 pt-1.5">{label}</span>
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

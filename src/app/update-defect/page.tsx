import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import Badge, { severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

export default async function UpdateDefectPicker({
  searchParams,
}: {
  searchParams: { key?: string; property?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  const filterProperty = (searchParams.property || '').trim();

  // --- gate ---------------------------------------------------------------
  if (!required || key !== required) {
    redirect('/');
  }

  // --- fetch open + work_ordered defects (last 180 days) ------------------
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseServer
    .from('defects')
    .select(`
      id, defect_number, title, severity, status, identified_at,
      property:property_id ( id, short_code, name )
    `)
    .in('status', ['open', 'work_ordered'])
    .gte('identified_at', sixMonthsAgo)
    .order('severity', { ascending: false })  // critical first
    .order('identified_at', { ascending: false });

  const { data: defects } = await query;

  // --- property filter list -----------------------------------------------
  const { data: properties } = await supabaseServer
    .from('properties')
    .select('id, short_code, name')
    .eq('active', true)
    .order('short_code');

  // --- group by property --------------------------------------------------
  const filtered = (defects || []).filter((d: any) => {
    if (!filterProperty) return true;
    return d.property?.short_code === filterProperty;
  });

  type Group = {
    short_code: string;
    name: string;
    rows: any[];
  };
  const groupsMap = new Map<string, Group>();
  for (const d of filtered) {
    const p = d.property as any;
    if (!p) continue;
    const code = p.short_code;
    if (!groupsMap.has(code)) {
      groupsMap.set(code, { short_code: code, name: p.name, rows: [] });
    }
    groupsMap.get(code)!.rows.push(d);
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) =>
    a.short_code.localeCompare(b.short_code),
  );

  const total = filtered.length;
  const grandTotal = (defects || []).length;

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-navy mb-1">Update a defect</h1>
      <p className="text-sm text-muted mb-4">
        Tap a defect to change its status. Photo evidence is required.
      </p>

      {/* ---------- property filter chips ---------- */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Link
          href={`/update-defect?key=${encodeURIComponent(key)}`}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            !filterProperty ? 'bg-navy text-white border-navy' : 'bg-white text-muted'
          }`}
        >
          All ({grandTotal})
        </Link>
        {(properties || []).map((p) => {
          const count = (defects || []).filter((d: any) => d.property?.short_code === p.short_code).length;
          const active = filterProperty === p.short_code;
          return (
            <Link
              key={p.id}
              href={`/update-defect?key=${encodeURIComponent(key)}&property=${encodeURIComponent(p.short_code)}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                active ? 'bg-navy text-white border-navy' : 'bg-white text-muted'
              }`}
            >
              {p.short_code} ({count})
            </Link>
          );
        })}
      </div>

      {/* ---------- groups ---------- */}
      {total === 0 && (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No open defects in this view. ✓
        </div>
      )}

      {groups.map((g) => (
        <div key={g.short_code} className="mb-5">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="text-xs font-bold text-navy uppercase tracking-wide">
              {g.name}
            </h2>
            <span className="text-xs text-muted">{g.rows.length}</span>
          </div>
          <div className="rounded-lg border bg-white overflow-hidden">
            {g.rows.map((d: any, i: number) => (
              <Link
                key={d.id}
                href={`/update-defect/${encodeURIComponent(d.defect_number)}?key=${encodeURIComponent(key)}`}
                className={`block p-3 hover:bg-gray-50 ${i > 0 ? 'border-t' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-mono text-[11px] text-muted">{d.defect_number}</span>
                  <Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge>
                </div>
                <div className="text-sm text-navy font-medium leading-snug">{d.title}</div>
                <div className="text-[11px] text-muted mt-1">
                  {d.status === 'work_ordered' ? 'In progress' : 'Open'}
                  {'  •  '}
                  Identified {(d.identified_at || '').slice(0, 10)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="text-xs text-muted text-center mt-6">
        Showing open + in-progress defects from the last 180 days.
      </div>
    </div>
  );
}

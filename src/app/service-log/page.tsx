import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return s.slice(0, 10);
}
function daysFromNow(s: string | null | undefined): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default async function ServiceLogPicker({
  searchParams,
}: {
  searchParams: { key?: string; property?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const filterProperty = (searchParams.property || '').trim();

  const { data: assets } = await supabaseServer
    .from('assets')
    .select(`
      id, name, asset_code, asset_type, current_condition,
      last_serviced_at, next_service_due_at, service_interval_months,
      property:property_id ( id, short_code, name )
    `)
    .eq('active', true)
    .order('next_service_due_at', { ascending: true, nullsFirst: false });

  const { data: properties } = await supabaseServer
    .from('properties')
    .select('id, short_code, name')
    .eq('active', true)
    .order('short_code');

  const filtered = (assets || []).filter((a: any) => {
    if (!filterProperty) return true;
    return a.property?.short_code === filterProperty;
  });

  type Group = { short_code: string; name: string; rows: any[] };
  const groupsMap = new Map<string, Group>();
  for (const a of filtered) {
    const p = a.property as any;
    if (!p) continue;
    if (!groupsMap.has(p.short_code)) {
      groupsMap.set(p.short_code, { short_code: p.short_code, name: p.name, rows: [] });
    }
    groupsMap.get(p.short_code)!.rows.push(a);
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => a.short_code.localeCompare(b.short_code));

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-navy mb-1">Log a service event</h1>
      <p className="text-sm text-muted mb-4">
        Pick an asset to record service. Sorted by next service due (overdue first).
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        <Link href={`/service-log?key=${encodeURIComponent(key)}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${!filterProperty ? 'bg-navy text-white border-navy' : 'bg-white text-muted'}`}>
          All ({(assets || []).length})
        </Link>
        {(properties || []).map(p => {
          const count = (assets || []).filter((a: any) => a.property?.short_code === p.short_code).length;
          const active = filterProperty === p.short_code;
          return (
            <Link key={p.id} href={`/service-log?key=${encodeURIComponent(key)}&property=${encodeURIComponent(p.short_code)}`}
                  className={`text-xs px-3 py-1.5 rounded-full border ${active ? 'bg-navy text-white border-navy' : 'bg-white text-muted'}`}>
              {p.short_code} ({count})
            </Link>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No active assets in this view.
        </div>
      )}

      {groups.map(g => (
        <div key={g.short_code} className="mb-5">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="text-xs font-bold text-navy uppercase tracking-wide">{g.name}</h2>
            <span className="text-xs text-muted">{g.rows.length}</span>
          </div>
          <div className="rounded-lg border bg-white overflow-hidden">
            {g.rows.map((a: any, i: number) => {
              const days = daysFromNow(a.next_service_due_at);
              let dueLabel = 'No schedule';
              let dueClass = 'text-muted';
              if (days != null) {
                if (days < 0) { dueLabel = `Overdue ${Math.abs(days)}d`; dueClass = 'text-red-700 font-medium'; }
                else if (days <= 30) { dueLabel = `Due in ${days}d`; dueClass = 'text-orange-700'; }
                else { dueLabel = `Due in ${days}d`; dueClass = 'text-muted'; }
              }
              return (
                <Link key={a.id}
                      href={`/service-log/${encodeURIComponent(a.id)}?key=${encodeURIComponent(key)}`}
                      className={`block p-3 hover:bg-gray-50 ${i > 0 ? 'border-t' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[11px] text-muted">{a.asset_type}{a.asset_code ? ` · ${a.asset_code}` : ''}</span>
                    {a.current_condition && <Badge tone={ratingTone(a.current_condition)}>{a.current_condition.toUpperCase()}</Badge>}
                  </div>
                  <div className="text-sm text-navy font-medium leading-snug">{a.name}</div>
                  <div className={`text-[11px] mt-1 ${dueClass}`}>
                    {dueLabel}
                    <span className="text-muted ml-2">Last serviced {fmtDate(a.last_serviced_at)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="text-xs text-muted text-center mt-6">
        Active assets only. Retired assets are hidden.
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import ResolveButtons from './resolve-buttons';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// FMX-051: Conflicts queue. Design principle #9 — never silently discard.
// Lists unresolved write-conflict rows the merge layer logged, and lets Carl
// pick which value to keep. Recently resolved rows show below the live list
// as an audit trail.

function fmtValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  if (Array.isArray(v)) return `[${v.length} item${v.length === 1 ? '' : 's'}]`;
  return JSON.stringify(v);
}

function strategyLabel(s: string): string {
  switch (s) {
    case 'lww':             return 'last-writer-wins';
    case 'union':           return 'set union';
    case 'concat':          return 'append';
    case 'max':             return 'keep larger';
    case 'min':             return 'keep smaller';
    case 'latest_non_null': return 'keep non-null';
    default:                return s;
  }
}

export default async function ConflictsPage() {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  if (!key) redirect('/');

  const sb = supabaseServer;
  const [unresolved, recent] = await Promise.all([
    sb.from('write_conflicts')
      .select('id, table_name, row_id, column_name, strategy, server_value, incoming_value, merged_value, context, detected_at')
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(100),
    sb.from('write_conflicts')
      .select('id, table_name, column_name, resolution, resolved_at, resolved_by')
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(20),
  ]);

  const rows = (unresolved.data || []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Conflicts</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        Write conflicts logged by the offline merge layer. Each row is a column where a queued edit arrived after the record had already moved on. Pick which value to keep — or acknowledge the current merged value and move on.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted">
          No unresolved conflicts. Nothing has been silently clobbered.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c: any) => (
            <article key={c.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted">
                    {c.table_name} · {c.column_name}
                  </div>
                  <div className="text-sm text-navy font-semibold">
                    Strategy: {strategyLabel(c.strategy)}
                  </div>
                </div>
                <div className="text-[11px] text-muted whitespace-nowrap">
                  {new Date(c.detected_at).toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                <ValueBox label="Server held" value={c.server_value} />
                <ValueBox label="Client tried" value={c.incoming_value} />
                <ValueBox label="Merge wrote" value={c.merged_value} highlight />
              </div>

              <ResolveButtons conflictId={c.id} secretKey={key} />
            </article>
          ))}
        </div>
      )}

      {(recent.data || []).length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">Recently resolved</h2>
          <ol className="rounded-lg border bg-white divide-y">
            {(recent.data || []).map((r: any) => (
              <li key={r.id} className="px-4 py-2 text-sm flex items-baseline justify-between gap-3">
                <span className="text-navy truncate">
                  {r.table_name} · {r.column_name}
                </span>
                <span className="text-xs text-muted shrink-0">
                  {r.resolution || 'resolved'} · {new Date(r.resolved_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function ValueBox({ label, value, highlight }: { label: string; value: unknown; highlight?: boolean }) {
  return (
    <div className={`rounded border p-3 ${highlight ? 'border-navy bg-blue-50/40' : 'border-gray-200 bg-gray-50'}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-xs text-navy mt-1 whitespace-pre-wrap break-words font-mono">
        {fmtValue(value)}
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// FMX-081: unified audit log.
// Read-only feed of the high-signal events every multi-audience path emits
// — tenant messages received, outbound pushes sent/skipped, client portal
// page views and report downloads. Filterable by actor_kind, action, and
// recency.
//
// The source-of-truth rows live in per-channel tables; audit_events is the
// index. Columns are self-contained (target_ref, actor_display) so the page
// renders without any joins.

const ACTOR_KIND_LABEL: Record<string, string> = {
  tenant: 'Tenant',
  client_viewer: 'Client viewer',
  fm_admin: 'FM',
  system: 'System',
  provider: 'Provider',
};

const ACTION_LABEL: Record<string, string> = {
  'tenant_message.received':       'Tenant message',
  'tenant_message.sent':           'Status push sent',
  'tenant_message.skipped':        'Status push skipped',
  'client_viewer.page_view':       'Portal viewed',
  'client_viewer.report_download': 'Report downloaded',
  'defect.draft_created':          'Defect drafted',
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  google_chat: 'Google Chat',
  web: 'Web',
};

type PageProps = {
  searchParams: { actor?: string; action?: string; days?: string };
};

export default async function AuditPage({ searchParams }: PageProps) {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  if (!key) redirect('/');

  const actor = (searchParams.actor || '').trim();
  const action = (searchParams.action || '').trim();
  const days = Number.parseInt(searchParams.days || '30', 10) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabaseServer
    .from('audit_events')
    .select('id, at, actor_kind, actor_id, actor_display, action, channel, target_table, target_id, target_ref, property_id, client_id, ip, context')
    .gte('at', since)
    .order('at', { ascending: false })
    .limit(500);
  if (actor)  query = query.eq('actor_kind', actor);
  if (action) query = query.eq('action', action);

  const { data: rows } = await query;

  const actorCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  for (const r of (rows || [])) {
    actorCounts.set(r.actor_kind as string, (actorCounts.get(r.actor_kind as string) || 0) + 1);
    actionCounts.set(r.action as string, (actionCounts.get(r.action as string) || 0) + 1);
  }

  const qs = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    if (actor)  next.set('actor', actor);
    if (action) next.set('action', action);
    if (days !== 30) next.set('days', String(days));
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Audit</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        Who did what, across tenant-side intake, client-portal access, and outbound pushes. Last {days} days, up to 500 rows.
      </p>

      {/* Filters */}
      <section className="rounded-lg border bg-white p-4 mb-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <FilterGroup label="Actor" current={actor} options={[
            { key: '', label: 'All' },
            ...Array.from(actorCounts.entries()).map(([k, n]) => ({ key: k, label: `${ACTOR_KIND_LABEL[k] || k} (${n})` })),
          ]} hrefFor={k => qs({ actor: k })} />

          <FilterGroup label="Action" current={action} options={[
            { key: '', label: 'All' },
            ...Array.from(actionCounts.entries()).map(([k, n]) => ({ key: k, label: `${ACTION_LABEL[k] || k} (${n})` })),
          ]} hrefFor={k => qs({ action: k })} />

          <FilterGroup label="Recency" current={String(days)} options={[
            { key: '7',  label: '7 days' },
            { key: '30', label: '30 days' },
            { key: '90', label: '90 days' },
          ]} hrefFor={k => qs({ days: k === '30' ? null : k })} />
        </div>
      </section>

      {/* Feed */}
      {(rows || []).length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted">
          No audit events in this window matching those filters.
        </div>
      ) : (
        <ol className="rounded-lg border bg-white divide-y">
          {(rows || []).map((r: any) => (
            <li key={r.id} className="px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-navy">
                  <span className="font-semibold">{ACTOR_KIND_LABEL[r.actor_kind] || r.actor_kind}</span>
                  {r.actor_display && <span className="text-muted"> · {r.actor_display}</span>}
                  {r.actor_id && !r.actor_display && <span className="text-muted"> · {r.actor_id}</span>}
                  <span className="mx-1 text-muted">·</span>
                  <span>{ACTION_LABEL[r.action] || r.action}</span>
                  {r.channel && <span className="text-muted"> via {CHANNEL_LABEL[r.channel] || r.channel}</span>}
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  {r.target_ref && <>{r.target_ref} · </>}
                  {r.target_table}
                  {r.ip && <> · {r.ip}</>}
                </div>
              </div>
              <div className="text-xs text-muted whitespace-nowrap shrink-0">
                {new Date(r.at).toLocaleString()}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FilterGroup({
  label, current, options, hrefFor,
}: {
  label: string;
  current: string;
  options: { key: string; label: string }[];
  hrefFor: (k: string) => string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted mb-1">{label}</div>
      <div className="flex flex-wrap items-baseline gap-1">
        {options.map(o => {
          const active = current === o.key;
          return (
            <Link
              key={o.key}
              href={hrefFor(o.key)}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? 'border-navy bg-navy text-white'
                  : 'border-gray-300 bg-white text-navy hover:bg-gray-50'
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

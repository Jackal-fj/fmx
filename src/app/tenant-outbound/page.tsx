import { redirect } from 'next/navigation';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import OutboundButtons from './buttons';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// FMX-080: approval queue for tenant-facing status pushes. Every time a
// defect flips to work_ordered or resolved and the tenant has a known route,
// a row lands here for Carl to approve or skip. Sent + skipped rows stay
// below for audit. 'no_route' rows flag transitions where we didn't have a
// way to reach the tenant — the fix is to add the contact info on the
// property record.

function channelLabel(c: string): string {
  switch (c) {
    case 'whatsapp':    return 'WhatsApp';
    case 'google_chat': return 'Google Chat';
    case 'email':       return 'Email';
    default:            return c;
  }
}

function triggerLabel(t: string): string {
  return t === 'work_ordered' ? 'Dispatched' : t === 'resolved' ? 'Resolved' : t;
}

export default async function TenantOutboundPage() {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  if (!key) redirect('/');

  const sb = supabaseServer;
  const [queued, recent, noRoute] = await Promise.all([
    sb.from('outbound_tenant_messages')
      .select('id, defect_number, channel, target_sender_id, trigger, body, queued_at, property_id, properties:property_id ( short_code, tenant_name )')
      .eq('status', 'queued')
      .order('queued_at', { ascending: false })
      .limit(100),
    sb.from('outbound_tenant_messages')
      .select('id, defect_number, channel, trigger, status, sent_at, skipped_at, error')
      .in('status', ['sent', 'skipped', 'failed'])
      .order('queued_at', { ascending: false })
      .limit(30),
    sb.from('outbound_tenant_messages')
      .select('id, defect_number, trigger, queued_at, property_id, properties:property_id ( short_code, tenant_name )')
      .eq('status', 'no_route')
      .order('queued_at', { ascending: false })
      .limit(30),
  ]);

  const q = queued.data || [];
  const r = recent.data || [];
  const nr = noRoute.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Tenant outbound</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        Status updates ready to send to tenants after a defect transitions. Each message is held for FM approval so nothing goes out without a review.
      </p>

      {/* Queued */}
      <section className="mb-8">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
          Ready to send ({q.length})
        </h2>
        {q.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-sm text-muted">
            Nothing queued. Transitions on defects with a known tenant route will show up here for review.
          </div>
        ) : (
          <div className="space-y-3">
            {q.map((m: any) => (
              <article key={m.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-navy">
                      {m.defect_number} · {triggerLabel(m.trigger)}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      → {channelLabel(m.channel)}
                      {m.target_sender_id ? ` · ${m.target_sender_id}` : ''}
                      {m.properties?.short_code ? ` · ${m.properties.short_code}` : ''}
                      {m.properties?.tenant_name ? ` · ${m.properties.tenant_name}` : ''}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted whitespace-nowrap">
                    Queued {new Date(m.queued_at).toLocaleString()}
                  </div>
                </div>
                <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-navy whitespace-pre-wrap mb-3">
                  {m.body}
                </div>
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <Link
                    href={`/defects/${m.defect_number}`}
                    className="text-xs text-muted hover:text-navy underline"
                  >
                    Open defect
                  </Link>
                  <OutboundButtons id={m.id} secretKey={key} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* No route */}
      {nr.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wide mb-3">
            Missed — no tenant route ({nr.length})
          </h2>
          <p className="text-xs text-muted mb-3">
            These transitions happened but the property doesn't have a tenant contact + preferred channel set, so there was nowhere to send the update. Add the tenant's phone or email on the property record and future transitions will queue here.
          </p>
          <ol className="rounded-lg border bg-white divide-y">
            {nr.map((m: any) => (
              <li key={m.id} className="px-4 py-2 flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm text-navy">
                  {m.defect_number} · {triggerLabel(m.trigger)}
                  {m.properties?.short_code ? ` · ${m.properties.short_code}` : ''}
                </span>
                <span className="text-xs text-muted whitespace-nowrap">
                  {new Date(m.queued_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Recently completed */}
      {r.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
            Recently completed
          </h2>
          <ol className="rounded-lg border bg-white divide-y">
            {r.map((m: any) => {
              const toneCls =
                m.status === 'sent'    ? 'text-green-800' :
                m.status === 'skipped' ? 'text-muted' :
                                          'text-red-800';
              return (
                <li key={m.id} className="px-4 py-2 flex items-baseline justify-between gap-3 flex-wrap text-sm">
                  <span className="text-navy">
                    {m.defect_number} · {triggerLabel(m.trigger)} · {channelLabel(m.channel)}
                  </span>
                  <span className={`text-xs whitespace-nowrap ${toneCls}`}>
                    {m.status}
                    {m.sent_at && ` · ${new Date(m.sent_at).toLocaleString()}`}
                    {m.skipped_at && ` · ${new Date(m.skipped_at).toLocaleString()}`}
                    {m.error && ` · ${m.error}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

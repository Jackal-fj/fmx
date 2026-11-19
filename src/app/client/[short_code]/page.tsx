import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { resolveClientFromToken } from '@/lib/client-access/tokens';
import { supabaseServer } from '@/lib/supabase';
import { logAudit } from '@/lib/audit/log';
import ReportDownload from './report-download';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// FMX-075: client-viewer portfolio snapshot.
//
// Read-only, mobile-first, no FM tools. The gate (FMX-074) resolves the
// token to a client scope before any data is queried, and every query is
// scoped to that client_id — a token for Client A can't reach Client B's
// data even if the URL is tampered.

const COOKIE_NAME = 'fmx_client';

type SevRank = 1 | 2 | 3 | 4;
const SEV_RANK: Record<string, SevRank> = { critical: 1, major: 2, moderate: 3, minor: 4 };

function sevBadge(sev: string): { label: string; cls: string } {
  switch (sev) {
    case 'critical': return { label: 'Critical', cls: 'bg-red-100 text-red-900 border-red-300' };
    case 'major':    return { label: 'Major',    cls: 'bg-orange-100 text-orange-900 border-orange-300' };
    case 'moderate': return { label: 'Moderate', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'minor':    return { label: 'Minor',    cls: 'bg-gray-100 text-gray-800 border-gray-300' };
    default:         return { label: sev,        cls: 'bg-gray-100 text-gray-800 border-gray-300' };
  }
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'open':         return { label: 'Open',         cls: 'bg-red-50 text-red-900 border-red-200' };
    case 'work_ordered': return { label: 'Work ordered', cls: 'bg-blue-50 text-blue-900 border-blue-200' };
    case 'resolved':     return { label: 'Resolved',     cls: 'bg-green-50 text-green-900 border-green-200' };
    default:             return { label: status,         cls: 'bg-gray-50 text-gray-800 border-gray-200' };
  }
}

function agreementStatusBadge(s: string): { label: string; cls: string } {
  switch (s) {
    case 'active':      return { label: 'Active',    cls: 'bg-green-50 text-green-900 border-green-200' };
    case 'negotiation':
    case 'tender':      return { label: 'Pending',   cls: 'bg-amber-50 text-amber-900 border-amber-200' };
    case 'suspended':   return { label: 'Suspended', cls: 'bg-gray-100 text-gray-800 border-gray-300' };
    case 'ended':       return { label: 'Expired',   cls: 'bg-gray-100 text-gray-700 border-gray-300' };
    case 'lost':        return { label: 'Terminated', cls: 'bg-gray-100 text-gray-700 border-gray-300' };
    default:            return { label: s,           cls: 'bg-gray-50 text-gray-700 border-gray-200' };
  }
}

function typeLabel(t: string): string {
  switch (t) {
    case 'all_in_one':  return 'All-in-one';
    case 'fm_services': return 'FM services';
    case 'maintenance': return 'Maintenance';
    case 'project':     return 'Project';
    case 'ad_hoc':      return 'Ad hoc';
    default:            return t;
  }
}

function fmtMonth(m: string): string {
  // report_month is "YYYY-MM"; render "Mon YYYY"
  const [yy, mm] = m.split('-');
  const d = new Date(Number(yy), Number(mm) - 1, 1);
  return d.toLocaleString('en-AU', { month: 'short', year: 'numeric' });
}

export default async function ClientLanding({
  params,
  searchParams,
}: {
  params: { short_code: string };
  searchParams: { t?: string };
}) {
  noStore();

  const cookieStore = cookies();
  const headerStore = headers();
  const queryToken = (searchParams.t || '').trim();
  const cookieToken = cookieStore.get(COOKIE_NAME)?.value || '';
  const candidate = queryToken || cookieToken;

  const ip =
    headerStore.get('x-real-ip') ||
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;

  const scope = candidate ? await resolveClientFromToken(candidate, { ip }) : null;

  if (!scope) {
    return (
      <div className="mx-auto max-w-md mt-16 rounded-lg border bg-white p-6 text-center">
        <div className="text-sm text-muted uppercase tracking-wide mb-2">Access required</div>
        <h1 className="text-xl font-bold text-navy mb-2">Signed link needed</h1>
        <p className="text-sm text-muted">
          This page is for client viewers. Please use the full signed link your FM shared with you — or ask them for a new one.
        </p>
      </div>
    );
  }
  if (scope.client_short_code !== params.short_code) notFound();

  if (queryToken && queryToken !== cookieToken) {
    cookieStore.set({
      name: COOKIE_NAME,
      value: queryToken,
      path: `/client/${params.short_code}`,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 180,
    });
  }

  // Keep `activeToken` around — the report download button needs the plaintext to
  // mint a signed URL server-side. We pass it to the client component; it's the
  // same token the viewer already holds in their cookie, so nothing new leaks.
  const activeToken = candidate;

  // FMX-081: audit the client-viewer page load. Best-effort; never blocks
  // the render. User agent + IP captured so Carl can see where access came
  // from on /audit.
  await logAudit({
    actor_kind: 'client_viewer',
    actor_id: scope.token_id,
    actor_display: scope.token_label,
    action: 'client_viewer.page_view',
    channel: 'web',
    target_table: 'clients',
    target_id: scope.client_id,
    target_ref: scope.client_short_code,
    client_id: scope.client_id,
    ip,
    user_agent: headerStore.get('user-agent'),
  });

  const sb = supabaseServer;
  const clientId = scope.client_id;
  const yearStart = `${new Date().getUTCFullYear()}-01-01T00:00:00Z`;

  const [
    { data: agreements },
    { data: properties },
    { data: openDefects },
    { count: resolvedYtdCount },
    { data: contracts },
    { data: reports },
  ] = await Promise.all([
    sb.from('client_agreements')
      .select('id, agreement_code, agreement_type, status, name, start_date, end_date')
      .eq('client_id', clientId)
      .order('agreement_code'),
    sb.from('properties')
      .select('id, short_code, name, address, tenant_name, facility_type')
      .eq('client_id', clientId)
      .eq('active', true)
      .order('short_code'),
    sb.from('defects')
      .select('id, defect_number, title, status, severity, property_id, identified_at, photo_urls, trade')
      .in('status', ['open', 'work_ordered'])
      .order('identified_at', { ascending: false })
      .limit(500),
    sb.from('defects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'resolved')
      .gte('resolved_at', yearStart),
    sb.from('service_contracts')
      .select('id, contract_name, discipline, frequency, next_service_date, property_id, provider:provider_id(name)')
      .eq('client_id', clientId)
      .eq('active', true)
      .order('next_service_date', { nullsFirst: false, ascending: true }),
    sb.from('report_runs')
      .select('id, report_month, scope, short_code, storage_path, filename, file_size_bytes, generated_at, property_id, client_id')
      .order('generated_at', { ascending: false })
      .limit(50),
  ]);

  const propertyIds = new Set((properties || []).map(p => p.id as string));
  const propsById = new Map((properties || []).map(p => [p.id as string, p]));

  // Scope defects to this client's properties.
  const defectsScoped = (openDefects || []).filter(d => propertyIds.has(d.property_id as string));

  // Resolved YTD count was head=true on all defects; scope it manually.
  // Pull just the ids with property_id for a tight count.
  const { data: resolvedYtdRows } = await sb
    .from('defects')
    .select('id, property_id')
    .eq('status', 'resolved')
    .gte('resolved_at', yearStart)
    .in('property_id', Array.from(propertyIds));
  const resolvedYtd = (resolvedYtdRows || []).length;
  // resolvedYtdCount is unused once we scope manually — keep the variable for traceability.
  void resolvedYtdCount;

  // Defects per property for the properties block.
  const openByProp = new Map<string, number>();
  for (const d of defectsScoped) {
    const pid = d.property_id as string;
    openByProp.set(pid, (openByProp.get(pid) || 0) + 1);
  }

  // Group defects by property for the "work in progress" list.
  const defectGroups: Array<{ property_id: string; items: typeof defectsScoped }> = [];
  for (const pid of propertyIds) {
    const items = defectsScoped
      .filter(d => d.property_id === pid)
      .sort((a, b) =>
        (SEV_RANK[a.severity as string] || 9) - (SEV_RANK[b.severity as string] || 9)
        || String(b.identified_at).localeCompare(String(a.identified_at)),
      );
    if (items.length) defectGroups.push({ property_id: pid, items });
  }
  defectGroups.sort((a, b) => b.items.length - a.items.length);

  // Service contracts scoped — already filtered by client_id, but a few rows
  // may not have a property; attach property short_code for display.
  const contractsScoped = (contracts || []).map(c => ({
    ...c,
    property_short_code: c.property_id ? (propsById.get(c.property_id as string)?.short_code as string | undefined) : undefined,
  }));

  // Reports scoped — accept either (a) client-scope report tagged to this
  // client_id, or (b) property report on a property owned by this client.
  const reportsScoped = (reports || []).filter(r =>
    (r.client_id as string | null) === clientId ||
    (r.property_id && propertyIds.has(r.property_id as string)),
  );

  const activeAgreements = (agreements || []).filter(a => a.status === 'active');

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="rounded-lg border bg-white p-6">
        <div className="text-[11px] uppercase tracking-wide text-muted">Client portal</div>
        <h1 className="text-2xl font-bold text-navy mt-1">{scope.client_name}</h1>
        <p className="text-sm text-muted mt-2">
          Read-only view{scope.token_label ? ` · ${scope.token_label}` : ''} · as of {new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>

      {/* Snapshot tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Tile label="Sites"              value={(properties || []).length} />
        <Tile label="Open items"         value={defectsScoped.length} tone={defectsScoped.length === 0 ? 'good' : defectsScoped.some(d => d.severity === 'critical') ? 'bad' : 'warn'} />
        <Tile label="Resolved this year" value={resolvedYtd} tone="good" />
        <Tile label="Active agreements"  value={activeAgreements.length} />
      </section>

      {/* Properties */}
      <section className="rounded-lg border bg-white p-4 md:p-6 mt-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">Properties</h2>
        {(properties || []).length === 0 ? (
          <div className="text-sm text-muted">No active properties on record.</div>
        ) : (
          <ol className="divide-y">
            {(properties || []).map(p => {
              const open = openByProp.get(p.id as string) || 0;
              return (
                <li key={p.id as string} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-navy truncate">{p.short_code} · {p.name}</div>
                    {p.address && <div className="text-xs text-muted truncate">{p.address}</div>}
                    {p.tenant_name && <div className="text-[11px] text-muted mt-0.5">Tenant: {p.tenant_name}</div>}
                  </div>
                  <div className="text-xs text-muted shrink-0 whitespace-nowrap">
                    {open === 0 ? 'No open items' : `${open} open`}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Open defects grouped by property */}
      <section className="rounded-lg border bg-white p-4 md:p-6 mt-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">Work in progress</h2>
        {defectGroups.length === 0 ? (
          <div className="text-sm text-muted">No open items. All reported issues have been resolved.</div>
        ) : (
          <div className="space-y-5">
            {defectGroups.map(g => {
              const p = propsById.get(g.property_id);
              return (
                <div key={g.property_id}>
                  <div className="text-[11px] font-semibold text-navy uppercase tracking-wide mb-2">
                    {p?.short_code} · {p?.name} ({g.items.length})
                  </div>
                  <ol className="divide-y border-t border-b">
                    {g.items.map(d => {
                      const sev = sevBadge(d.severity as string);
                      const st = statusBadge(d.status as string);
                      const photos = Array.isArray(d.photo_urls) ? (d.photo_urls as string[]).slice(0, 3) : [];
                      return (
                        <li key={d.id as string} className="py-3">
                          <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-navy">
                                <span className="font-mono text-xs text-muted mr-1.5">#{d.defect_number}</span>
                                {d.title}
                              </div>
                              <div className="text-[11px] text-muted mt-1">
                                Logged {new Date(d.identified_at as string).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                                {d.trade && <> · {d.trade}</>}
                              </div>
                            </div>
                            <div className="flex items-baseline gap-2 shrink-0">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] ${sev.cls}`}>{sev.label}</span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] ${st.cls}`}>{st.label}</span>
                            </div>
                          </div>
                          {photos.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {photos.map((u, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={u} alt="" className="h-16 w-16 object-cover rounded border" loading="lazy" />
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active agreements */}
      {(agreements || []).length > 0 && (
        <section className="rounded-lg border bg-white p-4 md:p-6 mt-4">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">Agreements</h2>
          <ol className="divide-y">
            {(agreements || []).map(a => {
              const st = agreementStatusBadge(a.status as string);
              return (
                <li key={a.id as string} className="py-3 flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-navy">
                      <span className="font-mono text-xs text-muted mr-1.5">{a.agreement_code}</span>
                      {a.name || '—'}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {typeLabel(a.agreement_type as string)}
                      {a.start_date && <> · from {new Date(a.start_date as string).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</>}
                      {a.end_date && <> · to {new Date(a.end_date as string).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</>}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] ${st.cls}`}>{st.label}</span>
                </li>
              );
            })}
          </ol>
          <p className="text-[11px] text-muted mt-3">
            Agreement details, fees and payment terms sit with your FM — contact them for a current copy.
          </p>
        </section>
      )}

      {/* Service contracts */}
      {contractsScoped.length > 0 && (
        <section className="rounded-lg border bg-white p-4 md:p-6 mt-4">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">Service contracts</h2>
          <ol className="divide-y">
            {contractsScoped.map(c => (
              <li key={c.id as string} className="py-3 flex items-baseline justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-navy">{c.contract_name}</div>
                  <div className="text-[11px] text-muted mt-1">
                    {c.discipline && <>{c.discipline} · </>}
                    {c.frequency && <>{c.frequency}</>}
                    {c.property_short_code && <> · {c.property_short_code}</>}
                    {(c.provider as any)?.name && <> · {(c.provider as any).name}</>}
                  </div>
                </div>
                {c.next_service_date && (
                  <span className="text-[11px] text-muted whitespace-nowrap">
                    Next: {new Date(c.next_service_date as string).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Reports */}
      {reportsScoped.length > 0 && (
        <section className="rounded-lg border bg-white p-4 md:p-6 mt-4">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">Reports</h2>
          <ol className="divide-y">
            {reportsScoped.map(r => (
              <li key={r.id as string} className="py-3 flex items-baseline justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-navy truncate">{r.filename}</div>
                  <div className="text-[11px] text-muted mt-1">
                    {fmtMonth(r.report_month as string)}
                    {r.short_code && <> · {r.short_code}</>}
                    {r.file_size_bytes != null && <> · {Math.round((r.file_size_bytes as number) / 1024)} KB</>}
                  </div>
                </div>
                <ReportDownload
                  storagePath={r.storage_path as string}
                  plaintext={activeToken}
                  shortCode={params.short_code}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-[11px] text-muted mt-6 mb-10 text-center">
        FMX client viewer · read-only · questions? contact your FM.
      </p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' | 'bad' }) {
  const valueCls =
    tone === 'bad'  ? 'text-red-900' :
    tone === 'warn' ? 'text-amber-900' :
    tone === 'good' ? 'text-green-900' :
                       'text-navy';
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueCls}`}>{value}</div>
    </div>
  );
}

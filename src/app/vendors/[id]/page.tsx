import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge from '@/components/badge';

export const dynamic = 'force-dynamic';

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return s.slice(0, 10);
}
function fmtMoney(n: number | null | undefined, currency = 'FJD') {
  if (n == null) return '—';
  return `${currency} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function stars(rating: number | null | undefined): string {
  if (!rating) return '—';
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return '★★★★★☆☆☆☆☆'.slice(5 - filled, 10 - filled);
}

export default async function VendorDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const key = process.env.QUICK_ADD_SECRET || '';
  const editEnabled = !!key;
  const savedFlag = searchParams.saved === '1';

  // Fetch vendor + activity in parallel
  const [
    { data: vendor },
    { data: defectUpdates },
    { data: serviceEvents },
  ] = await Promise.all([
    supabaseServer
      .from('providers')
      .select(`id, name, trade, contact_name, whatsapp_number, email, address, website, registration_id,
               hourly_rate_fjd, callout_fee_fjd, insurance_expiry, certifications, rating, notes, active,
               created_at, updated_at`)
      .eq('id', params.id)
      .maybeSingle(),
    supabaseServer
      .from('defect_updates')
      .select(`
        id, status_from, status_to, notes, created_at,
        defect:defect_id ( defect_number, title, severity, status,
          property:property_id ( short_code, name ) )
      `)
      .eq('provider_id', params.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseServer
      .from('asset_service_events')
      .select(`
        id, serviced_at, event_type, notes, condition_after,
        asset:asset_id ( id, name, asset_type,
          property:property_id ( short_code, name ) )
      `)
      .eq('provider_id', params.id)
      .order('serviced_at', { ascending: false })
      .limit(200),
  ]);

  if (!vendor) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Vendor not found.
        </div>
        <Link href="/vendors" className="block mt-4 text-sm text-navy hover:underline">← Back to vendors</Link>
      </div>
    );
  }

  // Bucket activity
  const updates = (defectUpdates || []) as any[];
  const events = (serviceEvents || []) as any[];

  // "Jobs pending" = defect_updates where status_to='work_ordered' AND the linked defect is still work_ordered/open
  const pendingUpdates = updates.filter(u =>
    u.status_to === 'work_ordered'
    && u.defect
    && (u.defect.status === 'work_ordered' || u.defect.status === 'open'),
  );
  // "Jobs completed" = defect_updates where status_to='resolved' PLUS all service events
  const completedUpdates = updates.filter(u => u.status_to === 'resolved');
  const completedEvents = events;
  const completedCount = completedUpdates.length + completedEvents.length;

  return (
    <div className="max-w-3xl">
      <Link href="/vendors" className="text-sm text-muted hover:text-navy">← Back to vendors</Link>

      {savedFlag && (
        <div className="mt-3 mb-1 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Vendor updated.</span>
        </div>
      )}

      <div className="flex items-baseline justify-between mt-2 mb-1 gap-3">
        <h1 className="text-2xl font-bold text-navy">{vendor.name}</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {vendor.trade && (
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-muted">{vendor.trade}</span>
        )}
        {!vendor.active && <Badge tone="muted">INACTIVE</Badge>}
        {vendor.rating && (
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-navy" title={`Rating: ${vendor.rating}/5`}>
            {stars(vendor.rating)} {vendor.rating}/5
          </span>
        )}
      </div>

      {editEnabled && (
        <div className="flex gap-2 mb-6">
          <Link
            href={`/vendors/${vendor.id}/edit?key=${encodeURIComponent(key)}`}
            className="text-xs px-3 py-1.5 rounded-md border border-navy text-navy hover:bg-navy hover:text-white"
          >Edit</Link>
        </div>
      )}

      {/* --- Contact block --- */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Contact</h2>
        <div className="rounded-lg border bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Primary contact" value={vendor.contact_name || '—'} />
          <Field label="WhatsApp" value={vendor.whatsapp_number || '—'} />
          <Field label="Email" value={vendor.email || '—'} />
          <Field label="Website" value={vendor.website || '—'} link={vendor.website || undefined} />
          <Field label="Address" value={vendor.address || '—'} className="sm:col-span-2" />
          <Field label="Registration ID" value={vendor.registration_id || '—'} />
        </div>
      </section>

      {/* --- Job summary --- */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Job summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBox label="Jobs completed" value={completedCount} tone={completedCount > 0 ? 'good' : 'muted'} />
          <StatBox label="Jobs pending" value={pendingUpdates.length} tone={pendingUpdates.length > 0 ? 'warn' : 'muted'} />
          <StatBox label="Rating" value={vendor.rating ? `${vendor.rating}/5` : '—'} tone="muted" />
        </div>
      </section>

      {/* --- Rates --- */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Rates schedule</h2>
        <div className="rounded-lg border bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Hourly rate" value={fmtMoney(vendor.hourly_rate_fjd)} />
          <Field label="Callout fee" value={fmtMoney(vendor.callout_fee_fjd)} />
        </div>
      </section>

      {/* --- Compliance --- */}
      {(vendor.insurance_expiry || vendor.certifications) && (
        <section className="mb-6">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Compliance</h2>
          <div className="rounded-lg border bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Field label="Insurance expiry" value={fmtDate(vendor.insurance_expiry)} />
            <Field label="Certifications" value={vendor.certifications || '—'} className="sm:col-span-2" />
          </div>
        </section>
      )}

      {/* --- Notes --- */}
      {vendor.notes && (
        <section className="mb-6">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Notes</h2>
          <div className="rounded-lg border bg-white p-4 text-sm">
            <p className="whitespace-pre-wrap">{vendor.notes}</p>
          </div>
        </section>
      )}

      {/* --- Pending jobs --- */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">
          Pending jobs ({pendingUpdates.length})
        </h2>
        {pendingUpdates.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-muted">No pending jobs.</div>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            {pendingUpdates.map((u: any, i: number) => (
              <div key={u.id} className={`p-3 ${i > 0 ? 'border-t' : ''}`}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <Link
                    href={`/defects/${encodeURIComponent(u.defect?.defect_number || '')}`}
                    className="text-sm font-medium text-navy hover:underline"
                  >
                    {u.defect?.defect_number} — {u.defect?.title}
                  </Link>
                  <span className="text-[11px] text-muted whitespace-nowrap">{fmtDate(u.created_at)}</span>
                </div>
                <div className="text-[11px] text-muted">
                  {u.defect?.property?.short_code || '—'}
                  {u.defect?.severity && <> · {(u.defect.severity as string).toUpperCase()}</>}
                </div>
                {u.notes && <p className="text-xs text-muted mt-1">{u.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Completed activity --- */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">
          Completed activity ({completedCount})
        </h2>
        {completedCount === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-muted">
            No completed jobs on record yet.
          </div>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            {[
              ...completedUpdates.map(u => ({
                sortDate: u.created_at as string,
                kind: 'defect-resolved' as const,
                data: u,
              })),
              ...completedEvents.map(e => ({
                sortDate: e.serviced_at as string,
                kind: 'service' as const,
                data: e,
              })),
            ]
              .sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''))
              .map((row, i, arr) => {
                if (row.kind === 'defect-resolved') {
                  const u: any = row.data;
                  return (
                    <div key={`d-${u.id}`} className={`p-3 ${i > 0 ? 'border-t' : ''}`}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <Link
                          href={`/defects/${encodeURIComponent(u.defect?.defect_number || '')}`}
                          className="text-sm font-medium text-navy hover:underline"
                        >
                          Resolved: {u.defect?.defect_number} — {u.defect?.title}
                        </Link>
                        <span className="text-[11px] text-muted whitespace-nowrap">{fmtDate(u.created_at)}</span>
                      </div>
                      <div className="text-[11px] text-muted">
                        {u.defect?.property?.short_code || '—'}
                        {u.defect?.severity && <> · {(u.defect.severity as string).toUpperCase()}</>}
                      </div>
                      {u.notes && <p className="text-xs text-muted mt-1">{u.notes}</p>}
                    </div>
                  );
                }
                const e: any = row.data;
                return (
                  <div key={`s-${e.id}`} className={`p-3 ${i > 0 ? 'border-t' : ''}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <Link
                        href={`/assets/${e.asset?.id}`}
                        className="text-sm font-medium text-navy hover:underline"
                      >
                        {(e.event_type || 'service').toUpperCase()}: {e.asset?.name}
                      </Link>
                      <span className="text-[11px] text-muted whitespace-nowrap">{fmtDate(e.serviced_at)}</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      {e.asset?.property?.short_code || '—'}
                      {e.asset?.asset_type && <> · {e.asset.asset_type}</>}
                      {e.condition_after && <> · condition: {String(e.condition_after).toUpperCase()}</>}
                    </div>
                    {e.notes && <p className="text-xs text-muted mt-1">{e.notes}</p>}
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, link, className = '' }: {
  label: string; value: string; link?: string; className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted mb-1">{label}</div>
      <div className="text-sm text-navy">
        {link ? (
          <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{value}</a>
        ) : value}
      </div>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number | string; tone: 'good' | 'warn' | 'muted' }) {
  const toneClass = tone === 'good' ? 'text-green-700' : tone === 'warn' ? 'text-orange-700' : 'text-navy';
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

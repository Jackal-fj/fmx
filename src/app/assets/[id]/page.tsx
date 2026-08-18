import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone } from '@/components/badge';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return s.slice(0, 10);
}
function fmtMoney(n: number | null | undefined) {
  if (n == null) return '—';
  return `FJD ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function AssetDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { key?: string; saved?: string; service?: string };
}) {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  const editEnabled = !!key;
  const savedFlag = searchParams.saved === '1';
  const serviceFlag = searchParams.service === '1';

  const { data: asset } = await supabaseServer
    .from('assets')
    .select(`
      id, name, asset_code, asset_type, make, model, serial_number,
      install_date, warranty_expiry_date, service_interval_months,
      last_serviced_at, next_service_due_at, current_condition,
      replacement_cost_fjd, notes, active, photo_urls,
      created_at, updated_at,
      property:property_id ( id, short_code, name ),
      space:space_id ( name, short_code, space_type )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (!asset) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Asset not found.
        </div>
        <Link href="/assets" className="block mt-4 text-sm text-navy hover:underline">← Back to assets</Link>
      </div>
    );
  }

  const property = (asset.property as unknown) as { id: string; short_code: string; name: string } | null;
  const space = (asset.space as unknown) as { name: string; short_code: string; space_type: string } | null;
  const photos: string[] = Array.isArray(asset.photo_urls) ? asset.photo_urls : [];

  // service history
  const { data: events } = await supabaseServer
    .from('asset_service_events')
    .select(`
      id, serviced_at, serviced_by, condition_before, condition_after, notes, photo_urls, source, event_type,
      provider:provider_id ( name, trade )
    `)
    .eq('asset_id', asset.id)
    .order('serviced_at', { ascending: false });

  return (
    <div className="max-w-3xl">
      <Link href="/assets" className="text-sm text-muted hover:text-navy">← Back to assets</Link>

      {(savedFlag || serviceFlag) && (
        <div className="mt-3 mb-1 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{serviceFlag ? 'Service event logged.' : 'Asset updated.'}</span>
        </div>
      )}

      <div className="flex items-baseline justify-between mt-2 mb-1 gap-3">
        <h1 className="text-2xl font-bold text-navy">{asset.name}</h1>
        {asset.asset_code && (
          <span className="font-mono text-xs text-muted whitespace-nowrap">{asset.asset_code}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {asset.current_condition && (
          <Badge tone={ratingTone(asset.current_condition)}>{asset.current_condition.toUpperCase()}</Badge>
        )}
        {!asset.active && (
          <Badge tone="muted">RETIRED</Badge>
        )}
        <span className="text-xs px-2 py-1 rounded-full border bg-white text-muted">{asset.asset_type}</span>
        {property && (
          <Link href={`/properties/${property.short_code}`} className="text-xs px-2 py-1 rounded-full border bg-white text-navy hover:bg-gray-50">
            {property.short_code} — {property.name}
          </Link>
        )}
        {space && (
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-muted">{space.name}</span>
        )}
      </div>

      {editEnabled && (
        <div className="flex gap-2 mb-6">
          <Link
            href={`/assets/${asset.id}/edit?key=${encodeURIComponent(key)}`}
            className="text-xs px-3 py-1.5 rounded-md border border-navy text-navy hover:bg-navy hover:text-white"
          >Edit</Link>
          <Link
            href={`/service-log/${asset.id}?key=${encodeURIComponent(key)}`}
            className="text-xs px-3 py-1.5 rounded-md bg-navy text-white"
          >Log service event</Link>
        </div>
      )}

      {/* identity grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Field label="Make" value={asset.make || '—'} />
        <Field label="Model" value={asset.model || '—'} />
        <Field label="Serial number" value={asset.serial_number || '—'} />
        <Field label="Install date" value={fmtDate(asset.install_date)} />
        <Field label="Warranty expires" value={fmtDate(asset.warranty_expiry_date)} />
        <Field label="Service interval" value={asset.service_interval_months ? `${asset.service_interval_months} mo` : '—'} />
        <Field label="Last serviced" value={fmtDate(asset.last_serviced_at)} />
        <Field label="Next service due" value={fmtDate(asset.next_service_due_at)} />
        <Field label="Replacement cost" value={fmtMoney(asset.replacement_cost_fjd)} />
      </div>

      {asset.notes && (
        <div className="rounded-lg border bg-white p-4 mb-6 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted mb-1">Notes</div>
          <p className="whitespace-pre-wrap">{asset.notes}</p>
        </div>
      )}

      {/* photos */}
      {photos.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Photos ({photos.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`asset ${i + 1}`} className="w-full h-32 object-cover rounded border hover:opacity-90" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* service history */}
      <div>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Service history ({(events || []).length})</h2>
        {(events || []).length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-muted">
            No service events recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {(events || []).map((e: any) => {
              const evPhotos: string[] = Array.isArray(e.photo_urls) ? e.photo_urls : [];
              return (
                <div key={e.id} className="rounded-lg border bg-white p-3">
                  <div className="flex items-baseline justify-between mb-1 gap-2">
                    <div className="text-sm">
                      <span className="font-semibold">{fmtDate(e.serviced_at)}</span>
                      {e.event_type && e.event_type !== 'service' && (
                        <span className="ml-2 text-xs uppercase tracking-wide px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                          {e.event_type}
                        </span>
                      )}
                    </div>
                    {e.condition_after && (
                      <Badge tone={ratingTone(e.condition_after)}>{e.condition_after.toUpperCase()}</Badge>
                    )}
                  </div>
                  {(e.provider || e.serviced_by) && (
                    <p className="text-xs text-muted mb-2">
                      {e.provider && (
                        <>
                          Vendor: <span className="font-medium text-navy">{e.provider.name}</span>
                          {e.provider.trade && <span> — {e.provider.trade}</span>}
                        </>
                      )}
                      {e.provider && e.serviced_by && <span className="mx-2">·</span>}
                      {e.serviced_by && <>Technician: {e.serviced_by}</>}
                    </p>
                  )}
                  {e.notes && <p className="text-sm text-navy mb-2 whitespace-pre-wrap">{e.notes}</p>}
                  {evPhotos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {evPhotos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`service ${i + 1}`} className="w-full h-20 object-cover rounded border hover:opacity-90" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted mb-1">{label}</div>
      <div>{value}</div>
    </div>
  );
}

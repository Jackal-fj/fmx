import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge, { severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

function statusLabel(s: string | null) {
  if (!s) return '—';
  return s.replace('_', ' ').toUpperCase();
}

function statusTone(s: string | null): 'good' | 'warn' | 'bad' | 'muted' {
  if (s === 'resolved') return 'good';
  if (s === 'work_ordered') return 'warn';
  if (s === 'open') return 'bad';
  return 'muted';
}

export default async function DefectDetail({
  params,
}: {
  params: { number: string };
}) {
  // Fetch defect first so we can use its id to fetch updates in parallel next.
  const { data: defect } = await supabaseServer
    .from('defects')
    .select(`
      id, defect_number, title, description, severity, status,
      identified_at, resolved_at, resolution_notes, photo_urls,
      property:property_id ( short_code, name ),
      space:space_id ( name, short_code )
    `)
    .eq('defect_number', params.number)
    .maybeSingle();

  if (!defect) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Defect <span className="font-mono">{params.number}</span> not found.
        </div>
        <Link href="/defects" className="block mt-4 text-sm text-navy hover:underline">← Back to defects</Link>
      </div>
    );
  }

  const property = (defect.property as unknown) as { short_code: string; name: string } | null;
  const space = (defect.space as unknown) as { name: string; short_code: string } | null;
  const photos: string[] = Array.isArray(defect.photo_urls) ? defect.photo_urls : [];

  // --- fetch update audit trail + whatsapp thread in parallel --------------
  const [{ data: updates }, { data: waMessages }] = await Promise.all([
    supabaseServer
      .from('defect_updates')
      .select(`
        id, status_from, status_to, notes, photo_urls, created_at, source,
        provider:provider_id ( name, trade )
      `)
      .eq('defect_id', defect.id)
      .order('created_at', { ascending: false }),
    supabaseServer
      .from('whatsapp_messages')
      .select(`
        id, direction, from_number, to_number, body, media_urls, message_type, status,
        created_at, sent_at, delivered_at, read_at, error_message,
        provider:provider_id ( name, trade )
      `)
      .eq('defect_id', defect.id)
      .order('created_at', { ascending: true }),
  ]);

  const dispatchKey = process.env.QUICK_ADD_SECRET || '';

  return (
    <div className="max-w-3xl">
      <Link href="/defects" className="text-sm text-muted hover:text-navy">← Back to defects</Link>

      <div className="flex items-baseline justify-between mt-2 mb-1 gap-3">
        <h1 className="text-2xl font-bold text-navy">{defect.title}</h1>
        <span className="font-mono text-xs text-muted whitespace-nowrap">{defect.defect_number}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Badge tone={severityTone(defect.severity)}>{(defect.severity || '').toUpperCase()}</Badge>
        <Badge tone={statusTone(defect.status)}>{statusLabel(defect.status)}</Badge>
        {property && (
          <Link href={`/properties/${property.short_code}`} className="text-xs px-2 py-1 rounded-full border bg-white text-navy hover:bg-gray-50">
            {property.short_code} — {property.name}
          </Link>
        )}
        {space && (
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-muted">
            {space.name}
          </span>
        )}
      </div>

      {dispatchKey && defect.status !== 'resolved' && (
        <div className="flex gap-2 mb-6">
          <Link
            href={`/dispatch/${encodeURIComponent(defect.defect_number)}?key=${encodeURIComponent(dispatchKey)}`}
            className="text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-800"
          >
            Dispatch to vendor via WhatsApp
          </Link>
          <Link
            href={`/update-defect/${encodeURIComponent(defect.defect_number)}?key=${encodeURIComponent(dispatchKey)}`}
            className="text-xs px-3 py-1.5 rounded-md border border-navy text-navy hover:bg-navy hover:text-white"
          >
            Update status
          </Link>
        </div>
      )}

      {defect.description && (
        <div className="rounded-lg border bg-white p-4 mb-6 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted mb-1">Description</div>
          <p className="whitespace-pre-wrap">{defect.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg border bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted mb-1">Identified</div>
          <div>{(defect.identified_at || '').slice(0, 10) || '—'}</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted mb-1">Resolved</div>
          <div>{(defect.resolved_at || '').slice(0, 10) || '—'}</div>
        </div>
      </div>

      {defect.resolution_notes && (
        <div className="rounded-lg border bg-white p-4 mb-6 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted mb-1">Resolution notes</div>
          <p className="whitespace-pre-wrap">{defect.resolution_notes}</p>
        </div>
      )}

      {/* ---------- all photos (aggregated) ---------- */}
      {photos.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">
            Photos ({photos.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={url}
                  alt={`evidence ${i + 1}`}
                  className="w-full h-32 object-cover rounded border hover:opacity-90"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ---------- update history ---------- */}
      <div>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">
          History ({(updates || []).length})
        </h2>
        {(updates || []).length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-muted">
            No status changes logged. This defect is still in its original state.
          </div>
        ) : (
          <div className="space-y-3">
            {(updates || []).map((u: any) => {
              const photos: string[] = Array.isArray(u.photo_urls) ? u.photo_urls : [];
              return (
                <div key={u.id} className="rounded-lg border bg-white p-3">
                  <div className="flex items-baseline justify-between mb-1 gap-2">
                    <div className="text-sm">
                      <span className="font-medium uppercase">{statusLabel(u.status_from)}</span>
                      <span className="text-muted mx-2">→</span>
                      <span className="font-medium uppercase">{statusLabel(u.status_to)}</span>
                    </div>
                    <span className="text-[11px] text-muted whitespace-nowrap">
                      {(u.created_at || '').slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  {u.provider && (
                    <p className="text-xs text-muted mb-1">
                      Vendor: <span className="font-medium text-navy">{u.provider.name}</span>
                      {u.provider.trade && <span> — {u.provider.trade}</span>}
                    </p>
                  )}
                  {u.notes && (
                    <p className="text-sm text-navy mb-2 whitespace-pre-wrap">{u.notes}</p>
                  )}
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {photos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={url}
                            alt={`evidence ${i + 1}`}
                            className="w-full h-20 object-cover rounded border hover:opacity-90"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-muted mt-2">via {u.source}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- WhatsApp thread ---------- */}
      {(waMessages || []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">
            WhatsApp thread ({(waMessages || []).length})
          </h2>
          <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
            {(waMessages || []).map((m: any) => {
              const outbound = m.direction === 'outbound';
              const media: string[] = Array.isArray(m.media_urls) ? m.media_urls : [];
              return (
                <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg p-3 ${outbound ? 'bg-green-50 border border-green-200' : 'bg-white border'}`}>
                    <div className="text-[11px] text-muted mb-1 flex items-center gap-2">
                      {outbound
                        ? <span>CMS → {m.provider?.name || m.to_number}</span>
                        : <span>{m.provider?.name || m.from_number} → CMS</span>
                      }
                      <span>·</span>
                      <span>{(m.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                      <span>·</span>
                      <span className="uppercase text-[10px]">{m.status}</span>
                    </div>
                    {m.body && <p className="text-sm text-navy whitespace-pre-wrap">{m.body}</p>}
                    {media.length > 0 && (
                      <div className="grid grid-cols-3 gap-1 mt-2">
                        {media.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="" className="w-full h-16 object-cover rounded" />
                          </a>
                        ))}
                      </div>
                    )}
                    {m.error_message && (
                      <div className="text-[11px] text-red-700 mt-1">{m.error_message}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

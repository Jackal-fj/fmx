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

  // --- fetch update audit trail -------------------------------------------
  const { data: updates } = await supabaseServer
    .from('defect_updates')
    .select('id, status_from, status_to, notes, photo_urls, created_at, source')
    .eq('defect_id', defect.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-3xl">
      <Link href="/defects" className="text-sm text-muted hover:text-navy">← Back to defects</Link>

      <div className="flex items-baseline justify-between mt-2 mb-1 gap-3">
        <h1 className="text-2xl font-bold text-navy">{defect.title}</h1>
        <span className="font-mono text-xs text-muted whitespace-nowrap">{defect.defect_number}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
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
    </div>
  );
}

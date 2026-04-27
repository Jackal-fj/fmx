import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone, severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

type ComponentScore = { label?: string; average?: number; avg_score?: number };

export default async function PropertyDetail({ params }: { params: { code: string } }) {
  const sb = supabaseServer;
  const code = params.code.toUpperCase();

  const { data: property } = await sb
    .from('properties')
    .select('*')
    .eq('short_code', code)
    .maybeSingle();

  if (!property) return notFound();

  const [
    { data: fcas },
    { data: defects },
    { data: assets },
    { data: contracts },
  ] = await Promise.all([
    sb.from('condition_assessments').select('*').eq('property_id', property.id).order('assessed_at', { ascending: false }),
    sb.from('defects').select('defect_number, title, severity, status, identified_at, description').eq('property_id', property.id).order('defect_number'),
    sb.from('assets').select('asset_code, name, asset_type, make, model, current_condition').eq('property_id', property.id).eq('active', true).order('asset_code'),
    sb.from('service_contracts').select('contract_name, frequency, fee_amount, fee_currency, next_service_date, active').eq('property_id', property.id).eq('active', true),
  ]);

  const latestFca = fcas?.[0];
  const open = (defects || []).filter(d => d.status === 'open' || d.status === 'work_ordered');
  const resolved = (defects || []).filter(d => d.status === 'resolved');
  const components: [string, ComponentScore][] = latestFca?.component_scores
    ? Object.entries(latestFca.component_scores as Record<string, ComponentScore>)
    : [];

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-muted hover:text-navy">← Dashboard</Link>
        <div className="flex items-baseline justify-between mt-2">
          <h1 className="text-3xl font-bold text-navy">{property.name}</h1>
          <span className="text-muted">{property.short_code}</span>
        </div>
        <p className="text-muted mt-1">
          {property.tenant_name}{property.tenant_short_code ? ` (${property.tenant_short_code})` : ''}  •  {property.address}
        </p>
      </div>

      {/* FCA */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-navy mb-3">Facility Condition Assessment</h2>
        {latestFca ? (
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="p-5 border-b flex items-center gap-6">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Overall</div>
                <div className="flex items-center gap-3 mt-1">
                  <Badge tone={ratingTone(latestFca.overall_rating)}>{(latestFca.overall_rating || '—').toUpperCase()}</Badge>
                  <span className="text-3xl font-bold">{latestFca.numeric_score == null ? '—' : Number(latestFca.numeric_score).toFixed(2)}</span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Assessed</div>
                <div className="text-sm mt-1">{(latestFca.assessed_at || '').slice(0, 10)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Photos</div>
                <div className="text-sm mt-1">{latestFca.photo_count || 0}</div>
              </div>
            </div>
            {components.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-muted">
                  <tr>
                    <th className="text-left p-3">Component</th>
                    <th className="text-left p-3">Rating</th>
                    <th className="text-right p-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map(([key, sect]) => {
                    const score = sect.average ?? sect.avg_score;
                    return (
                      <tr key={key} className="border-t">
                        <td className="p-3 font-medium capitalize">{key.replaceAll('_', ' ')}</td>
                        <td className="p-3"><Badge tone={ratingTone(sect.label)}>{(sect.label || '—').toUpperCase()}</Badge></td>
                        <td className="p-3 text-right font-mono">{score == null ? '—' : Number(score).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {latestFca.summary && (
              <div className="p-5 border-t bg-gray-50 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted mb-2">Summary</div>
                <p>{latestFca.summary}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted text-sm">No FCA on record.</p>
        )}
      </section>

      {/* Defects */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold text-navy">Defects</h2>
          <span className="text-sm text-muted">{open.length} open  •  {resolved.length} resolved</span>
        </div>
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-muted">
              <tr>
                <th className="text-left p-3">Ref</th>
                <th className="text-left p-3">Severity</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(defects || []).slice(0, 50).map((d) => (
                <tr key={d.defect_number} className="border-t">
                  <td className="p-3 font-mono text-xs">{d.defect_number}</td>
                  <td className="p-3"><Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge></td>
                  <td className="p-3">{d.title}</td>
                  <td className="p-3 text-muted">{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(defects?.length ?? 0) > 50 && (
            <div className="p-3 text-xs text-muted border-t">
              Showing first 50 of {defects?.length}.
            </div>
          )}
        </div>
      </section>

      {/* Assets summary */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-navy mb-3">Asset register ({assets?.length ?? 0})</h2>
        {(assets?.length ?? 0) > 0 ? (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-muted">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Make / Model</th>
                  <th className="text-left p-3">Condition</th>
                </tr>
              </thead>
              <tbody>
                {(assets || []).slice(0, 30).map(a => (
                  <tr key={a.asset_code} className="border-t">
                    <td className="p-3 font-mono text-xs">{a.asset_code}</td>
                    <td className="p-3">{a.name}</td>
                    <td className="p-3 text-muted">
                      {a.make || ''}{a.make && a.model ? ' ' : ''}{a.model || ''}
                      {!a.make && !a.model ? '—' : ''}
                    </td>
                    <td className="p-3">
                      <Badge tone={ratingTone(a.current_condition)}>
                        {(a.current_condition || '—').toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(assets?.length ?? 0) > 30 && (
              <div className="p-3 text-xs text-muted border-t">
                Showing first 30 of {assets?.length}.
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted text-sm">No assets registered.</p>
        )}
      </section>

      {/* Service contracts */}
      <section>
        <h2 className="text-lg font-bold text-navy mb-3">Service contracts</h2>
        {(contracts?.length ?? 0) > 0 ? (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-muted">
                <tr>
                  <th className="text-left p-3">Contract</th>
                  <th className="text-left p-3">Frequency</th>
                  <th className="text-right p-3">Fee</th>
                  <th className="text-left p-3">Next service</th>
                </tr>
              </thead>
              <tbody>
                {(contracts || []).map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3">{c.contract_name}</td>
                    <td className="p-3 text-muted">{c.frequency || '—'}</td>
                    <td className="p-3 text-right font-mono">
                      {c.fee_amount == null ? 'TBC' : `${c.fee_currency} ${Number(c.fee_amount).toFixed(2)}`}
                    </td>
                    <td className="p-3 text-muted">{c.next_service_date || 'TBC'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted text-sm">No active service contracts.</p>
        )}
      </section>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone, severityTone } from '@/components/badge';
import DefaultTemplatePicker from '@/components/default-template-picker';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type ComponentScore = { label?: string; average?: number; avg_score?: number };

export default async function PropertyDetail({ params }: { params: { code: string } }) {
  noStore();
  const sb = supabaseServer;
  const code = decodeURIComponent(params.code).toUpperCase();

  const { data: property } = await sb
    .from('properties')
    .select('*, client:client_id ( short_code, name )')
    .eq('short_code', code)
    .maybeSingle();

  if (!property) return notFound();

  const [
    { data: fcas },
    { data: defects },
    { data: assets },
    { data: contracts },
    { data: templates },
  ] = await Promise.all([
    sb.from('condition_assessments').select('*').eq('property_id', property.id).order('assessed_at', { ascending: false }),
    sb.from('defects').select('defect_number, title, severity, status, identified_at, description').eq('property_id', property.id).neq('status', 'draft').order('defect_number'),
    sb.from('assets').select('asset_code, name, asset_type, make, model, current_condition').eq('property_id', property.id).eq('active', true).order('asset_code'),
    sb.from('service_contracts').select('contract_name, frequency, fee_amount, fee_currency, next_service_date, active').eq('property_id', property.id).eq('active', true),
    sb.from('inspection_templates').select('id, name').eq('active', true).in('scope', ['property', 'any']).order('name'),
  ]);
  const quickAddKey = process.env.QUICK_ADD_SECRET || '';

  const latestFca = fcas?.[0];
  const open = (defects || []).filter(d => d.status === 'open' || d.status === 'work_ordered');
  const resolved = (defects || []).filter(d => d.status === 'resolved');
  const components: [string, ComponentScore][] = latestFca?.component_scores
    ? Object.entries(latestFca.component_scores as Record<string, ComponentScore>)
    : [];

  return (
    <div>
      <div className="mb-6">
        <div className="text-sm text-muted">
          <Link href="/clients" className="hover:text-navy">Clients</Link>
          {property.client && (<>
            <span className="mx-1.5">/</span>
            <Link href={`/clients/${property.client.short_code}`} className="hover:text-navy">{property.client.name}</Link>
          </>)}
          <span className="mx-1.5">/</span>
          <span>{property.short_code}</span>
        </div>
        <div className="flex items-baseline justify-between mt-2">
          <h1 className="text-3xl font-bold text-navy">{property.name}</h1>
          <span className="text-muted">{property.short_code}</span>
        </div>
        <p className="text-muted mt-1">
          {[
            property.tenant_name ? `${property.tenant_name}${property.tenant_short_code ? ` (${property.tenant_short_code})` : ''}` : null,
            property.address,
          ].filter(Boolean).join('  •  ') || '—'}
        </p>
        <div className="flex gap-2 mt-3">
          <Link href={`/defects?property=${encodeURIComponent(property.short_code)}`}
            className="rounded-full border border-gray-300 text-navy text-sm font-semibold px-4 py-2 hover:border-navy">All defects</Link>
        </div>
      </div>

      {/* FMX-063 / FMX-064 — default inspection template + Start button */}
      {quickAddKey && (
        <div className="mb-6">
          <DefaultTemplatePicker
            target="property"
            targetId={property.short_code}
            current={property.default_inspection_template_id || null}
            templates={(templates || []) as any}
            secretKey={quickAddKey}
            startHrefPrefix="/inspect/new?template="
            startExtraQs={`&property=${encodeURIComponent(property.short_code)}`}
          />
        </div>
      )}

      {/* FCA */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-navy mb-3">Facility Condition Assessment</h2>
        {latestFca ? (
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="p-4 border-b grid grid-cols-3 gap-4">
              <div className="col-span-3 sm:col-span-1">
                <div className="text-xs uppercase tracking-wide text-muted">Overall</div>
                <div className="flex items-center gap-3 mt-1">
                  <Badge tone={ratingTone(latestFca.overall_rating)}>{(latestFca.overall_rating || '—').toUpperCase()}</Badge>
                  <span className="text-2xl sm:text-3xl font-bold">{latestFca.numeric_score == null ? '—' : Number(latestFca.numeric_score).toFixed(2)}</span>
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
              <ul className="divide-y">
                {components.map(([key, sect]) => {
                  const score = sect.average ?? sect.avg_score;
                  return (
                    <li key={key} className="p-3 flex items-center gap-3">
                      <span className="flex-1 min-w-0 text-sm font-medium capitalize truncate">{key.replaceAll('_', ' ')}</span>
                      <Badge tone={ratingTone(sect.label)}>{(sect.label || '—').toUpperCase()}</Badge>
                      <span className="w-14 text-right font-mono text-sm">{score == null ? '—' : Number(score).toFixed(2)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {latestFca.summary && (
              <div className="p-4 border-t bg-gray-50 text-sm">
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
          <ul className="divide-y">
            {(defects || []).slice(0, 50).map((d) => (
              <li key={d.defect_number}>
                <Link href={`/defects/${encodeURIComponent(d.defect_number)}`} className="block px-4 py-3 hover:bg-blue-50/40 min-h-[44px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-navy">{d.defect_number}</span>
                    <Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge>
                    <span className="ml-auto text-[11px] text-muted">{d.status}</span>
                  </div>
                  <div className="text-sm text-navy mt-1">{d.title}</div>
                </Link>
              </li>
            ))}
          </ul>
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
            <ul className="divide-y">
              {(assets || []).slice(0, 30).map(a => {
                const makeModel = [a.make, a.model].filter(Boolean).join(' ');
                return (
                  <li key={a.asset_code} className="p-3 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {a.asset_code && <div className="font-mono text-[11px] text-muted">{a.asset_code}</div>}
                      <div className="text-sm text-navy">{a.name}</div>
                      {makeModel && <div className="text-xs text-muted truncate">{makeModel}</div>}
                    </div>
                    <Badge tone={ratingTone(a.current_condition)}>{(a.current_condition || '—').toUpperCase()}</Badge>
                  </li>
                );
              })}
            </ul>
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
            <ul className="divide-y">
              {(contracts || []).map((c, i) => (
                <li key={i} className="p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-navy">{c.contract_name}</span>
                    <span className="text-sm font-mono shrink-0">
                      {c.fee_amount == null ? 'TBC' : `${c.fee_currency} ${Number(c.fee_amount).toFixed(0)}`}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {[c.frequency || '—', `next ${c.next_service_date || 'TBC'}`].join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted text-sm">No active service contracts.</p>
        )}
      </section>
    </div>
  );
}

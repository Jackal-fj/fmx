import { notFound, redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import Runner from './runner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function InspectionRunnerPage({
  params, searchParams,
}: {
  params: { session_id: string };
  searchParams: { key?: string };
}) {
  noStore();
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const sessionId = params.session_id;

  const { data: session } = await supabaseServer
    .from('inspection_sessions')
    .select('id, template_id, property_id, asset_id, inspector_name, started_at, completed_at, template:template_id ( id, name )')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return notFound();

  const [{ data: items }, { data: results }, propertyRow, assetRow, raisedRows] = await Promise.all([
    supabaseServer
      .from('inspection_template_items')
      .select('id, sort_order, question, kind, required, photo_required, trade, fail_if, notes')
      .eq('template_id', session.template_id)
      .order('sort_order'),
    supabaseServer
      .from('inspection_results')
      .select('template_item_id, answer_bool, answer_number, answer_text, photo_urls, failed, failure_reason, defect_id')
      .eq('session_id', sessionId),
    session.property_id
      ? supabaseServer.from('properties').select('short_code, name').eq('id', session.property_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session.asset_id
      ? supabaseServer.from('assets').select('asset_code, name').eq('id', session.asset_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // FMX-056: pull the defects auto-raised from this session so the done
    // screen can list them for the inspector before they leave the page.
    supabaseServer
      .from('inspection_results')
      .select('defect_id, defect:defect_id ( defect_number, title, severity )')
      .eq('session_id', sessionId)
      .not('defect_id', 'is', null),
  ]);

  const template = session.template as any as { id: string; name: string } | null;
  const property = (propertyRow as any)?.data as { short_code: string; name: string } | null;
  const asset = (assetRow as any)?.data as { asset_code: string | null; name: string } | null;

  const headerLine = [
    property && `${property.short_code} — ${property.name}`,
    asset && (asset.asset_code ? `${asset.asset_code} — ${asset.name}` : asset.name),
  ].filter(Boolean).join(' · ');

  const raisedDefects = ((raisedRows as any)?.data || [])
    .map((r: any) => r.defect)
    .filter(Boolean) as Array<{ defect_number: string; title: string; severity: string }>;

  return (
    <div className="max-w-md mx-auto">
      <Runner
        sessionId={sessionId}
        templateName={template?.name || '—'}
        headerLine={headerLine}
        items={(items || []) as any}
        initialResults={(results || []) as any}
        completed={!!session.completed_at}
        raisedDefects={raisedDefects}
        secretKey={key}
      />
    </div>
  );
}

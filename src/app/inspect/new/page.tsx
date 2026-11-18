import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import NewSessionForm from './form';

export const dynamic = 'force-dynamic';

// FMX-055: start a new inspection session. Supports deep-link prefill
// from the scanner (property / asset short-codes) so a tap on a QR code
// walks the FM straight into the right checklist.
export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: { template?: string; property?: string; asset?: string; key?: string };
}) {
  noStore();
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const [{ data: templates }, { data: properties }, { data: assets }] = await Promise.all([
    supabaseServer
      .from('inspection_templates')
      .select('id, name, scope')
      .eq('active', true)
      .order('name'),
    supabaseServer
      .from('properties')
      .select('short_code, name')
      .eq('active', true)
      .order('short_code'),
    supabaseServer
      .from('assets')
      .select('id, asset_code, name, property:property_id ( short_code )')
      .eq('active', true)
      .order('asset_code'),
  ]);

  // Resolve initial property / asset from search params (short_code / id).
  const pick = (val: string | undefined) => (val || '').trim();
  const initial = {
    templateId: pick(searchParams.template) || (templates?.[0]?.id ?? ''),
    propertyCode: pick(searchParams.property).toUpperCase(),
    assetId: pick(searchParams.asset),
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-bold text-navy mb-1">New inspection</h1>
      <p className="text-sm text-muted mb-5">
        Pick a template and (optionally) the site or piece of equipment it's for. The run takes you one question at a time.
      </p>
      <NewSessionForm
        templates={(templates || []) as any}
        properties={(properties || []) as any}
        assets={(assets || []) as any}
        initial={initial}
        secretKey={key}
      />
    </div>
  );
}

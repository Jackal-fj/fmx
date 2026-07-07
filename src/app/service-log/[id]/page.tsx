import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import ServiceLogForm from './form';

export const dynamic = 'force-dynamic';

export default async function ServiceLogPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { key?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const { data: asset } = await supabaseServer
    .from('assets')
    .select(`
      id, name, asset_type, current_condition,
      last_serviced_at, service_interval_months,
      property:property_id ( short_code, name )
    `)
    .eq('id', params.id)
    .maybeSingle();

  const { data: providers } = await supabaseServer
    .from('providers')
    .select('id, name, trade, whatsapp_number')
    .eq('active', true)
    .order('name');

  if (!asset) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Asset not found.
        </div>
        <Link href={`/service-log?key=${encodeURIComponent(key)}`} className="block mt-4 text-sm text-navy hover:underline">← Back to service log</Link>
      </div>
    );
  }

  const property = (asset.property as unknown) as { short_code: string; name: string } | null;

  return (
    <div className="max-w-md mx-auto">
      <Link href={`/service-log?key=${encodeURIComponent(key)}`} className="text-sm text-muted hover:text-navy">← Back to asset list</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Log service</h1>
      <p className="text-sm text-muted mb-6">
        Record a service event with photo evidence. Updates last-serviced and next-due dates.
      </p>

      <ServiceLogForm
        asset={{
          id: asset.id,
          name: asset.name,
          asset_type: asset.asset_type,
          current_condition: asset.current_condition,
          last_serviced_at: asset.last_serviced_at,
          service_interval_months: asset.service_interval_months,
          property_short_code: property?.short_code || '—',
        }}
        providers={providers || []}
        secretKey={key}
      />
    </div>
  );
}

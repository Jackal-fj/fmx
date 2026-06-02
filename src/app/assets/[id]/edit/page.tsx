import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import EditAssetForm from './form';

export const dynamic = 'force-dynamic';

export default async function EditAssetPage({
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
      id, name, asset_code, asset_type, make, model, serial_number,
      install_date, warranty_expiry_date, service_interval_months,
      current_condition, replacement_cost_fjd, notes, active, photo_urls,
      space_id, property_id,
      property:property_id ( short_code, name )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (!asset) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Asset not found.
        </div>
        <Link href="/assets" className="block mt-4 text-sm text-navy hover:underline">← Back to assets</Link>
      </div>
    );
  }

  const property = (asset.property as unknown) as { short_code: string; name: string } | null;

  const { data: spaces } = await supabaseServer
    .from('spaces')
    .select('id, property_id, name, short_code, space_type')
    .eq('active', true)
    .order('name');

  return (
    <div className="max-w-md mx-auto">
      <Link href={`/assets/${asset.id}?key=${encodeURIComponent(key)}`} className="text-sm text-muted hover:text-navy">← Back to asset</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Edit asset</h1>
      <p className="text-sm text-muted mb-6">Update any field. Existing photos are preserved.</p>

      <EditAssetForm
        asset={{
          id: asset.id,
          property_id: asset.property_id,
          property_short_code: property?.short_code || '—',
          property_name: property?.name || '—',
          space_id: asset.space_id,
          name: asset.name,
          asset_type: asset.asset_type,
          asset_code: asset.asset_code,
          make: asset.make,
          model: asset.model,
          serial_number: asset.serial_number,
          install_date: asset.install_date,
          warranty_expiry_date: asset.warranty_expiry_date,
          service_interval_months: asset.service_interval_months,
          current_condition: asset.current_condition,
          replacement_cost_fjd: asset.replacement_cost_fjd,
          notes: asset.notes,
          active: asset.active,
          photo_urls: Array.isArray(asset.photo_urls) ? asset.photo_urls : [],
        }}
        spaces={(spaces || []) as any}
        secretKey={key}
      />
    </div>
  );
}

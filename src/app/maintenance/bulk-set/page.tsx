import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import BulkSetForm from './form';

export const dynamic = 'force-dynamic';

export default async function BulkSetPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const { data: assets } = await supabaseServer
    .from('assets')
    .select(`
      id, name, asset_code, asset_type,
      service_interval_months, last_serviced_at, next_service_due_at,
      property:property_id ( short_code, name )
    `)
    .eq('active', true)
    .order('asset_type')
    .order('name');

  const rows = (assets || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    asset_code: a.asset_code,
    asset_type: a.asset_type,
    service_interval_months: a.service_interval_months,
    last_serviced_at: a.last_serviced_at,
    next_service_due_at: a.next_service_due_at,
    property_short_code: a.property?.short_code || '—',
    property_name: a.property?.name || '—',
  }));

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/maintenance?key=${encodeURIComponent(key)}`}
        className="text-sm text-muted hover:text-navy"
      >← Back to maintenance</Link>

      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Bulk-set PM intervals</h1>
      <p className="text-sm text-muted mb-6">
        Set the same service interval on many assets at once — pick the interval, filter by property or type,
        check the assets, save. Existing schedules are overwritten.
      </p>

      <BulkSetForm assets={rows} secretKey={key} />
    </div>
  );
}

import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

export default async function AssetsList({
  searchParams,
}: {
  searchParams: { deleted?: string };
}) {
  // Server component reads the secret directly from env so the action buttons
  // appear when the env is configured. The key is included in links so the
  // destination routes (gated server-side) succeed without an extra hop.
  const key = process.env.QUICK_ADD_SECRET || '';
  const quickAddEnabled = !!key;
  const deletedName = searchParams.deleted;

  const { data: assets } = await supabaseServer
    .from('assets')
    .select(`
      id, asset_code, name, asset_type, make, model, current_condition, created_at,
      property:property_id ( short_code, name )
    `)
    .eq('active', true)
    // Newest first so freshly added assets appear at the top and are visible
    // immediately. Within same created_at, fall back to code so long-standing
    // items keep a stable order.
    .order('created_at', { ascending: false })
    .order('asset_code', { ascending: true, nullsFirst: false })
    .limit(500);

  return (
    <div>
      {deletedName && (
        <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-900 flex items-center gap-2">
          <span>Asset <span className="font-semibold">{deletedName}</span> deleted.</span>
        </div>
      )}
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-navy">Assets</h1>
        {quickAddEnabled && (
          <div className="flex gap-2">
            <Link href={`/service-log?key=${encodeURIComponent(key)}`}
                  className="text-sm px-3 py-1.5 rounded-md border border-navy text-navy hover:bg-navy hover:text-white">
              Service log
            </Link>
            <Link href={`/new-asset?key=${encodeURIComponent(key)}`}
                  className="text-sm px-3 py-1.5 rounded-md bg-navy text-white hover:bg-blue-900">
              + Add asset
            </Link>
          </div>
        )}
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent text-navy">
            <tr>
              <th className="text-left p-3">Code</th>
              <th className="text-left p-3">Property</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Make / Model</th>
              <th className="text-left p-3">Condition</th>
            </tr>
          </thead>
          <tbody>
            {(assets || []).map((a: any) => (
              <tr key={a.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/assets/${a.id}${quickAddEnabled ? `?key=${encodeURIComponent(key)}` : ''}`}
                        className="text-navy hover:underline">
                    {a.asset_code || '—'}
                  </Link>
                </td>
                <td className="p-3">
                  {a.property ? (
                    <Link href={`/properties/${a.property.short_code}`} className="text-navy hover:underline">
                      {a.property.short_code}
                    </Link>
                  ) : '—'}
                </td>
                <td className="p-3">
                  <Link href={`/assets/${a.id}${quickAddEnabled ? `?key=${encodeURIComponent(key)}` : ''}`}
                        className="text-navy hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td className="p-3 text-muted">{a.asset_type}</td>
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
      </div>
    </div>
  );
}

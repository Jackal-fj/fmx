import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge, { ratingTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

export default async function AssetsList() {
  const { data: assets } = await supabaseServer
    .from('assets')
    .select(`
      asset_code, name, asset_type, make, model, current_condition,
      property:property_id ( short_code, name )
    `)
    .eq('active', true)
    .order('asset_code')
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Assets</h1>
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
              <tr key={a.asset_code} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono text-xs">{a.asset_code}</td>
                <td className="p-3">
                  {a.property ? (
                    <Link href={`/properties/${a.property.short_code}`} className="text-navy hover:underline">
                      {a.property.short_code}
                    </Link>
                  ) : '—'}
                </td>
                <td className="p-3">{a.name}</td>
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

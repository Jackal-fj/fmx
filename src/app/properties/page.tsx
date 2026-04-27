import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function PropertiesList() {
  const { data: properties } = await supabaseServer
    .from('properties')
    .select('short_code, name, address, tenant_name, facility_type, storeys')
    .eq('active', true)
    .order('short_code');

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Properties</h1>
      <table className="w-full text-sm border rounded-lg overflow-hidden bg-white">
        <thead className="bg-accent text-navy">
          <tr>
            <th className="text-left p-3">Code</th>
            <th className="text-left p-3">Name</th>
            <th className="text-left p-3">Tenant</th>
            <th className="text-left p-3">Address</th>
            <th className="text-left p-3">Type</th>
          </tr>
        </thead>
        <tbody>
          {(properties || []).map((p) => (
            <tr key={p.short_code} className="border-t hover:bg-gray-50">
              <td className="p-3 font-bold">
                <Link href={`/properties/${p.short_code}`} className="text-navy hover:underline">
                  {p.short_code}
                </Link>
              </td>
              <td className="p-3">{p.name}</td>
              <td className="p-3 text-muted">{p.tenant_name || '—'}</td>
              <td className="p-3 text-muted">{p.address || '—'}</td>
              <td className="p-3 text-muted">
                {p.facility_type || '—'}{p.storeys ? ` • ${p.storeys} storeys` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

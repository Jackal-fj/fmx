import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function PropertiesList() {
  noStore();
  const { data: rows } = await supabaseServer
    .from('properties')
    .select('short_code, name, address, tenant_name, facility_type, storeys, client:client_id ( short_code, name )')
    .eq('active', true)
    .order('short_code');
  // Group by client, then property code.
  const properties = [...(rows || [])].sort((a: any, b: any) =>
    (a.client?.short_code || '').localeCompare(b.client?.short_code || '') || a.short_code.localeCompare(b.short_code));

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Properties</h1>
      <div className="overflow-x-auto">
      <table className="w-full text-sm border rounded-lg overflow-hidden bg-white">
        <thead className="bg-accent text-navy">
          <tr>
            <th className="text-left p-3">Client</th>
            <th className="text-left p-3">Code</th>
            <th className="text-left p-3">Name</th>
            <th className="text-left p-3">Tenant</th>
            <th className="text-left p-3">Address</th>
            <th className="text-left p-3">Type</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p: any) => (
            <tr key={p.short_code} className="border-t hover:bg-gray-50">
              <td className="p-3 whitespace-nowrap">
                {p.client ? (
                  <Link href={`/clients/${p.client.short_code}`} className="text-xs font-semibold text-muted hover:text-navy" title={p.client.name}>
                    {p.client.short_code}
                  </Link>
                ) : '—'}
              </td>
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
    </div>
  );
}

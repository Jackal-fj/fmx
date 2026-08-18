import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function VendorsList({
  searchParams,
}: {
  searchParams: { deleted?: string };
}) {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  const quickAddEnabled = !!key;
  const deletedName = searchParams.deleted;

  const { data: providers } = await supabaseServer
    .from('providers')
    .select('id, name, trade, contact_name, whatsapp_number, email, rating, active')
    .order('active', { ascending: false })
    .order('name');

  return (
    <div>
      {deletedName && (
        <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-900">
          Vendor <span className="font-semibold">{deletedName}</span> deleted.
        </div>
      )}
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-navy">Vendors</h1>
        {quickAddEnabled && (
          <Link href={`/new-vendor?key=${encodeURIComponent(key)}`}
                className="text-sm px-3 py-1.5 rounded-md bg-navy text-white hover:bg-blue-900">
            + Add vendor
          </Link>
        )}
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent text-navy">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Trade</th>
              <th className="text-left p-3">Contact</th>
              <th className="text-left p-3">WhatsApp</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Rating</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(providers || []).map((p: any) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">
                  <Link href={`/vendors/${p.id}`} className="text-navy hover:underline">{p.name}</Link>
                </td>
                <td className="p-3 text-muted">{p.trade || '—'}</td>
                <td className="p-3 text-muted">{p.contact_name || '—'}</td>
                <td className="p-3 text-muted whitespace-nowrap">{p.whatsapp_number || '—'}</td>
                <td className="p-3 text-muted">{p.email || '—'}</td>
                <td className="p-3 text-muted">{p.rating ? `${p.rating}/5` : '—'}</td>
                <td className="p-3 text-muted">{p.active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(providers || []).length === 0 && (
        <p className="mt-4 text-sm text-muted">No vendors yet. Tap + Add vendor to add your first one.</p>
      )}
    </div>
  );
}

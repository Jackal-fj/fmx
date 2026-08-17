import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import EditVendorForm from './form';

export const dynamic = 'force-dynamic';

export default async function EditVendorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { key?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const { data: vendor } = await supabaseServer
    .from('providers')
    .select(`id, name, trade, contact_name, whatsapp_number, email,
             address, website, registration_id,
             hourly_rate_fjd, callout_fee_fjd, insurance_expiry,
             certifications, rating, notes, active`)
    .eq('id', params.id)
    .maybeSingle();

  if (!vendor) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Vendor not found.
        </div>
        <Link href="/vendors" className="block mt-4 text-sm text-navy hover:underline">← Back to vendors</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Link href={`/vendors/${vendor.id}`} className="text-sm text-muted hover:text-navy">← Back to vendor</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Edit vendor</h1>
      <p className="text-sm text-muted mb-6">Update contact, rates, compliance, rating, notes.</p>

      <EditVendorForm vendor={vendor} secretKey={key} />
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import NewAssetForm from './form';

export const dynamic = 'force-dynamic';

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: { key?: string; property?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const { data: properties } = await supabaseServer
    .from('properties')
    .select('id, short_code, name')
    .eq('active', true)
    .order('short_code');

  const { data: spaces } = await supabaseServer
    .from('spaces')
    .select('id, property_id, name, short_code, space_type')
    .eq('active', true)
    .order('name');

  return (
    <div className="max-w-md mx-auto">
      <Link href="/assets" className="text-sm text-muted hover:text-navy">← Back to assets</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Add asset</h1>
      <p className="text-sm text-muted mb-6">
        Register a new asset. Only property, name, and type are required — everything else can be filled in later.
      </p>
      <NewAssetForm
        properties={properties || []}
        spaces={(spaces || []) as any}
        secretKey={key}
      />
    </div>
  );
}

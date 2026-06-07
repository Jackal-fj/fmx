import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import NewDefectForm from './form';

export const dynamic = 'force-dynamic';

export default async function NewDefectPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = searchParams.key || '';
  if (!required || key !== required) {
    redirect('/');
  }

  const { data: properties } = await supabaseServer
    .from('properties')
    .select('short_code, name')
    .eq('active', true)
    .order('short_code');

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-navy mb-1">Log a defect</h1>
      <p className="text-sm text-muted mb-6">
        Quick capture — Property, Title, and Severity required; photo and rest optional.
      </p>
      <NewDefectForm properties={properties || []} secretKey={key} />
    </div>
  );
}

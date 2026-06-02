import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import UpdateDefectForm from './form';

export const dynamic = 'force-dynamic';

export default async function UpdateDefectByNumber({
  params,
  searchParams,
}: {
  params: { number: string };
  searchParams: { key?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();

  // --- gate ---------------------------------------------------------------
  if (!required || key !== required) {
    redirect('/');
  }

  // --- fetch defect -------------------------------------------------------
  const { data: defect } = await supabaseServer
    .from('defects')
    .select(`
      id, defect_number, title, severity, status,
      property:property_id ( short_code, name )
    `)
    .eq('defect_number', params.number)
    .maybeSingle();

  if (!defect) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Defect <span className="font-mono">{params.number}</span> not found.
        </div>
        <Link
          href={`/update-defect?key=${encodeURIComponent(key)}`}
          className="block mt-4 text-sm text-navy hover:underline"
        >← Back to defect list</Link>
      </div>
    );
  }

  const property = defect.property as { short_code: string; name: string } | null;

  return (
    <div className="max-w-md mx-auto">
      <Link
        href={`/update-defect?key=${encodeURIComponent(key)}`}
        className="text-sm text-muted hover:text-navy"
      >← Back to defect list</Link>

      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Update defect</h1>
      <p className="text-sm text-muted mb-6">
        Change status with photo evidence. At least one photo is required.
      </p>

      <UpdateDefectForm
        defect={{
          id: defect.id,
          defect_number: defect.defect_number,
          title: defect.title,
          severity: defect.severity,
          status: defect.status,
          property_short_code: property?.short_code || '—',
          property_name: property?.name || '—',
        }}
        secretKey={key}
      />
    </div>
  );
}

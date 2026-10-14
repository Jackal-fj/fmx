import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import DispatchForm from './form';

export const dynamic = 'force-dynamic';

export default async function DispatchPage({
  params,
  searchParams,
}: {
  params: { number: string };
  searchParams: { key?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const [{ data: defect }, { data: providers }] = await Promise.all([
    supabaseServer
      .from('defects')
      .select(`
        id, defect_number, title, description, severity, status, identified_at, photo_urls,
        property:property_id ( short_code, name ),
        space:space_id ( name, space_type )
      `)
      .eq('defect_number', params.number)
      .maybeSingle(),
    supabaseServer
      .from('providers')
      .select('id, name, trade, whatsapp_number, contact_name')
      .eq('active', true)
      .not('whatsapp_number', 'is', null)
      .order('name'),
  ]);

  if (!defect) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Defect not found.
        </div>
        <Link href="/defects" className="block mt-4 text-sm text-navy hover:underline">← Back to defects</Link>
      </div>
    );
  }

  const property = (defect.property as unknown) as { short_code: string; name: string } | null;
  const space = (defect.space as unknown) as { name: string; space_type: string } | null;
  const photos: string[] = Array.isArray(defect.photo_urls) ? defect.photo_urls : [];

  return (
    <div className="max-w-md mx-auto">
      <Link
        href={`/defects/${encodeURIComponent(defect.defect_number)}`}
        className="text-sm text-muted hover:text-navy"
      >← Back to defect</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Dispatch to vendor</h1>
      <p className="text-sm text-muted mb-6">
        Opens WhatsApp with the vendor + message pre-filled. Photo links are included in the message body.
      </p>

      <DispatchForm
        defect={{
          id: defect.id,
          defect_number: defect.defect_number,
          title: defect.title,
          description: defect.description || '',
          severity: defect.severity,
          status: defect.status,
          identified_at: defect.identified_at,
          property_short_code: property?.short_code || '—',
          property_name: property?.name || '—',
          space_name: space?.name || null,
          photos,
        }}
        providers={providers || []}
        secretKey={key}
      />
    </div>
  );
}

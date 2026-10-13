import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import PromoteDraftForm from './form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function PromoteDraftPage({
  params,
  searchParams,
}: {
  params: { number: string };
  searchParams: { key?: string };
}) {
  noStore();

  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  const [{ data: defect }, { data: properties }] = await Promise.all([
    supabaseServer
      .from('defects')
      .select(`
        id, defect_number, title, description, severity, status, photo_urls,
        property:property_id ( short_code )
      `)
      .eq('defect_number', params.number)
      .maybeSingle(),
    supabaseServer
      .from('properties')
      .select('short_code, name')
      .eq('active', true)
      .order('short_code'),
  ]);

  if (!defect) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Defect <span className="font-mono">{params.number}</span> not found.
        </div>
        <Link href="/email-inbox" className="block mt-4 text-sm text-navy hover:underline">
          ← Back to Email Inbox
        </Link>
      </div>
    );
  }

  if (defect.status !== 'draft') {
    // Not a draft — just send Carl to the detail page with highlight.
    redirect(`/defects/${encodeURIComponent(defect.defect_number)}?highlight=1`);
  }

  // Pull the originating inbox email (most recent one that created this defect)
  // so we can show Carl the context he's reviewing.
  const { data: inbox } = await supabaseServer
    .from('email_inbox')
    .select('from_email, from_name, subject, received_at')
    .eq('created_defect_id', defect.id)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prop = (defect.property as unknown) as { short_code: string } | null;
  const photoCount = Array.isArray(defect.photo_urls) ? defect.photo_urls.length : 0;

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/email-inbox" className="text-sm text-muted hover:text-navy">← Email Inbox</Link>

      <div className="flex items-baseline justify-between mt-2 mb-1 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-navy">Review draft defect</h1>
        <span className="font-mono text-xs text-muted">{defect.defect_number}</span>
      </div>
      <p className="text-sm text-muted mb-6">
        Edit any field — ingestion made its best guesses. Approve to promote to Open, or reject to delete.
      </p>

      <PromoteDraftForm
        defect={{
          id: defect.id,
          defect_number: defect.defect_number,
          title: defect.title,
          description: defect.description,
          severity: defect.severity,
          photo_count: photoCount,
          source_email: inbox ? {
            from: inbox.from_name ? `${inbox.from_name} <${inbox.from_email}>` : inbox.from_email,
            subject: inbox.subject,
            received_at: inbox.received_at,
          } : null,
        }}
        properties={properties || []}
        initialProperty={prop?.short_code || ''}
        secretKey={key}
      />
    </div>
  );
}

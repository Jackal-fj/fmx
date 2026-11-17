import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import GenerateForm from './generate-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { key?: string; saved?: string; month?: string; client?: string };
}) {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  const generateEnabled = !!key;
  const urlKey = (searchParams.key || '').trim();

  const selectedClient = (searchParams.client || 'KGF').toString().toUpperCase();

  const [{ data: properties }, { data: clients }, { data: latest }] = await Promise.all([
    supabaseServer
      .from('properties')
      .select('short_code, name, client:client_id ( short_code )')
      .eq('active', true)
      .order('short_code'),
    supabaseServer
      .from('clients')
      .select('id, short_code, name')
      .eq('active', true)
      .order('short_code'),
    supabaseServer
      .from('report_runs')
      .select('client_id, generated_at, report_month')
      .order('generated_at', { ascending: false })
      .limit(50),
  ]);

  const scopedProperties = (properties || []).filter((p: any) =>
    (p.client as { short_code: string } | null)?.short_code === selectedClient,
  );

  const selectedClientId = (clients || []).find((c: any) => c.short_code === selectedClient)?.id;
  const clientRunCount = (latest || []).filter((r: any) => r.client_id === selectedClientId).length;
  const lastRun = (latest || []).find((r: any) => r.client_id === selectedClientId);

  const savedNote = searchParams.saved
    ? `Generated ${searchParams.saved} report${searchParams.saved === '1' ? '' : 's'} for ${searchParams.month || ''}.`
    : null;

  const historyHref = urlKey
    ? `/reports/history?key=${encodeURIComponent(urlKey)}&client=${encodeURIComponent(selectedClient)}`
    : `/reports/history?client=${encodeURIComponent(selectedClient)}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Reports</h1>
        <p className="text-sm text-muted mt-1">
          Generate a fresh monthly report. Pick client, month, and scope.
        </p>
      </div>

      {/* Client picker */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <span className="text-xs uppercase tracking-wide text-muted mr-1">Client</span>
        {(clients || []).map((c: any) => {
          const active = c.short_code === selectedClient;
          const href = urlKey
            ? `/reports?key=${encodeURIComponent(urlKey)}&client=${encodeURIComponent(c.short_code)}`
            : `/reports?client=${encodeURIComponent(c.short_code)}`;
          return (
            <Link
              key={c.short_code}
              href={href}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-muted border-gray-300 hover:border-navy hover:text-navy'
              }`}
            >
              {c.short_code} — {c.name}
            </Link>
          );
        })}
      </div>

      {savedNote && (
        <div className="mb-6 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 flex items-baseline justify-between gap-3">
          <span>✓ {savedNote}</span>
          <Link href={historyHref} className="text-xs text-green-900 underline whitespace-nowrap">View history</Link>
        </div>
      )}

      {generateEnabled ? (
        <GenerateForm properties={scopedProperties as any} secretKey={key} client={selectedClient} />
      ) : (
        <div className="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
          Report generation is gated by QUICK_ADD_SECRET. Only visible when configured.
        </div>
      )}

      {/* History link — always visible, no inline list */}
      <div className="rounded-lg border bg-gray-50 p-4 text-sm flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-navy">Download history</div>
          <div className="text-xs text-muted mt-0.5">
            {clientRunCount === 0
              ? `No reports generated yet for ${selectedClient}.`
              : `${clientRunCount} previous run${clientRunCount === 1 ? '' : 's'} for ${selectedClient}${lastRun ? ` • last generated ${(lastRun.generated_at || '').slice(0, 10)}` : ''}`}
          </div>
        </div>
        <Link
          href={historyHref}
          className="text-xs font-semibold text-navy border border-navy rounded-md px-3 py-1.5 hover:bg-navy hover:text-white transition whitespace-nowrap"
        >
          View history →
        </Link>
      </div>
    </div>
  );
}

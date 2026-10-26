import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import GenerateForm from './generate-form';
import DownloadButton from './download-button';

export const dynamic = 'force-dynamic';

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scopeLabel(scope: string, short_code: string): string {
  if (scope === 'portfolio') return 'Portfolio roll-up';
  return `${short_code} — property`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { key?: string; saved?: string; month?: string };
}) {
  const key = process.env.QUICK_ADD_SECRET || '';
  const generateEnabled = !!key;
  const urlKey = (searchParams.key || '').trim();

  const selectedClient = ((searchParams as any).client || 'KGF').toString().toUpperCase();

  // Latest reports + active properties for the selected client + the clients list
  const [{ data: runs }, { data: properties }, { data: clients }] = await Promise.all([
    supabaseServer
      .from('report_runs')
      .select('id, report_month, scope, short_code, storage_path, filename, file_size_bytes, generated_at, generated_by')
      .order('report_month', { ascending: false })
      .order('scope', { ascending: false })
      .order('short_code', { ascending: true })
      .limit(200),
    supabaseServer
      .from('properties')
      .select('short_code, name, client:client_id ( short_code )')
      .eq('active', true)
      .order('short_code'),
    supabaseServer
      .from('clients')
      .select('short_code, name')
      .eq('active', true)
      .order('short_code'),
  ]);

  // Filter properties shown in the generate form by the selected client.
  const scopedProperties = (properties || []).filter((p: any) =>
    (p.client as { short_code: string } | null)?.short_code === selectedClient,
  );

  // Group by month
  type Group = { month: string; rows: any[] };
  const groups: Group[] = [];
  const groupMap = new Map<string, Group>();
  for (const r of runs || []) {
    if (!groupMap.has(r.report_month)) {
      const g = { month: r.report_month, rows: [] };
      groupMap.set(r.report_month, g);
      groups.push(g);
    }
    groupMap.get(r.report_month)!.rows.push(r);
  }

  const savedNote = searchParams.saved
    ? `Generated ${searchParams.saved} report${searchParams.saved === '1' ? '' : 's'} for ${searchParams.month || ''}. See below.`
    : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Reports</h1>
        <p className="text-sm text-muted mt-1">
          Monthly facility management reports. Pick a client, generate a fresh set for any month, or download prior runs.
        </p>
      </div>

      {/* Client picker */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
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
        <div className="mb-6 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          ✓ {savedNote}
        </div>
      )}

      {generateEnabled ? (
        <GenerateForm properties={scopedProperties as any} secretKey={key} client={selectedClient} />
      ) : (
        <div className="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
          Report generation is gated by QUICK_ADD_SECRET. Only visible when configured.
        </div>
      )}

      {groups.length === 0 && (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No reports generated yet. Click <strong>Generate 4 reports</strong> above to produce the first set.
        </div>
      )}

      {groups.map(g => (
        <div key={g.month} className="mb-6">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide">{monthDisplay(g.month)}</h2>
            <span className="text-xs text-muted">{g.rows.length} file{g.rows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {g.rows.map((r: any, i: number) => (
                  <tr key={r.id} className={i > 0 ? 'border-t' : ''}>
                    <td className="p-3">
                      <div className="text-sm font-medium text-navy">{scopeLabel(r.scope, r.short_code)}</div>
                      <div className="text-[11px] text-muted font-mono">{r.filename}</div>
                    </td>
                    <td className="p-3 text-xs text-muted whitespace-nowrap">
                      {r.generated_at?.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="p-3 text-xs text-muted whitespace-nowrap">
                      {fmtSize(r.file_size_bytes)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {generateEnabled ? (
                        <DownloadButton
                          storagePath={r.storage_path}
                          filename={r.filename}
                          secretKey={key}
                        >
                          Download
                        </DownloadButton>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function monthDisplay(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  return `${months[m - 1]} ${y}`;
}

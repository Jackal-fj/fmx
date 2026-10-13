import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import Badge from '@/components/badge';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type Filter = 'pending-review' | 'all' | 'draft' | 'errors';

function parseFilter(raw?: string): Filter {
  const v = (raw || '').toLowerCase();
  if (v === 'all') return 'all';
  if (v === 'draft') return 'draft';
  if (v === 'errors') return 'errors';
  return 'pending-review';
}

export default async function EmailInboxPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  noStore();

  const quickAddKey = process.env.QUICK_ADD_SECRET || '';
  const keyParam = quickAddKey ? `?key=${encodeURIComponent(quickAddKey)}` : '';
  const filter = parseFilter(searchParams.filter);

  // Base query — all emails ordered newest first.
  const { data: rows } = await supabaseServer
    .from('email_inbox')
    .select(`
      id, received_at, from_email, from_name, subject, status, error_message,
      classification, attachments,
      matched_defect:matched_defect_id ( defect_number, title, status ),
      created_defect:created_defect_id ( defect_number, title, status )
    `)
    .order('received_at', { ascending: false })
    .limit(200);

  // Also fetch the draft defects queue — unapproved emails live here.
  const { data: drafts } = await supabaseServer
    .from('defects')
    .select(`
      defect_number, title, severity, status, identified_at,
      property:property_id ( short_code )
    `)
    .eq('status', 'draft')
    .order('identified_at', { ascending: false })
    .limit(50);

  // Apply the filter view.
  const all = rows || [];
  let displayed = all;
  if (filter === 'pending-review') {
    // emails that created a draft defect still awaiting your approval
    displayed = all.filter(r => (r.created_defect as any)?.status === 'draft');
  } else if (filter === 'draft') {
    displayed = all.filter(r => !!r.created_defect);
  } else if (filter === 'errors') {
    displayed = all.filter(r => r.status === 'error');
  }

  const counts = {
    'pending-review': all.filter(r => (r.created_defect as any)?.status === 'draft').length,
    all: all.length,
    draft: all.filter(r => !!r.created_defect).length,
    errors: all.filter(r => r.status === 'error').length,
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-navy">Email Inbox</h1>
        <div className="text-xs text-muted">
          {displayed.length} email{displayed.length === 1 ? '' : 's'} shown
        </div>
      </div>

      {/* Quick-glance drafts strip */}
      {(drafts || []).length > 0 && (
        <div className="mb-6 rounded-lg border-2 border-orange-300 bg-orange-50 p-4">
          <div className="text-sm font-bold text-navy mb-2">
            {(drafts || []).length} draft defect{(drafts || []).length === 1 ? '' : 's'} awaiting review
          </div>
          <div className="space-y-1">
            {(drafts || []).slice(0, 10).map((d: any) => (
              <div key={d.defect_number} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex-1 min-w-0 truncate">
                  <Link
                    href={`/defects/${encodeURIComponent(d.defect_number)}?highlight=1`}
                    className="font-mono text-xs text-navy hover:underline"
                  >
                    {d.defect_number}
                  </Link>
                  <span className="ml-2 text-muted">{d.property?.short_code || '—'}</span>
                  <span className="ml-2 text-navy">{d.title}</span>
                </div>
                <Link
                  href={`/update-defect/${encodeURIComponent(d.defect_number)}${keyParam}`}
                  className="text-xs px-2.5 py-1 rounded-md bg-navy text-white hover:bg-blue-900 whitespace-nowrap"
                >
                  Review
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip filter={filter} value="pending-review" label={`Pending review (${counts['pending-review']})`} />
        <FilterChip filter={filter} value="draft" label={`All with draft (${counts.draft})`} />
        <FilterChip filter={filter} value="errors" label={`Errors (${counts.errors})`} />
        <FilterChip filter={filter} value="all" label={`All (${counts.all})`} />
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No emails match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((r: any) => {
            const matched = r.matched_defect as any;
            const created = r.created_defect as any;
            const cls = r.classification || {};
            const atts = Array.isArray(r.attachments) ? r.attachments : [];
            return (
              <div key={r.id} className="rounded-lg border bg-white p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                  <div className="font-semibold text-navy">
                    {r.subject || '(no subject)'}
                  </div>
                  <span className="text-[11px] text-muted whitespace-nowrap">
                    {(r.received_at || '').slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div className="text-xs text-muted mb-2">
                  From: {r.from_name ? `${r.from_name} <${r.from_email}>` : r.from_email || '(unknown)'}
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {r.status === 'processed' && <Badge tone="good">processed</Badge>}
                  {r.status === 'pending' && <Badge tone="warn">pending</Badge>}
                  {r.status === 'ignored' && <Badge tone="muted">ignored</Badge>}
                  {r.status === 'error' && <Badge tone="bad">error</Badge>}
                  {cls.def_ref && <Badge tone="muted">matched {cls.def_ref}</Badge>}
                  {cls.property_guess && <Badge tone="muted">prop: {cls.property_guess}</Badge>}
                  {cls.severity_guess && <Badge tone="warn">severity guess: {cls.severity_guess}</Badge>}
                  {cls.is_known_provider && <Badge tone="good">known provider</Badge>}
                  {atts.length > 0 && <Badge tone="muted">{atts.length} attachment{atts.length === 1 ? '' : 's'}</Badge>}
                </div>
                {r.error_message && (
                  <div className="text-xs text-red-700 mb-2">Error: {r.error_message}</div>
                )}
                {matched && (
                  <div className="text-xs">
                    Attached to{' '}
                    <Link href={`/defects/${encodeURIComponent(matched.defect_number)}?highlight=1`} className="text-navy hover:underline font-mono">
                      {matched.defect_number}
                    </Link>
                    {' '}— {matched.title}
                  </div>
                )}
                {created && (
                  <div className="text-xs flex items-center gap-2 flex-wrap">
                    <span>Draft created:</span>
                    <Link href={`/defects/${encodeURIComponent(created.defect_number)}?highlight=1`} className="text-navy hover:underline font-mono">
                      {created.defect_number}
                    </Link>
                    <span className="text-muted">— {created.title}</span>
                    {created.status === 'draft' && quickAddKey && (
                      <Link
                        href={`/update-defect/${encodeURIComponent(created.defect_number)}${keyParam}`}
                        className="ml-auto text-xs px-2 py-0.5 rounded bg-navy text-white hover:bg-blue-900"
                      >
                        Review & promote
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-xs text-muted">
        Emails arrive at <span className="font-mono">fmx@cmsfiji.com</span> and route through Postmark.
        See <span className="font-mono">/api/email</span> for the webhook endpoint.
      </div>
    </div>
  );
}

function FilterChip({ filter, value, label }: { filter: Filter; value: Filter; label: string }) {
  const active = filter === value;
  const href = value === 'pending-review' ? '/email-inbox' : `/email-inbox?filter=${value}`;
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        active
          ? 'bg-navy text-white border-navy'
          : 'bg-white text-muted border-gray-300 hover:border-navy hover:text-navy'
      }`}
    >
      {label}
    </Link>
  );
}

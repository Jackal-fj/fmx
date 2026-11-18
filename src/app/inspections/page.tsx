import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import NewTemplateForm from './new-template-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function InspectionsPage() {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';

  const { data: templates } = await supabaseServer
    .from('inspection_templates')
    .select('id, name, description, scope, active, updated_at')
    .order('active', { ascending: false })
    .order('name');

  // Item counts per template — single query, grouped client-side.
  const ids = (templates || []).map(t => t.id);
  const { data: items } = ids.length
    ? await supabaseServer
        .from('inspection_template_items')
        .select('template_id')
        .in('template_id', ids)
    : { data: [] as any[] };
  const countBy = new Map<string, number>();
  for (const i of items || []) countBy.set(i.template_id, (countBy.get(i.template_id) || 0) + 1);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Inspection templates</h1>
          <p className="text-sm text-muted mt-1">
            Short, re-usable checklists. Each site or asset can carry a default template so a scan walks straight into the right questions.
          </p>
        </div>
        {key && (
          <Link href="/inspections/import" className="shrink-0 text-xs rounded-md border border-navy text-navy font-semibold px-3 py-2 hover:bg-navy hover:text-white">
            Import from text
          </Link>
        )}
      </div>

      {key && (
        <section className="mb-6 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">New template</h2>
          <NewTemplateForm secretKey={key} />
        </section>
      )}

      {(templates || []).length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center">
          No templates yet. Create one above.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-white overflow-hidden">
          {(templates || []).map(t => {
            const count = countBy.get(t.id) || 0;
            return (
              <li key={t.id}>
                <Link href={`/inspections/${t.id}`} className="block px-4 py-3 hover:bg-blue-50/40 min-h-[44px]">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-navy">{t.name}</span>
                    <span className="text-[11px] uppercase tracking-wide text-muted border border-gray-300 rounded px-1.5 py-0.5">{t.scope}</span>
                    {!t.active && <span className="text-[11px] uppercase tracking-wide text-muted">Archived</span>}
                    <span className="ml-auto text-[11px] text-muted">{count} item{count === 1 ? '' : 's'}</span>
                  </div>
                  {t.description && <div className="text-xs text-muted mt-0.5 line-clamp-1">{t.description}</div>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

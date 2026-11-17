import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import TemplateEditor from './editor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function TemplatePage({ params }: { params: { id: string } }) {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';

  const { data: template } = await supabaseServer
    .from('inspection_templates')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!template) return notFound();

  const { data: items } = await supabaseServer
    .from('inspection_template_items')
    .select('*')
    .eq('template_id', params.id)
    .order('sort_order');

  if (!key) {
    // Read-only when no admin key. Render a minimal view.
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-navy">{template.name}</h1>
        {template.description && <p className="text-sm text-muted mt-1">{template.description}</p>}
        <ul className="divide-y rounded-lg border bg-white overflow-hidden mt-6">
          {(items || []).map(i => (
            <li key={i.id} className="px-4 py-3">
              <div className="text-sm text-navy">{i.question}</div>
              <div className="text-xs text-muted">{i.kind}{i.required ? ' · required' : ''}{i.photo_required ? ' · photo' : ''}{i.trade ? ` · ${i.trade}` : ''}</div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted italic">Read-only view. Editing requires permission.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <TemplateEditor
        template={template as any}
        initialItems={(items || []) as any}
        secretKey={key}
      />
    </div>
  );
}

'use server';

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

const SCOPES = ['property', 'asset', 'any'] as const;
const KINDS = ['yes_no', 'rating', 'number', 'text'] as const;

type Res = { ok: boolean; error?: string; id?: string };

function auth(key: string): boolean {
  const required = process.env.QUICK_ADD_SECRET;
  return !!required && key === required;
}

// ---- templates ---------------------------------------------------------

// FMX-065: bulk create — template header + a batch of items in one call.
// Used by /inspections/import so pasted/copied checklists don't require N
// round-trips. Items default to yes_no with fail-on-No; FM can tweak each
// in the template editor after.
export async function createTemplateWithItems(input: {
  name: string;
  description?: string | null;
  scope?: 'property' | 'asset' | 'any';
  items: Array<{ question: string; kind?: 'yes_no' | 'rating' | 'number' | 'text'; required?: boolean; photo_required?: boolean; trade?: string | null }>;
  key: string;
}): Promise<Res> {
  if (!auth(input.key)) return { ok: false, error: 'Not authorised.' };
  const name = (input.name || '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  const scope = (input.scope || 'any');
  if (!SCOPES.includes(scope)) return { ok: false, error: `Scope must be one of ${SCOPES.join(', ')}.` };
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: 'Paste at least one checklist item.' };
  }

  const { data: tpl, error: tplErr } = await supabaseServer
    .from('inspection_templates')
    .insert({ name, description: (input.description || '').trim() || null, scope })
    .select('id')
    .single();
  if (tplErr || !tpl) return { ok: false, error: tplErr?.message || 'Template create failed.' };

  const rows = input.items
    .map((it, i) => {
      const q = (it.question || '').trim();
      if (!q) return null;
      const kind = KINDS.includes(it.kind as any) ? (it.kind as string) : 'yes_no';
      return {
        template_id: tpl.id,
        sort_order: (i + 1) * 10,
        question: q.slice(0, 500),
        kind,
        required: !!it.required,
        photo_required: !!it.photo_required,
        trade: (it.trade || '').trim() || null,
        fail_if: kind === 'yes_no' ? { no: true } : kind === 'rating' ? { lt: 3 } : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) {
    // Rolled-back-but-not-really — the template exists but has no items.
    // Not fatal: caller can edit it. Surface a warning rather than failure.
    return { ok: true, id: tpl.id, error: 'No usable items parsed.' };
  }
  const { error: itemErr } = await supabaseServer
    .from('inspection_template_items')
    .insert(rows);
  if (itemErr) return { ok: false, error: `Template saved but items failed: ${itemErr.message}` };

  revalidatePath('/inspections');
  revalidatePath(`/inspections/${tpl.id}`);
  return { ok: true, id: tpl.id };
}

export async function createTemplate(fd: FormData): Promise<Res> {
  const key = (fd.get('key') as string || '').trim();
  if (!auth(key)) return { ok: false, error: 'Not authorised.' };

  const name = (fd.get('name') as string || '').trim();
  const description = (fd.get('description') as string || '').trim() || null;
  const scope = ((fd.get('scope') as string || 'any').trim()) as any;
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!SCOPES.includes(scope)) return { ok: false, error: `Scope must be one of ${SCOPES.join(', ')}.` };

  const { data, error } = await supabaseServer
    .from('inspection_templates')
    .insert({ name, description, scope })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Create failed.' };

  revalidatePath('/inspections');
  return { ok: true, id: data.id };
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; description?: string | null; scope?: string; active?: boolean },
  secretKey: string,
): Promise<Res> {
  if (!auth(secretKey)) return { ok: false, error: 'Not authorised.' };
  if (patch.scope && !SCOPES.includes(patch.scope as any)) {
    return { ok: false, error: `Scope must be one of ${SCOPES.join(', ')}.` };
  }
  const p: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabaseServer.from('inspection_templates').update(p).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/inspections');
  revalidatePath(`/inspections/${id}`);
  return { ok: true };
}

export async function cloneTemplate(id: string, secretKey: string): Promise<Res> {
  if (!auth(secretKey)) return { ok: false, error: 'Not authorised.' };
  const { data: src } = await supabaseServer
    .from('inspection_templates')
    .select('name, description, scope')
    .eq('id', id)
    .maybeSingle();
  if (!src) return { ok: false, error: 'Template not found.' };

  const { data: dst, error: insErr } = await supabaseServer
    .from('inspection_templates')
    .insert({
      name: `${src.name} (copy)`,
      description: src.description,
      scope: src.scope,
    })
    .select('id')
    .single();
  if (insErr || !dst) return { ok: false, error: insErr?.message || 'Clone failed.' };

  const { data: items } = await supabaseServer
    .from('inspection_template_items')
    .select('sort_order, question, kind, required, photo_required, trade, fail_if, notes')
    .eq('template_id', id)
    .order('sort_order');
  if ((items || []).length) {
    const copies = (items || []).map(i => ({ ...i, template_id: dst.id }));
    await supabaseServer.from('inspection_template_items').insert(copies);
  }

  revalidatePath('/inspections');
  return { ok: true, id: dst.id };
}

// ---- items -------------------------------------------------------------

export async function addItem(templateId: string, question: string, secretKey: string): Promise<Res> {
  if (!auth(secretKey)) return { ok: false, error: 'Not authorised.' };
  const q = (question || '').trim();
  if (!q) return { ok: false, error: 'Question is required.' };

  const { data: last } = await supabaseServer
    .from('inspection_template_items')
    .select('sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? 0) + 10;

  const { data, error } = await supabaseServer
    .from('inspection_template_items')
    .insert({
      template_id: templateId,
      sort_order: nextOrder,
      question: q,
      kind: 'yes_no',
      required: false,
      photo_required: false,
      fail_if: { no: true },
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Add failed.' };
  revalidatePath(`/inspections/${templateId}`);
  return { ok: true, id: data.id };
}

export async function updateItem(
  itemId: string,
  templateId: string,
  patch: {
    question?: string;
    kind?: string;
    required?: boolean;
    photo_required?: boolean;
    trade?: string | null;
    fail_if?: unknown;
    notes?: string | null;
  },
  secretKey: string,
): Promise<Res> {
  if (!auth(secretKey)) return { ok: false, error: 'Not authorised.' };
  if (patch.kind && !KINDS.includes(patch.kind as any)) {
    return { ok: false, error: `Kind must be one of ${KINDS.join(', ')}.` };
  }
  const p: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabaseServer.from('inspection_template_items').update(p).eq('id', itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/inspections/${templateId}`);
  return { ok: true };
}

export async function deleteItem(itemId: string, templateId: string, secretKey: string): Promise<Res> {
  if (!auth(secretKey)) return { ok: false, error: 'Not authorised.' };
  const { error } = await supabaseServer.from('inspection_template_items').delete().eq('id', itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/inspections/${templateId}`);
  return { ok: true };
}

export async function reorderItem(
  itemId: string,
  templateId: string,
  direction: 'up' | 'down',
  secretKey: string,
): Promise<Res> {
  if (!auth(secretKey)) return { ok: false, error: 'Not authorised.' };
  const { data: items } = await supabaseServer
    .from('inspection_template_items')
    .select('id, sort_order')
    .eq('template_id', templateId)
    .order('sort_order');
  if (!items) return { ok: false, error: 'No items.' };
  const idx = items.findIndex(i => i.id === itemId);
  if (idx < 0) return { ok: false, error: 'Item not in this template.' };
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return { ok: true };

  const a = items[idx];
  const b = items[swapIdx];
  // Swap sort_orders — two updates so the UNIQUE constraint isn't violated mid-flight.
  await supabaseServer.from('inspection_template_items').update({ sort_order: -1 }).eq('id', a.id);
  await supabaseServer.from('inspection_template_items').update({ sort_order: a.sort_order }).eq('id', b.id);
  await supabaseServer.from('inspection_template_items').update({ sort_order: b.sort_order }).eq('id', a.id);

  revalidatePath(`/inspections/${templateId}`);
  return { ok: true };
}

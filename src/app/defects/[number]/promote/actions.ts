'use server';

// Promote a draft defect to open after Carl reviews and edits the fields that
// email ingestion best-guessed. Also used to reject the draft outright
// (deletes the row + marks the inbox email as 'ignored').

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type Result = { ok: boolean; error?: string };

export async function promoteDraft(formData: FormData): Promise<Result> {
  const defectId    = (formData.get('defect_id') as string || '').trim();
  const title       = (formData.get('title') as string || '').trim();
  const description = (formData.get('description') as string || '').trim();
  const severity    = (formData.get('severity') as string || '').trim();
  const propertyCd  = (formData.get('property') as string || '').trim();
  const floor       = (formData.get('floor') as string || '').trim();
  const area        = (formData.get('area') as string || '').trim();
  const category    = (formData.get('category') as string || '').trim();
  const key         = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');
  if (!defectId) return { ok: false, error: 'Missing defect id.' };
  if (!title) return { ok: false, error: 'Title is required.' };
  if (!['critical', 'major', 'moderate', 'minor'].includes(severity)) {
    return { ok: false, error: 'Severity must be critical / major / moderate / minor.' };
  }

  // Fetch draft to confirm it's actually a draft (don't promote a non-draft).
  const { data: defect } = await supabaseServer
    .from('defects')
    .select('id, defect_number, status')
    .eq('id', defectId)
    .maybeSingle();
  if (!defect) return { ok: false, error: 'Defect not found.' };
  if (defect.status !== 'draft') {
    return { ok: false, error: `This defect is already ${defect.status} — nothing to promote.` };
  }

  // Property lookup (optional — may stay null if Carl isn't sure yet).
  let propertyId: string | null = null;
  if (propertyCd) {
    const { data: prop } = await supabaseServer
      .from('properties')
      .select('id')
      .eq('short_code', propertyCd)
      .maybeSingle();
    if (prop) propertyId = prop.id;
  }

  // Defects table has no metadata jsonb column — floor/area/category go into
  // the description as a short header line so nothing's lost. A dedicated
  // columns migration can come later if these need to be filtered on.
  const locBits = [floor, area, category].filter(Boolean);
  const descriptionWithLocation = locBits.length > 0
    ? `[${locBits.join(' · ')}]\n\n${description || ''}`.trim()
    : description || null;

  const patch: Record<string, any> = {
    title,
    description: descriptionWithLocation,
    severity,
    status: 'open',
    property_id: propertyId,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabaseServer
    .from('defects')
    .update(patch)
    .eq('id', defectId);
  if (upErr) return { ok: false, error: `Promote failed: ${upErr.message}` };

  // Audit trail.
  await supabaseServer.from('defect_updates').insert({
    defect_id: defectId,
    status_from: 'draft',
    status_to: 'open',
    notes: 'Promoted from draft after email review.',
    source: 'draft_promote',
  });

  // Cache busts across every surface that reads defect state.
  revalidatePath('/defects');
  revalidatePath(`/defects/${defect.defect_number}`);
  revalidatePath('/update-defect');
  revalidatePath('/email-inbox');
  revalidatePath('/');
  revalidatePath('/maintenance');
  revalidatePath('/properties', 'layout');

  redirect(`/defects/${encodeURIComponent(defect.defect_number)}?highlight=1`);
}

export async function rejectDraft(formData: FormData): Promise<Result> {
  const defectId = (formData.get('defect_id') as string || '').trim();
  const key      = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');
  if (!defectId) return { ok: false, error: 'Missing defect id.' };

  const { data: defect } = await supabaseServer
    .from('defects')
    .select('id, defect_number, status')
    .eq('id', defectId)
    .maybeSingle();
  if (!defect) return { ok: false, error: 'Defect not found.' };
  if (defect.status !== 'draft') {
    return { ok: false, error: `Only drafts can be rejected. This defect is ${defect.status}.` };
  }

  // Mark the originating inbox email(s) as ignored first (set created_defect_id → NULL so the FK survives delete).
  await supabaseServer
    .from('email_inbox')
    .update({ status: 'ignored', created_defect_id: null })
    .eq('created_defect_id', defectId);

  // Delete the draft outright (defect_updates FKs will cascade-null, photos stay in storage).
  const { error: delErr } = await supabaseServer
    .from('defects')
    .delete()
    .eq('id', defectId);
  if (delErr) return { ok: false, error: `Reject failed: ${delErr.message}` };

  revalidatePath('/defects');
  revalidatePath('/email-inbox');
  revalidatePath('/');
  redirect('/email-inbox');
}

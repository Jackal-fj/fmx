'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type CreateResult = {
  ok: boolean;
  error?: string;
};

export async function createDefect(formData: FormData): Promise<CreateResult> {
  const propertyCode = (formData.get('property_code') as string || '').trim();
  const title        = (formData.get('title') as string || '').trim();
  const severity     = (formData.get('severity') as string || '').trim();
  const description  = (formData.get('description') as string || '').trim();
  const floor        = (formData.get('floor') as string || '').trim();
  const area         = (formData.get('area') as string || '').trim();
  const category     = (formData.get('category') as string || '').trim();
  const key          = (formData.get('key') as string || '').trim();

  // --- secret-key gate -----------------------------------------------------
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) {
    redirect('/');
  }

  // --- validation ----------------------------------------------------------
  if (!propertyCode || !title || !severity) {
    return { ok: false, error: 'Property, title, and severity are required.' };
  }
  const allowedSeverity = ['minor', 'moderate', 'major', 'critical'];
  if (!allowedSeverity.includes(severity)) {
    return { ok: false, error: 'Invalid severity value.' };
  }

  // --- photos --------------------------------------------------------------
  const photoFiles = formData.getAll('photos').filter(
    (v): v is File => v instanceof File && v.size > 0,
  );
  if (photoFiles.length > 5) {
    return { ok: false, error: 'Maximum 5 photos.' };
  }

  // --- resolve property ----------------------------------------------------
  const { data: prop } = await supabaseServer
    .from('properties')
    .select('id, short_code, name')
    .eq('short_code', propertyCode)
    .maybeSingle();
  if (!prop) {
    return { ok: false, error: 'Property not found.' };
  }

  // --- resolve floor → space_id (best-effort) ------------------------------
  let space_id: string | null = null;
  if (floor && floor !== 'External' && floor !== 'Roof') {
    const { data: space } = await supabaseServer
      .from('spaces')
      .select('id')
      .eq('property_id', prop.id)
      .eq('short_code', floor)
      .eq('space_type', 'floor')
      .maybeSingle();
    if (space) space_id = space.id;
  } else if (floor === 'External') {
    const { data: space } = await supabaseServer
      .from('spaces')
      .select('id')
      .eq('property_id', prop.id)
      .eq('space_type', 'outdoor')
      .maybeSingle();
    if (space) space_id = space.id;
  }

  // --- compose description -------------------------------------------------
  const fullDesc = [
    description || null,
    category ? `Category: ${category}` : null,
    area ? `Area: ${area}` : null,
    floor && !space_id ? `Floor: ${floor}` : null,
  ].filter(Boolean).join('. ');

  // --- insert defect first so we have an id for photo paths ---------------
  const { data: defect, error: insertErr } = await supabaseServer
    .from('defects')
    .insert({
      property_id: prop.id,
      space_id,
      title,
      description: fullDesc || null,
      severity,
      status: 'open',
    })
    .select('id, defect_number')
    .single();

  if (insertErr || !defect) {
    console.error('Defect insert failed:', insertErr);
    return { ok: false, error: `Save failed: ${insertErr?.message || 'unknown'}` };
  }

  // --- upload photos to Supabase Storage + write URLs back to defect ------
  if (photoFiles.length > 0) {
    const ts = Date.now();
    const photoUrls: string[] = [];
    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i];
      const ext = file.type === 'image/png' ? 'png'
                : file.type === 'image/webp' ? 'webp'
                : 'jpg';
      const path = `${defect.id}/${ts}-${i + 1}.${ext}`;
      const buffer = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabaseServer.storage
        .from('defect-photos')
        .upload(path, buffer, { contentType: file.type, upsert: false });
      if (upErr) {
        console.error('Defect photo upload failed:', upErr);
        // Don't fail the whole submission — defect is saved, log a warning
        // and surface partial success
        continue;
      }
      const { data: urlData } = supabaseServer.storage
        .from('defect-photos')
        .getPublicUrl(path);
      photoUrls.push(urlData.publicUrl);
    }
    if (photoUrls.length > 0) {
      await supabaseServer
        .from('defects')
        .update({ photo_urls: photoUrls })
        .eq('id', defect.id);
    }
  }

  // Bust caches so freshly logged defect appears immediately across the app.
  revalidatePath('/defects');
  revalidatePath('/update-defect');
  revalidatePath('/');
  revalidatePath('/properties', 'layout');

  redirect(`/new-defect/success?ref=${encodeURIComponent(defect.defect_number)}&key=${encodeURIComponent(key)}`);
}

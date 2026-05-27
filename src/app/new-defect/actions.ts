'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export async function createDefect(formData: FormData) {
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
  if (required && key !== required) {
    redirect('/');
  }

  // --- validation ----------------------------------------------------------
  if (!propertyCode || !title || !severity) {
    redirect(`/new-defect?key=${encodeURIComponent(key)}&error=missing_required`);
  }
  const allowedSeverity = ['minor', 'moderate', 'major', 'critical'];
  if (!allowedSeverity.includes(severity)) {
    redirect(`/new-defect?key=${encodeURIComponent(key)}&error=bad_severity`);
  }

  // --- resolve property ----------------------------------------------------
  const { data: prop } = await supabaseServer
    .from('properties')
    .select('id, short_code, name')
    .eq('short_code', propertyCode)
    .maybeSingle();
  if (!prop) {
    redirect(`/new-defect?key=${encodeURIComponent(key)}&error=bad_property`);
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
    floor && !space_id ? `Floor: ${floor}` : null,  // include floor in desc if no space match
  ].filter(Boolean).join('. ');

  // --- insert defect -------------------------------------------------------
  const { data: defect, error } = await supabaseServer
    .from('defects')
    .insert({
      property_id: prop.id,
      space_id,
      title,
      description: fullDesc || null,
      severity,
      status: 'open',
    })
    .select('defect_number')
    .single();

  if (error || !defect) {
    console.error('Defect insert failed:', error);
    redirect(`/new-defect?key=${encodeURIComponent(key)}&error=db_failed`);
  }

  redirect(`/new-defect/success?ref=${encodeURIComponent(defect.defect_number)}&key=${encodeURIComponent(key)}`);
}

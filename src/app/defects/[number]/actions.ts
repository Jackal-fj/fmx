'use server';

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// FMX-037: tiny inline control on the defect detail page so an FM can set or
// change `defects.trade` without having to go through /update-defect (which
// insists on a status change + photo evidence). Used mainly to backfill the
// ~60 defects the FMX-021 classifier couldn't confidently tag.
export async function setDefectTrade(
  defectNumber: string,
  trade: string,
  secretKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) {
    return { ok: false, error: 'Not authorised.' };
  }
  const clean = (trade || '').trim();
  const { error } = await supabaseServer
    .from('defects')
    .update({ trade: clean || null })
    .eq('defect_number', defectNumber);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath(`/defects/${defectNumber}`);
  revalidatePath('/defects');
  return { ok: true };
}

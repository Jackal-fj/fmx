'use server';

import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';

type BulkResult = { ok: boolean; error?: string; updated?: number };

export async function bulkSetInterval(formData: FormData): Promise<BulkResult> {
  const key = (formData.get('key') as string || '').trim();
  const intervalRaw = (formData.get('service_interval_months') as string || '').trim();
  const anchorDate = (formData.get('anchor_date') as string || '').trim();
  const assetIdsRaw = formData.getAll('asset_ids');

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  const assetIds = assetIdsRaw
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim())
    .filter(Boolean);

  if (assetIds.length === 0) {
    return { ok: false, error: 'Select at least one asset.' };
  }

  const interval = parseInt(intervalRaw, 10);
  if (!Number.isFinite(interval) || interval < 0 || interval > 120) {
    return { ok: false, error: 'Interval must be 0–120 months. Use 0 to clear the schedule.' };
  }

  // Build update payload
  const patch: Record<string, any> = {
    service_interval_months: interval === 0 ? null : interval,
    updated_at: new Date().toISOString(),
  };

  // If interval > 0 and anchor date provided, recompute next_service_due_at.
  // If interval > 0 but no anchor and last_serviced_at exists, we'd want to
  // reproject from last_serviced_at — but that varies per asset, so we skip
  // and let the anchor drive it uniformly.
  if (interval > 0 && anchorDate) {
    const start = new Date(anchorDate + 'T00:00:00');
    if (!isNaN(start.getTime())) {
      const due = new Date(start);
      due.setMonth(due.getMonth() + interval);
      patch.next_service_due_at = due.toISOString().slice(0, 10);
    }
  } else if (interval === 0) {
    // Clearing the schedule
    patch.next_service_due_at = null;
  }

  const { error, count } = await supabaseServer
    .from('assets')
    .update(patch, { count: 'exact' })
    .in('id', assetIds);

  if (error) {
    console.error('Bulk update failed:', error);
    return { ok: false, error: `Update failed: ${error.message}` };
  }

  redirect(`/maintenance?key=${encodeURIComponent(key)}&saved=${count ?? assetIds.length}`);
}

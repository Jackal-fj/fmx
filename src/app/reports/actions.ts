'use server';

import { supabaseServer } from '@/lib/supabase';
import { fetchReportSnapshot } from '@/lib/reports/data';
import { buildReportsForMonth, buildPropertyReport, buildPortfolioReport } from '@/lib/reports/generate';
import { redirect } from 'next/navigation';

type Result = { ok: boolean; error?: string; count?: number };

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Generate the full set (per-property + portfolio) for a given YYYY-MM.
export async function generateAllReports(formData: FormData): Promise<Result> {
  const month = (formData.get('month') as string || '').trim();
  const key   = (formData.get('key') as string || '').trim();

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, error: 'Month must be in YYYY-MM format.' };
  }

  try {
    const snap = await fetchReportSnapshot('KGF');
    const reports = await buildReportsForMonth(snap, month);

    for (const r of reports) {
      const path = `${month}/${r.filename}`;
      const { error: upErr } = await supabaseServer.storage
        .from('reports')
        .upload(path, r.buffer, { contentType: DOCX_MIME, upsert: true });
      if (upErr) {
        return { ok: false, error: `Upload failed for ${r.filename}: ${upErr.message}` };
      }
      let property_id: string | null = null;
      if (r.scope === 'property') {
        const prop = snap.properties.find(p => p.short_code === r.short_code);
        if (prop) {
          const { data: propRow } = await supabaseServer
            .from('properties')
            .select('id')
            .eq('short_code', prop.short_code)
            .maybeSingle();
          property_id = propRow?.id || null;
        }
      }
      await supabaseServer.from('report_runs').insert({
        report_month: month,
        scope: r.scope,
        property_id,
        short_code: r.short_code,
        storage_path: path,
        filename: r.filename,
        file_size_bytes: r.buffer.length,
        generated_by: 'in_app',
      });
    }

    redirect(`/reports?key=${encodeURIComponent(key)}&saved=${reports.length}&month=${month}`);
  } catch (e: any) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    console.error('Report generation failed:', e);
    return { ok: false, error: e?.message || 'Report generation failed.' };
  }
}

// Get a signed URL for a stored report — server action for the download button.
export async function getReportDownloadUrl(storagePath: string, key: string): Promise<{ url: string | null; error?: string }> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) return { url: null, error: 'Not authorised.' };

  const { data, error } = await supabaseServer.storage
    .from('reports')
    .createSignedUrl(storagePath, 60 * 60); // 1 hour

  if (error || !data) {
    return { url: null, error: error?.message || 'Signed URL failed.' };
  }
  return { url: data.signedUrl };
}

'use server';

import { supabaseServer } from '@/lib/supabase';
import { fetchReportSnapshot } from '@/lib/reports/data';
import { buildPropertyReport, buildPortfolioReport } from '@/lib/reports/generate';
import { uploadReportToDropbox, isDropboxConfigured } from '@/lib/dropbox';
import { redirect } from 'next/navigation';

type Result = { ok: boolean; error?: string; count?: number };

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Generate the selected reports for a given YYYY-MM. Scopes is an array of
// property short_codes ('GH', 'KH', 'NH') plus 'PORTFOLIO' as a special value
// for the portfolio roll-up. Server generates only what's selected.
export async function generateReports(formData: FormData): Promise<Result> {
  const month  = (formData.get('month') as string || '').trim();
  const key    = (formData.get('key') as string || '').trim();
  const scopes = formData.getAll('scopes').filter((v): v is string => typeof v === 'string');

  const required = process.env.QUICK_ADD_SECRET;
  if (!required || key !== required) redirect('/');

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, error: 'Month must be in YYYY-MM format.' };
  }
  if (scopes.length === 0) {
    return { ok: false, error: 'Select at least one report to generate.' };
  }

  try {
    const snap = await fetchReportSnapshot('KGF');
    let count = 0;

    for (const scope of scopes) {
      if (scope === 'PORTFOLIO') {
        const r = await buildPortfolioReport(snap, month);
        await saveOne(r.filename, r.buffer, month, r.scope, null, r.short_code);
        count += 1;
      } else {
        const r = await buildPropertyReport(snap, scope, month);
        if (!r) continue;
        const prop = snap.properties.find(p => p.short_code === scope);
        let property_id: string | null = null;
        if (prop) {
          const { data: propRow } = await supabaseServer
            .from('properties')
            .select('id')
            .eq('short_code', prop.short_code)
            .maybeSingle();
          property_id = propRow?.id || null;
        }
        await saveOne(r.filename, r.buffer, month, r.scope, property_id, r.short_code);
        count += 1;
      }
    }

    redirect(`/reports?key=${encodeURIComponent(key)}&saved=${count}&month=${month}`);
  } catch (e: any) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    console.error('Report generation failed:', e);
    return { ok: false, error: e?.message || 'Report generation failed.' };
  }
}

async function saveOne(
  filename: string,
  buffer: Buffer,
  month: string,
  scope: string,
  property_id: string | null,
  short_code: string,
) {
  const path = `${month}/${filename}`;
  const { error: upErr } = await supabaseServer.storage
    .from('reports')
    .upload(path, buffer, { contentType: DOCX_MIME, upsert: true });
  if (upErr) throw new Error(`Upload failed for ${filename}: ${upErr.message}`);

  // Best-effort mirror to Dropbox. Non-blocking — Supabase is the source of
  // truth; Dropbox is a convenience copy for local access via the synced
  // Dropbox folder on Carl's Mac.
  if (isDropboxConfigured()) {
    const dbxResult = await uploadReportToDropbox(month, filename, buffer);
    if (!dbxResult.ok) {
      console.warn('Dropbox mirror failed:', filename, dbxResult.error);
    }
  }

  await supabaseServer.from('report_runs').insert({
    report_month: month,
    scope,
    property_id,
    short_code,
    storage_path: path,
    filename,
    file_size_bytes: buffer.length,
    generated_by: 'in_app',
  });
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

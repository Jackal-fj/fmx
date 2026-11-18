'use server';

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { mergePatch, logConflicts } from '@/lib/offline/merge';

// FMX-026: inline edit of an agreement from its view page. Only the fields the
// read-only grid exposes can be set — nothing exotic. Server validates that
// status is in the enum; shape-level validation matches the client's.
const STATUSES = ['tender', 'negotiation', 'active', 'suspended', 'ended', 'lost'];
const TYPES = ['all_in_one', 'fm_services', 'maintenance', 'project', 'ad_hoc'];
const BILLING = ['monthly', 'fortnightly', 'quarterly', 'per_job'];

type Patch = {
  name?: string;
  agreement_type?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  monthly_value_estimate?: number | null;
  management_fee_pct?: number | null;
  payment_terms_days?: number | null;
  billing_cycle?: string;
  billing_day?: number | null;
  po_required?: boolean;
  cpi_escalation_pct?: number | null;
  bond_amount?: number | null;
  float_amount?: number | null;
  currency?: string;
  invoice_requirements?: string | null;
  notes?: string | null;
};

export async function updateAgreement(
  agreementId: string,
  clientShortCode: string,
  agreementCode: string,
  patch: Patch,
  secretKey: string,
  // FMX-051: optional baseline — the `updated_at` the client saw when it
  // staged the edit. When supplied, mergePatch flags any column whose
  // server-side value moved on since that baseline. When omitted, the
  // merge strategies still apply (concat / union / max / etc.) but no
  // conflict rows are logged — no way to know they happened.
  baselineUpdatedAt?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) return { ok: false, error: 'Not authorised.' };
  if (!agreementId) return { ok: false, error: 'Missing agreement id.' };

  // --- validate --------------------------------------------------
  if (patch.status && !STATUSES.includes(patch.status)) {
    return { ok: false, error: `Status must be one of ${STATUSES.join(', ')}.` };
  }
  if (patch.agreement_type && !TYPES.includes(patch.agreement_type)) {
    return { ok: false, error: `Type must be one of ${TYPES.join(', ')}.` };
  }
  if (patch.billing_cycle && !BILLING.includes(patch.billing_cycle)) {
    return { ok: false, error: `Billing cycle must be one of ${BILLING.join(', ')}.` };
  }
  if (patch.start_date && patch.end_date && patch.end_date < patch.start_date) {
    return { ok: false, error: 'End date must be on or after start date.' };
  }
  if (patch.management_fee_pct != null && (patch.management_fee_pct < 0 || patch.management_fee_pct > 100)) {
    return { ok: false, error: 'Management fee must be between 0 and 100.' };
  }
  if (patch.payment_terms_days != null && patch.payment_terms_days < 0) {
    return { ok: false, error: 'Payment terms must be >= 0.' };
  }
  if (patch.monthly_value_estimate != null && patch.monthly_value_estimate < 0) {
    return { ok: false, error: 'Monthly value must be >= 0.' };
  }
  if (patch.bond_amount != null && patch.bond_amount < 0) return { ok: false, error: 'Bond must be >= 0.' };
  if (patch.float_amount != null && patch.float_amount < 0) return { ok: false, error: 'Float must be >= 0.' };
  if (patch.billing_day != null && (patch.billing_day < 1 || patch.billing_day > 31)) {
    return { ok: false, error: 'Billing day must be 1–31.' };
  }

  // FMX-051: read the current row so the merge layer has a server-side
  // baseline. Only the columns the patch touches are inspected, plus
  // updated_at for the baseline check.
  const touched = Object.keys(patch);
  const columnsToRead = Array.from(new Set(['id', 'updated_at', ...touched]));
  const { data: current, error: readErr } = await supabaseServer
    .from('client_agreements')
    .select(columnsToRead.join(','))
    .eq('id', agreementId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: 'Agreement not found.' };

  const { toApply, conflicts } = mergePatch(
    'client_agreements',
    current as unknown as Record<string, unknown>,
    patch as Record<string, unknown>,
    baselineUpdatedAt ?? null,
  );

  // No-op merge — nothing changed server-side relative to current. Still
  // bump updated_at so the client's follow-up refresh sees a stable write
  // marker, but skip the UPDATE if there's truly nothing to apply.
  if (Object.keys(toApply).length === 0) {
    return { ok: true };
  }

  toApply.updated_at = new Date().toISOString();

  const { error } = await supabaseServer
    .from('client_agreements')
    .update(toApply)
    .eq('id', agreementId);
  if (error) return { ok: false, error: error.message };

  // Best-effort — never blocks the UPDATE. See merge.ts logConflicts().
  if (conflicts.length > 0) {
    await logConflicts('client_agreements', agreementId, conflicts, {
      client_short_code: clientShortCode,
      agreement_code: agreementCode,
      baseline_updated_at: baselineUpdatedAt ?? null,
    });
  }

  revalidatePath(`/clients/${clientShortCode}/agreements/${agreementCode}`);
  revalidatePath(`/clients/${clientShortCode}`);
  revalidatePath('/clients');
  return { ok: true };
}

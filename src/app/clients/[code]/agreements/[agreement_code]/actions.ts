'use server';

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

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

  const toApply: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    toApply[k] = v;
  }
  toApply.updated_at = new Date().toISOString();

  const { error } = await supabaseServer
    .from('client_agreements')
    .update(toApply)
    .eq('id', agreementId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${clientShortCode}/agreements/${agreementCode}`);
  revalidatePath(`/clients/${clientShortCode}`);
  revalidatePath('/clients');
  return { ok: true };
}

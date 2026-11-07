'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import {
  CLIENT_TYPES, CONTACT_ROLES, AGREEMENT_TYPES, AGREEMENT_STATUSES,
  BILLING_CYCLES, FEE_BASES, WO_STATUSES, WO_PRIORITIES, SHORT_CODE_RE, Option,
} from '@/lib/clients';

export type ActionResult = { ok: boolean; error?: string; redirectTo?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class InputError extends Error {}

function authorised(fd: FormData): boolean {
  const required = process.env.QUICK_ADD_SECRET;
  const key = String(fd.get('key') || '').trim();
  return !!required && key === required;
}

function str(fd: FormData, name: string, max = 2000): string | null {
  const v = fd.get(name);
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function req(fd: FormData, name: string, label: string, max = 500): string {
  const s = str(fd, name, max);
  if (!s) throw new InputError(`${label} is required.`);
  return s;
}

function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === 'on' || v === 'true' || v === '1';
}

function num(fd: FormData, name: string, label: string, opts: { min?: number; max?: number; int?: boolean } = {}): number | null {
  const s = str(fd, name, 50);
  if (s == null) return null;
  const v = Number(s.replace(/[, ]/g, ''));
  if (!Number.isFinite(v)) throw new InputError(`${label} must be a number.`);
  if (opts.int && !Number.isInteger(v)) throw new InputError(`${label} must be a whole number.`);
  if (opts.min != null && v < opts.min) throw new InputError(`${label} must be at least ${opts.min}.`);
  if (opts.max != null && v > opts.max) throw new InputError(`${label} must be at most ${opts.max}.`);
  return v;
}

function date(fd: FormData, name: string, label: string): string | null {
  const s = str(fd, name, 20);
  if (s == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new InputError(`${label} must be a valid date.`);
  }
  return s;
}

function oneOf(fd: FormData, name: string, list: Option[], fallback: string | null, label: string): string | null {
  const s = str(fd, name, 50);
  if (s == null) return fallback;
  if (!list.some(o => o.value === s)) throw new InputError(`${label} is not a valid option.`);
  return s;
}

function uuid(fd: FormData, name: string): string | null {
  const s = str(fd, name, 64);
  if (s == null) return null;
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new InputError('Invalid reference.');
  return s;
}

function friendly(err: { code?: string; message?: string } | null | undefined, what: string): string {
  if (!err) return `${what} failed.`;
  if (err.code === '23505') {
    if ((err.message || '').includes('short_code')) return 'That short code is already in use. Pick another.';
    if ((err.message || '').includes('primary')) return 'Only one primary contact is allowed per client.';
    return 'A record with those details already exists.';
  }
  if (err.code === '23514') return `${what} failed: a value is outside the allowed range.`;
  if (err.code === '23503') return `${what} failed: a linked record no longer exists.`;
  return `${what} failed: ${err.message || 'unknown error'}`;
}

async function clientCode(clientId: string): Promise<string | null> {
  const { data } = await supabaseServer.from('clients').select('short_code').eq('id', clientId).maybeSingle();
  return data?.short_code || null;
}

function revalidateClient(code: string | null) {
  revalidatePath('/');
  revalidatePath('/clients');
  if (code) {
    revalidatePath(`/clients/${code}`);
    revalidatePath(`/clients/${code}/manage`);
  }
  revalidatePath('/properties', 'layout');
  revalidatePath('/reports');
  revalidatePath('/defects');
  revalidatePath('/new-defect');
}

// Wraps every action: auth, input errors → {ok:false}, never throws.
async function run(fd: FormData, what: string, fn: () => Promise<ActionResult>): Promise<ActionResult> {
  if (!authorised(fd)) return { ok: false, error: 'Not authorised. Reopen this page from the FMX menu.' };
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof InputError) return { ok: false, error: e.message };
    console.error(`[clients] ${what} threw:`, e);
    return { ok: false, error: `${what} failed: ${e?.message || 'unknown error'}` };
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export async function saveClient(fd: FormData): Promise<ActionResult> {
  return run(fd, 'Saving client', async () => {
    const id = uuid(fd, 'id');
    const short_code = req(fd, 'short_code', 'Short code', 12).toUpperCase();
    if (!SHORT_CODE_RE.test(short_code)) {
      throw new InputError('Short code must be 2 to 12 letters or digits (hyphen allowed), e.g. HW.');
    }
    const row = {
      name: req(fd, 'name', 'Client name', 200),
      short_code,
      client_type: oneOf(fd, 'client_type', CLIENT_TYPES, 'owner', 'Client type')!,
      legal_name: str(fd, 'legal_name', 200),
      tin: str(fd, 'tin', 50),
      address: str(fd, 'address', 500),
      xero_contact_id: str(fd, 'xero_contact_id', 100),
      dropbox_folder: str(fd, 'dropbox_folder', 300),
      dropbox_reports_path: str(fd, 'dropbox_reports_path', 300),
      billing_notes: str(fd, 'billing_notes', 2000),
      notes: str(fd, 'notes', 4000),
      active: id ? bool(fd, 'active') : true,
    };

    let oldCode: string | null = null;
    if (id) {
      oldCode = await clientCode(id);
      if (!oldCode) throw new InputError('Client not found.');
      const { error } = await supabaseServer.from('clients').update(row).eq('id', id);
      if (error) return { ok: false, error: friendly(error, 'Saving client') };
    } else {
      const { data: clash } = await supabaseServer.from('clients').select('id').ilike('short_code', short_code).maybeSingle();
      if (clash) return { ok: false, error: 'That short code is already in use. Pick another.' };
      const { error } = await supabaseServer.from('clients').insert(row);
      if (error) return { ok: false, error: friendly(error, 'Creating client') };
    }

    if (oldCode && oldCode !== short_code) revalidateClient(oldCode);
    revalidateClient(short_code);
    const key = String(fd.get('key') || '');
    // New client, or the code changed: land on the hub/manage page at its new URL.
    if (!id) return { ok: true, redirectTo: `/clients/${short_code}/manage?key=${encodeURIComponent(key)}&open=agreements` };
    if (oldCode !== short_code) return { ok: true, redirectTo: `/clients/${short_code}/manage?key=${encodeURIComponent(key)}&open=client` };
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

export async function saveAgreement(fd: FormData): Promise<ActionResult> {
  return run(fd, 'Saving agreement', async () => {
    const id = uuid(fd, 'id');
    const client_id = uuid(fd, 'client_id');
    if (!client_id) throw new InputError('Missing client.');
    const start_date = date(fd, 'start_date', 'Start date');
    const end_date = date(fd, 'end_date', 'End date');
    if (start_date && end_date && end_date < start_date) throw new InputError('End date is before the start date.');

    const row = {
      client_id,
      name: req(fd, 'name', 'Agreement name', 200),
      agreement_type: oneOf(fd, 'agreement_type', AGREEMENT_TYPES, 'fm_services', 'Agreement type')!,
      status: oneOf(fd, 'status', AGREEMENT_STATUSES, 'tender', 'Status')!,
      start_date,
      end_date,
      billing_cycle: oneOf(fd, 'billing_cycle', BILLING_CYCLES, 'monthly', 'Billing cycle')!,
      billing_day: num(fd, 'billing_day', 'Billing day', { min: 1, max: 31, int: true }),
      payment_terms_days: num(fd, 'payment_terms_days', 'Payment terms', { min: 0, max: 365, int: true }),
      po_required: bool(fd, 'po_required'),
      invoice_requirements: str(fd, 'invoice_requirements', 2000),
      management_fee_pct: num(fd, 'management_fee_pct', 'Management fee %', { min: 0, max: 100 }),
      monthly_value_estimate: num(fd, 'monthly_value_estimate', 'Monthly value', { min: 0 }),
      float_amount: num(fd, 'float_amount', 'Float', { min: 0 }),
      bond_amount: num(fd, 'bond_amount', 'Bond', { min: 0 }),
      cpi_escalation_pct: num(fd, 'cpi_escalation_pct', 'CPI escalation %', { min: 0, max: 100 }),
      drive_folder_path: str(fd, 'drive_folder_path', 300),
      notes: str(fd, 'notes', 4000),
    };

    const { error } = id
      ? await supabaseServer.from('client_agreements').update(row).eq('id', id).eq('client_id', client_id)
      : await supabaseServer.from('client_agreements').insert(row);
    if (error) return { ok: false, error: friendly(error, 'Saving agreement') };
    revalidateClient(await clientCode(client_id));
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export async function saveContact(fd: FormData): Promise<ActionResult> {
  return run(fd, 'Saving contact', async () => {
    const id = uuid(fd, 'id');
    const client_id = uuid(fd, 'client_id');
    if (!client_id) throw new InputError('Missing client.');
    const email = str(fd, 'email', 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Email address looks wrong.');
    const active = id ? bool(fd, 'active') : true;
    const is_primary = bool(fd, 'is_primary') && active;

    const row = {
      client_id,
      name: req(fd, 'name', 'Contact name', 200),
      role: oneOf(fd, 'role', CONTACT_ROLES, 'other', 'Role')!,
      title: str(fd, 'title', 200),
      email,
      phone: str(fd, 'phone', 50),
      is_primary,
      receives_invoices: bool(fd, 'receives_invoices'),
      notes: str(fd, 'notes', 2000),
      active,
    };

    // One active primary per client (unique index). Clear the old primary first.
    if (is_primary) {
      let q = supabaseServer.from('client_contacts').update({ is_primary: false })
        .eq('client_id', client_id).eq('is_primary', true);
      if (id) q = q.neq('id', id);
      const { error: clearErr } = await q;
      if (clearErr) return { ok: false, error: friendly(clearErr, 'Saving contact') };
    }

    const { error } = id
      ? await supabaseServer.from('client_contacts').update(row).eq('id', id).eq('client_id', client_id)
      : await supabaseServer.from('client_contacts').insert(row);
    if (error) return { ok: false, error: friendly(error, 'Saving contact') };
    revalidateClient(await clientCode(client_id));
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

export async function saveProperty(fd: FormData): Promise<ActionResult> {
  return run(fd, 'Saving property', async () => {
    const id = uuid(fd, 'id');
    const client_id = uuid(fd, 'client_id');
    if (!client_id) throw new InputError('Missing client.');
    const short_code = req(fd, 'short_code', 'Property code', 12).toUpperCase();
    if (!SHORT_CODE_RE.test(short_code)) {
      throw new InputError('Property code must be 2 to 12 letters or digits (hyphen allowed), e.g. HW-OFF.');
    }

    const { data: clash } = await supabaseServer.from('properties').select('id').ilike('short_code', short_code);
    if ((clash || []).some(c => c.id !== id)) {
      return { ok: false, error: 'That property code is already in use. Pick another.' };
    }

    const row = {
      client_id,
      name: req(fd, 'name', 'Property name', 200),
      short_code,
      address: str(fd, 'address', 500),
      facility_type: str(fd, 'facility_type', 100),
      storeys: num(fd, 'storeys', 'Storeys', { min: 0, max: 200, int: true }),
      gross_floor_area_m2: num(fd, 'gross_floor_area_m2', 'Floor area', { min: 0 }),
      tenant_name: str(fd, 'tenant_name', 200),
      access_notes: str(fd, 'access_notes', 2000),
      dropbox_folder: str(fd, 'dropbox_folder', 300),
      dropbox_photos_path: str(fd, 'dropbox_photos_path', 300),
      active: id ? bool(fd, 'active') : true,
    };

    const { error } = id
      ? await supabaseServer.from('properties').update(row).eq('id', id).eq('client_id', client_id)
      : await supabaseServer.from('properties').insert(row);
    if (error) return { ok: false, error: friendly(error, 'Saving property') };
    revalidateClient(await clientCode(client_id));
    revalidatePath(`/properties/${short_code}`);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Service line (service_contracts)
// ---------------------------------------------------------------------------

export async function saveServiceLine(fd: FormData): Promise<ActionResult> {
  return run(fd, 'Saving service line', async () => {
    const id = uuid(fd, 'id');
    const client_id = uuid(fd, 'client_id');
    if (!client_id) throw new InputError('Missing client.');

    const row = {
      client_id,
      agreement_id: uuid(fd, 'agreement_id'),
      property_id: uuid(fd, 'property_id'),
      provider_id: uuid(fd, 'provider_id'),
      line_no: num(fd, 'line_no', 'Line number', { min: 1, max: 999, int: true }),
      contract_name: req(fd, 'contract_name', 'Service name', 200),
      discipline: str(fd, 'discipline', 100),
      frequency: str(fd, 'frequency', 100),
      fee_basis: oneOf(fd, 'fee_basis', FEE_BASES, null, 'Fee basis'),
      fee_amount: num(fd, 'fee_amount', 'Fee', { min: 0 }),
      management_fee_pct: num(fd, 'management_fee_pct', 'Management fee %', { min: 0, max: 100 }),
      next_service_date: date(fd, 'next_service_date', 'Next service date'),
      fee_notes: str(fd, 'fee_notes', 1000),
      active: id ? bool(fd, 'active') : true,
    };

    const { error } = id
      ? await supabaseServer.from('service_contracts').update(row).eq('id', id).eq('client_id', client_id)
      : await supabaseServer.from('service_contracts').insert(row);
    if (error) {
      // Trigger raises a clear message if agreement/property belong to another client.
      return { ok: false, error: friendly(error, 'Saving service line') };
    }
    revalidateClient(await clientCode(client_id));
    revalidatePath('/maintenance');
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Work order / job
// ---------------------------------------------------------------------------

export async function saveWorkOrder(fd: FormData): Promise<ActionResult> {
  return run(fd, 'Saving job', async () => {
    const id = uuid(fd, 'id');
    const client_id = uuid(fd, 'client_id');
    if (!client_id) throw new InputError('Missing client.');
    const status = oneOf(fd, 'status', WO_STATUSES, 'new', 'Status')!;
    const completed = date(fd, 'completed_at', 'Completed date');
    const scheduled = date(fd, 'scheduled_for', 'Scheduled date');

    const row: Record<string, unknown> = {
      client_id,
      property_id: uuid(fd, 'property_id'),
      provider_id: uuid(fd, 'provider_id'),
      title: req(fd, 'title', 'Job title', 300),
      description: str(fd, 'description', 4000),
      status,
      priority: oneOf(fd, 'priority', WO_PRIORITIES, 'normal', 'Priority')!,
      quote_ref: str(fd, 'quote_ref', 100),
      invoice_ref: str(fd, 'invoice_ref', 100),
      cost_est_fjd: num(fd, 'cost_est_fjd', 'Estimate', { min: 0 }),
      cost_actual_fjd: num(fd, 'cost_actual_fjd', 'Actual / invoiced', { min: 0 }),
      scheduled_for: scheduled,
      completed_at: completed,
    };

    if (status === 'closed') {
      // Keep an existing closed_at; otherwise stamp it.
      if (id) {
        const { data: cur } = await supabaseServer.from('work_orders').select('closed_at').eq('id', id).maybeSingle();
        row.closed_at = cur?.closed_at || completed || new Date().toISOString();
      } else {
        row.closed_at = completed || new Date().toISOString();
      }
    } else {
      row.closed_at = null;
    }

    const { error } = id
      ? await supabaseServer.from('work_orders').update(row).eq('id', id).eq('client_id', client_id)
      : await supabaseServer.from('work_orders').insert(row);
    if (error) return { ok: false, error: friendly(error, 'Saving job') };
    revalidateClient(await clientCode(client_id));
    return { ok: true };
  });
}

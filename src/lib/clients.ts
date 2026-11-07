// Shared vocabulary for the client layer (clients → agreements → service
// lines, contacts, properties, work orders). Values here MUST match the
// CHECK constraints in the client_layer_agreements_contacts migration.

export type Option = { value: string; label: string };

export const CLIENT_TYPES: Option[] = [
  { value: 'owner',          label: 'Owner' },
  { value: 'occupier',       label: 'Occupier / tenant' },
  { value: 'owner_occupier', label: 'Owner occupier' },
];

export const CONTACT_ROLES: Option[] = [
  { value: 'decision_maker', label: 'Decision maker' },
  { value: 'approver',       label: 'Approver' },
  { value: 'site',           label: 'Site contact' },
  { value: 'accounts',       label: 'Accounts' },
  { value: 'ap_inbox',       label: 'AP inbox' },
  { value: 'tenant',         label: 'Tenant' },
  { value: 'other',          label: 'Other' },
];

export const AGREEMENT_TYPES: Option[] = [
  { value: 'all_in_one',  label: 'All in one' },
  { value: 'fm_services', label: 'FM services' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'project',     label: 'Project' },
  { value: 'ad_hoc',      label: 'Ad hoc' },
];

export const AGREEMENT_STATUSES: Option[] = [
  { value: 'tender',      label: 'Tender' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'active',      label: 'Active' },
  { value: 'suspended',   label: 'Suspended' },
  { value: 'ended',       label: 'Ended' },
  { value: 'lost',        label: 'Lost' },
];

export const BILLING_CYCLES: Option[] = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'per_job',     label: 'Per job' },
];

export const FEE_BASES: Option[] = [
  { value: 'fixed',        label: 'Fixed fee' },
  { value: 'pass_through', label: 'Pass through' },
  { value: 'cost_plus',    label: 'Cost plus' },
  { value: 'rate',         label: 'Rate' },
  { value: 'included',     label: 'Included' },
];

export const WO_STATUSES: Option[] = [
  { value: 'new',         label: 'New' },
  { value: 'dispatched',  label: 'Dispatched' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted',   label: 'Submitted' },
  { value: 'approved',    label: 'Approved' },
  { value: 'closed',      label: 'Closed' },
  { value: 'cancelled',   label: 'Cancelled' },
];

export const WO_PRIORITIES: Option[] = [
  { value: 'low',    label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const OPEN_WO_STATUSES = ['new', 'dispatched', 'in_progress', 'submitted', 'approved'];

export function labelOf(list: Option[], value?: string | null): string {
  if (!value) return '—';
  return list.find(o => o.value === value)?.label || value;
}

export function agreementTone(status?: string | null): 'good' | 'ok' | 'warn' | 'bad' | 'muted' {
  switch (status) {
    case 'active':      return 'good';
    case 'negotiation':
    case 'tender':      return 'ok';
    case 'suspended':   return 'warn';
    case 'lost':        return 'bad';
    default:            return 'muted';
  }
}

export function woTone(status?: string | null): 'good' | 'ok' | 'warn' | 'bad' | 'muted' {
  switch (status) {
    case 'closed':
    case 'approved':    return 'good';
    case 'in_progress':
    case 'dispatched':
    case 'submitted':   return 'ok';
    case 'new':         return 'warn';
    case 'cancelled':   return 'muted';
    default:            return 'muted';
  }
}

export function fmtMoney(n: number | string | null | undefined, currency = 'FJD'): string {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

// Short codes are the public identifier in URLs. Uppercase letters, digits,
// hyphen; 2 to 12 chars.
export const SHORT_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,11}$/;

// Append ?key=… (or &key=…) when a write key is available.
export function withKey(href: string, key?: string | null): string {
  if (!key) return href;
  return href + (href.includes('?') ? '&' : '?') + `key=${encodeURIComponent(key)}`;
}

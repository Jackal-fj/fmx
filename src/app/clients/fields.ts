import type { Field, FieldOption } from '@/components/action-form';
import {
  CLIENT_TYPES, CONTACT_ROLES, AGREEMENT_TYPES, AGREEMENT_STATUSES,
  BILLING_CYCLES, FEE_BASES, WO_STATUSES, WO_PRIORITIES,
} from '@/lib/clients';

// Field specs for every client-layer form. `r` is the existing row (edit) or
// undefined (create). Kept in one place so create and edit never drift.

type Row = Record<string, any> | undefined;
const v = (r: Row, k: string) => (r ? r[k] : undefined);

export function clientFields(r: Row): Field[] {
  return [
    { name: 'name', label: 'Client name', required: true, defaultValue: v(r, 'name'), placeholder: 'Huawei Technologies (Fiji)' },
    { name: 'short_code', label: 'Short code', required: true, defaultValue: v(r, 'short_code'), placeholder: 'HW', help: 'Used in URLs and report names.' },
    { name: 'client_type', label: 'Client type', type: 'select', options: CLIENT_TYPES, required: true, defaultValue: v(r, 'client_type') || 'owner' },
    { name: 'legal_name', label: 'Legal name', defaultValue: v(r, 'legal_name') },
    { name: 'tin', label: 'TIN', defaultValue: v(r, 'tin') },
    { name: 'xero_contact_id', label: 'Xero contact', defaultValue: v(r, 'xero_contact_id'), help: 'Xero contact name or ID.' },
    { name: 'address', label: 'Postal / billing address', defaultValue: v(r, 'address'), wide: true },
    { name: 'dropbox_folder', label: 'Dropbox folder', defaultValue: v(r, 'dropbox_folder'), placeholder: 'Huawei', help: 'Folder name under FMX/04_CLIENTS. Blank uses the short code.' },
    { name: 'dropbox_reports_path', label: 'Reports sub-path', defaultValue: v(r, 'dropbox_reports_path'), placeholder: 'Reports', help: 'Inside the client folder. Month folders are added automatically.' },
    { name: 'billing_notes', label: 'Billing notes', type: 'textarea', defaultValue: v(r, 'billing_notes') },
    { name: 'notes', label: 'Notes', type: 'textarea', defaultValue: v(r, 'notes') },
    ...(r?.id ? [{ name: 'active', label: 'Active client', type: 'checkbox' as const, defaultValue: r.active }] : []),
  ];
}

export function agreementFields(r: Row): Field[] {
  return [
    { name: 'name', label: 'Agreement name', required: true, defaultValue: v(r, 'name'), placeholder: 'All in one FM services', wide: true },
    { name: 'agreement_type', label: 'Type', type: 'select', options: AGREEMENT_TYPES, required: true, defaultValue: v(r, 'agreement_type') || 'fm_services' },
    { name: 'status', label: 'Status', type: 'select', options: AGREEMENT_STATUSES, required: true, defaultValue: v(r, 'status') || 'tender' },
    { name: 'start_date', label: 'Start date', type: 'date', defaultValue: v(r, 'start_date') },
    { name: 'end_date', label: 'End date', type: 'date', defaultValue: v(r, 'end_date') },
    { name: 'monthly_value_estimate', label: 'Monthly value (excl. VAT)', type: 'number', defaultValue: v(r, 'monthly_value_estimate') },
    { name: 'management_fee_pct', label: 'Management fee %', type: 'number', defaultValue: v(r, 'management_fee_pct') },
    { name: 'billing_cycle', label: 'Billing cycle', type: 'select', options: BILLING_CYCLES, required: true, defaultValue: v(r, 'billing_cycle') || 'monthly' },
    { name: 'billing_day', label: 'Billing day (1 to 31)', type: 'number', defaultValue: v(r, 'billing_day') },
    { name: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', defaultValue: v(r, 'payment_terms_days') },
    { name: 'cpi_escalation_pct', label: 'CPI escalation %', type: 'number', defaultValue: v(r, 'cpi_escalation_pct') },
    { name: 'float_amount', label: 'Float held', type: 'number', defaultValue: v(r, 'float_amount') },
    { name: 'bond_amount', label: 'Bond', type: 'number', defaultValue: v(r, 'bond_amount') },
    { name: 'po_required', label: 'PO required before invoicing', type: 'checkbox', defaultValue: v(r, 'po_required') },
    { name: 'invoice_requirements', label: 'Invoice requirements', type: 'textarea', defaultValue: v(r, 'invoice_requirements'), placeholder: 'Single line, supporting docs attached, copy AP inbox' },
    { name: 'drive_folder_path', label: 'Contract folder path', defaultValue: v(r, 'drive_folder_path'), wide: true },
    { name: 'notes', label: 'Notes', type: 'textarea', defaultValue: v(r, 'notes') },
  ];
}

export function contactFields(r: Row): Field[] {
  return [
    { name: 'name', label: 'Name', required: true, defaultValue: v(r, 'name') },
    { name: 'role', label: 'Role', type: 'select', options: CONTACT_ROLES, required: true, defaultValue: v(r, 'role') || 'other' },
    { name: 'title', label: 'Job title', defaultValue: v(r, 'title') },
    { name: 'phone', label: 'Phone', type: 'tel', defaultValue: v(r, 'phone'), placeholder: '+679 …' },
    { name: 'email', label: 'Email', type: 'email', defaultValue: v(r, 'email'), wide: true },
    { name: 'is_primary', label: 'Primary contact', type: 'checkbox', defaultValue: v(r, 'is_primary') },
    { name: 'receives_invoices', label: 'Receives invoices', type: 'checkbox', defaultValue: v(r, 'receives_invoices') },
    { name: 'notes', label: 'Notes', type: 'textarea', defaultValue: v(r, 'notes') },
    ...(r?.id ? [{ name: 'active', label: 'Active (untick to archive)', type: 'checkbox' as const, defaultValue: r.active }] : []),
  ];
}

export function propertyFields(r: Row): Field[] {
  return [
    { name: 'name', label: 'Property / site name', required: true, defaultValue: v(r, 'name') },
    { name: 'short_code', label: 'Property code', required: true, defaultValue: v(r, 'short_code'), placeholder: 'HW-OFF' },
    { name: 'address', label: 'Address', defaultValue: v(r, 'address'), wide: true },
    { name: 'facility_type', label: 'Facility type', defaultValue: v(r, 'facility_type'), placeholder: 'Office, Residential…' },
    { name: 'tenant_name', label: 'Tenant / occupier', defaultValue: v(r, 'tenant_name') },
    { name: 'storeys', label: 'Storeys', type: 'number', defaultValue: v(r, 'storeys') },
    { name: 'gross_floor_area_m2', label: 'Floor area m²', type: 'number', defaultValue: v(r, 'gross_floor_area_m2') },
    { name: 'dropbox_folder', label: 'Dropbox site folder', defaultValue: v(r, 'dropbox_folder'), help: 'Inside the client folder. Blank uses the property code.' },
    { name: 'dropbox_photos_path', label: 'Photos sub-folder', defaultValue: v(r, 'dropbox_photos_path'), placeholder: '02_Photos' },
    { name: 'access_notes', label: 'Access notes', type: 'textarea', defaultValue: v(r, 'access_notes') },
    ...(r?.id ? [{ name: 'active', label: 'Active property', type: 'checkbox' as const, defaultValue: r.active }] : []),
  ];
}

export function serviceLineFields(
  r: Row,
  agreements: FieldOption[],
  properties: FieldOption[],
  providers: FieldOption[],
): Field[] {
  return [
    { name: 'contract_name', label: 'Service', required: true, defaultValue: v(r, 'contract_name'), wide: true },
    { name: 'agreement_id', label: 'Agreement', type: 'select', options: agreements, defaultValue: v(r, 'agreement_id'), blank: 'Not linked' },
    { name: 'line_no', label: 'Line no.', type: 'number', defaultValue: v(r, 'line_no') },
    { name: 'property_id', label: 'Property', type: 'select', options: properties, defaultValue: v(r, 'property_id'), blank: 'All sites' },
    { name: 'provider_id', label: 'Vendor', type: 'select', options: providers, defaultValue: v(r, 'provider_id'), blank: 'Self delivered / TBC' },
    { name: 'discipline', label: 'Discipline', defaultValue: v(r, 'discipline') },
    { name: 'frequency', label: 'Frequency', defaultValue: v(r, 'frequency'), placeholder: 'Monthly, Quarterly…' },
    { name: 'fee_basis', label: 'Fee basis', type: 'select', options: FEE_BASES, defaultValue: v(r, 'fee_basis') },
    { name: 'fee_amount', label: 'Fee (FJD, per cycle)', type: 'number', defaultValue: v(r, 'fee_amount') },
    { name: 'management_fee_pct', label: 'Management fee %', type: 'number', defaultValue: v(r, 'management_fee_pct') },
    { name: 'next_service_date', label: 'Next service', type: 'date', defaultValue: v(r, 'next_service_date') },
    { name: 'fee_notes', label: 'Fee notes', type: 'textarea', defaultValue: v(r, 'fee_notes') },
    ...(r?.id ? [{ name: 'active', label: 'Active line', type: 'checkbox' as const, defaultValue: r.active }] : []),
  ];
}

export function workOrderFields(r: Row, properties: FieldOption[], providers: FieldOption[]): Field[] {
  const d = (k: string) => (v(r, k) ? String(v(r, k)).slice(0, 10) : undefined);
  return [
    { name: 'title', label: 'Job', required: true, defaultValue: v(r, 'title'), wide: true },
    { name: 'property_id', label: 'Property', type: 'select', options: properties, defaultValue: v(r, 'property_id'), blank: 'Client wide' },
    { name: 'status', label: 'Status', type: 'select', options: WO_STATUSES, required: true, defaultValue: v(r, 'status') || 'new' },
    { name: 'priority', label: 'Priority', type: 'select', options: WO_PRIORITIES, required: true, defaultValue: v(r, 'priority') || 'normal' },
    { name: 'provider_id', label: 'Vendor', type: 'select', options: providers, defaultValue: v(r, 'provider_id'), blank: 'CMS / TBC' },
    { name: 'quote_ref', label: 'Quote ref', defaultValue: v(r, 'quote_ref'), placeholder: 'QU-0000' },
    { name: 'invoice_ref', label: 'Invoice ref', defaultValue: v(r, 'invoice_ref'), placeholder: 'INV-0000' },
    { name: 'cost_est_fjd', label: 'Quoted / estimate (FJD)', type: 'number', defaultValue: v(r, 'cost_est_fjd') },
    { name: 'cost_actual_fjd', label: 'Invoiced (FJD)', type: 'number', defaultValue: v(r, 'cost_actual_fjd') },
    { name: 'scheduled_for', label: 'Scheduled', type: 'date', defaultValue: d('scheduled_for') },
    { name: 'completed_at', label: 'Completed', type: 'date', defaultValue: d('completed_at') },
    { name: 'description', label: 'Notes', type: 'textarea', defaultValue: v(r, 'description') },
  ];
}

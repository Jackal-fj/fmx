// Data snapshot for FM report generation.
// Ports fmx-monthly-report/src/fetch-data.js into direct in-process queries
// against supabaseServer. Called by server actions on demand.

import { supabaseServer } from '@/lib/supabase';

export type Property = {
  short_code: string;
  name: string;
  address: string | null;
  facility_type: string | null;
  storeys: number | null;
  tenant_name: string | null;
  tenant_short_code: string | null;
  tenant_contact_name: string | null;
  tenant_contact_phone: string | null;
  tenant_contact_email: string | null;
  client_name: string;
  client_short_code: string;
};

export type ComponentRow = [name: string, label: string, score: number | null];

export type Fca = {
  short_code: string;
  assessed_at: string | null;
  overall_rating: string | null;
  numeric_score: number | null;
  summary: string | null;
  recommendations: string | null;
  photo_count: number | null;
  assessor_name: string | null;
  components: ComponentRow[];
};

export type DefectCount = {
  short_code: string;
  open: number;
  resolved: number;
  work_ordered: number;
  critical_open: number;
  major_open: number;
  moderate_open: number;
  minor_open: number;
};

export type OpenDefect = {
  short_code: string;
  defect_number: string;
  space: string;
  title: string;
  severity: string;
  identified_at: string | null;
  description: string;
  photo_urls: string[];
  days_open: number | null;
};

export type ComplianceEvent = {
  short_code: string | null;
  kind: 'service_contract' | 'asset_pm' | 'contract_renewal';
  label: string;
  detail: string;
  due_date: string;
  days_until: number;
};

export type ResolvedThisMonth = {
  short_code: string;
  count: number;
};

export type AssetSummaryRow = {
  short_code: string;
  asset_type: string;
  count: number;
  good: number;
  poor: number;
  failed: number;
};

export type ServiceContractRow = {
  short_code: string | null;
  contract_name: string;
  discipline: string | null;
  frequency: string | null;
  fee_amount: number | null;
  fee_currency: string | null;
  next_service_date: string | null;
  provider_name: string | null;
  active: boolean;
};

export type ReportSnapshot = {
  properties: Property[];
  fcas: Fca[];
  defectCounts: DefectCount[];
  openDefects: OpenDefect[];
  assetSummary: AssetSummaryRow[];
  serviceContracts: ServiceContractRow[];
  complianceEvents: ComplianceEvent[];
  resolvedThisMonth: ResolvedThisMonth[];
  reportMonth: string;   // YYYY-MM that this snapshot represents
};

// Convert JSONB component_scores map into the [name,label,score] tuple array
// generate.ts expects.
function componentScoresToRows(jsonb: any): ComponentRow[] {
  if (!jsonb) return [];
  const order: Array<[string, string]> = [
    ['site',            'Site'],
    ['substructure',    'Substructure'],
    ['exterior',        'Exterior'],
    ['interior',        'Interior'],
    ['conveyance',      'Conveyance'],
    ['plumbing',        'Plumbing'],
    ['hvac',            'HVAC'],
    ['fire_protection', 'Fire Protection'],
    ['electrical',      'Electrical'],
  ];
  const rows: ComponentRow[] = [];
  for (const [key, label] of order) {
    const sect = jsonb[key];
    if (!sect) continue;
    const avg = sect.average ?? sect.avg_score ?? null;
    const score = avg == null ? null : Number(avg);
    rows.push([label, sect.label || ratingFromScore(score), score]);
  }
  return rows;
}

function ratingFromScore(s: number | null): string {
  if (s == null) return 'N/A';
  if (s >= 4.5) return 'Excellent';
  if (s >= 3.5) return 'Good';
  if (s >= 2.5) return 'Adequate';
  if (s >= 1.5) return 'Marginal';
  return 'Poor';
}

function daysBetween(fromIso: string | null, toDate: Date = new Date()): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (isNaN(from.getTime())) return null;
  return Math.floor((toDate.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export async function fetchReportSnapshot(clientShortCode: string = 'KGF', reportMonth?: string): Promise<ReportSnapshot> {
  const sb = supabaseServer;

  // 1. Client
  const { data: clients } = await sb
    .from('clients')
    .select('id, name, short_code')
    .eq('short_code', clientShortCode)
    .limit(1);
  if (!clients || clients.length === 0) throw new Error(`Client not found: ${clientShortCode}`);
  const client = clients[0];
  const clientId = client.id;

  // Fetch everything else in parallel
  const [
    { data: propRows },
    { data: scRows },
    { data: fcaRows },
    { data: allDefects },
    { data: openDefectRows },
    { data: assetRows },
  ] = await Promise.all([
    sb.from('properties')
      .select('short_code, name, address, facility_type, storeys, tenant_name, tenant_short_code, tenant_contact_name, tenant_contact_phone, tenant_contact_email')
      .eq('client_id', clientId)
      .eq('active', true)
      .order('short_code'),
    sb.from('service_contracts')
      .select(`contract_name, discipline, frequency, fee_amount, fee_currency, next_service_date, active,
        property:property_id ( short_code ),
        provider:provider_id ( name )`)
      .eq('client_id', clientId),
    sb.from('condition_assessments')
      .select(`assessed_at, overall_rating, numeric_score, summary, recommendations, photo_count, assessor_name, component_scores,
        property:property_id ( short_code, client_id )`)
      .order('assessed_at', { ascending: false }),
    sb.from('defects')
      .select(`property_id, status, severity, resolved_at, identified_at,
        property:property_id ( short_code, client_id )`),
    sb.from('defects')
      .select(`defect_number, title, description, severity, status, identified_at, photo_urls,
        property:property_id ( short_code, client_id ),
        space:space_id ( name )`)
      .in('status', ['open', 'work_ordered'])
      .order('defect_number'),
    sb.from('assets')
      .select(`asset_type, current_condition,
        property:property_id ( short_code, client_id )`)
      .eq('active', true),
  ]);

  // Properties
  const properties: Property[] = (propRows || []).map(r => ({
    ...r,
    client_name: client.name,
    client_short_code: client.short_code,
  }));

  // Service contracts
  const serviceContracts: ServiceContractRow[] = (scRows || []).map((r: any) => ({
    short_code: r.property?.short_code || null,
    contract_name: r.contract_name,
    discipline: r.discipline,
    frequency: r.frequency,
    fee_amount: r.fee_amount,
    fee_currency: r.fee_currency,
    next_service_date: r.next_service_date,
    provider_name: r.provider?.name || null,
    active: r.active,
  }));

  // FCAs — latest per property, filtered to client
  const seen = new Set<string>();
  const fcas: Fca[] = [];
  for (const r of (fcaRows || []) as any[]) {
    if (!r.property || r.property.client_id !== clientId) continue;
    const code = r.property.short_code;
    if (seen.has(code)) continue;
    seen.add(code);
    fcas.push({
      short_code: code,
      assessed_at: r.assessed_at?.slice(0, 10) || null,
      overall_rating: r.overall_rating,
      numeric_score: r.numeric_score == null ? null : Number(r.numeric_score),
      summary: r.summary,
      recommendations: r.recommendations,
      photo_count: r.photo_count,
      assessor_name: r.assessor_name,
      components: componentScoresToRows(r.component_scores),
    });
  }
  fcas.sort((a, b) => a.short_code.localeCompare(b.short_code));

  // Defect counts per property
  const countsMap: Record<string, DefectCount> = {};
  for (const p of properties) {
    countsMap[p.short_code] = {
      short_code: p.short_code, open: 0, resolved: 0, work_ordered: 0,
      critical_open: 0, major_open: 0, moderate_open: 0, minor_open: 0,
    };
  }
  for (const d of (allDefects || []) as any[]) {
    if (!d.property || d.property.client_id !== clientId) continue;
    const c = countsMap[d.property.short_code];
    if (!c) continue;
    if (d.status === 'open') c.open += 1;
    if (d.status === 'work_ordered') c.work_ordered += 1;
    if (d.status === 'resolved') c.resolved += 1;
    if (d.status === 'open' || d.status === 'work_ordered') {
      if (d.severity === 'critical') c.critical_open += 1;
      if (d.severity === 'major') c.major_open += 1;
      if (d.severity === 'moderate') c.moderate_open += 1;
      if (d.severity === 'minor') c.minor_open += 1;
    }
  }
  const defectCounts = Object.values(countsMap);

  // Open defects with detail — includes days-open and first photo URL
  const openDefects: OpenDefect[] = (openDefectRows || [])
    .filter((d: any) => d.property && d.property.client_id === clientId)
    .map((d: any) => ({
      short_code: d.property.short_code,
      defect_number: d.defect_number,
      space: d.space?.name || '—',
      title: d.title,
      severity: d.severity,
      identified_at: d.identified_at?.slice(0, 10) || null,
      description: d.description || '',
      photo_urls: Array.isArray(d.photo_urls) ? d.photo_urls : [],
      days_open: daysBetween(d.identified_at),
    }));

  // --- Resolved this month per property ---
  const month = reportMonth || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [monthYear, monthNum] = month.split('-').map(Number);
  const monthStart = new Date(monthYear, monthNum - 1, 1).toISOString();
  const monthEnd = new Date(monthYear, monthNum, 1).toISOString();

  const { data: resolvedRows } = await sb
    .from('defects')
    .select(`property:property_id ( short_code, client_id )`)
    .eq('status', 'resolved')
    .gte('resolved_at', monthStart)
    .lt('resolved_at', monthEnd);

  const resolvedMap: Record<string, number> = {};
  for (const p of properties) resolvedMap[p.short_code] = 0;
  for (const r of (resolvedRows || []) as any[]) {
    if (!r.property || r.property.client_id !== clientId) continue;
    resolvedMap[r.property.short_code] = (resolvedMap[r.property.short_code] || 0) + 1;
  }
  const resolvedThisMonth: ResolvedThisMonth[] = Object.entries(resolvedMap)
    .map(([short_code, count]) => ({ short_code, count }));

  // --- Compliance calendar — next 60 days ---
  const now = new Date();
  const sixtyDaysOut = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const complianceEvents: ComplianceEvent[] = [];

  // Service contracts with next_service_date in window
  for (const sc of serviceContracts) {
    if (!sc.next_service_date) continue;
    const d = new Date(sc.next_service_date);
    if (isNaN(d.getTime())) continue;
    if (d <= sixtyDaysOut) {
      const days = Math.floor((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      complianceEvents.push({
        short_code: sc.short_code,
        kind: 'service_contract',
        label: sc.contract_name,
        detail: `${sc.discipline || 'Service'}${sc.provider_name ? ` · ${sc.provider_name}` : ''}`,
        due_date: sc.next_service_date,
        days_until: days,
      });
    }
  }

  // Assets with next_service_due_at in window
  const { data: assetsForPm } = await sb
    .from('assets')
    .select(`name, asset_type, next_service_due_at,
      property:property_id ( short_code, client_id )`)
    .eq('active', true)
    .not('next_service_due_at', 'is', null)
    .lt('next_service_due_at', sixtyDaysOut.toISOString().slice(0, 10));
  for (const a of (assetsForPm || []) as any[]) {
    if (!a.property || a.property.client_id !== clientId) continue;
    const d = new Date(a.next_service_due_at);
    if (isNaN(d.getTime())) continue;
    const days = Math.floor((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    complianceEvents.push({
      short_code: a.property.short_code,
      kind: 'asset_pm',
      label: a.name,
      detail: a.asset_type,
      due_date: a.next_service_due_at,
      days_until: days,
    });
  }

  complianceEvents.sort((a, b) => a.days_until - b.days_until);

  // Asset summary
  const assetMap: Record<string, AssetSummaryRow> = {};
  for (const a of (assetRows || []) as any[]) {
    if (!a.property || a.property.client_id !== clientId) continue;
    const key = `${a.property.short_code}::${a.asset_type}`;
    if (!assetMap[key]) {
      assetMap[key] = {
        short_code: a.property.short_code,
        asset_type: a.asset_type,
        count: 0, good: 0, poor: 0, failed: 0,
      };
    }
    assetMap[key].count += 1;
    if (a.current_condition === 'good') assetMap[key].good += 1;
    if (a.current_condition === 'poor') assetMap[key].poor += 1;
    if (a.current_condition === 'failed') assetMap[key].failed += 1;
  }
  const assetSummary = Object.values(assetMap);

  return {
    properties,
    fcas,
    defectCounts,
    openDefects,
    assetSummary,
    serviceContracts,
    complianceEvents,
    resolvedThisMonth,
    reportMonth: month,
  };
}

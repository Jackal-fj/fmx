import { redirect } from 'next/navigation';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// FMX-043: HEART-style metrics for internal use.
// Adoption · Engagement · Task success go live now; Retention needs real
// user accounts (FMX-024) and Happiness needs a survey (TBD). Everything
// here reads the existing tables — no new instrumentation.

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

type MetricCard = {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad';
};

function trendArrow(current: number, prior: number): string {
  if (prior === 0 && current === 0) return '·';
  if (prior === 0) return '▲';
  const delta = (current - prior) / prior;
  if (delta > 0.05) return '▲';
  if (delta < -0.05) return '▼';
  return '·';
}

function pct(part: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

export default async function MetricsPage() {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  if (!key) redirect('/');

  const sb = supabaseServer;
  const d30 = daysAgoIso(30);
  const d60 = daysAgoIso(60);

  // -------- Pulls (parallel) ----------------------------------------------
  const [
    { count: inspec30 },
    { count: inspec60 },
    { count: scans30 },
    { count: scans60 },
    { count: logged30 },
    { count: logged60 },
    { count: resolved30 },
    { count: resolved60 },
    { data: propsAll },
    { data: propsWithDefault },
    { count: defectsTotal },
    { count: defectsWithTrade },
    { count: activeTemplates },
    { data: templatesUsed30 },
    { count: sessionsClosed30 },
    { count: sessionsWithEvidence30 },
    { data: durations },
    { data: items30Rows },
    { data: resolvedPhotos30 },
  ] = await Promise.all([
    sb.from('inspection_sessions').select('id', { count: 'exact', head: true }).gte('completed_at', d30).not('completed_at', 'is', null),
    sb.from('inspection_sessions').select('id', { count: 'exact', head: true }).gte('completed_at', d60).lt('completed_at', d30).not('completed_at', 'is', null),
    sb.from('scan_events').select('id', { count: 'exact', head: true }).gte('scanned_at', d30),
    sb.from('scan_events').select('id', { count: 'exact', head: true }).gte('scanned_at', d60).lt('scanned_at', d30),
    sb.from('defects').select('id', { count: 'exact', head: true }).gte('identified_at', d30).neq('status', 'draft'),
    sb.from('defects').select('id', { count: 'exact', head: true }).gte('identified_at', d60).lt('identified_at', d30).neq('status', 'draft'),
    sb.from('defects').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', d30),
    sb.from('defects').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', d60).lt('resolved_at', d30),
    sb.from('properties').select('id').eq('active', true),
    sb.from('properties').select('id').eq('active', true).not('default_inspection_template_id', 'is', null),
    sb.from('defects').select('id', { count: 'exact', head: true }).neq('status', 'draft'),
    sb.from('defects').select('id', { count: 'exact', head: true }).neq('status', 'draft').not('trade', 'is', null),
    sb.from('inspection_templates').select('id', { count: 'exact', head: true }).eq('active', true),
    sb.from('inspection_sessions').select('template_id').gte('completed_at', d30).not('completed_at', 'is', null),
    sb.from('inspection_sessions').select('id', { count: 'exact', head: true }).gte('completed_at', d30).not('completed_at', 'is', null),
    sb.from('inspection_sessions').select('id', { count: 'exact', head: true }).gte('completed_at', d30).not('completed_at', 'is', null).not('signature_data_url', 'is', null).not('attendance_photo_url', 'is', null),
    sb.from('inspection_sessions').select('id, started_at, completed_at').gte('completed_at', d30).not('completed_at', 'is', null),
    sb.from('inspection_results').select('session_id, photo_urls, defect_id').gte('created_at', d30),
    sb.from('defects').select('id, photo_urls, resolved_at').eq('status', 'resolved').gte('resolved_at', d30),
  ]);

  // Adoption derived values
  const propCount = (propsAll || []).length;
  const propWithDefaultCount = (propsWithDefault || []).length;
  // Distinct templates used in sessions completed in the last 30 days.
  const templatesUsedSetProper = new Set<string>();
  for (const r of ((templatesUsed30 as any) || [])) {
    if (r.template_id) templatesUsedSetProper.add(r.template_id as string);
  }

  // Task-success derived values
  const resolvedCount30 = resolved30 ?? 0;
  const resolvedWithPhotos30 = (resolvedPhotos30 || []).filter((d: any) => Array.isArray(d.photo_urls) && d.photo_urls.length > 0).length;

  // Median inspection duration (minutes, where started_at + completed_at both present)
  const minutes: number[] = [];
  for (const s of (durations || [])) {
    const a = s.started_at ? new Date(s.started_at).getTime() : 0;
    const b = s.completed_at ? new Date(s.completed_at).getTime() : 0;
    if (a && b && b > a) minutes.push((b - a) / 60000);
  }
  minutes.sort((x, y) => x - y);
  const medianMinutes = minutes.length ? minutes[Math.floor(minutes.length / 2)] : null;

  // Items per inspection
  const itemsBySession = new Map<string, number>();
  for (const r of (items30Rows || [])) {
    itemsBySession.set(r.session_id, (itemsBySession.get(r.session_id) || 0) + 1);
  }
  const itemCounts = Array.from(itemsBySession.values()).sort((a, b) => a - b);
  const medianItems = itemCounts.length ? itemCounts[Math.floor(itemCounts.length / 2)] : null;

  // Auto-raised defects from inspections in the window
  const autoRaisedFromInspections = (items30Rows || []).filter((r: any) => r.defect_id).length;

  // ---- cards --------------------------------------------------------------
  const engagement: MetricCard[] = [
    {
      label: 'Inspections / 30d',
      value: String(inspec30 ?? 0),
      sub: `${trendArrow(inspec30 ?? 0, inspec60 ?? 0)} vs prior 30d (${inspec60 ?? 0})`,
    },
    {
      label: 'Scans / 30d',
      value: String(scans30 ?? 0),
      sub: `${trendArrow(scans30 ?? 0, scans60 ?? 0)} vs prior 30d (${scans60 ?? 0})`,
    },
    {
      label: 'Defects logged / 30d',
      value: String(logged30 ?? 0),
      sub: `${trendArrow(logged30 ?? 0, logged60 ?? 0)} vs prior 30d (${logged60 ?? 0})`,
    },
    {
      label: 'Defects resolved / 30d',
      value: String(resolvedCount30),
      sub: `${trendArrow(resolvedCount30, resolved60 ?? 0)} vs prior 30d (${resolved60 ?? 0})`,
    },
    {
      label: 'Median items per inspection',
      value: medianItems == null ? '—' : String(medianItems),
      sub: 'Target: 5–8 per the hero workflow',
    },
    {
      label: 'Auto-raised from inspections / 30d',
      value: String(autoRaisedFromInspections),
      sub: 'Scan → Check → Snap → Done → Report',
    },
  ];

  const adoption: MetricCard[] = [
    {
      label: 'Properties with default template',
      value: `${propWithDefaultCount} / ${propCount}`,
      sub: pct(propWithDefaultCount, propCount) + ' of active sites',
      tone: propCount > 0 && propWithDefaultCount / propCount < 0.5 ? 'warn' : 'good',
    },
    {
      label: 'Defects tagged with trade',
      value: pct(defectsWithTrade ?? 0, defectsTotal ?? 0),
      sub: `${defectsWithTrade ?? 0} of ${defectsTotal ?? 0}`,
      tone: (defectsTotal ?? 0) > 0 && (defectsWithTrade ?? 0) / (defectsTotal ?? 1) < 0.7 ? 'warn' : 'good',
    },
    {
      label: 'Active templates',
      value: String(activeTemplates ?? 0),
    },
    {
      label: 'Templates in use last 30d',
      value: `${templatesUsedSetProper.size} / ${activeTemplates ?? 0}`,
      sub: 'Unused templates may need archiving',
    },
  ];

  const taskSuccess: MetricCard[] = [
    {
      label: 'Inspections closed with sig + attendance',
      value: pct(sessionsWithEvidence30 ?? 0, sessionsClosed30 ?? 0),
      sub: `${sessionsWithEvidence30 ?? 0} of ${sessionsClosed30 ?? 0} in last 30d`,
      tone: (sessionsClosed30 ?? 0) > 0 && (sessionsWithEvidence30 ?? 0) / (sessionsClosed30 ?? 1) < 0.9 ? 'warn' : 'good',
    },
    {
      label: 'Resolved defects with photo evidence',
      value: pct(resolvedWithPhotos30, resolvedCount30),
      sub: `${resolvedWithPhotos30} of ${resolvedCount30} resolved in last 30d`,
      tone: resolvedCount30 > 0 && resolvedWithPhotos30 / resolvedCount30 < 0.8 ? 'warn' : 'good',
    },
    {
      label: 'Median inspection duration',
      value: medianMinutes == null ? '—' : `${Math.round(medianMinutes)} min`,
      sub: 'Target: < 5 min on-site (hero workflow)',
      tone: medianMinutes != null && medianMinutes > 10 ? 'warn' : 'good',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Metrics</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        HEART framework — <em>internal</em>, not for client reports. Happiness (survey) and Retention (needs user accounts, FMX-024) are stubbed until the dependencies land.
      </p>

      <Section title="Engagement" items={engagement} />
      <Section title="Adoption" items={adoption} />
      <Section title="Task success" items={taskSuccess} />
      <Section
        title="Happiness · Retention"
        items={[
          { label: 'PMF score (Sean Ellis)', value: '—', sub: 'Survey not yet instrumented' },
          { label: '% field users active month 3', value: '—', sub: 'Needs user accounts (FMX-024)' },
        ]}
      />

      <p className="text-xs text-muted mt-6">
        Scoped to this client's active properties. See <Link href="/" className="text-navy underline">Dashboard</Link> for the live board.
      </p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: MetricCard[] }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((m, i) => (
          <div key={i} className="rounded-lg border bg-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted">{m.label}</div>
            <div className={`text-2xl font-bold mt-1 ${
              m.tone === 'warn' ? 'text-amber-800' : m.tone === 'bad' ? 'text-red-800' : 'text-navy'
            }`}>{m.value}</div>
            {m.sub && <div className="text-[11px] text-muted mt-1">{m.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

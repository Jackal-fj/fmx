import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import QRCode from 'qrcode';
import PrintButton from './print-button';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type Kind = 'property' | 'asset' | 'client' | 'agreement';

type LabelRow = {
  kind: Kind;
  label: string;         // big readable code / name beneath the QR
  sub: string;           // small line below (property, tenant, etc.)
  href: string;          // absolute-path target (combined with origin at render time)
};

async function fetchRows(kind: Kind, propertyFilter: string | null): Promise<LabelRow[]> {
  const sb = supabaseServer;
  if (kind === 'property') {
    const { data } = await sb.from('properties')
      .select('short_code, name, tenant_name, client:client_id ( short_code )')
      .eq('active', true).order('short_code');
    return (data || []).map((p: any) => ({
      kind,
      label: p.short_code,
      sub: [p.name, p.tenant_name].filter(Boolean).join(' · '),
      href: `/properties/${encodeURIComponent(p.short_code)}`,
    }));
  }
  if (kind === 'asset') {
    let q = sb.from('assets')
      .select('id, asset_code, name, asset_type, property:property_id ( short_code )')
      .eq('active', true).order('asset_code');
    const { data } = await q;
    const rows = (data || []).filter((a: any) =>
      !propertyFilter || a.property?.short_code === propertyFilter
    );
    return rows.map((a: any) => ({
      kind,
      label: a.asset_code || a.name.slice(0, 18),
      sub: [a.property?.short_code, a.asset_type, a.name].filter(Boolean).join(' · '),
      href: `/assets/${a.id}`,
    }));
  }
  if (kind === 'client') {
    const { data } = await sb.from('clients')
      .select('short_code, name')
      .eq('active', true).order('short_code');
    return (data || []).map((c: any) => ({
      kind,
      label: c.short_code,
      sub: c.name,
      href: `/clients/${encodeURIComponent(c.short_code)}`,
    }));
  }
  // agreement
  const { data } = await sb.from('client_agreements')
    .select('agreement_code, name, status, client:client_id ( short_code )')
    .order('agreement_code');
  return (data || []).map((a: any) => ({
    kind,
    label: a.agreement_code,
    sub: `${a.client?.short_code || '—'} · ${a.name}`,
    href: a.client?.short_code
      ? `/clients/${encodeURIComponent(a.client.short_code)}/agreements/${encodeURIComponent(a.agreement_code)}`
      : '/clients',
  }));
}

function parseKind(raw?: string): Kind {
  if (raw === 'asset' || raw === 'client' || raw === 'agreement') return raw;
  return 'property';
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: { kind?: string; property?: string; size?: string };
}) {
  noStore();
  const kind = parseKind(searchParams.kind);
  const propertyFilter = (searchParams.property || '').toUpperCase() || null;
  const size = searchParams.size === 'large' ? 'large' : 'medium';

  // Base URL for the QR payload. Falls back to relative if env is unset — the
  // scanner on a phone can still resolve it when the same host served the page.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.VERCEL_URL
    || '';
  const origin = baseUrl.startsWith('http') ? baseUrl : baseUrl ? `https://${baseUrl}` : '';

  const [rows, { data: properties }] = await Promise.all([
    fetchRows(kind, propertyFilter),
    supabaseServer.from('properties').select('short_code, name').eq('active', true).order('short_code'),
  ]);

  // Pre-render every QR as an SVG string server-side so Print works
  // instantly without a JS pass.
  const qrSize = size === 'large' ? 320 : 180;
  const qrs = await Promise.all(rows.map(async r => {
    const url = (origin + r.href) || r.href;
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      width: qrSize,
      errorCorrectionLevel: 'M',
    });
    return { ...r, svg, url };
  }));

  const KIND_LABEL: Record<Kind, string> = {
    property: 'Properties', asset: 'Assets', client: 'Clients', agreement: 'Agreements',
  };

  return (
    <div>
      {/* ---- Controls (hidden on print) ---- */}
      <div className="print:hidden mb-6">
        <h1 className="text-2xl font-bold text-navy mb-1">QR labels</h1>
        <p className="text-sm text-muted mb-4">
          Print, cut, stick. Scan a label with Search ({' '}
          <kbd className="font-mono text-xs border rounded px-1">/</kbd>{' '}
          then phone camera) or any QR app to jump straight to that record.
        </p>

        <FilterRow label="Kind">
          {(['property', 'asset', 'client', 'agreement'] as Kind[]).map(k => (
            <Chip key={k} active={kind === k} href={buildHref({ kind: k, property: propertyFilter, size })} label={KIND_LABEL[k]} />
          ))}
        </FilterRow>

        {kind === 'asset' && (
          <FilterRow label="Property">
            <Chip href={buildHref({ kind, property: null, size })} active={!propertyFilter} label="All" />
            {(properties || []).map(p => (
              <Chip key={p.short_code} href={buildHref({ kind, property: p.short_code, size })} active={propertyFilter === p.short_code} label={p.short_code} />
            ))}
          </FilterRow>
        )}

        <FilterRow label="Size">
          <Chip href={buildHref({ kind, property: propertyFilter, size: 'medium' })} active={size === 'medium'} label="A4 grid" />
          <Chip href={buildHref({ kind, property: propertyFilter, size: 'large' })} active={size === 'large'} label="Large (1 per page)" />
        </FilterRow>

        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="text-muted">{qrs.length} label{qrs.length === 1 ? '' : 's'} ready</span>
          {qrs.length > 0 && (
            <PrintButton />
          )}
          {!origin && (
            <span className="text-amber-800 text-xs">
              ⚠ Set <code className="font-mono">NEXT_PUBLIC_APP_URL</code> to produce absolute QR URLs. Relative URLs scan only on the same host.
            </span>
          )}
        </div>
      </div>

      {/* ---- Printable sheet ---- */}
      {qrs.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted text-center print:hidden">
          Nothing to render for this filter combination.
        </div>
      ) : size === 'large' ? (
        <div className="space-y-6 print:space-y-0">
          {qrs.map((r, i) => (
            <div key={i} className="label-page label-large rounded-lg border bg-white p-8 flex flex-col items-center gap-4 print:break-after-page print:border-0 print:rounded-none">
              <div dangerouslySetInnerHTML={{ __html: r.svg }} />
              <div className="text-center">
                <div className="text-3xl font-bold text-navy">{r.label}</div>
                <div className="text-sm text-muted mt-1">{r.sub}</div>
                <div className="text-[10px] font-mono text-muted mt-2 break-all">{r.url}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="label-grid grid grid-cols-2 sm:grid-cols-3 gap-3 print:grid-cols-3 print:gap-2">
          {qrs.map((r, i) => (
            <div key={i} className="label-cell rounded border bg-white p-3 flex flex-col items-center gap-2 text-center print:border-0 print:rounded-none">
              <div dangerouslySetInnerHTML={{ __html: r.svg }} />
              <div className="text-sm font-bold text-navy leading-tight">{r.label}</div>
              <div className="text-[10px] text-muted leading-snug line-clamp-2">{r.sub}</div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white !important; }
          main { padding: 0 !important; max-width: none !important; }
          nav, footer { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function buildHref(f: { kind: Kind; property: string | null; size: 'medium' | 'large' }) {
  const p = new URLSearchParams();
  if (f.kind !== 'property') p.set('kind', f.kind);
  if (f.property) p.set('property', f.property);
  if (f.size !== 'medium') p.set('size', f.size);
  const qs = p.toString();
  return qs ? `/labels?${qs}` : '/labels';
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-muted w-16 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        active ? 'bg-navy text-white border-navy' : 'bg-white text-muted border-gray-300 hover:border-navy hover:text-navy'
      }`}
    >
      {label}
    </Link>
  );
}


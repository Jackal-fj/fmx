import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type SearchHit = {
  type: 'defect' | 'client' | 'property' | 'agreement' | 'asset' | 'vendor';
  href: string;
  label: string;        // primary display line
  sub?: string;         // secondary line (property, type, trade, etc.)
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const sb = supabaseServer;
  const like = `%${q}%`;

  const [
    { data: defects },
    { data: clients },
    { data: properties },
    { data: agreements },
    { data: assets },
    { data: vendors },
  ] = await Promise.all([
    sb.from('defects')
      .select('defect_number, title, severity, property:property_id ( short_code )')
      .or(`defect_number.ilike.${like},title.ilike.${like}`)
      .neq('status', 'draft')
      .limit(5),
    sb.from('clients')
      .select('short_code, name')
      .or(`short_code.ilike.${like},name.ilike.${like}`)
      .eq('active', true)
      .limit(5),
    sb.from('properties')
      .select('short_code, name, address')
      .or(`short_code.ilike.${like},name.ilike.${like}`)
      .eq('active', true)
      .limit(5),
    sb.from('client_agreements')
      .select('agreement_code, name, status, client:client_id ( short_code )')
      .or(`agreement_code.ilike.${like},name.ilike.${like}`)
      .limit(5),
    sb.from('assets')
      .select('id, name, asset_code, asset_type, property:property_id ( short_code )')
      .or(`name.ilike.${like},asset_code.ilike.${like},asset_type.ilike.${like}`)
      .eq('active', true)
      .limit(5),
    sb.from('providers')
      .select('id, name, trade')
      .or(`name.ilike.${like},trade.ilike.${like}`)
      .eq('active', true)
      .limit(5),
  ]);

  const hits: SearchHit[] = [];

  for (const d of defects || []) {
    const prop = (d.property as any)?.short_code || '';
    hits.push({
      type: 'defect',
      href: `/defects/${encodeURIComponent(d.defect_number)}`,
      label: `${d.defect_number} — ${d.title}`,
      sub: [prop, (d.severity || '').toUpperCase()].filter(Boolean).join(' · '),
    });
  }
  for (const c of clients || []) {
    hits.push({
      type: 'client',
      href: `/clients/${c.short_code}`,
      label: `${c.short_code} — ${c.name}`,
    });
  }
  for (const p of properties || []) {
    hits.push({
      type: 'property',
      href: `/properties/${p.short_code}`,
      label: `${p.short_code} — ${p.name}`,
      sub: p.address || undefined,
    });
  }
  for (const a of agreements || []) {
    const cs = (a.client as any)?.short_code;
    hits.push({
      type: 'agreement',
      href: cs ? `/clients/${cs}/agreements/${encodeURIComponent(a.agreement_code)}` : '/clients',
      label: `${a.agreement_code} — ${a.name}`,
      sub: cs ? `${cs} · ${a.status}` : a.status,
    });
  }
  for (const a of assets || []) {
    const prop = (a.property as any)?.short_code || '';
    hits.push({
      type: 'asset',
      href: `/assets/${a.id}`,
      label: a.asset_code ? `${a.asset_code} — ${a.name}` : a.name,
      sub: [prop, a.asset_type].filter(Boolean).join(' · '),
    });
  }
  for (const v of vendors || []) {
    hits.push({
      type: 'vendor',
      href: `/vendors/${v.id}`,
      label: v.name,
      sub: v.trade || undefined,
    });
  }

  return NextResponse.json({ hits });
}

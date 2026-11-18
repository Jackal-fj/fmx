import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Small helper: short_code → uuid. Used by client components that only
// carry the short_code in the URL but need the uuid for an append-only
// write.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get('code') || '').trim().toUpperCase();
  if (!code) return NextResponse.json({ id: null });
  const { data } = await supabaseServer
    .from('properties')
    .select('id')
    .eq('short_code', code)
    .maybeSingle();
  return NextResponse.json({ id: data?.id ?? null });
}

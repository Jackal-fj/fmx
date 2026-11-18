import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// FMX-055: upload inspection-result photos to Supabase Storage.
// Shares the defect-photos bucket (same ACL pattern); path namespaced
// under `inspection/<session>/<item>/...` so audits can group them.
export async function POST(req: Request) {
  const required = process.env.QUICK_ADD_SECRET;
  const fd = await req.formData();
  const key = (fd.get('key') as string || '').trim();
  if (!required || key !== required) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }
  const sessionId = (fd.get('session_id') as string || '').trim();
  const itemId = (fd.get('item_id') as string || '').trim();
  if (!sessionId || !itemId) {
    return NextResponse.json({ error: 'Missing session / item id' }, { status: 400 });
  }

  const files = fd.getAll('photos').filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ urls: [] });
  }
  if (files.length > 10) {
    return NextResponse.json({ error: 'Max 10 photos per upload' }, { status: 400 });
  }

  const ts = Date.now();
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.type === 'image/png' ? 'png'
              : f.type === 'image/webp' ? 'webp'
              : 'jpg';
    const path = `inspection/${sessionId}/${itemId}/${ts}-${i + 1}.${ext}`;
    const buffer = new Uint8Array(await f.arrayBuffer());
    const { error: upErr } = await supabaseServer.storage
      .from('defect-photos')
      .upload(path, buffer, { contentType: f.type, upsert: false });
    if (upErr) continue;
    const { data: urlData } = supabaseServer.storage.from('defect-photos').getPublicUrl(path);
    urls.push(urlData.publicUrl);
  }
  return NextResponse.json({ urls });
}

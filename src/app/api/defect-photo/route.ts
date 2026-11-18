import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// FMX-061: upload evidence photos for a defect update (and for any future
// defect-scoped photo flow). Shares the defect-photos bucket; path prefixed
// with `${defect_id}/...` to match the pattern the existing updateDefect
// and appendDefectPhotos actions already write to.
//
// Posted from the FMX-061 queue handler with blobs read out of Dexie.
export async function POST(req: Request) {
  const required = process.env.QUICK_ADD_SECRET;
  const fd = await req.formData();
  const key = (fd.get('key') as string || '').trim();
  if (!required || key !== required) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }
  const defectId = (fd.get('defect_id') as string || '').trim();
  if (!defectId) return NextResponse.json({ error: 'Missing defect_id' }, { status: 400 });

  const files = fd.getAll('photos').filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) return NextResponse.json({ urls: [] });
  if (files.length > 10) return NextResponse.json({ error: 'Max 10 photos per upload' }, { status: 400 });

  const ts = Date.now();
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.type === 'image/png' ? 'png'
              : f.type === 'image/webp' ? 'webp'
              : 'jpg';
    const path = `${defectId}/${ts}-${i + 1}.${ext}`;
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

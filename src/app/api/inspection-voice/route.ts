import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// FMX-067: upload a voice-note blob for a given inspection result.
// Shares the defect-photos bucket (same ACL) but under a different
// prefix: inspection/<session>/<item>/voice-<ts>.webm. Returns the
// public URL so the voice.upload handler can attach it to the result.
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
    return NextResponse.json({ error: 'Missing session_id / item_id' }, { status: 400 });
  }
  const file = fd.get('voice');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing voice blob' }, { status: 400 });
  }
  // Rough cap — a 30-min WebM/Opus at 32kbps is ~7 MB; 15 MB headroom.
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'Voice note too large (max 15 MB)' }, { status: 400 });
  }

  const ts = Date.now();
  const ext = file.type.includes('mp4') ? 'm4a'
            : file.type.includes('mpeg') ? 'mp3'
            : file.type.includes('ogg') ? 'ogg'
            : 'webm';
  const path = `inspection/${sessionId}/${itemId}/voice-${ts}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabaseServer.storage
    .from('defect-photos')
    .upload(path, buffer, { contentType: file.type || 'audio/webm', upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  const { data: urlData } = supabaseServer.storage.from('defect-photos').getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}

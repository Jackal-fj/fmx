import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// FMX-073: extract lines from a .docx / .xlsx / .csv / .txt file for the
// template import flow. Returns { lines: string[] } — the client drops them
// into the pastebox and the existing FMX-065 parser takes over (bullets,
// numbering, CSV cell stripping, blank filtering).
//
// Auth-gated the same way the rest of the write endpoints are (secret key
// in the multipart form).
export async function POST(req: Request) {
  const required = process.env.QUICK_ADD_SECRET;
  const fd = await req.formData();
  const key = (fd.get('key') as string || '').trim();
  if (!required || key !== required) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  // Rough cap — a 10 MB .docx would be thousands of pages. Keep it modest.
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
  }

  const name = (file.name || '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    // ----- .docx (Word) ----------------------------------------------------
    if (name.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      const lines = (value || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
      return NextResponse.json({ lines, source: 'docx' });
    }

    // ----- .xlsx / .xls / .csv (Excel + comma-separated) -------------------
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      const wb = XLSX.read(buf, { type: 'buffer' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return NextResponse.json({ lines: [], source: 'xlsx-empty' });
      const sheet = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      // Take the first non-empty cell of each row — mirrors the FMX-065
      // CSV-first-cell behaviour but works on columns B+ too if A is empty.
      const lines: string[] = [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (cell == null) continue;
          const s = String(cell).trim();
          if (s) { lines.push(s); break; }
        }
      }
      return NextResponse.json({ lines, source: 'xlsx' });
    }

    // ----- .txt / anything else treated as UTF-8 text ---------------------
    if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
      const text = buf.toString('utf-8');
      const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
      return NextResponse.json({ lines, source: 'text' });
    }

    return NextResponse.json({ error: 'Unsupported file type. Use .docx, .xlsx, .csv or .txt.' }, { status: 415 });
  } catch (e: any) {
    return NextResponse.json({ error: `Could not parse file: ${e?.message || e}` }, { status: 500 });
  }
}

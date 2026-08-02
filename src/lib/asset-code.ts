// Auto-generation for asset codes.
//
// Format: {PROPERTY_SHORT_CODE}-{TYPE_SLUG}-{SEQ:3-digit}
// Examples:
//   KH-AC-001, KH-AC-002, KH-GEN-001, NH-LIFT-001
//
// Existing hand-crafted codes (e.g. NH-GF-AC-HRLAY) don't match this pattern
// and won't clash with the auto-generated numeric sequence.

import { supabaseServer } from './supabase';

// Convert asset type into a 2-4 character upper-case slug.
// Preserves letters and numbers, drops separators and short words.
export function typeSlug(assetType: string): string {
  const cleaned = (assetType || '').trim();
  if (!cleaned) return 'OT';
  // Take the first word (up to first / or space)
  const first = cleaned.split(/[\s/]+/)[0];
  const upper = first.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper.length === 0) return 'OT';
  return upper.slice(0, 4);
}

// Generate the next available code for a property + asset type combination.
// Queries current maximum sequence and returns +1, zero-padded to 3 digits.
export async function generateAssetCode(
  propertyShortCode: string,
  assetType: string,
): Promise<string> {
  const prop = propertyShortCode.trim().toUpperCase();
  const slug = typeSlug(assetType);
  const prefix = `${prop}-${slug}-`;

  // Find all existing assets with this prefix + trailing digits
  const { data } = await supabaseServer
    .from('assets')
    .select('asset_code')
    .like('asset_code', `${prefix}%`);

  let maxSeq = 0;
  const seqRe = /-(\d+)$/;
  for (const row of data || []) {
    const code = row.asset_code;
    if (!code) continue;
    // Only match rows where suffix is purely digits (skip alpha suffixes like -HRLAY)
    if (!code.startsWith(prefix)) continue;
    const m = code.match(seqRe);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }

  const seq = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

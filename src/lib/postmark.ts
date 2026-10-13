// Postmark Inbound webhook helpers.
//
// Postmark posts a JSON body to our endpoint whenever mail arrives at the
// configured inbound address. Carl's cmsfiji.com Google Workspace forwards
// fmx@cmsfiji.com → Postmark inbound address → us.
//
// Postmark docs:
//   https://postmarkapp.com/developer/user-guide/inbound/parse-an-email

// -------------------------------------------------------------------------
// Webhook auth — Postmark's URL validator rejects user:pass@host, so we
// authenticate via a query-parameter secret instead. Carl sets the webhook
// URL in Postmark as e.g. https://fmx.cmsfiji.com/api/email?secret=XXX and
// we check XXX against the POSTMARK_WEBHOOK_SECRET env var.
// -------------------------------------------------------------------------
export function verifyQuerySecret(url: string): boolean {
  const expected = process.env.POSTMARK_WEBHOOK_SECRET;
  if (!expected) return false;
  try {
    const u = new URL(url);
    const got = u.searchParams.get('secret');
    return got !== null && got === expected;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------------
// Extract an existing defect number (DEF-YYYY-NNN) from any of the given text.
// -------------------------------------------------------------------------
export function extractDefectRef(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/\bDEF-\d{4}-\d{3,5}\b/i);
    if (m) return m[0].toUpperCase();
  }
  return null;
}

// -------------------------------------------------------------------------
// Property keyword detection. Matches both short codes (NH / KH / GH) and
// property names (Naibati, Korobasaga, Gunu). Case-insensitive. Returns the
// short_code or null if no match.
// -------------------------------------------------------------------------
const PROPERTY_KEYWORDS: { short_code: string; patterns: RegExp[] }[] = [
  { short_code: 'NH', patterns: [/\bNH\b/i, /\bnaibati\b/i] },
  { short_code: 'KH', patterns: [/\bKH\b/i, /\bkorobasaga\b/i] },
  { short_code: 'GH', patterns: [/\bGH\b/i, /\bgunu\b/i] },
];

export function detectProperty(...candidates: (string | null | undefined)[]): string | null {
  const blob = candidates.filter(Boolean).join(' ');
  for (const prop of PROPERTY_KEYWORDS) {
    for (const re of prop.patterns) {
      if (re.test(blob)) return prop.short_code;
    }
  }
  return null;
}

// -------------------------------------------------------------------------
// Severity hints. Looser than defects.severity enum — these just feed the
// draft prefill, Carl approves. 'critical' / 'urgent' / 'emergency' / 'fire'
// / 'flood' / 'power out' → critical. 'leak' / 'broken' / 'not working' →
// major. Otherwise null (default to 'moderate' at insert time).
// -------------------------------------------------------------------------
export function detectSeverity(...candidates: (string | null | undefined)[]): 'critical' | 'major' | 'moderate' | 'minor' | null {
  const blob = candidates.filter(Boolean).join(' ').toLowerCase();
  if (/\b(critical|urgent|emergency|fire|flood|power\s*out|evacuat|safety)\b/.test(blob)) return 'critical';
  if (/\b(leak|broken|not\s*working|dangerous|failed|outage|burst)\b/.test(blob)) return 'major';
  if (/\b(minor|small|cosmetic|tidy|clean)\b/.test(blob)) return 'minor';
  return null;
}

// -------------------------------------------------------------------------
// Shape of Postmark's inbound POST body (fields we actually use).
// Full schema: https://postmarkapp.com/developer/webhooks/inbound-webhook
// -------------------------------------------------------------------------
export type PostmarkInbound = {
  MessageID: string;
  Date: string;
  Subject: string;
  FromFull?: { Email: string; Name?: string; MailboxHash?: string };
  From?: string;
  To?: string;
  ToFull?: { Email: string; Name?: string }[];
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Attachments?: {
    Name: string;
    Content: string;        // base64
    ContentType: string;
    ContentLength: number;
    ContentID?: string;
  }[];
};

// Derive a short, email-safe title from the subject or the first line of body.
// Trims boilerplate like "Re:" / "Fwd:" / "FW:".
export function titleFromEmail(
  subject: string | null | undefined,
  textBody: string | null | undefined,
): string {
  const s = (subject || '').replace(/^\s*(re|fw|fwd|aw):\s*/gi, '').trim();
  if (s) return s.slice(0, 200);
  const first = (textBody || '').split('\n').map(l => l.trim()).find(Boolean);
  return (first || '(no subject)').slice(0, 200);
}

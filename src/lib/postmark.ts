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
// Severity hints. Context-aware: a fire-related email about compliance
// paperwork should NOT be flagged as a critical incident, so when admin
// keywords are present we demote one tier (or skip if we'd otherwise be
// mild). Carl approves at the review step anyway — this just keeps the
// prefill honest.
// -------------------------------------------------------------------------
const ADMIN_CONTEXT_RE = /\b(certificate|certification|compliance|training|renewal|application|procedure|renew|licens|audit|insur|inspection\s+report)\b/i;

export function detectSeverity(...candidates: (string | null | undefined)[]): 'critical' | 'major' | 'moderate' | 'minor' | null {
  const blob = candidates.filter(Boolean).join(' ').toLowerCase();
  const isAdmin = ADMIN_CONTEXT_RE.test(blob);

  let hit: 'critical' | 'major' | 'moderate' | 'minor' | null = null;
  if (/\b(critical|urgent|emergency|fire|flood|power\s*out|evacuat|safety)\b/.test(blob)) hit = 'critical';
  else if (/\b(leak|broken|not\s*working|dangerous|failed|outage|burst)\b/.test(blob)) hit = 'major';
  else if (/\b(minor|small|cosmetic|tidy|clean)\b/.test(blob)) hit = 'minor';

  if (!hit) return null;
  if (!isAdmin) return hit;

  // Admin context — demote one tier.
  if (hit === 'critical') return 'major';
  if (hit === 'major') return 'moderate';
  return hit;   // minor stays minor
}

// -------------------------------------------------------------------------
// Trim a forwarded or reply email body down to the newest message only.
// Detects Gmail's "---------- Forwarded message ---------", Outlook's
// "From: ... Sent: ... To: ... Subject:" header block, and the generic
// "On [date] at [time] [name] wrote:" delimiter. Everything before the
// delimiter is kept; the quoted history is dropped (still available in
// the raw email_inbox row for audit).
// -------------------------------------------------------------------------
const QUOTE_DELIMITERS = [
  /\n-{3,}\s*Forwarded message\s*-{3,}/i,
  /\n-{3,}\s*Original message\s*-{3,}/i,
  /\nFrom:\s+.+\nSent:\s+/i,                       // Outlook thread header
  /\nFrom:\s+.+\nDate:\s+/i,                       // Alt Outlook forward
  /\nOn\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2}\s+\w+|\w+,?\s+\w+\s+\d{1,2}).{0,80}wrote:\s*$/im,
  /\n>+\s*/,                                        // first quoted-reply marker
];

export function topMessageOnly(textBody: string | null | undefined): string {
  if (!textBody) return '';
  let earliest = textBody.length;
  for (const re of QUOTE_DELIMITERS) {
    const m = textBody.match(re);
    if (m && m.index !== undefined && m.index < earliest) {
      earliest = m.index;
    }
  }
  return textBody.slice(0, earliest).trim();
}

// -------------------------------------------------------------------------
// Extract the real reporter from a Gmail-style forward. When Carl forwards
// a KGF email to fmx@, Postmark sees Carl as the sender; the actual
// reporter is in the first "From:" line of the forwarded block.
// -------------------------------------------------------------------------
export function extractForwardedFrom(textBody: string | null | undefined): { email: string; name: string | null } | null {
  if (!textBody) return null;
  // Match "From: Name <email@domain>" or "From: email@domain" — first occurrence
  // after a forward delimiter, OR anywhere in the body if no delimiter found.
  const re = /From:\s+(?:(.+?)\s*<)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
  const m = textBody.match(re);
  if (!m) return null;
  const name = (m[1] || '').trim() || null;
  return { email: m[2].toLowerCase(), name };
}

// Operator addresses — mail from these senders is treated as an operator
// forwarding on behalf of a real reporter. Expand later if more staff
// forward on Carl's behalf.
export function isOperatorAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const operators = (process.env.FMX_OPERATOR_EMAILS || 'carl@cmsfiji.com')
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return operators.includes(email.toLowerCase());
}

// Signature-logo detection. Three signals, any one triggers:
//   1. Postmark reports a ContentID → image is inline (HTML <img src="cid:...">),
//      which is nearly always a signature or branded header, never evidence.
//      This is the cleanest signal.
//   2. Filename matches image001/image002/image.png generic pattern AND is
//      under 250KB — Outlook, Gmail native, Apple Mail all produce these.
//   3. Phone photos from WhatsApp/Gmail come as IMG_1234.jpg, DSC_...,
//      PXL_... — those are kept regardless of size.
const INLINE_FILENAME_RE = /^(image\d{0,3}|logo|signature|banner|header|footer)\.(png|jpg|jpeg|gif|webp)$/i;
const SIGNATURE_SIZE_LIMIT = 250 * 1024;   // 250KB — Human Rights-style logos run 127-200KB

export function isLikelySignatureImage(
  filename: string,
  size: number,
  contentId: string | null | undefined,
): boolean {
  if (contentId && contentId.trim().length > 0) return true;
  if (INLINE_FILENAME_RE.test(filename) && size <= SIGNATURE_SIZE_LIMIT) return true;
  return false;
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

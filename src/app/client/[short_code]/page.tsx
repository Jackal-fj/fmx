import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { resolveClientFromToken } from '@/lib/client-access/tokens';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// FMX-074: client-viewer landing (stub).
//
// Signed-link gate. The URL carries `?t=<plaintext>` on first visit; we set
// a cookie so subsequent visits don't leak the token in referrer headers,
// browser history, or server access logs beyond the first hop.
//
// The real portfolio snapshot lands in FMX-075. For now, prove the gate
// works end to end so Carl can hand a URL to Irene and verify.

const COOKIE_NAME = 'fmx_client';   // scoped by path below

export default async function ClientLanding({
  params,
  searchParams,
}: {
  params: { short_code: string };
  searchParams: { t?: string };
}) {
  noStore();

  // Resolve token from query string (fresh link) or cookie (follow-up visits).
  const cookieStore = cookies();
  const headerStore = headers();
  const queryToken = (searchParams.t || '').trim();
  const cookieToken = cookieStore.get(COOKIE_NAME)?.value || '';
  const candidate = queryToken || cookieToken;

  // Best-effort IP for the last_used bump — Vercel headers first, then fallback.
  const ip =
    headerStore.get('x-real-ip') ||
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;

  const scope = candidate ? await resolveClientFromToken(candidate, { ip }) : null;

  // No valid token → render a generic "sign-in required" page. Deliberately
  // vague: don't confirm whether the client short_code exists, don't say
  // "revoked" vs "wrong" — same shape in both cases.
  if (!scope) {
    return (
      <div className="mx-auto max-w-md mt-16 rounded-lg border bg-white p-6 text-center">
        <div className="text-sm text-muted uppercase tracking-wide mb-2">Access required</div>
        <h1 className="text-xl font-bold text-navy mb-2">Signed link needed</h1>
        <p className="text-sm text-muted">
          This page is for client viewers. Please use the full signed link your FM shared with you — or ask them for a new one.
        </p>
      </div>
    );
  }

  // Cross-check the short_code in the URL against the token's scope. A
  // token is bound to one client; visiting another client's path with
  // someone else's token = 404 rather than leak anything.
  if (scope.client_short_code !== params.short_code) notFound();

  // On the first visit we received the token in ?t=. Promote it to a cookie
  // so subsequent navigations within /client/<short_code> don't leak it in
  // referrers. The response below is server-rendered so cookies() is the
  // right surface — set the cookie here and let Next serialise it.
  if (queryToken && queryToken !== cookieToken) {
    cookieStore.set({
      name: COOKIE_NAME,
      value: queryToken,
      path: `/client/${params.short_code}`,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      // Six months — long enough to survive casual re-use without being
      // effectively forever. Revoking the token in admin kills it anyway.
      maxAge: 60 * 60 * 24 * 180,
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border bg-white p-6">
        <div className="text-[11px] uppercase tracking-wide text-muted">Client portal</div>
        <h1 className="text-2xl font-bold text-navy mt-1">{scope.client_name}</h1>
        <p className="text-sm text-muted mt-2">
          Signed in as a read-only viewer{scope.token_label ? ` (${scope.token_label})` : ''}.
        </p>
      </div>

      <section className="rounded-lg border bg-white p-6 mt-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">What's here</h2>
        <p className="text-sm text-muted">
          Your portfolio snapshot lands next — open defects by property, active service agreements, published reports. You'll see this view evolve over the coming days as content is wired up.
        </p>
      </section>

      <p className="text-[11px] text-muted mt-6 text-center">
        FMX client viewer · read-only · {new Date().toISOString().slice(0, 10)}
      </p>
    </div>
  );
}

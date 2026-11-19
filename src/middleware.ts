import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// FMX-074 fix (2026-11-19): promote `?t=<token>` to the `fmx_client` cookie
// here, BEFORE the page component runs. Next.js 14's Server Components can
// read cookies but can't write them — attempting cookies().set() in a page
// throws "Cookies can only be modified in a Server Action or Route Handler".
// Middleware is the correct seam.
//
// Flow:
//   1. User clicks   /client/KGF?t=<plaintext>
//   2. Middleware sees the ?t=, sets cookie scoped to /client/KGF, redirects
//      to a clean /client/KGF (no token in the URL anymore — no referrer leak,
//      no bookmark leak).
//   3. Browser follows redirect carrying the cookie.
//   4. Page component reads the cookie, validates via resolveClientFromToken,
//      renders the portal.
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const t = url.searchParams.get('t');
  if (!t) return NextResponse.next();

  // Pull the short_code from the pathname. matcher pins us to /client/:code*,
  // so parts[1] is the short_code (if present).
  const parts = url.pathname.split('/').filter(Boolean);
  const shortCode = parts[1] || '';
  if (!shortCode) return NextResponse.next();

  // Clean URL: strip the plaintext token from the query string.
  const clean = url.clone();
  clean.searchParams.delete('t');

  const res = NextResponse.redirect(clean);
  res.cookies.set({
    name: 'fmx_client',
    value: t,
    path: `/client/${shortCode}`,
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    // Six months — long enough to survive casual re-use without being
    // effectively forever. Revoking the token in admin kills it anyway.
    maxAge: 60 * 60 * 24 * 180,
  });
  return res;
}

export const config = {
  matcher: '/client/:path*',
};

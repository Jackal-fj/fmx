// FMX-044: client-side locale resolution. Reads the LOCALE_COOKIE from
// document.cookie and returns a translator. Lives on its own path so
// client components can import it without pulling the server cookies()
// helper into the client bundle.

'use client';

import { useMemo } from 'react';
import { LOCALE_COOKIE } from './strings';
import { makeT, resolveLocale, T } from './t';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function useT(): T {
  return useMemo(() => makeT(resolveLocale(readCookie(LOCALE_COOKIE))), []);
}

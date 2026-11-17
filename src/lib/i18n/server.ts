// FMX-044: server-side locale resolution. Reads the LOCALE_COOKIE set by
// the LocaleSwitcher and returns a translator bound to that locale.
// Default locale is English; unknown cookie values fall back silently.

import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from './strings';
import { makeT, resolveLocale, T } from './t';

export function getT(): T {
  const raw = cookies().get(LOCALE_COOKIE)?.value ?? null;
  return makeT(resolveLocale(raw));
}

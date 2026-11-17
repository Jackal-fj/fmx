// FMX-044: lookup helper. Resolves a dotted key against the current
// locale catalogue, falling back to English for any missing translation.
// Used both server-side (reads the cookie via next/headers) and client-side
// (via the useT hook in ./use-t.ts).

import { CATALOGUES, DEFAULT_LOCALE, Locale, Strings } from './strings';

type Path<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends object
    ? `${K}.${Path<T[K]>}`
    : K
  : never;

export type StringKey = Path<Strings>;

function dig(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function resolveLocale(raw: string | undefined | null): Locale {
  if (raw === 'fj' || raw === 'hi' || raw === 'en') return raw;
  return DEFAULT_LOCALE;
}

// Apply {{name}} style substitution for interpolated values.
function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = params[k];
    return v == null ? `{{${k}}}` : String(v);
  });
}

// Build a translator bound to a specific locale. Server pages and client
// components both route through this.
export function makeT(locale: Locale) {
  const primary = CATALOGUES[locale] as any;
  const fallback = CATALOGUES.en as any;
  return function t(key: StringKey, params?: Record<string, string | number>): string {
    const hit = dig(primary, key) ?? dig(fallback, key);
    if (hit == null) {
      // Visible key so missing strings surface in dev rather than empty UI.
      return key;
    }
    return interpolate(hit, params);
  };
}

export type T = ReturnType<typeof makeT>;

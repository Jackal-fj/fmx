'use client';

import { useState, useRef, useEffect } from 'react';
import { LOCALE_COOKIE, LOCALE_LABELS, Locale } from '@/lib/i18n/strings';
import { resolveLocale } from '@/lib/i18n/t';

// Tiny menu that writes the locale cookie and reloads. Mount wherever
// language choice belongs (today: nowhere by default — FMX-044 stubs are
// English only. Add to the account menu when iTaukei / Fiji Hindi
// translations arrive).
export default function LocaleSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Locale>('en');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    setCurrent(resolveLocale(match ? decodeURIComponent(match[1]) : null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  function pick(l: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setCurrent(l);
    setOpen(false);
    // Full reload so server components re-read the cookie.
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="rounded text-xs text-muted hover:text-navy px-2 py-1 min-h-[44px]"
      >
        {LOCALE_LABELS[current]}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-md border bg-white shadow-lg min-w-[160px] overflow-hidden z-10">
          {(['en', 'fj', 'hi'] as Locale[]).map(l => (
            <button
              key={l}
              type="button"
              onClick={() => pick(l)}
              className={`block w-full text-left px-3 py-2 text-sm min-h-[44px] ${
                l === current ? 'bg-blue-50 text-navy font-semibold' : 'text-navy hover:bg-gray-50'
              }`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

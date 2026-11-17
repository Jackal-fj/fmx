'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

type AddItem = { href: string; label: string };

export default function AddDropdown({ items }: { items: AddItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside + Escape
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Add new record"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-center gap-2 bg-white px-5 py-3 min-h-[60px] min-w-[120px] rounded-lg border-2 transition ${
          open ? 'border-navy bg-blue-50' : 'border-navy hover:bg-blue-50'
        }`}
      >
        <span className="text-2xl leading-none text-navy font-light" aria-hidden>+</span>
        <span className="text-sm font-semibold text-navy">Add</span>
        <svg
          className={`w-3 h-3 text-navy transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12" fill="none" aria-hidden
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-md border bg-white shadow-lg min-w-[200px] overflow-hidden z-10">
          {items.map(it => (
            <Link
              key={it.href}
              href={it.href}
              className="block px-4 py-3 text-sm font-medium text-navy hover:bg-blue-50 transition border-b last:border-b-0 min-h-[44px] flex items-center gap-2"
            >
              <span className="text-lg leading-none text-navy font-light" aria-hidden>+</span>
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

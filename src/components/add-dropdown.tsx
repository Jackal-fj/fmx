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
        aria-label="New record"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-center bg-white w-14 h-14 rounded-lg border-2 transition ${
          open ? 'border-navy bg-blue-50' : 'border-navy hover:bg-blue-50'
        }`}
      >
        <span className="text-3xl leading-none text-navy font-light" aria-hidden>+</span>
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

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/',            label: 'Dashboard' },
  { href: '/properties',  label: 'Properties' },
  { href: '/defects',     label: 'Defects' },
  { href: '/assets',      label: 'Assets' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/vendors',     label: 'Vendors' },
  { href: '/reports',     label: 'Reports' },
];

export default function Nav({ quickAddKey }: { quickAddKey?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close all menus on route change
  useEffect(() => { setMenuOpen(false); setMoreOpen(false); }, [pathname]);

  // Close on click outside + Escape
  useEffect(() => {
    if (!menuOpen && !moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setMoreOpen(false); }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [menuOpen, moreOpen]);

  const withKey = (base: string) => quickAddKey ? `${base}?key=${encodeURIComponent(quickAddKey)}` : base;
  const newDefectHref    = withKey('/new-defect');
  const updateDefectHref = withKey('/update-defect');
  const newAssetHref     = withKey('/new-asset');
  const serviceLogHref   = withKey('/service-log');
  const newVendorHref    = withKey('/new-vendor');

  const moreActions = [
    { href: newAssetHref,   label: '+ Add asset',    hint: 'Register new equipment' },
    { href: serviceLogHref, label: 'Log service',    hint: 'Record a service event' },
    { href: newVendorHref,  label: '+ Add vendor',   hint: 'Register a contractor' },
  ];

  // Match current pathname against link href for highlighting
  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <nav className="border-b bg-white fixed top-0 left-0 right-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

        {/* -------- Left: FMX dropdown menu -------- */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            className="font-bold text-navy text-lg whitespace-nowrap flex items-center gap-1.5 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-navy/30 rounded px-1 py-0.5 -mx-1"
          >
            <span>FMX</span>
            <svg
              className={`w-3 h-3 text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 12 12" fill="none" aria-hidden
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-2 rounded-md border bg-white shadow-lg min-w-[220px] overflow-hidden">
              <div className="px-4 py-2 border-b bg-gray-50">
                <div className="text-xs font-semibold text-navy uppercase tracking-wide">Navigate</div>
              </div>
              {LINKS.map(l => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block px-4 py-2.5 text-sm border-b last:border-b-0 transition ${
                      active
                        ? 'text-navy font-semibold bg-blue-50 border-l-4 border-l-navy'
                        : 'text-muted hover:text-navy hover:bg-gray-50'
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
              <div className="px-4 py-2 text-[11px] text-muted bg-gray-50 border-t">
                Commercial Management Solutions
              </div>
            </div>
          )}
        </div>

        {/* -------- Right: Action buttons -------- */}
        {quickAddKey && (
          <div className="flex items-center gap-2">
            <Link
              href={updateDefectHref}
              className="rounded-md border border-navy text-navy text-sm font-semibold px-3 py-1.5 hover:bg-navy hover:text-white whitespace-nowrap transition"
            >
              Update
            </Link>
            <Link
              href={newDefectHref}
              className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-1.5 hover:bg-blue-900 whitespace-nowrap transition"
            >
              + Log defect
            </Link>
            <div ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen(o => !o)}
                aria-expanded={moreOpen}
                aria-haspopup="true"
                className="rounded-md border border-gray-300 text-muted text-sm font-semibold px-3 py-1.5 hover:border-navy hover:text-navy whitespace-nowrap transition flex items-center gap-1"
              >
                More
                <svg
                  className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12" fill="none" aria-hidden
                >
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-2 rounded-md border bg-white shadow-lg min-w-[220px] overflow-hidden">
                  <div className="px-4 py-2 border-b bg-gray-50">
                    <div className="text-xs font-semibold text-navy uppercase tracking-wide">Quick actions</div>
                  </div>
                  {moreActions.map(a => (
                    <Link
                      key={a.href}
                      href={a.href}
                      className="block px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50 transition"
                    >
                      <div className="text-sm font-medium text-navy">{a.label}</div>
                      <div className="text-xs text-muted">{a.hint}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type LeafLink = { href: string; label: string };
type GroupLink = { label: string; children: LeafLink[] };
type TopItem = LeafLink | GroupLink;

const TOP: TopItem[] = [
  { href: '/', label: 'Dashboard' },
  {
    label: 'Portfolio',
    children: [
      { href: '/clients',    label: 'Clients' },
      { href: '/properties', label: 'Properties' },
    ],
  },
  {
    label: 'Work',
    children: [
      { href: '/defects',     label: 'Defects' },
      { href: '/maintenance', label: 'Maintenance' },
      { href: '/assets',      label: 'Assets' },
    ],
  },
  {
    label: 'Resources',
    children: [
      { href: '/vendors',     label: 'Vendors' },
      { href: '/email-inbox', label: 'Email Inbox' },
    ],
  },
  { href: '/reports', label: 'Reports' },
];

function isLeaf(i: TopItem): i is LeafLink {
  return (i as LeafLink).href !== undefined;
}

export default function Nav({ quickAddKey }: { quickAddKey?: string }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close everything on route change
  useEffect(() => {
    setOpenGroup(null);
    setMoreOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Close on click outside + Escape
  useEffect(() => {
    if (openGroup === null && !moreOpen && !mobileOpen) return;
    const handler = (e: MouseEvent) => {
      if (openGroup !== null && groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (mobileOpen && mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenGroup(null); setMoreOpen(false); setMobileOpen(false); }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [openGroup, moreOpen, mobileOpen]);

  const withKey = (base: string) => quickAddKey ? `${base}?key=${encodeURIComponent(quickAddKey)}` : base;
  const newDefectHref    = withKey('/new-defect');
  const updateDefectHref = withKey('/update-defect');
  const newAssetHref     = withKey('/new-asset');
  const serviceLogHref   = withKey('/service-log');
  const newVendorHref    = withKey('/new-vendor');
  const newClientHref    = withKey('/clients/new');

  const moreActions = [
    { href: newAssetHref,   label: '+ Add asset',    hint: 'Register new equipment' },
    { href: serviceLogHref, label: 'Log service',    hint: 'Record a service event' },
    { href: newVendorHref,  label: '+ Add vendor',   hint: 'Register a contractor' },
    { href: newClientHref,  label: '+ New client',   hint: 'Set up a client, agreement and sites' },
  ];

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }
  function groupActive(g: GroupLink) {
    return g.children.some(c => isActive(c.href));
  }

  const chev = (open: boolean) => (
    <svg
      className={`w-3 h-3 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 12 12" fill="none" aria-hidden
    >
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <nav className="border-b bg-white fixed top-0 left-0 right-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

        {/* -------- Left: brand + mobile menu toggle -------- */}
        <div ref={mobileRef} className="relative flex items-center gap-2">
          <Link href="/" className="font-bold text-navy text-lg whitespace-nowrap hover:text-blue-900">
            FMX
          </Link>
          {/* Mobile hamburger (below md) */}
          <button
            type="button"
            onClick={() => setMobileOpen(o => !o)}
            aria-expanded={mobileOpen}
            aria-haspopup="true"
            className="md:hidden rounded p-1 text-muted hover:text-navy focus:outline-none focus:ring-2 focus:ring-navy/30"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          {mobileOpen && (
            <div className="md:hidden absolute left-0 top-full mt-2 rounded-md border bg-white shadow-lg min-w-[240px] overflow-hidden">
              <div className="px-4 py-2 border-b bg-gray-50">
                <div className="text-xs font-semibold text-navy uppercase tracking-wide">Navigate</div>
              </div>
              {TOP.map(item => {
                if (isLeaf(item)) {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-4 py-2.5 text-sm border-b transition ${
                        active
                          ? 'text-navy font-semibold bg-blue-50 border-l-4 border-l-navy'
                          : 'text-muted hover:text-navy hover:bg-gray-50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                }
                return (
                  <div key={item.label} className="border-b">
                    <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted bg-gray-50">
                      {item.label}
                    </div>
                    {item.children.map(c => {
                      const active = isActive(c.href);
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`block px-4 py-2 text-sm transition ${
                            active
                              ? 'text-navy font-semibold bg-blue-50 border-l-4 border-l-navy'
                              : 'text-muted hover:text-navy hover:bg-gray-50'
                          }`}
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
              <div className="px-4 py-2 text-[11px] text-muted bg-gray-50 border-t">
                Commercial Management Solutions
              </div>
            </div>
          )}
        </div>

        {/* -------- Centre: grouped links (md and up) -------- */}
        <div ref={groupRef} className="hidden md:flex items-center gap-1 flex-1 min-w-0 justify-center">
          {TOP.map(item => {
            if (isLeaf(item)) {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition ${
                    active ? 'text-navy font-semibold bg-blue-50' : 'text-muted hover:text-navy hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            }
            const open = openGroup === item.label;
            const active = groupActive(item);
            return (
              <div key={item.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup(o => o === item.label ? null : item.label)}
                  aria-expanded={open}
                  aria-haspopup="true"
                  className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition flex items-center gap-1 ${
                    active || open ? 'text-navy font-semibold bg-blue-50' : 'text-muted hover:text-navy hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                  {chev(open)}
                </button>
                {open && (
                  <div className="absolute left-0 top-full mt-2 rounded-md border bg-white shadow-lg min-w-[180px] overflow-hidden">
                    {item.children.map(c => {
                      const a = isActive(c.href);
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`block px-4 py-2.5 text-sm border-b last:border-b-0 transition ${
                            a
                              ? 'text-navy font-semibold bg-blue-50 border-l-4 border-l-navy'
                              : 'text-muted hover:text-navy hover:bg-gray-50'
                          }`}
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
                {chev(moreOpen)}
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

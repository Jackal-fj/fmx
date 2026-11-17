'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

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

// Deep-link fallback when there is no browser history (e.g. opening a share
// link, or landing on a detail page in a fresh tab). Maps the current route
// to its sensible parent so the back button never bounces to the dashboard
// from a context that has an obvious owner.
function inferParent(pathname: string): string {
  // Agreement view → client hub
  const agrMatch = pathname.match(/^\/clients\/([^/]+)\/agreements\/[^/]+/);
  if (agrMatch) return `/clients/${agrMatch[1]}`;
  // Anything deeper under /clients/[code]/* → client hub
  const clientDeep = pathname.match(/^\/clients\/([^/]+)\/.+/);
  if (clientDeep) return `/clients/${clientDeep[1]}`;
  if (pathname.startsWith('/clients/'))    return '/clients';
  // Property deep links → property hub, else list
  const propDeep = pathname.match(/^\/properties\/([^/]+)\/.+/);
  if (propDeep) return `/properties/${propDeep[1]}`;
  if (pathname.startsWith('/properties/')) return '/properties';
  // Defects / reports / email inbox detail → their list
  if (pathname.startsWith('/defects/'))     return '/defects';
  if (pathname.startsWith('/reports/history')) return '/reports';
  if (pathname.startsWith('/reports/'))     return '/reports';
  if (pathname.startsWith('/email-inbox/')) return '/email-inbox';
  if (pathname.startsWith('/maintenance/')) return '/maintenance';
  if (pathname.startsWith('/assets/'))      return '/assets';
  if (pathname.startsWith('/vendors/'))     return '/vendors';
  // Fallback: dashboard
  return '/';
}

export default function Nav({ quickAddKey }: { quickAddKey?: string }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Close everything on route change
  useEffect(() => {
    setOpenGroup(null);
    setAddOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Close on click outside + Escape
  useEffect(() => {
    if (openGroup === null && !addOpen && !mobileOpen) return;
    const handler = (e: MouseEvent) => {
      if (openGroup !== null && groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
      if (addOpen && addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddOpen(false);
      }
      if (mobileOpen && mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenGroup(null); setAddOpen(false); setMobileOpen(false); }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [openGroup, addOpen, mobileOpen]);

  const withKey = (base: string) => quickAddKey ? `${base}?key=${encodeURIComponent(quickAddKey)}` : base;

  // Consolidated Add menu — grouped by domain.
  const addGroups: { label: string; items: { href: string; label: string; hint: string }[] }[] = quickAddKey ? [
    {
      label: 'Defect',
      items: [
        { href: withKey('/new-defect'),    label: 'Log defect',    hint: 'Raise a new defect' },
        { href: withKey('/update-defect'), label: 'Update defect', hint: 'Edit or close an existing defect' },
      ],
    },
    {
      label: 'Register',
      items: [
        { href: withKey('/new-asset'),  label: 'Add asset',   hint: 'Register new equipment' },
        { href: withKey('/new-vendor'), label: 'Add vendor',  hint: 'Register a contractor' },
      ],
    },
    {
      label: 'Service',
      items: [
        { href: withKey('/service-log'), label: 'Log service event', hint: 'Record a service event' },
      ],
    },
    {
      label: 'Client',
      items: [
        { href: withKey('/clients/new'),  label: 'New client',   hint: 'Set up a client, agreement and sites' },
      ],
    },
  ] : [];

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

  // Back button — one click to previous page; falls back to inferred parent on
  // deep-link loads where browser history is empty.
  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(inferParent(pathname));
    }
  }
  const showBack = pathname !== '/';

  return (
    <nav className="border-b bg-white fixed top-0 left-0 right-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

        {/* -------- Left: back + brand + mobile menu -------- */}
        <div ref={mobileRef} className="relative flex items-center gap-1 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="rounded p-1.5 text-muted hover:text-navy hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/30 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M12.5 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <Link href="/" className="font-bold text-navy text-lg whitespace-nowrap hover:text-blue-900 px-1">
            FMX
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(o => !o)}
            aria-expanded={mobileOpen}
            aria-haspopup="true"
            aria-label="Menu"
            className="md:hidden rounded p-1 text-muted hover:text-navy focus:outline-none focus:ring-2 focus:ring-navy/30"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          {mobileOpen && (
            <div className="md:hidden absolute left-0 top-full mt-2 rounded-md border bg-white shadow-lg min-w-[260px] max-h-[80vh] overflow-y-auto">
              {/* Add actions pinned to the top on mobile */}
              {addGroups.length > 0 && (
                <div className="border-b bg-blue-50/50">
                  <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-navy font-semibold">+ Add</div>
                  {addGroups.map(g => (
                    <div key={g.label}>
                      <div className="px-4 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted">{g.label}</div>
                      {g.items.map(it => (
                        <Link key={it.href} href={it.href} className="block px-4 py-2 text-sm text-navy hover:bg-white">
                          + {it.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
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
                    <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted bg-gray-50">{item.label}</div>
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

        {/* -------- Right: consolidated Add menu -------- */}
        {addGroups.length > 0 && (
          <div ref={addRef} className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setAddOpen(o => !o)}
              aria-expanded={addOpen}
              aria-haspopup="true"
              className={`rounded-md text-sm font-semibold px-3 py-1.5 whitespace-nowrap transition flex items-center gap-1 ${
                addOpen
                  ? 'bg-navy text-white'
                  : 'border border-navy text-navy hover:bg-navy hover:text-white'
              }`}
            >
              + Add
              <svg className={`w-3 h-3 transition-transform ${addOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {addOpen && (
              <div className="absolute right-0 top-full mt-2 rounded-md border bg-white shadow-lg min-w-[260px] max-h-[80vh] overflow-y-auto">
                {addGroups.map((g, gi) => (
                  <div key={g.label} className={gi > 0 ? 'border-t' : ''}>
                    <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted bg-gray-50">
                      {g.label}
                    </div>
                    {g.items.map(it => (
                      <Link
                        key={it.href}
                        href={it.href}
                        className="block px-4 py-2 hover:bg-gray-50 transition"
                      >
                        <div className="text-sm font-medium text-navy">+ {it.label}</div>
                        <div className="text-xs text-muted">{it.hint}</div>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

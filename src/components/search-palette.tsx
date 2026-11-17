'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Hit = {
  type: 'defect' | 'client' | 'property' | 'agreement' | 'asset' | 'vendor';
  href: string;
  label: string;
  sub?: string;
};

const TYPE_LABEL: Record<Hit['type'], string> = {
  defect:    'Defects',
  client:    'Clients',
  property:  'Properties',
  agreement: 'Agreements',
  asset:     'Assets',
  vendor:    'Vendors',
};

const TYPE_ICON: Record<Hit['type'], string> = {
  defect:    '⚠',
  client:    '◆',
  property:  '▣',
  agreement: '§',
  asset:     '⚙',
  vendor:    '☎',
};

const RECENT_KEY = 'fmx.search.recent';
const RECENT_MAX = 5;

function readRecent(): Hit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

function pushRecent(hit: Hit) {
  try {
    const prev = readRecent().filter(h => h.href !== hit.href);
    const next = [hit, ...prev].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export default function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [recent, setRecent] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Global keyboard shortcut: "/" opens, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !open) {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Load recent on open; autofocus input
  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setQ('');
      setHits([]);
      setFocusIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        setHits(Array.isArray(body.hits) ? body.hits : []);
        setFocusIdx(0);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setHits([]);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open]);

  const current = q.trim().length >= 2 ? hits : recent;

  const go = useCallback((hit: Hit) => {
    pushRecent(hit);
    setOpen(false);
    router.push(hit.href);
  }, [router]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx(i => Math.min(i + 1, current.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = current[focusIdx];
      if (h) go(h);
    }
  }

  // Group hits by type for display
  const grouped = new Map<Hit['type'], Hit[]>();
  for (const h of current) {
    if (!grouped.has(h.type)) grouped.set(h.type, []);
    grouped.get(h.type)!.push(h);
  }
  const groupOrder: Hit['type'][] = ['defect', 'client', 'property', 'agreement', 'asset', 'vendor'];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search (press /)"
        className="rounded p-1.5 text-muted hover:text-navy hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/30 min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 pt-[10vh] px-3"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <svg className="w-4 h-4 text-muted shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
                <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search defects, assets, vendors, clients, properties…"
                className="flex-1 bg-transparent outline-none text-sm py-1.5"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted hover:text-navy rounded px-2 py-1"
                aria-label="Close"
              >
                esc
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {q.trim().length < 2 && recent.length > 0 && (
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted">Recent</div>
              )}
              {q.trim().length >= 2 && loading && current.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted text-center">Searching…</div>
              )}
              {q.trim().length >= 2 && !loading && current.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted text-center">No matches.</div>
              )}
              {q.trim().length < 2 && recent.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted text-center">Type at least 2 characters to search.</div>
              )}

              {(q.trim().length >= 2
                ? groupOrder.filter(t => grouped.has(t))
                : [null]  // recent uses a single flat list
              ).map(type => {
                const list = type === null ? current : grouped.get(type as Hit['type']) || [];
                let startIdx = 0;
                if (type !== null) {
                  // compute the index offset of this group in the flat current array
                  for (const t of groupOrder) {
                    if (t === type) break;
                    startIdx += (grouped.get(t) || []).length;
                  }
                }
                return (
                  <div key={type || 'recent'}>
                    {type !== null && (
                      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted">
                        {TYPE_LABEL[type as Hit['type']]}
                      </div>
                    )}
                    <ul>
                      {list.map((h, i) => {
                        const idx = startIdx + i;
                        const focused = idx === focusIdx;
                        return (
                          <li key={h.href}>
                            <button
                              type="button"
                              onClick={() => go(h)}
                              onMouseEnter={() => setFocusIdx(idx)}
                              className={`w-full text-left flex items-start gap-3 px-3 py-2 min-h-[44px] ${
                                focused ? 'bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <span className="text-navy shrink-0 w-5 text-center" aria-hidden>{TYPE_ICON[h.type]}</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-navy truncate">{h.label}</div>
                                {h.sub && <div className="text-xs text-muted truncate">{h.sub}</div>}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="border-t px-3 py-1.5 text-[10px] text-muted bg-gray-50 flex justify-between">
              <span>↑↓ navigate · ↵ open · esc close</span>
              <span className="hidden sm:inline">shortcut: /</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

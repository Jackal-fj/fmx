'use client';

import { useEffect, useState } from 'react';
import { onChange, startRunner, summary, QueueSummary } from '@/lib/offline/queue';

// FMX-046 / FMX-047 (preview): small nav-mounted chip showing queue state.
// - Hidden entirely when nothing is pending AND we're online.
// - Shows "Offline" (muted) when navigator says so.
// - Shows the count of in-flight / failed items when any exist.
// Clicking the chip takes the user to /sync (built out in FMX-047 proper).
export default function SyncIndicator() {
  const [online, setOnline] = useState(true);
  const [sum, setSum] = useState<QueueSummary>({ queued: 0, in_flight: 0, failed: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Kick off the retry runner once on first mount (singleton inside queue.ts).
    startRunner();

    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);

    let alive = true;
    const refresh = async () => {
      try {
        const s = await summary();
        if (alive) setSum(s);
      } catch (_) { /* IndexedDB blocked (private tab) — stay silent */ }
    };
    refresh();
    const off = onChange(refresh);
    const t = setInterval(refresh, 5_000);
    return () => {
      alive = false;
      off();
      clearInterval(t);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const pending = sum.queued + sum.in_flight;
  const nothingToShow = online && pending === 0 && sum.failed === 0;
  if (nothingToShow) return null;

  // Visual: offline > failed > pending. Colour + icon + word (principle #6).
  if (!online) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted px-2 py-1 rounded-full border border-gray-300">
        <span aria-hidden>●</span> Offline{pending > 0 ? ` · ${pending} queued` : ''}
      </span>
    );
  }
  if (sum.failed > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-800 bg-red-50 px-2 py-1 rounded-full border border-red-300">
        <span aria-hidden>⚠</span> {sum.failed} sync failed{pending > 0 ? ` · ${pending} queued` : ''}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded-full border border-amber-300">
      <span aria-hidden>⟳</span> Syncing {pending}
    </span>
  );
}

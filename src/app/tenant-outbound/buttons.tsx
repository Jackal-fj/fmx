'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveSend, skipMessage } from './actions';

// FMX-080: Send / Skip buttons for a queued outbound message row.
export default function OutboundButtons({ id, secretKey }: { id: string; secretKey: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function send() {
    setErr(null);
    startTransition(async () => {
      const r = await approveSend(id, secretKey);
      if (!r.ok) { setErr(r.error || 'Send failed.'); return; }
      router.refresh();
    });
  }

  function skip() {
    if (!confirm('Skip this message? It stays on file for audit but nothing goes to the tenant.')) return;
    setErr(null);
    startTransition(async () => {
      const r = await skipMessage(id, secretKey);
      if (!r.ok) { setErr(r.error || 'Skip failed.'); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex items-baseline gap-2">
      <button
        type="button"
        onClick={skip}
        disabled={isPending}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-muted hover:bg-gray-50 disabled:opacity-50 min-h-[36px]"
      >
        Skip
      </button>
      <button
        type="button"
        onClick={send}
        disabled={isPending}
        className="rounded bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-50 min-h-[36px]"
      >
        {isPending ? 'Sending…' : 'Send'}
      </button>
      {err && <span className="text-[11px] text-red-800">{err}</span>}
    </div>
  );
}

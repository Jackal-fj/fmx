'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveConflict } from './actions';

// FMX-051: three-button resolver for a single conflict row. Writes the
// chosen value back through the server action, which also bumps
// updated_at on the target row so the next client refresh sees the
// change.
export default function ResolveButtons({
  conflictId,
  secretKey,
}: {
  conflictId: string;
  secretKey: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function resolve(choice: 'acknowledged' | 'kept_incoming' | 'kept_server') {
    setErr(null);
    startTransition(async () => {
      const r = await resolveConflict(conflictId, choice, secretKey);
      if (!r.ok) { setErr(r.error || 'Resolve failed.'); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => resolve('kept_server')}
        disabled={isPending}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-navy hover:bg-gray-50 disabled:opacity-50 min-h-[36px]"
      >
        Keep server
      </button>
      <button
        type="button"
        onClick={() => resolve('kept_incoming')}
        disabled={isPending}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-navy hover:bg-gray-50 disabled:opacity-50 min-h-[36px]"
      >
        Keep client edit
      </button>
      <button
        type="button"
        onClick={() => resolve('acknowledged')}
        disabled={isPending}
        className="rounded bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-50 min-h-[36px]"
      >
        Keep merged (OK)
      </button>
      {isPending && <span className="text-[11px] text-muted">Saving…</span>}
      {err && <span className="text-[11px] text-red-800">{err}</span>}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { getClientReportDownloadUrl } from './actions';

// FMX-075: a download button for a single report row. On click it asks the
// server for a 1-hour signed URL (scoped: the token must match the report's
// client), then opens it in a new tab. Keeps the plaintext token server-side
// only after the first navigation — the button itself holds it in memory
// (same token the cookie already carries), so no new leakage path.
export default function ReportDownload({
  storagePath,
  plaintext,
  shortCode,
}: {
  storagePath: string;
  plaintext: string;
  shortCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function download() {
    setErr(null);
    startTransition(async () => {
      const r = await getClientReportDownloadUrl(storagePath, plaintext, shortCode);
      if (!r.url) { setErr(r.error || 'Download failed.'); return; }
      window.open(r.url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <div className="flex items-baseline gap-2">
      <button
        type="button"
        onClick={download}
        disabled={isPending}
        className="rounded border border-navy bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-blue-50 disabled:opacity-50 min-h-[36px]"
      >
        {isPending ? 'Preparing…' : 'Download'}
      </button>
      {err && <span className="text-[11px] text-red-800">{err}</span>}
    </div>
  );
}

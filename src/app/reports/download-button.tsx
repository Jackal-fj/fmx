'use client';

import { useState, useTransition } from 'react';
import { getReportDownloadUrl } from './actions';

export default function DownloadButton({
  storagePath,
  filename,
  secretKey,
  className = '',
  children,
}: {
  storagePath: string;
  filename: string;
  secretKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleClick() {
    setErr(null);
    startTransition(async () => {
      const { url, error } = await getReportDownloadUrl(storagePath, secretKey);
      if (!url) {
        setErr(error || 'Download failed.');
        return;
      }
      // Open in a new tab; Supabase serves the file with correct Content-Type.
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={className || 'text-xs px-3 py-1.5 rounded-md border border-navy text-navy hover:bg-navy hover:text-white disabled:opacity-50'}
      >
        {isPending ? 'Preparing…' : children}
      </button>
      {err && <div className="text-[11px] text-red-800 mt-1">{err}</div>}
    </div>
  );
}

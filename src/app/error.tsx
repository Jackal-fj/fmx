'use client';

import Link from 'next/link';

// Shown when a page throws (e.g. the database is briefly unreachable).
// Better than a misleading "not found" or a blank page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h1 className="text-2xl font-bold text-navy mb-2">Something went wrong</h1>
      <p className="text-sm text-muted mb-6">
        The page could not load. This is usually a brief connection issue. Try again, or go back to the dashboard.
      </p>
      <div className="flex justify-center gap-3">
        <button onClick={() => reset()} className="rounded-md bg-navy text-white text-base font-semibold px-4 py-2 hover:bg-blue-900">Try again</button>
        <Link href="/" className="rounded-md border border-gray-300 text-navy text-base font-semibold px-4 py-2 hover:border-navy">Dashboard</Link>
      </div>
      {error?.digest && <p className="text-[11px] text-muted mt-6">Ref {error.digest}</p>}
    </div>
  );
}

import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function DefectCreatedPage({
  searchParams,
}: {
  searchParams: { ref?: string; key?: string };
}) {
  const ref = searchParams.ref || '';
  const key = searchParams.key || '';
  const newDefectUrl = `/new-defect${key ? `?key=${encodeURIComponent(key)}` : ''}`;

  return (
    <div className="max-w-md mx-auto text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 text-green-700 mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-navy mb-2">Defect logged</h1>
      <p className="text-sm text-muted mb-1">Reference</p>
      <p className="text-3xl font-mono font-bold text-navy mb-8">{ref || '—'}</p>

      <p className="text-sm text-muted mb-8">
        The new defect is on the dashboard now and will appear in next month&apos;s report automatically.
      </p>

      <div className="flex flex-col gap-3">
        <Link href={newDefectUrl} className="rounded-lg bg-navy text-white font-semibold py-3 text-base">
          Log another
        </Link>
        <Link href="/" className="rounded-lg border border-gray-300 text-navy font-semibold py-3 text-base">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

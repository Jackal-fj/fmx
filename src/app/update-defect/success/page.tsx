import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function UpdateSuccess({
  searchParams,
}: {
  searchParams: { ref?: string; status?: string; key?: string };
}) {
  const ref = searchParams.ref || '';
  const status = (searchParams.status || '').replace('_', ' ');
  const key = searchParams.key || '';

  return (
    <div className="max-w-md mx-auto text-center pt-8">
      <div className="rounded-full bg-green-100 w-16 h-16 mx-auto flex items-center justify-center mb-4">
        <span className="text-green-700 text-3xl leading-none">✓</span>
      </div>
      <h1 className="text-2xl font-bold text-navy mb-2">Status updated</h1>
      <p className="text-sm text-muted mb-6">
        Defect <span className="font-mono">{ref}</span> is now{' '}
        <span className="font-semibold uppercase">{status}</span>.
      </p>

      <div className="rounded-lg border bg-white p-4 text-left text-sm text-muted mb-6">
        Your photos have been uploaded as evidence and the change is logged on the audit trail. This will show on the dashboard within a few seconds and roll into next month&apos;s report.
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href={`/update-defect?key=${encodeURIComponent(key)}`}
          className="block w-full rounded-md bg-navy text-white font-semibold py-3"
        >
          Update another defect
        </Link>
        <Link
          href="/"
          className="block w-full rounded-md border bg-white text-navy font-semibold py-3"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function ServiceLogSuccess({
  searchParams,
}: {
  searchParams: { asset_id?: string; key?: string };
}) {
  const assetId = searchParams.asset_id || '';
  const key = searchParams.key || '';

  return (
    <div className="max-w-md mx-auto text-center pt-8">
      <div className="rounded-full bg-green-100 w-16 h-16 mx-auto flex items-center justify-center mb-4">
        <span className="text-green-700 text-3xl leading-none">✓</span>
      </div>
      <h1 className="text-2xl font-bold text-navy mb-2">Service logged</h1>
      <p className="text-sm text-muted mb-6">
        Event recorded with your photos. Last-serviced and next-due dates updated.
      </p>
      <div className="rounded-lg border bg-white p-4 text-left text-sm text-muted mb-6">
        This event will appear on the asset detail page and in the next monthly report.
      </div>
      <div className="flex flex-col gap-2">
        {assetId && (
          <Link href={`/assets/${encodeURIComponent(assetId)}?key=${encodeURIComponent(key)}`}
                className="block w-full rounded-md border bg-white text-navy font-semibold py-3">
            View asset
          </Link>
        )}
        <Link href={`/service-log?key=${encodeURIComponent(key)}`}
              className="block w-full rounded-md bg-navy text-white font-semibold py-3">
          Log another service event
        </Link>
        <Link href="/" className="block w-full rounded-md border bg-white text-navy font-semibold py-3">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

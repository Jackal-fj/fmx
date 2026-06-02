import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NewAssetSuccess({
  searchParams,
}: {
  searchParams: { id?: string; name?: string; key?: string };
}) {
  const id = searchParams.id || '';
  const name = searchParams.name || 'Asset';
  const key = searchParams.key || '';

  return (
    <div className="max-w-md mx-auto text-center pt-8">
      <div className="rounded-full bg-green-100 w-16 h-16 mx-auto flex items-center justify-center mb-4">
        <span className="text-green-700 text-3xl leading-none">✓</span>
      </div>
      <h1 className="text-2xl font-bold text-navy mb-2">Asset added</h1>
      <p className="text-sm text-muted mb-6">
        <span className="font-semibold">{name}</span> is now in the register.
      </p>
      <div className="flex flex-col gap-2">
        {id && (
          <Link href={`/assets/${encodeURIComponent(id)}`} className="block w-full rounded-md border bg-white text-navy font-semibold py-3">
            View asset
          </Link>
        )}
        <Link href={`/new-asset?key=${encodeURIComponent(key)}`} className="block w-full rounded-md bg-navy text-white font-semibold py-3">
          Add another asset
        </Link>
        <Link href="/assets" className="block w-full rounded-md border bg-white text-navy font-semibold py-3">
          Back to assets list
        </Link>
      </div>
    </div>
  );
}

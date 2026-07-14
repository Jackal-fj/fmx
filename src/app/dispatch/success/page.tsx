import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function DispatchSuccess({
  searchParams,
}: {
  searchParams: { ref?: string; vendor?: string; key?: string };
}) {
  const ref = searchParams.ref || '';
  const vendor = searchParams.vendor || 'the vendor';
  const key = searchParams.key || '';

  return (
    <div className="max-w-md mx-auto text-center pt-8">
      <div className="rounded-full bg-green-100 w-16 h-16 mx-auto flex items-center justify-center mb-4">
        <span className="text-green-700 text-3xl leading-none">✓</span>
      </div>
      <h1 className="text-2xl font-bold text-navy mb-2">Dispatched</h1>
      <p className="text-sm text-muted mb-6">
        Defect <span className="font-mono">{ref}</span> has been sent to <span className="font-semibold">{vendor}</span> via WhatsApp.
      </p>
      <div className="rounded-lg border bg-white p-4 text-left text-sm text-muted mb-6">
        The vendor should confirm receipt shortly. Their reply will appear on the defect detail page
        as inbound WhatsApp messages.
      </div>
      <div className="flex flex-col gap-2">
        {ref && (
          <Link href={`/defects/${encodeURIComponent(ref)}`} className="block w-full rounded-md border bg-white text-navy font-semibold py-3">
            View defect thread
          </Link>
        )}
        <Link href={`/update-defect?key=${encodeURIComponent(key)}`} className="block w-full rounded-md bg-navy text-white font-semibold py-3">
          Update another defect
        </Link>
        <Link href="/" className="block w-full rounded-md border bg-white text-navy font-semibold py-3">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

import ScanRunner from './runner';

export const dynamic = 'force-dynamic';

// FMX-053: QR scanner page. The runner is a client component that owns
// the camera, decoder and resolver — this wrapper is just a thin host
// so the route stays in /scan and the bundle split is clean.
export default function ScanPage() {
  const secretKey = process.env.QUICK_ADD_SECRET || '';
  return (
    <div className="max-w-md mx-auto">
      <ScanRunner secretKey={secretKey} />
    </div>
  );
}

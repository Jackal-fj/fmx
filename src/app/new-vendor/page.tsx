import Link from 'next/link';
import { redirect } from 'next/navigation';
import NewVendorForm from './form';

export const dynamic = 'force-dynamic';

export default function NewVendorPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  return (
    <div className="max-w-md mx-auto">
      <Link href="/vendors" className="text-sm text-muted hover:text-navy">← Back to vendors</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">Add vendor</h1>
      <p className="text-sm text-muted mb-6">
        Register a new contractor. Only name and trade are required — everything else can be filled in later.
      </p>
      <NewVendorForm secretKey={key} />
    </div>
  );
}

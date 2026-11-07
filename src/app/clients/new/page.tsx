import Link from 'next/link';
import { redirect } from 'next/navigation';
import ActionForm from '@/components/action-form';
import { saveClient } from '../actions';
import { clientFields } from '../fields';

export const dynamic = 'force-dynamic';

export default function NewClientPage({ searchParams }: { searchParams: { key?: string } }) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = (searchParams.key || '').trim();
  if (!required || key !== required) redirect('/');

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/clients" className="text-sm text-muted hover:text-navy">← Clients</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-1">New client</h1>
      <p className="text-sm text-muted mb-6">
        Name and short code are enough to start. You will land on the client&apos;s manage page to add the agreement, contacts and sites.
      </p>
      <ActionForm action={saveClient} hidden={{ key }} fields={clientFields(undefined)} submitLabel="Create client" />
    </div>
  );
}

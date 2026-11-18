import { redirect, notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import AccessManager from './manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// FMX-074: admin page for managing a client's signed-link access tokens.
// Lives under the normal /clients/[code]/* tree so Carl stays in the admin
// side of the app. Gated by QUICK_ADD_SECRET like the other write surfaces.

export default async function ClientAccessPage({ params }: { params: { code: string } }) {
  noStore();
  const key = process.env.QUICK_ADD_SECRET || '';
  if (!key) redirect('/');

  const sb = supabaseServer;
  const { data: client } = await sb
    .from('clients')
    .select('id, short_code, name')
    .eq('short_code', params.code)
    .maybeSingle();
  if (!client) notFound();

  const { data: tokens } = await sb
    .from('client_access_tokens')
    .select('id, label, created_at, last_used_at, last_used_ip, revoked_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-navy">Client access — {client.name}</h1>
        <Link
          href={`/clients/${client.short_code}`}
          className="text-sm text-muted hover:text-navy underline"
        >
          Back to client
        </Link>
      </div>
      <p className="text-sm text-muted mb-6">
        Signed links that give this client a read-only view of their portfolio at <code>/client/{client.short_code}</code>. The full URL is shown <em>once</em> at mint time — hand it to the recipient directly and don't store it in email bodies you can't delete.
      </p>

      <AccessManager
        clientShortCode={client.short_code}
        secretKey={key}
        tokens={(tokens || []) as any}
      />
    </div>
  );
}

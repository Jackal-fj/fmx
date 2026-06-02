import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import Badge, { severityTone } from '@/components/badge';

export const dynamic = 'force-dynamic';

export default async function DefectsList() {
  const { data: defects } = await supabaseServer
    .from('defects')
    .select(`
      defect_number, title, severity, status, identified_at,
      property:property_id ( short_code, name )
    `)
    .order('identified_at', { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Defects</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent text-navy">
            <tr>
              <th className="text-left p-3">Ref</th>
              <th className="text-left p-3">Property</th>
              <th className="text-left p-3">Severity</th>
              <th className="text-left p-3">Title</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Identified</th>
            </tr>
          </thead>
          <tbody>
            {(defects || []).map((d: any) => (
              <tr key={d.defect_number} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/defects/${encodeURIComponent(d.defect_number)}`} className="text-navy hover:underline">
                    {d.defect_number}
                  </Link>
                </td>
                <td className="p-3">
                  {d.property ? (
                    <Link href={`/properties/${d.property.short_code}`} className="text-navy hover:underline">
                      {d.property.short_code}
                    </Link>
                  ) : '—'}
                </td>
                <td className="p-3">
                  <Badge tone={severityTone(d.severity)}>{(d.severity || '').toUpperCase()}</Badge>
                </td>
                <td className="p-3">
                  <Link href={`/defects/${encodeURIComponent(d.defect_number)}`} className="text-navy hover:underline">
                    {d.title}
                  </Link>
                </td>
                <td className="p-3 text-muted">{d.status}</td>
                <td className="p-3 text-muted text-xs">{(d.identified_at || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

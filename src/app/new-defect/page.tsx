import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import NewDefectForm from './form';

export const dynamic = 'force-dynamic';

// A DEF-YYYY-NNNN reference anywhere in the prefill text short-circuits a
// new-defect flow and sends Carl to the existing defect's detail page with
// the highlight banner. KGF's "update on DEF-2026-0138" email becomes a
// one-tap deep link into the ready-to-dispatch state.
function extractDefectRef(...candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/\bDEF-\d{4}-\d{3,5}\b/i);
    if (m) return m[0].toUpperCase();
  }
  return null;
}

// Prefill URL contract — any email, Shortcut, or template can build URLs like:
//   /new-defect?key=XXX&title=Leak&property=NH&severity=major&description=...
// Accepted params: title, description, property (short_code), severity,
// floor, area, category, ref (existing DEF-xxxx — hands off to detail page).
export default async function NewDefectPage({
  searchParams,
}: {
  searchParams: {
    key?: string;
    title?: string;
    description?: string;
    property?: string;
    severity?: string;
    floor?: string;
    area?: string;
    category?: string;
    ref?: string;
  };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = searchParams.key || '';
  if (!required || key !== required) {
    redirect('/');
  }

  // Short-circuit: if the email/URL mentions an existing defect, go there.
  const existingRef = extractDefectRef(
    searchParams.ref,
    searchParams.title,
    searchParams.description,
  );
  if (existingRef) {
    redirect(`/defects/${encodeURIComponent(existingRef)}?highlight=1`);
  }

  const { data: properties } = await supabaseServer
    .from('properties')
    .select('short_code, name')
    .eq('active', true)
    .order('short_code');

  const propertyCodes = (properties || []).map(p => p.short_code.toUpperCase());
  const prefill = {
    title: (searchParams.title || '').slice(0, 500),
    description: (searchParams.description || '').slice(0, 5000),
    property: propertyCodes.includes((searchParams.property || '').toUpperCase())
      ? (searchParams.property || '').toUpperCase() : '',
    severity: ['minor', 'moderate', 'major', 'critical'].includes((searchParams.severity || '').toLowerCase())
      ? (searchParams.severity || '').toLowerCase() : '',
    floor: (searchParams.floor || '').slice(0, 20),
    area: (searchParams.area || '').slice(0, 80),
    category: (searchParams.category || '').slice(0, 80),
  };
  const anyPrefill = Object.values(prefill).some(v => v);

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-navy mb-1">Log a defect</h1>
      <p className="text-sm text-muted mb-4">
        Quick capture — Property, Title, and Severity required; photo and rest optional.
      </p>
      {anyPrefill && (
        <div className="mb-4 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          Pre-filled from a link. Review every field before saving.
        </div>
      )}
      <NewDefectForm properties={properties || []} secretKey={key} prefill={prefill} />
    </div>
  );
}

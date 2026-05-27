import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { createDefect } from './actions';

export const dynamic = 'force-dynamic';

const SEVERITIES = ['minor', 'moderate', 'major', 'critical'];
const FLOORS     = ['External', 'G', 'L1', 'L2', 'L3', 'Roof'];
const AREAS = [
  'Lobby/Reception', 'Lift Lobby', 'Corridor', 'Stairwell',
  'Toilets - Mens', 'Toilets - Ladies', 'Toilets - Disabled',
  'Meeting Room', 'Kitchenette', 'Office', 'Open Office Area',
  'Storage', 'Comms/IT Room', 'Plant/Services Room',
  'Security/Guard Point', 'Site / Perimeter', 'Other',
];
const CATEGORIES = [
  'Doors/Locks/Access', 'Cleaning/Waste', 'Electrical/Lighting',
  'HVAC/Ventilation', 'Building Damage (walls/ceiling/floor)',
  'Plumbing/Drainage', 'Fire Services', 'Glazing/Windows',
  'Roofing/Stormwater', 'Pest/Hygiene', 'External/Site/Landscaping',
  'Signage/Wayfinding', 'Security/CCTV/Access Control',
  'Lifts/Conveyance', 'Furniture/Fittings', 'OHS/Compliance',
  'Communications/IT Infrastructure', 'Other',
];

const ERRORS: Record<string, string> = {
  missing_required: 'Property, Title and Severity are required.',
  bad_severity:     'Invalid severity value.',
  bad_property:     'Unknown property code.',
  db_failed:        'Failed to save — please try again, or message Carl.',
};

export default async function NewDefectPage({
  searchParams,
}: {
  searchParams: { key?: string; error?: string };
}) {
  const required = process.env.QUICK_ADD_SECRET;
  const key = searchParams.key || '';
  if (required && key !== required) {
    redirect('/');
  }

  const { data: properties } = await supabaseServer
    .from('properties')
    .select('short_code, name')
    .eq('active', true)
    .order('short_code');

  const error = searchParams.error ? ERRORS[searchParams.error] : null;

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-navy mb-1">Log a defect</h1>
      <p className="text-sm text-muted mb-6">
        Quick capture — Property, Title and Severity required; rest optional.
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 ring-1 ring-red-200 text-red-800 p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <form action={createDefect} className="space-y-4">
        <input type="hidden" name="key" value={key} />

        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Property <span className="text-bad">*</span>
          </label>
          <select
            name="property_code"
            required
            className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white focus:border-navy focus:outline-none"
            defaultValue=""
          >
            <option value="" disabled>Select property…</option>
            {(properties || []).map((p) => (
              <option key={p.short_code} value={p.short_code}>
                {p.short_code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Title <span className="text-bad">*</span>
          </label>
          <input
            type="text"
            name="title"
            required
            maxLength={120}
            placeholder="e.g. L2 server room GPOs tripping again"
            className="w-full rounded-lg border border-gray-300 p-3 text-base focus:border-navy focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Severity <span className="text-bad">*</span>
          </label>
          <select
            name="severity"
            required
            className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white focus:border-navy focus:outline-none"
            defaultValue="moderate"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Optional — context, who flagged it, what was tried"
            className="w-full rounded-lg border border-gray-300 p-3 text-base focus:border-navy focus:outline-none"
          />
        </div>

        <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <summary className="text-sm font-medium text-navy cursor-pointer select-none">
            More detail (location, category)
          </summary>
          <div className="space-y-3 mt-3">
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Floor</label>
              <select name="floor" className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white" defaultValue="">
                <option value="">—</option>
                {FLOORS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Area</label>
              <select name="area" className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white" defaultValue="">
                <option value="">—</option>
                {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Category</label>
              <select name="category" className="w-full rounded-lg border border-gray-300 p-3 text-base bg-white" defaultValue="">
                <option value="">—</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </details>

        <button
          type="submit"
          className="w-full rounded-lg bg-navy text-white font-semibold py-3 text-base hover:bg-blue-900 active:bg-blue-950 transition"
        >
          Save defect
        </button>
        <p className="text-xs text-muted text-center">
          The new defect appears on the dashboard and in next month's report automatically.
        </p>
      </form>
    </div>
  );
}

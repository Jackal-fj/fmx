// FMX-038: keyword-based trade classifier. Same vocabulary used by the
// FMX-021 backfill SQL migration so a defect raised by email, by the
// scanner, or by an inspection fails into the same bucket.
//
// Returns a label matching the live providers.trade vocabulary (see
// FMX-021). Returns null when nothing matches confidently — the FM tags
// it on promote (FMX-037 makes trade required on promote-from-draft) or
// via the inline trade editor on the defect detail page.

type Trade =
  | 'HVAC'
  | 'Fire'
  | 'Plumbing'
  | 'Electrical'
  | 'Genset'
  | 'Garden and Landscaping'
  | 'General building / roofing'
  | 'Waste / skip bin hire'
  | 'General Handyman';

// Order matters — more specific matches first. First hit wins.
const RULES: Array<{ trade: Trade; rx: RegExp }> = [
  { trade: 'HVAC',                       rx: /\b(a\/?c|aircon|air[- ]?condition|hvac|split[- ]?unit|chiller|r22|r32)\b/i },
  { trade: 'Fire',                       rx: /\b(fire[- ]?alarm|smoke[- ]?detector|extinguisher|fhr|hose[- ]?reel|evacuation|exit[- ]?sign|emergency[- ]?light)\b/i },
  { trade: 'Plumbing',                   rx: /\b(plumb|tap|sink|basin|toilet|cistern|drain|sewer|leak|water[- ]?tank|non[- ]?return|hot[- ]?water|geyser|pipe|waste)\b/i },
  { trade: 'Electrical',                 rx: /\b(electric|wiring|gpo|power[- ]?point|socket|circuit|breaker|rcd|switchboard|lighting|troffer|tube|fluoro|led[- ]?panel)\b/i },
  { trade: 'Genset',                     rx: /\b(generator|genset|backup[- ]?power|diesel|f\.g\.?[- ]?wilson|leega)\b/i },
  { trade: 'Garden and Landscaping',     rx: /\b(garden|grass|lawn|landscap|hedge|tree|mulch|weed)\b/i },
  { trade: 'General building / roofing', rx: /\b(roof|gutter|downpipe|facade|render|cladding|driveway|pavement|wall[- ]?crack|concrete|masonry)\b/i },
  { trade: 'Waste / skip bin hire',      rx: /\b(skip|waste|rubbish|bin[- ]?hire)\b/i },
  { trade: 'General Handyman',           rx: /\b(door|window|hinge|lock|paint|refurbish|staircase|handrail|nosing|carpentry|timber)\b/i },
];

export function classifyTrade(...texts: Array<string | null | undefined>): string | null {
  const blob = texts.filter(Boolean).join(' ');
  if (!blob.trim()) return null;
  for (const r of RULES) {
    if (r.rx.test(blob)) return r.trade;
  }
  return null;
}

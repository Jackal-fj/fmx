type Tone = 'good' | 'ok' | 'warn' | 'bad' | 'muted';

const toneClass: Record<Tone, string> = {
  good:   'bg-green-50 text-green-800 ring-green-200',
  ok:     'bg-blue-50 text-blue-800 ring-blue-200',
  warn:   'bg-orange-50 text-orange-800 ring-orange-200',
  bad:    'bg-red-50 text-red-800 ring-red-200',
  muted:  'bg-gray-50 text-gray-700 ring-gray-200',
};

export function ratingTone(label?: string | null): Tone {
  switch ((label || '').toLowerCase()) {
    case 'excellent':
    case 'good':       return 'good';
    case 'adequate':   return 'ok';
    case 'marginal':   return 'warn';
    case 'poor':
    case 'failed':     return 'bad';
    default:           return 'muted';
  }
}

export function severityTone(s?: string | null): Tone {
  switch ((s || '').toLowerCase()) {
    case 'critical': return 'bad';
    case 'major':    return 'bad';
    case 'moderate': return 'warn';
    case 'minor':    return 'muted';
    default:         return 'muted';
  }
}

export default function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

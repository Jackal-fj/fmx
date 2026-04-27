export default function StatCard({
  label, value, hint, tone = 'navy',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'navy' | 'good' | 'warn' | 'bad';
}) {
  const toneClass = {
    navy: 'text-navy',
    good: 'text-good',
    warn: 'text-warn',
    bad:  'text-bad',
  }[tone];
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}

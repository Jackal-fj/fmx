import Link from 'next/link';

export default function Nav({ quickAddKey }: { quickAddKey?: string }) {
  const links = [
    { href: '/',           label: 'Dashboard' },
    { href: '/properties', label: 'Properties' },
    { href: '/defects',    label: 'Defects' },
    { href: '/assets',     label: 'Assets' },
  ];
  const newDefectHref    = quickAddKey ? `/new-defect?key=${encodeURIComponent(quickAddKey)}`    : '/new-defect';
  const updateDefectHref = quickAddKey ? `/update-defect?key=${encodeURIComponent(quickAddKey)}` : '/update-defect';
  return (
    <nav className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="font-bold text-navy text-lg whitespace-nowrap">
          FMX <span className="text-muted text-sm font-normal ml-2 hidden sm:inline">Commercial Management Solutions</span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
          <ul className="flex gap-3 sm:gap-6 text-sm">
            {links.map(l => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted hover:text-navy">{l.label}</Link>
              </li>
            ))}
          </ul>
          {quickAddKey && (
            <div className="flex items-center gap-2">
              <Link
                href={updateDefectHref}
                className="rounded-md border border-navy text-navy text-sm font-semibold px-3 py-1.5 hover:bg-navy hover:text-white whitespace-nowrap"
              >
                Update
              </Link>
              <Link
                href={newDefectHref}
                className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-1.5 hover:bg-blue-900 whitespace-nowrap"
              >
                + Log defect
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

import Link from 'next/link';

export default function Nav() {
  const links = [
    { href: '/',           label: 'Dashboard' },
    { href: '/properties', label: 'Properties' },
    { href: '/defects',    label: 'Defects' },
    { href: '/assets',     label: 'Assets' },
  ];
  return (
    <nav className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-navy text-lg">
          FMX <span className="text-muted text-sm font-normal ml-2">Commercial Management Solutions</span>
        </Link>
        <ul className="flex gap-6 text-sm">
          {links.map(l => (
            <li key={l.href}>
              <Link href={l.href} className="text-muted hover:text-navy">{l.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

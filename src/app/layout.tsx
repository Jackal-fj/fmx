import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/nav';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'FMX — Commercial Management Solutions',
  description: 'Facility Management Platform — Commercial Management Solutions Pte Limited',
  robots: 'noindex, nofollow',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const quickAddKey = process.env.QUICK_ADD_SECRET;
  return (
    <html lang="en">
      <body className="font-sans pt-14">
        <Nav quickAddKey={quickAddKey} />
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-muted border-t mt-12">
          FMX  •  Commercial Management Solutions Pte Limited  •  Internal use
        </footer>
        <Analytics />
      </body>
    </html>
  );
}

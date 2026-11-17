import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/nav';
import ServiceWorkerRegister from '@/components/sw-register';

export const metadata: Metadata = {
  title: 'FMX — Commercial Management Solutions',
  description: 'Facility Management Platform — Commercial Management Solutions Pte Limited',
  robots: 'noindex, nofollow',
  // iOS add-to-home-screen hints (manifest handles Android).
  appleWebApp: {
    capable: true,
    title: 'FMX',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#1a365d',
  // Field use — one-handed, outdoors. Prevent zoom-out making 44pt targets tiny.
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const quickAddKey = process.env.QUICK_ADD_SECRET;
  return (
    <html lang="en">
      <body className="font-sans pt-14">
        <ServiceWorkerRegister />
        <Nav quickAddKey={quickAddKey} />
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-muted border-t mt-12">
          FMX  •  Commercial Management Solutions Pte Limited  •  Internal use
        </footer>
      </body>
    </html>
  );
}

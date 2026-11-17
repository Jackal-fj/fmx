import type { MetadataRoute } from 'next';

// FMX-050: PWA manifest. Lets the app install to home screen on
// Android/iOS and open in standalone (no browser chrome). Served at
// /manifest.webmanifest by Next 14.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FMX — Commercial Management Solutions',
    short_name: 'FMX',
    description: 'Facility Management Platform — Commercial Management Solutions Pte Limited',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#1a365d',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['business', 'productivity', 'utilities'],
    lang: 'en',
  };
}

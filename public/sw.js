// FMX-050: Service worker.
// - Precaches the app shell + icons + offline fallback page.
// - Serves static assets cache-first.
// - Routes everything else network-first with a cache fallback so the app
//   opens even on a dead 4G link. Mutations (POST/PUT/PATCH/DELETE) are
//   never cached — those belong to the FMX-046 write queue, not to the SW.
// - Bump CACHE_VERSION on every deploy that changes the shell.

const CACHE_VERSION = 'fmx-shell-v1';
const OFFLINE_URL = '/offline';

const SHELL_URLS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Pre-cache shell; individual failures don't block install.
      await Promise.all(
        SHELL_URLS.map(async (u) => {
          try { await cache.add(new Request(u, { cache: 'reload' })); } catch (_) { /* ignore */ }
        })
      );
      // Activate the new SW immediately on next idle.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Allow pages to tell the SW to activate a waiting version immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GETs; writes go through the app's write queue (FMX-046).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin + supabase storage photos we already cache.
  if (url.origin !== self.location.origin) return;

  // Never cache Next.js route-handler / server-action streaming traffic or
  // Supabase realtime — let those fail loudly offline.
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // Navigation requests → network first, fall back to cached shell / offline page.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        // Stash a copy of successful page shells so re-opens offline work.
        if (net.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, net.clone()).catch(() => {});
        }
        return net;
      } catch (_) {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(req);
        if (cached) return cached;
        const offline = await cache.match(OFFLINE_URL);
        if (offline) return offline;
        return new Response('Offline. Reconnect and try again.', {
          status: 503, headers: { 'Content-Type': 'text/plain' },
        });
      }
    })());
    return;
  }

  // Static assets under /_next/static/* and /icons → cache-first.
  if (url.pathname.startsWith('/_next/static/') || /\.(?:png|svg|jpg|jpeg|webp|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net.ok) cache.put(req, net.clone()).catch(() => {});
        return net;
      } catch (_) {
        return cached || new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Everything else → network first, cache fallback.
  event.respondWith((async () => {
    try {
      const net = await fetch(req);
      if (net.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch (_) {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      return cached || new Response('', { status: 504 });
    }
  })());
});

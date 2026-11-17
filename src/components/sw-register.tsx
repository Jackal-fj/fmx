'use client';

import { useEffect } from 'react';

// FMX-050: Register /sw.js once the app loads. Only runs in production
// so `next dev` isn't polluted by a stale cache. New SW versions are
// nudged to activate on the next idle via SKIP_WAITING + controllerchange
// → reload; mid-inspection users are not interrupted.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // If a new worker is waiting (deploy happened), tell it to take over.
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch((e) => {
        // Non-fatal — the app still works online without the SW.
        // eslint-disable-next-line no-console
        console.warn('[fmx] SW registration failed:', e);
      });
  }, []);

  return null;
}

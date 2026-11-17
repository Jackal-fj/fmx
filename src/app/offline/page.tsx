// FMX-050: served by the service worker when a navigation fails offline.
// Keep it dependency-free — no DB queries, no server actions — so it
// renders from the precache without any network dependency.

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="max-w-md mx-auto text-center py-10">
      <div className="text-6xl mb-4" aria-hidden>📡</div>
      <h1 className="text-2xl font-bold text-navy mb-2">Offline</h1>
      <p className="text-sm text-muted mb-6">
        No network right now. Open any page you've already visited to keep working from cache — anything you log while offline will sync when the connection returns.
      </p>
      <a
        href="/"
        className="inline-block rounded-md bg-navy text-white text-sm font-semibold px-4 py-2 hover:bg-blue-900"
      >
        Dashboard
      </a>
    </div>
  );
}

// Root loading skeleton — automatically shown by Next.js during route
// transitions. Wraps every page. Users see grey placeholder bars instead of
// a blank screen while the server renders the actual content.

export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Title row */}
      <div className="mb-8">
        <div className="h-8 w-2/3 bg-gray-200 rounded" />
        <div className="mt-2 h-4 w-1/3 bg-gray-100 rounded" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-lg border bg-white p-4 h-24">
            <div className="h-3 w-16 bg-gray-100 rounded mb-3" />
            <div className="h-6 w-10 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Content block */}
      <div className="rounded-lg border bg-white p-4 mb-6">
        <div className="h-4 w-1/4 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-3">
              <div className="h-4 w-24 bg-gray-100 rounded" />
              <div className="h-4 w-16 bg-gray-100 rounded" />
              <div className="h-4 flex-1 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Grid of cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-lg border bg-white p-5 h-48">
            <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-1/2 bg-gray-100 rounded mb-6" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="h-3 w-8 bg-gray-100 rounded mb-2" />
                <div className="h-6 w-16 bg-gray-200 rounded" />
              </div>
              <div>
                <div className="h-3 w-14 bg-gray-100 rounded mb-2" />
                <div className="h-6 w-10 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

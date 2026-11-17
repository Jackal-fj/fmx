'use client';

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-navy text-white text-sm font-semibold px-3 py-1.5 hover:bg-blue-900 min-h-[44px]"
    >
      Print
    </button>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mintClientAccessToken, revokeClientAccessToken } from './actions';

type TokenRow = {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
};

export default function AccessManager({
  clientShortCode,
  secretKey,
  tokens,
}: {
  clientShortCode: string;
  secretKey: string;
  tokens: TokenRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Fresh mint result — shown prominently so Carl can copy it. Cleared on
  // the next mint or on dismiss.
  const [minted, setMinted] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function mint(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCopied(false);
    if (!label.trim()) { setErr('Label is required.'); return; }
    startTransition(async () => {
      const r = await mintClientAccessToken(clientShortCode, label, secretKey);
      if (!r.ok) { setErr(r.error || 'Mint failed.'); return; }
      setMinted({ url: r.url, label });
      setLabel('');
      router.refresh();
    });
  }

  function revoke(tokenId: string) {
    if (!confirm('Revoke this link? The recipient will lose access immediately.')) return;
    startTransition(async () => {
      const r = await revokeClientAccessToken(tokenId, clientShortCode, secretKey);
      if (!r.ok) { setErr(r.error || 'Revoke failed.'); return; }
      router.refresh();
    });
  }

  async function copyUrl() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Copy failed — select the URL and copy manually.');
    }
  }

  return (
    <>
      {/* Mint form */}
      <section className="rounded-lg border bg-white p-4 mb-6">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">Mint a new link</h2>
        <form onSubmit={mint} className="flex items-baseline gap-2 flex-wrap">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder='e.g. "Irene — KGF landlord"'
            required
            maxLength={200}
            className="flex-1 min-w-[240px] rounded border border-gray-300 p-3 text-base bg-white"
          />
          <button
            type="submit"
            disabled={isPending || !label.trim()}
            className="rounded bg-navy px-4 py-3 text-base font-semibold text-white disabled:opacity-50 min-h-[44px]"
          >
            {isPending ? 'Minting…' : 'Mint'}
          </button>
        </form>
        {err && <div className="text-sm text-red-800 mt-2">{err}</div>}
      </section>

      {/* Fresh mint result — shown once, bright banner */}
      {minted && (
        <section className="rounded-lg border-2 border-navy bg-blue-50 p-4 mb-6">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h2 className="text-sm font-bold text-navy">New link for {minted.label}</h2>
            <button
              type="button"
              onClick={() => setMinted(null)}
              className="text-xs text-muted hover:text-navy underline"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-navy mb-2">
            This is the only time the full URL is shown. Copy it now — once dismissed, it can't be recovered. (You can revoke this link and mint a new one if needed.)
          </p>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={minted.url}
              readOnly
              onFocus={e => e.currentTarget.select()}
              className="flex-1 rounded border border-navy p-2 text-xs font-mono bg-white"
            />
            <button
              type="button"
              onClick={copyUrl}
              className="rounded bg-navy px-3 py-2 text-xs font-semibold text-white hover:bg-blue-900 whitespace-nowrap"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </section>
      )}

      {/* Existing tokens */}
      <section>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
          Links ({tokens.filter(t => !t.revoked_at).length} active · {tokens.filter(t => t.revoked_at).length} revoked)
        </h2>
        {tokens.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-sm text-muted">
            No access links yet. Mint one above to give this client a read-only view.
          </div>
        ) : (
          <ol className="rounded-lg border bg-white divide-y">
            {tokens.map(t => (
              <li key={t.id} className="px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-navy truncate">
                    {t.label || '—'}
                    {t.revoked_at && <span className="ml-2 text-xs font-normal text-red-800">revoked</span>}
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    Created {new Date(t.created_at).toLocaleString()}
                    {t.last_used_at && (
                      <> · Last used {new Date(t.last_used_at).toLocaleString()}{t.last_used_ip ? ` · ${t.last_used_ip}` : ''}</>
                    )}
                    {!t.last_used_at && <> · Never used</>}
                  </div>
                </div>
                {!t.revoked_at && (
                  <button
                    type="button"
                    onClick={() => revoke(t.id)}
                    disabled={isPending}
                    className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs text-red-800 hover:bg-red-50 disabled:opacity-50 min-h-[36px]"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

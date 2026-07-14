'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import { dispatchDefect } from '../actions';

type DefectInfo = {
  id: string;
  defect_number: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  identified_at: string | null;
  property_short_code: string;
  property_name: string;
  space_name: string | null;
  photos: string[];
};

type ProviderOption = {
  id: string;
  name: string;
  trade: string;
  whatsapp_number: string | null;
  contact_name: string | null;
};

function composeInitialMessage(defect: DefectInfo, provider: ProviderOption | null): string {
  const greeting = provider?.contact_name
    ? `Hi ${provider.contact_name}`
    : provider
      ? `Hi ${provider.name}`
      : 'Hi';

  const location = defect.space_name
    ? `${defect.space_name}, ${defect.property_name}`
    : defect.property_name;

  const parts: string[] = [
    `${greeting},`,
    ``,
    `CMS Fiji has a job for you.`,
    ``,
    `Reference: ${defect.defect_number}`,
    `Location: ${location} (${defect.property_short_code})`,
    `Severity: ${defect.severity.toUpperCase()}`,
    `Issue: ${defect.title}`,
  ];

  if (defect.description) {
    parts.push(``, defect.description);
  }

  parts.push(
    ``,
    `Please confirm receipt and let us know when you can attend.`,
    ``,
    defect.photos.length > 0
      ? `${defect.photos.length} photo${defect.photos.length > 1 ? 's' : ''} attached below for reference.`
      : `Photos will follow if available.`,
    ``,
    `— Carl / CMS Fiji`,
  );

  return parts.join('\n');
}

export default function DispatchForm({
  defect,
  providers,
  secretKey,
  whatsappConfigured,
}: {
  defect: DefectInfo;
  providers: ProviderOption[];
  secretKey: string;
  whatsappConfigured: boolean;
}) {
  const [providerId, setProviderId] = useState('');
  const [message, setMessage] = useState('');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedProvider = useMemo(
    () => providers.find(p => p.id === providerId) || null,
    [providerId, providers],
  );

  // Reset the message body when the vendor changes so greeting refreshes.
  useEffect(() => {
    setMessage(composeInitialMessage(defect, selectedProvider));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!providerId) {
      setErr('Choose a vendor.');
      return;
    }
    if (!message.trim()) {
      setErr('Message body is required.');
      return;
    }

    const fd = new FormData();
    fd.set('defect_id', defect.id);
    fd.set('provider_id', providerId);
    fd.set('message', message.trim());
    fd.set('include_photos', includePhotos ? 'true' : 'false');
    fd.set('key', secretKey);

    startTransition(async () => {
      try {
        const result = await dispatchDefect(fd);
        if (result && !result.ok) setErr(result.error || 'Dispatch failed.');
      } catch (e: any) {
        if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
        setErr(e?.message || 'Dispatch failed.');
      }
    });
  }

  const noVendorsWithWA = providers.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Defect confirmation card */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <span className="font-mono text-xs text-muted">{defect.defect_number}</span>
          <span className="text-xs text-muted">
            {defect.property_short_code}{defect.space_name ? ` · ${defect.space_name}` : ''}
          </span>
        </div>
        <div className="font-semibold text-navy mb-2 leading-snug">{defect.title}</div>
        {defect.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {defect.photos.slice(0, 3).map((url, i) => (
              <img key={i} src={url} alt="" className="w-full h-20 object-cover rounded border" />
            ))}
            {defect.photos.length > 3 && (
              <div className="text-[10px] text-muted">+ {defect.photos.length - 3} more</div>
            )}
          </div>
        )}
        <div className="text-xs text-muted">
          Severity <span className="uppercase font-medium text-navy">{defect.severity}</span>
        </div>
      </div>

      {/* Vendor picker */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Vendor <span className="text-red-600">*</span>
        </label>
        {noVendorsWithWA ? (
          <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
            No vendors with WhatsApp numbers on file. Add or edit a vendor first (Vendors page).
          </div>
        ) : (
          <>
            <select
              value={providerId}
              onChange={e => setProviderId(e.target.value)}
              required
              className="w-full rounded-md border bg-white p-3 text-sm"
            >
              <option value="">Choose vendor…</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.trade} ({p.whatsapp_number})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">
              Only vendors with a WhatsApp number are listed here.
            </p>
          </>
        )}
      </div>

      {/* Message body */}
      <div>
        <label className="block text-sm font-semibold text-navy mb-2">
          Message <span className="text-red-600">*</span>
          <span className="text-xs font-normal text-muted ml-2">{message.length} chars</span>
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={12}
          required
          className="w-full rounded-md border bg-white p-3 text-sm font-mono"
        />
        <p className="text-xs text-muted mt-1">
          Auto-composed from defect data. Edit freely before sending.
        </p>
      </div>

      {/* Include photos */}
      {defect.photos.length > 0 && (
        <label className="flex items-center gap-3 rounded-lg border bg-white p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={e => setIncludePhotos(e.target.checked)}
            className="w-4 h-4"
          />
          <div>
            <div className="text-sm font-semibold text-navy">
              Attach {defect.photos.length} photo{defect.photos.length > 1 ? 's' : ''}
            </div>
            <div className="text-xs text-muted">
              Sent as separate WhatsApp image messages after the text.
            </div>
          </div>
        </label>
      )}

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      <button
        type="submit"
        disabled={isPending || noVendorsWithWA}
        className="w-full rounded-md bg-navy text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Sending…' : (whatsappConfigured ? 'Send WhatsApp dispatch' : 'Preview only (not configured)')}
      </button>

      {!whatsappConfigured && (
        <p className="text-xs text-muted text-center">
          Submitting will fail until Cloud API credentials are added to Vercel env vars.
        </p>
      )}
    </form>
  );
}

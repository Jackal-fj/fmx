'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import jsQR from 'jsqr';
import { enqueue } from '@/lib/offline/queue';

// FMX-053: QR scan runner.
// - Opens the rear camera via getUserMedia.
// - Prefers the native BarcodeDetector API (Chromium/Android); falls back
//   to jsQR on the canvas frame when BarcodeDetector isn't available
//   (Safari / older browsers).
// - Resolves the payload against the FMX URL space, strips the origin so
//   scans from the printed sheet on any build still work, and navigates.
// - Caches the last 5 scans in localStorage for one-tap re-open.

type RecentHit = { href: string; label: string; at: number };

const RECENT_KEY = 'fmx.scan.recent';
const RECENT_MAX = 5;

function readRecent(): RecentHit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function pushRecent(hit: RecentHit) {
  try {
    const prev = readRecent().filter(h => h.href !== hit.href);
    const next = [hit, ...prev].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

// Known FMX paths — anything matching one of these resolves and navigates.
// Unknown paths fall through to the "not in catalogue" message so a stray
// business-card QR can't send the FM somewhere random.
const FMX_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/clients(\/[^/?#]+)?(\/agreements\/[^/?#]+)?\/?$/,
  /^\/properties\/[^/?#]+\/?$/,
  /^\/defects\/[^/?#]+(\/promote)?\/?$/,
  /^\/assets\/[^/?#]+\/?$/,
  /^\/vendors\/[^/?#]+\/?$/,
  /^\/dispatch\/[^/?#]+\/?$/,
  /^\/update-defect\/[^/?#]+\/?$/,
];

// Given any QR payload, return the FMX-internal path to navigate to
// (or null if we can't resolve it).
function resolveToPath(payload: string): string | null {
  const text = (payload || '').trim();
  if (!text) return null;

  // If it looks like a URL, strip origin.
  try {
    const u = new URL(text);
    const path = u.pathname + (u.search || '') + (u.hash || '');
    return FMX_ROUTES.some(r => r.test(u.pathname)) ? path : null;
  } catch {
    // Not a URL — accept a bare path like "/defects/DEF-2026-0211".
    if (text.startsWith('/')) {
      const p = text.split('?')[0].split('#')[0];
      return FMX_ROUTES.some(r => r.test(p)) ? text : null;
    }
    return null;
  }
}

// Map a resolved path back to a (kind, id) tuple for scan_events.
function targetFromPath(path: string): { kind: 'property' | 'asset' | 'client' | 'agreement' | 'defect' | 'vendor' | 'other'; id: string } | null {
  const p = path.split('?')[0].split('#')[0];
  const seg = p.split('/').filter(Boolean);
  if (seg[0] === 'clients' && seg[2] === 'agreements' && seg[3]) return { kind: 'agreement', id: seg[3] };
  if (seg[0] === 'clients' && seg[1])    return { kind: 'client',    id: seg[1] };
  if (seg[0] === 'properties' && seg[1]) return { kind: 'property',  id: seg[1] };
  if (seg[0] === 'defects' && seg[1])    return { kind: 'defect',    id: seg[1] };
  if (seg[0] === 'assets' && seg[1])     return { kind: 'asset',     id: seg[1] };
  if (seg[0] === 'vendors' && seg[1])    return { kind: 'vendor',    id: seg[1] };
  return null;
}

// Short human label from a path — "/properties/NH" → "NH · property".
function labelForPath(path: string): string {
  const p = path.split('?')[0].split('#')[0];
  if (p === '/' || p === '') return 'Dashboard';
  const seg = p.split('/').filter(Boolean);
  if (seg[0] === 'clients' && seg[2] === 'agreements' && seg[3]) return `${seg[3]} · agreement`;
  if (seg[0] === 'clients' && seg[1]) return `${seg[1]} · client`;
  if (seg[0] === 'properties' && seg[1]) return `${seg[1]} · property`;
  if (seg[0] === 'defects' && seg[1]) return `${seg[1]} · defect`;
  if (seg[0] === 'assets' && seg[1]) return `${seg[1]} · asset`;
  if (seg[0] === 'vendors' && seg[1]) return `${seg[1]} · vendor`;
  if (seg[0] === 'dispatch' && seg[1]) return `${seg[1]} · dispatch`;
  if (seg[0] === 'update-defect' && seg[1]) return `${seg[1]} · update`;
  return p;
}

export default function ScanRunner({ secretKey = '' }: { secretKey?: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(true);

  const [status, setStatus] = useState<'starting' | 'ready' | 'denied' | 'unsupported' | 'error'>('starting');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentHit[]>([]);

  useEffect(() => {
    setRecent(readRecent());
    activeRef.current = true;
    startCamera();
    return () => {
      activeRef.current = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      setStatus('ready');
      loop();
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        setStatus('denied');
      } else {
        setErrMsg(e?.message || String(e));
        setStatus('error');
      }
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }

  // Scan loop — uses BarcodeDetector when available, falls back to jsQR.
  async function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!activeRef.current) return;

    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    let decoded: string | null = null;

    // Try native BarcodeDetector first.
    const BD: any = (window as any).BarcodeDetector;
    if (BD) {
      try {
        const detector = new BD({ formats: ['qr_code'] });
        const codes = await detector.detect(video);
        if (codes && codes[0]?.rawValue) decoded = codes[0].rawValue as string;
      } catch (_) { /* fall through to jsQR */ }
    }

    // Fallback: canvas pixel data → jsQR.
    if (!decoded) {
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (result?.data) decoded = result.data;
      }
    }

    if (decoded) {
      const path = resolveToPath(decoded);
      if (path) {
        const hit: RecentHit = { href: path, label: labelForPath(path), at: Date.now() };
        pushRecent(hit);
        // FMX-066 / FMX-068: log every scan into scan_events via the queue.
        if (secretKey) {
          const target = targetFromPath(path);
          if (target) {
            void enqueue('scan.record', {
              key: secretKey,
              scan: {
                id: crypto.randomUUID(),
                target_kind: target.kind,
                target_id: target.id,
                target_path: path,
                context: 'scan_jump',
                scanned_at: new Date().toISOString(),
              },
            });
          }
        }
        stopCamera();
        router.push(path);
        return;
      } else {
        setHint(`Unrecognised label — this QR isn't in your catalogue. Read: ${decoded.slice(0, 80)}`);
        // Keep scanning; let the FM try another label or tap Back.
      }
    }

    if (activeRef.current) rafRef.current = requestAnimationFrame(loop);
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-navy">Scan</h1>
        <Link href="/labels" className="text-xs text-muted hover:text-navy">Print labels →</Link>
      </div>

      {status === 'starting' && (
        <p className="text-sm text-muted mb-4">Opening camera…</p>
      )}
      {status === 'denied' && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 mb-4">
          Camera permission denied. Enable it in your browser's site settings and reload this page.
        </div>
      )}
      {status === 'unsupported' && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 mb-4">
          This browser can't access the camera. Open the app in Chrome, Safari or Edge, or use your phone's native QR app — it will open the record directly.
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 mb-4">
          Camera failed to start{errMsg ? `: ${errMsg}` : ''}.
        </div>
      )}

      {/* Video viewport */}
      <div className="relative rounded-lg overflow-hidden bg-black aspect-square mb-4 border">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* QR crosshair overlay */}
        <div className="absolute inset-8 border-2 border-white/70 rounded-md pointer-events-none" aria-hidden />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {hint && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 mb-4">
          {hint}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Recent</div>
          <ul className="divide-y rounded-lg border bg-white overflow-hidden">
            {recent.map(r => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="block px-4 py-3 text-sm text-navy hover:bg-blue-50/40 min-h-[44px]"
                >
                  {r.label}
                  <span className="block text-[11px] text-muted mt-0.5 font-mono truncate">{r.href}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

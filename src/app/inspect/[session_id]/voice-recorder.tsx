'use client';

import { useEffect, useRef, useState } from 'react';

// FMX-067: simple MediaRecorder wrapper for a single-take voice note.
// Shows a Record / Stop toggle with a rolling timer, then a preview with
// Clear / Re-record. Owns the stream; the parent just reads back the
// final Blob via `onChange`.
export default function VoiceRecorder({
  value,
  onChange,
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    // Cleanup on unmount: stop any active recording + revoke blob URL.
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const previewUrl = (() => {
    if (!value) return null;
    if (!previewUrlRef.current) previewUrlRef.current = URL.createObjectURL(value);
    return previewUrlRef.current;
  })();

  async function start() {
    setErr(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErr('This browser can\'t record audio.');
      return;
    }
    try {
      // Revoke any prior preview URL so the new recording is clean.
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      onChange(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Prefer opus-in-webm; fall back to browser default if unsupported (Safari).
      let mimeType: string | undefined = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = undefined;
      }
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecording(false);
        onChange(blob);
      };
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        setErr('Microphone permission denied.');
      } else {
        setErr(e?.message || 'Could not start recording.');
      }
    }
  }

  function stop() {
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
  }

  function clearIt() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    onChange(null);
  }

  const mm = Math.floor(elapsed / 60).toString().padStart(1, '0');
  const ss = (elapsed % 60).toString().padStart(2, '0');

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">Voice note</span>
        {value && !recording && (
          <button type="button" onClick={clearIt} className="text-xs text-muted hover:text-red-700">Clear</button>
        )}
      </div>

      {!recording && !value && (
        <button
          type="button"
          onClick={start}
          className="w-full rounded-md border border-navy text-navy text-sm font-semibold py-2 hover:bg-navy hover:text-white min-h-[44px] flex items-center justify-center gap-2"
        >
          <span aria-hidden>🎤</span> Record
        </button>
      )}

      {recording && (
        <button
          type="button"
          onClick={stop}
          className="w-full rounded-md bg-red-700 text-white text-sm font-semibold py-2 hover:bg-red-800 min-h-[44px] flex items-center justify-center gap-2"
        >
          <span aria-hidden>■</span> Stop · {mm}:{ss}
        </button>
      )}

      {value && !recording && (
        <div className="space-y-2">
          {previewUrl && <audio src={previewUrl} controls className="w-full" />}
          <button
            type="button"
            onClick={start}
            className="w-full rounded-md border border-gray-300 text-muted text-xs font-semibold py-2 min-h-[44px]"
          >
            Re-record
          </button>
        </div>
      )}

      {err && <div className="mt-2 text-xs text-red-800">{err}</div>}
    </div>
  );
}

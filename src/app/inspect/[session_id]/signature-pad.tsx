'use client';

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

// FMX-057: signature-on-glass. Pointer-events only (works with touch, pen,
// and mouse). Caller owns the "has signed anything" state via onChange —
// this component just paints strokes and exposes `clear()` and `toDataURL()`.

export type SignaturePadHandle = {
  clear(): void;
  toDataURL(): string;
  isEmpty(): boolean;
};

const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (empty: boolean) => void }>(
  function SignaturePad({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const emptyRef = useRef(true);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Match internal pixel size to displayed size × DPR for crisp strokes.
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a365d';
      ctx.lineWidth = 2;
    }, []);

    function pt(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
    }

    function onDown(e: React.PointerEvent) {
      e.preventDefault();
      drawingRef.current = true;
      lastRef.current = pt(e);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
    function onMove(e: React.PointerEvent) {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const p = pt(e);
      const last = lastRef.current || p;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastRef.current = p;
      if (emptyRef.current) {
        emptyRef.current = false;
        onChange?.(false);
      }
    }
    function onUp() {
      drawingRef.current = false;
      lastRef.current = null;
    }

    useImperativeHandle(ref, () => ({
      clear() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1a365d';
        ctx.lineWidth = 2;
        emptyRef.current = true;
        onChange?.(true);
      },
      toDataURL() {
        const canvas = canvasRef.current;
        if (!canvas) return '';
        return canvas.toDataURL('image/png');
      },
      isEmpty() {
        return emptyRef.current;
      },
    }), [onChange]);

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
        className="w-full h-40 rounded-md border-2 border-dashed border-gray-300 bg-white touch-none"
        aria-label="Signature pad"
      />
    );
  }
);

export default SignaturePad;

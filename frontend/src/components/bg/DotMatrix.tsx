"use client";

// Dot-matrix canvas background — a dome of tiny dots that softly shimmer.
// Sits behind hero sections and auth screens; honours prefers-reduced-motion.

import { useEffect, useRef } from "react";

interface DotMatrixProps {
  className?: string;
  density?: number; // px between dots
  opacity?: number;
}

export default function DotMatrix({
  className = "",
  density = 14,
  opacity = 0.5,
}: DotMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth * window.devicePixelRatio;
      canvas.height = parent.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 1.05; // dome rises from below the frame
      const maxR = Math.max(w, h) * 0.75;

      for (let y = 0; y < h; y += density) {
        for (let x = 0; x < w; x += density) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxR) continue;
          const falloff = 1 - dist / maxR;
          const shimmer = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t / 40 + dist / 46);
          const a = falloff * (0.16 + 0.5 * shimmer) * opacity;
          if (a < 0.02) continue;
          ctx.fillStyle = `rgba(169,229,197,${a.toFixed(3)})`;
          const size = falloff > 0.85 ? 1.8 : 1.2;
          ctx.fillRect(x, y, size, size);
        }
      }
      t += 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}

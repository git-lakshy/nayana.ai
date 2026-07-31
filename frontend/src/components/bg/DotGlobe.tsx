"use client";

// Dot-matrix globe — a half dome of tiny dots where continent-like clusters
// glow brighter, with a mint horizon bloom and a slow shimmer/rotation.
// Canvas-based; honours prefers-reduced-motion.

import { useEffect, useRef } from "react";

interface DotGlobeProps {
  className?: string;
  /** px between dot sample points */
  density?: number;
}

// Deterministic hash → stable pseudo-random field (no hydration mismatch).
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Blob centres on the projected unit circle acting as "continents".
const BLOBS: { x: number; y: number; r: number }[] = [
  { x: -0.48, y: -0.34, r: 0.3 },
  { x: -0.12, y: -0.02, r: 0.2 },
  { x: 0.28, y: -0.5, r: 0.22 },
  { x: 0.5, y: -0.12, r: 0.26 },
  { x: 0.02, y: -0.62, r: 0.14 },
  { x: -0.66, y: -0.06, r: 0.15 },
  { x: 0.14, y: -0.28, r: 0.12 },
];

export default function DotGlobe({ className = "", density = 8 }: DotGlobeProps) {
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
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const horizon = h; // dome rises from the bottom edge
      const R = Math.min(w * 0.62, h * 1.5);

      // Horizon glow bloom.
      const glow = ctx.createRadialGradient(cx, horizon, R * 0.05, cx, horizon, R * 1.1);
      glow.addColorStop(0, "rgba(169,229,197,0.28)");
      glow.addColorStop(0.5, "rgba(169,229,197,0.09)");
      glow.addColorStop(1, "rgba(169,229,197,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const rot = reduced ? 0 : t / 260; // very slow landmass drift
      for (let gy = -R; gy <= 0; gy += density) {
        const ny = gy / R;
        const half = Math.sqrt(Math.max(0, 1 - ny * ny)); // latitude half-width
        if (half < 0.02) continue;
        for (let gx = -R; gx <= R; gx += density) {
          const nx = gx / (R * half);
          if (Math.abs(nx) > 1) continue;
          const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); // sphere depth for shading
          const px = cx + gx;
          const py = horizon + gy;

          // Continent test (with slow drift).
          let land = 0;
          for (const b of BLOBS) {
            const bx = b.x + 0.12 * Math.sin(rot + b.y * 3.1);
            const dx = nx - bx;
            const dy = ny - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < b.r * b.r) land = Math.max(land, 1 - d2 / (b.r * b.r));
          }

          const speck = hash(Math.round(px / density), Math.round(py / density));
          const isLand = land > 0.3 && speck > 0.42 - land * 0.3;
          const isSea = speck > 0.86; // sparse ocean dots
          if (!isLand && !isSea) continue;

          const shade = 0.35 + 0.65 * z;
          const shimmer = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t / 34 + (px + py) / 55);
          let a = isLand ? (0.4 + 0.5 * land) * shade : 0.13 * shade;
          a *= 0.72 + 0.28 * shimmer;
          ctx.fillStyle = `rgba(169,229,197,${Math.min(0.95, a).toFixed(3)})`;
          const s = isLand ? 2 : 1.3;
          ctx.fillRect(px, py, s, s);
        }
      }

      // Rim light along the dome edge.
      ctx.strokeStyle = "rgba(169,229,197,0.30)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, horizon, R, Math.PI, 0);
      ctx.stroke();

      t += 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}

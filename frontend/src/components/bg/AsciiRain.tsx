"use client";

// AsciiRain — a Matrix-style dropping kana/glyph rain rendered on canvas.
// Deterministic-ish (no SSR flash), lightweight, decorative.
// Used as a backdrop for dark section headers (Scan Report, Fixes, Domains).

import { useEffect, useRef } from "react";

interface AsciiRainProps {
  className?: string;
  opacity?: number;
  // pixels between columns
  columnGap?: number;
  // px font size
  fontSize?: number;
  // approximate drops falling per column (0..1)
  density?: number;
  color?: string; // rgb triplet like "169,229,197"
}

const GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロ01";

export default function AsciiRain({
  className = "",
  opacity = 0.35,
  columnGap = 14,
  fontSize = 12,
  density = 0.9,
  color = "169,229,197",
}: AsciiRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let cols: number[] = [];
    let colSpeed: number[] = [];
    let colLen: number[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      const nCols = Math.max(1, Math.floor(canvas.offsetWidth / columnGap));
      cols = new Array(nCols)
        .fill(0)
        .map(() => -Math.random() * canvas.offsetHeight);
      colSpeed = new Array(nCols).fill(0).map(() => 0.6 + Math.random() * 1.4);
      colLen = new Array(nCols)
        .fill(0)
        .map(() => 6 + Math.floor(Math.random() * 14));
    };
    resize();
    window.addEventListener("resize", resize);

    ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "top";

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      // trailing fade instead of full clear → gives the drip effect
      ctx.fillStyle = "rgba(10,20,17,0.18)";
      ctx.fillRect(0, 0, w, h);

      for (let c = 0; c < cols.length; c++) {
        if (Math.random() > density) continue;
        const x = c * columnGap;
        const yHead = cols[c];
        const len = colLen[c];
        for (let k = 0; k < len; k++) {
          const y = yHead - k * fontSize;
          if (y < -fontSize || y > h) continue;
          const g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          const a = k === 0 ? 1 : 1 - k / len;
          ctx.fillStyle =
            k === 0
              ? `rgba(${color},${(a * 0.95).toFixed(2)})`
              : `rgba(${color},${(a * 0.55).toFixed(2)})`;
          ctx.fillText(g, x, y);
        }
        cols[c] += fontSize * colSpeed[c] * 0.5;
        if (cols[c] - len * fontSize > h) {
          cols[c] = -Math.random() * h * 0.4;
          colSpeed[c] = 0.6 + Math.random() * 1.4;
          colLen[c] = 6 + Math.floor(Math.random() * 14);
        }
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [color, columnGap, density, fontSize]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={{ opacity }}
    />
  );
}

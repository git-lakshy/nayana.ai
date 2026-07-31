"use client";

// OrbitGlobe — hero centerpiece: a WebGL dot-matrix globe (COBE) with two
// tilted elliptical orbit rings. Provider icon chips travel along the orbits
// and dim/shrink when they pass behind the globe.
//
// COBE renders the classic GitHub/Stripe-style dotted 3D globe on a canvas —
// tiny (~4 kB), no three.js needed.

import { useEffect, useRef } from "react";
import createGlobe from "cobe";
import ProviderIcon from "@/components/ui/ProviderIcon";

type OrbitChip = {
  provider: string;
  orbit: 0 | 1;
  /** starting angle in radians */
  theta0: number;
  size: number;
};

// Two orbits; angles spread so chips never bunch up.
const CHIPS: OrbitChip[] = [
  { provider: "chatgpt", orbit: 0, theta0: 3.6, size: 52 },
  { provider: "claude", orbit: 0, theta0: 0.5, size: 52 },
  { provider: "perplexity", orbit: 1, theta0: 2.4, size: 46 },
  { provider: "gemini", orbit: 1, theta0: 4.6, size: 46 },
  { provider: "grok", orbit: 1, theta0: 0.2, size: 44 },
];

// Orbit geometry, relative to container half-size (1 = container edge).
// rx: horizontal radius, ry: vertical radius (flattened => perspective),
// tilt: ring rotation in degrees, speed: radians/second.
const ORBITS = [
  { rx: 0.86, ry: 0.30, tilt: -10, speed: 0.10 },
  { rx: 0.72, ry: 0.24, tilt: 14, speed: -0.13 },
];

export default function OrbitGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);

  // --- COBE globe ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let phi = 0;
    let width = 0;
    const onResize = () => {
      width = canvas.offsetWidth;
    };
    window.addEventListener("resize", onResize);
    onResize();

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.22,
      dark: 1,
      diffuse: 1.35,
      mapSamples: 22000,
      mapBrightness: 8,
      baseColor: [0.16, 0.32, 0.25], // deep pine-green land dots
      markerColor: [0.79, 0.96, 0.87], // mint-bright pings
      glowColor: [0.22, 0.45, 0.35], // soft mint atmosphere
      opacity: 0.95,
      markers: [
        { location: [37.77, -122.41], size: 0.06 }, // SF
        { location: [51.5, -0.12], size: 0.05 }, // London
        { location: [28.61, 77.2], size: 0.06 }, // Delhi
        { location: [35.68, 139.69], size: 0.05 }, // Tokyo
        { location: [-23.55, -46.63], size: 0.04 }, // São Paulo
      ],
    });

    // cobe v2 has no onRender — drive rotation via update() in a rAF loop.
    let raf = 0;
    const spin = () => {
      phi += 0.0032;
      globe.update({ phi, width: width * 2, height: width * 2 });
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    // Fade the canvas in once the first frame is painted.
    setTimeout(() => {
      if (canvas) canvas.style.opacity = "1";
    }, 120);

    return () => {
      cancelAnimationFrame(raf);
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // --- Orbiting chips (single rAF loop, writes transforms directly) ---
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const wrap = wrapRef.current;
      if (wrap) {
        const w = wrap.offsetWidth;
        const h = wrap.offsetHeight;
        const cx = w / 2;
        const cy = h / 2;
        const half = Math.min(w, h) / 2;
        CHIPS.forEach((chip, i) => {
          const el = chipRefs.current[i];
          if (!el) return;
          const o = ORBITS[chip.orbit];
          const th = chip.theta0 + o.speed * t;
          // point on axis-aligned ellipse
          const ex = Math.cos(th) * o.rx * half * 1.55; // stretch x — wide orbits
          const ey = Math.sin(th) * o.ry * half;
          // rotate ellipse by tilt
          const rad = (o.tilt * Math.PI) / 180;
          const x = cx + ex * Math.cos(rad) - ey * Math.sin(rad);
          const y = cy + ex * Math.sin(rad) + ey * Math.cos(rad);
          // front when on the lower half of its ellipse
          const front = Math.sin(th) > 0;
          const scale = front ? 1 : 0.72;
          el.style.transform = `translate(${x - chip.size / 2}px, ${
            y - chip.size / 2
          }px) scale(${scale})`;
          el.style.opacity = front ? "1" : "0.38";
          el.style.zIndex = front ? "30" : "5";
          el.style.filter = front ? "none" : "saturate(0.6)";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none relative mx-auto aspect-square w-full max-w-[560px]"
      aria-hidden
    >
      {/* Orbit rings (SVG ellipses matching the chip paths) */}
      <svg
        className="absolute left-1/2 top-1/2 h-full w-[160%] -translate-x-1/2 -translate-y-1/2 overflow-visible"
        viewBox="-280 -280 560 560"
        style={{ zIndex: 10 }}
      >
        {ORBITS.map((o, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="0"
            rx={o.rx * 280 * 1.55}
            ry={o.ry * 280}
            transform={`rotate(${o.tilt})`}
            fill="none"
            stroke="rgba(169,229,197,0.20)"
            strokeWidth="1"
            strokeDasharray="2 5"
          />
        ))}
      </svg>

      {/* Soft atmosphere glow behind the globe */}
      <div
        className="absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          zIndex: 8,
          background:
            "radial-gradient(circle, rgba(169,229,197,0.16) 0%, rgba(169,229,197,0.05) 55%, transparent 72%)",
        }}
      />

      {/* COBE canvas — the globe itself */}
      <canvas
        ref={canvasRef}
        className="absolute left-1/2 top-1/2 h-[76%] w-[76%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700"
        style={{ zIndex: 20, opacity: 0, contain: "layout paint size" }}
      />

      {/* Provider chips — positioned by the rAF loop */}
      {CHIPS.map((chip, i) => (
        <div
          key={chip.provider}
          ref={(el) => {
            chipRefs.current[i] = el;
          }}
          className="absolute left-0 top-0 transition-[filter] duration-300 will-change-transform"
          style={{ width: chip.size, height: chip.size }}
        >
          <ProviderIcon provider={chip.provider} size={chip.size} glow />
        </div>
      ))}
    </div>
  );
}

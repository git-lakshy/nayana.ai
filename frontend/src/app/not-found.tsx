"use client";

// 404 — outlined "404" numerals with a particle-dissolve drift behind them,
// per the wireframe: "This page is invisible — even to us."

import Link from "next/link";
import { useEffect, useRef } from "react";
import Logo from "@/components/ui/Logo";

export default function NotFound() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    interface P {
      x: number;
      y: number;
      vy: number;
      vx: number;
      life: number;
      maxLife: number;
      size: number;
    }

    const spawn = (initial = false): P => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h * (0.55 + Math.random() * 0.45),
        vy: -(0.15 + Math.random() * 0.45),
        vx: (Math.random() - 0.5) * 0.2,
        life: 0,
        maxLife: 300 + Math.random() * 300,
        size: 1 + Math.random() * 1.6,
      };
    };

    const particles: P[] = Array.from({ length: 240 }, () => spawn(true));

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        const fade = 1 - p.life / p.maxLife;
        if (fade <= 0 || p.y < -10) {
          particles[i] = spawn();
          continue;
        }
        ctx.fillStyle = `rgba(169,229,197,${(fade * 0.75).toFixed(3)})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-pine px-6">
      <div className="absolute top-6 right-6">
        <Link href="/dashboard" aria-label="Home">
          <Logo withWordmark={false} size={30} />
        </Link>
      </div>

      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />

      <h1
        className="font-display select-none text-[22vw] leading-none font-bold tracking-tight text-transparent sm:text-[13rem]"
        style={{ WebkitTextStroke: "2px rgba(169,229,197,0.55)" }}
      >
        404
      </h1>

      <p className="mt-4 text-lg text-ink-dim">
        This page is invisible — even to us.
      </p>

      <Link
        href="/dashboard"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-pine transition-transform hover:scale-[1.04]"
      >
        Back to Home <span aria-hidden>↗</span>
      </Link>
    </main>
  );
}

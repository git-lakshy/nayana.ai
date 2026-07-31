"use client";

// Landing page — dark pine hero with a dot-matrix globe dome, orbiting provider
// icon chips, curved transition to off-white, stat band, how-it-works terminal
// demo, features grid, dark CTA band. Hero "Run Free Scan" posts /api/crawl as
// a guest and redirects to the scan report page.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Logo from "@/components/ui/Logo";
import DotGlobe from "@/components/bg/DotGlobe";
import ProviderIcon from "@/components/ui/ProviderIcon";
import TerminalPanel from "@/components/ui/TerminalPanel";
import { api, ApiError } from "@/lib/api";
import type { CrawlResponse } from "@/lib/types";

const NAV = [
  { label: "Home", href: "/", active: true },
  { label: "Product", href: "#features" },
  { label: "Scan", href: "#hero" },
  { label: "Pricing", href: "#pricing" },
  { label: "Resources", href: "#how" },
  { label: "Company", href: "#footer" },
];

// Provider chips orbit the globe on gently rotating elliptical arcs.
const ORBIT: {
  provider: string;
  angleDeg: number; // 0 = right, 90 = bottom, -90 = top
  rxPct: number; // ellipse rx as % of viewport width
  ryPct: number; // ellipse ry as % of viewport width
}[] = [
  { provider: "chatgpt", angleDeg: -155, rxPct: 46, ryPct: 22 },
  { provider: "claude", angleDeg: -18, rxPct: 46, ryPct: 22 },
  { provider: "perplexity", angleDeg: 170, rxPct: 32, ryPct: 34 },
  { provider: "grok", angleDeg: 30, rxPct: 40, ryPct: 30 },
  { provider: "gemini", angleDeg: -95, rxPct: 22, ryPct: 46 },
];

const DEMO_LINES = [
  "$ nayana scan https://acme.com",
  "▸ crawling… 18 pages found          [########..]",
  "▸ chunking… 142 content chunks",
  "▸ asking 5 AI providers 12 questions…",
  "  chatgpt      ✓ answered 12/12",
  "  perplexity   ✓ answered 12/12  (cites acme.com 8×)",
  "▸ scoring…",
  "  AI Visibility Score: 78/100  ▁▃▅▇",
  "  3 content gaps found → fixes ready",
];

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: "◉", title: "See what AI sees", body: "Crawl your site the way answer engines do — page types, chunks, schema and all." },
  { icon: "⚋", title: "Test 5 providers", body: "Ask ChatGPT, Perplexity, Claude, Gemini and Grok real questions about your product." },
  { icon: "┆", title: "Visibility score", body: "One score across coverage, accuracy, attribution and confidence — tracked over time." },
  { icon: "✦", title: "Fix the gaps", body: "AI-generated FAQs, rewrites and schema patches with before/after diffs you can apply." },
  { icon: "◷", title: "Beat competitors", body: "Share of Voice shows who the AI mentions — you or them — question by question." },
  { icon: "∿", title: "Track the trend", body: "Score history per domain proves your fixes actually move the needle." },
];

export default function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = url.trim();
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      const normalized = /^https?:\/\//i.test(target) ? target : "https://" + target;
      const d = await api.post<CrawlResponse>("/api/crawl", {
        root_url: normalized,
        max_pages: 10,
        max_depth: 2,
      });
      router.push("/scan/?id=" + d.scan.id);
    } catch (e2) {
      setErr(
        e2 instanceof ApiError
          ? e2.message
          : "Could not start the scan — is the backend running?"
      );
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-pine text-ink">
      {/* Nav */}
      <header className="sticky top-4 z-50 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="nayana.ai home">
          <Logo />
        </Link>
        <nav className="glass hidden items-center gap-1 rounded-full px-2 py-1.5 sm:flex">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={
                "rounded-full px-4 py-1.5 text-sm transition-colors " +
                (item.active
                  ? "bg-mint font-semibold text-pine"
                  : "text-ink-dim hover:text-ink")
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
        <a
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("hero-input")?.focus();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-pine transition-transform hover:scale-[1.03]"
        >
          Start Free Scan
        </a>
      </header>

      {/* Hero */}
      <section id="hero" className="relative overflow-hidden pt-24 pb-40">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass rounded-full px-4 py-1.5 font-mono text-xs text-mint"
          >
            ▪ AI Search Console
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl"
          >
            Your Site,
            <br />
            As AI Sees It.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-6 max-w-xl text-lg text-ink-dim"
          >
            Scan your website and test how ChatGPT, Perplexity, Claude, Gemini
            and Grok answer real questions from your content.
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            onSubmit={runScan}
            className="glass-strong mt-10 flex w-full max-w-xl items-center gap-2 rounded-full p-2"
          >
            <span className="pl-3 font-mono text-sm text-ink-dim">https://</span>
            <input
              id="hero-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yoursite.com"
              aria-label="Website URL"
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-dim/60"
            />
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Scanning…" : "Run Free Scan"}
            </button>
          </motion.form>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-line-strong px-5 py-2 text-sm text-ink-dim transition-colors hover:border-mint hover:text-ink"
              onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
            >
              See Demo
            </button>
            <p className="font-mono text-xs text-ink-dim">
              5 free scans · no signup needed
            </p>
          </div>
          {err && <p className="mt-3 text-sm text-signal">{err}</p>}
        </div>

        {/* Globe dome + orbiting providers */}
        <div
          className="pointer-events-none relative mx-auto mt-16 h-[26rem] w-full max-w-6xl px-4"
          aria-hidden
        >
          <div className="relative h-full w-full">
            <DotGlobe />
            {ORBIT.map((chip, i) => {
              const a = (chip.angleDeg * Math.PI) / 180;
              const x = 50 + chip.rxPct * Math.cos(a);
              const y = 100 + chip.ryPct * Math.sin(a); // 100% = dome baseline
              return (
                <motion.div
                  key={chip.provider}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.5 + i * 0.08 }}
                  className="absolute"
                  style={{
                    left: x + "%",
                    top: y + "%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <ProviderIcon provider={chip.provider} size={54} glow />
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Curved transition to off-white */}
      <div className="relative -mt-2">
        <svg viewBox="0 0 1440 88" className="block w-full" preserveAspectRatio="none" aria-hidden>
          <path d="M0,88 C420,0 1020,0 1440,88 L1440,88 L0,88 Z" fill="var(--ink)" />
        </svg>
      </div>

      {/* Stat band on paper */}
      <section className="bg-ink px-4 pt-6 pb-16 text-pine">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Built for the AI age. Measured for real.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl bg-pine p-6 text-left text-ink">
              <p className="text-sm text-ink-dim">AI Visibility Score</p>
              <p className="mt-1 font-display text-5xl font-semibold">
                78<span className="text-2xl text-ink-dim">/100</span>
              </p>
              <div className="mt-4 flex items-end gap-[3px]">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-1.5 rounded-sm ${
                      i < 18 ? "bg-mint" : "bg-ink/12"
                    }`}
                    style={{ height: 8 + (i % 4) * 5 + "px" }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-pine/10 bg-white/60 p-6 text-left">
              <p className="text-sm text-pine/70">Content Gaps Found</p>
              <p className="mt-1 font-display text-5xl font-semibold">12</p>
              <p className="mt-3 text-xs text-pine/50">
                Questions where AI answers were weak, hedged or wrong.
              </p>
            </div>
            <div className="rounded-2xl bg-pine p-6 text-left text-ink">
              <p className="text-sm text-ink-dim">5 LLMs Tested</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {["chatgpt", "perplexity", "claude", "gemini", "grok"].map((p) => (
                  <ProviderIcon key={p} provider={p} size={34} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-ink px-4 py-20 text-pine">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">How it works</h2>
          <div className="mt-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <ol className="flex flex-col gap-6">
              {[
                ["Crawl", "We fetch your site like an answer engine — respecting robots, classifying page types, extracting chunks."],
                ["Ask", "Real questions are generated from your content and put to 5 AI providers."],
                ["Score", "Answers are graded on coverage, accuracy, attribution and confidence."],
                ["Fix", "Gap analysis turns weak answers into ready-to-apply content fixes."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="font-mono text-sm font-bold text-pine/40">0{i + 1}</span>
                  <div>
                    <p className="font-display text-lg font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-pine/70">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <TerminalPanel lines={DEMO_LINES} maxHeight={320} className="shadow-2xl" />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="bg-ink px-4 pb-24 text-pine">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Everything between you and the answer
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-pine/10 bg-white/50 p-6 transition-shadow hover:shadow-lg"
              >
                <p className="font-mono text-2xl text-[#1d7a4f]" aria-hidden>
                  {f.icon}
                </p>
                <p className="mt-3 font-display text-lg font-semibold">{f.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-pine/70">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section id="pricing" className="relative overflow-hidden bg-pine px-4 py-24">
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="font-display text-3xl font-semibold text-ink sm:text-5xl">
            Know what the machines say about you.
          </h2>
          <a
            href="#hero"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="glow-mint mt-8 rounded-full bg-mint px-8 py-3 font-semibold text-pine transition-transform hover:scale-[1.04]"
          >
            Run your free scan
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer id="footer" className="border-t border-line bg-frame px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Logo size={20} />
          <p className="font-mono text-xs text-ink-dim">
            ▁▃▅▇ nayana.ai — AI visibility engine
          </p>
          <div className="flex gap-5 text-sm text-ink-dim">
            <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

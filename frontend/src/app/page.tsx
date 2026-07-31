"use client";

// Landing page — dark pine hero with dot-matrix dome, provider constellation,
// curved transition to off-white, how-it-works terminal demo, features grid,
// dark CTA band. Hero "Run Free Scan" posts /api/crawl as guest and redirects
// to the scan report.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Logo from "@/components/ui/Logo";
import DotMatrix from "@/components/bg/DotMatrix";
import TerminalPanel from "@/components/ui/TerminalPanel";
import { api, ApiError } from "@/lib/api";
import type { CrawlResponse } from "@/lib/types";

const PROVIDERS = ["ChatGPT", "Perplexity", "Claude", "Gemini", "Grok"];

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
  {
    icon: "◉",
    title: "See what AI sees",
    body: "Crawl your site the way answer engines do — page types, chunks, schema and all.",
  },
  {
    icon: "⚋",
    title: "Test 5 providers",
    body: "Ask ChatGPT, Perplexity, Claude, Gemini and Grok real questions about your product.",
  },
  {
    icon: "┆",
    title: "Visibility score",
    body: "One score across coverage, accuracy, attribution and confidence — tracked over time.",
  },
  {
    icon: "✦",
    title: "Fix the gaps",
    body: "AI-generated FAQs, rewrites and schema patches with before/after diffs you can apply.",
  },
  {
    icon: "◷",
    title: "Beat competitors",
    body: "Share of Voice shows who the AI mentions — you or them — question by question.",
  },
  {
    icon: "∿",
    title: "Track the trend",
    body: "Score history per domain proves your fixes actually move the needle.",
  },
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
    <div className="min-h-screen bg-frame text-ink">
      {/* Nav */}
      <header className="sticky top-4 z-50 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav className="glass hidden items-center gap-1 rounded-full px-2 py-1.5 sm:flex">
          <a href="#how" className="rounded-full px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink">
            How it works
          </a>
          <a href="#features" className="rounded-full px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink">
            Features
          </a>
          <Link href="/dashboard" className="rounded-full px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink">
            Dashboard
          </Link>
        </nav>
        <Link
          href="/login"
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-pine transition-transform hover:scale-[1.03]"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pb-28 pt-24">
        <DotMatrix opacity={0.7} />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass rounded-full px-4 py-1.5 font-mono text-xs text-mint"
          >
            AI Visibility &amp; Perception Engine
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mt-6 font-display text-5xl font-semibold leading-tight tracking-tight sm:text-7xl"
          >
            Your Site,
            <br />
            <span className="text-mint text-glow">As AI Sees It.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-6 max-w-xl text-lg text-ink-dim"
          >
            Search is becoming answers. nayana.ai measures how ChatGPT,
            Perplexity, Claude, Gemini and Grok describe you — then helps you
            fix what they get wrong.
          </motion.p>

          {/* Scan input */}
          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            onSubmit={runScan}
            className="glass-strong mt-10 flex w-full max-w-xl items-center gap-2 rounded-full p-2"
          >
            <span className="pl-3 font-mono text-sm text-ink-dim">https://</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yoursite.com"
              aria-label="Website URL"
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-dim/60"
            />
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="glow-mint rounded-full bg-mint px-6 py-2.5 text-sm font-semibold text-pine transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Scanning…" : "Run Free Scan"}
            </button>
          </motion.form>
          {err && <p className="mt-3 text-sm text-signal">{err}</p>}
          <p className="mt-3 font-mono text-xs text-ink-dim">
            5 free scans · no signup needed
          </p>

          {/* Provider constellation */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-xs text-ink-dim">
            {PROVIDERS.map((p, i) => (
              <span key={p} className="flex items-center gap-6">
                <span className="transition-colors hover:text-mint">{p}</span>
                {i < PROVIDERS.length - 1 && <span className="text-mint/40">·</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Curved transition to paper */}
      <div className="relative">
        <svg viewBox="0 0 1440 64" className="block w-full" preserveAspectRatio="none" aria-hidden>
          <path d="M0,64 C480,0 960,0 1440,64 L1440,64 L0,64 Z" fill="var(--ink)" />
        </svg>
      </div>

      {/* How it works — paper band */}
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
      <section className="relative overflow-hidden bg-pine px-4 py-24">
        <DotMatrix opacity={0.35} density={18} />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="font-display text-3xl font-semibold text-ink sm:text-5xl">
            Know what the machines say about you.
          </h2>
          <a
            href="#"
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
      <footer className="border-t border-line bg-frame px-4 py-10">
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

"use client";

// Landing page — dark pine hero with a 3D dot-globe, orbiting provider icon
// chips on curved SVG paths, curved transition to off-white, stat band,
// how-it-works terminal demo, features grid, dark CTA band.
//
// Hero shows two clean buttons ("Run Free Scan" + "See Demo"). Clicking Run
// Free Scan reveals an inline URL pill; submitting posts /api/crawl as a guest
// and redirects to the scan report page.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Logo from "@/components/ui/Logo";
import OrbitGlobe from "@/components/bg/OrbitGlobe";
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
  const [scanOpen, setScanOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const runScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = url.trim();
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      const normalized = /^https?:\/\//i.test(target)
        ? target
        : "https://" + target;
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

  const openScan = () => {
    setScanOpen(true);
    setTimeout(() => document.getElementById("hero-input")?.focus(), 80);
  };

  return (
    <div className="min-h-screen bg-pine text-ink">
      {/* Nav */}
      <header className="sticky top-3 z-50 mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 sm:top-4 sm:gap-4 sm:px-4">
        <Link href="/" aria-label="nayana.ai home">
          <Logo />
        </Link>

        <nav
          className="glass hidden items-center gap-1 rounded-full px-2 py-1.5 md:flex"
          style={{ backgroundColor: "rgba(10, 20, 17, 0.88)" }}
        >
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

        <div className="flex items-center gap-2">
          <a
            href="#hero"
            onClick={(e) => {
              e.preventDefault();
              openScan();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="hidden rounded-full bg-ink px-5 py-2 text-sm font-semibold text-pine transition-transform hover:scale-[1.03] sm:inline-block"
          >
            Start Free Scan
          </a>
          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="glass flex h-10 w-10 items-center justify-center rounded-full md:hidden"
          >
            <div className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 bg-ink" />
              <span className="block h-[2px] w-4 bg-ink" />
              <span className="block h-[2px] w-4 bg-ink" />
            </div>
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 left-3 right-3 z-40 md:hidden"
          >
            <div className="glass-strong flex flex-col gap-1 rounded-2xl p-3">
              {NAV.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={
                    "rounded-xl px-4 py-2 text-sm transition-colors " +
                    (item.active
                      ? "bg-mint font-semibold text-pine"
                      : "text-ink-dim hover:bg-pine-800 hover:text-ink")
                  }
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#hero"
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMenuOpen(false);
                  openScan();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="mt-1 rounded-xl bg-ink px-4 py-2 text-center text-sm font-semibold text-pine"
              >
                Start Free Scan
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <section
        id="hero"
        className="relative overflow-hidden pt-16 pb-32 sm:pt-24 sm:pb-40"
      >
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass rounded-full px-4 py-1.5 font-mono text-[11px] text-mint sm:text-xs"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint align-middle" />
            AI Search Console
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:mt-6 sm:text-6xl md:text-7xl"
          >
            Your Site,
            <br />
            As AI Sees It
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-5 max-w-md text-sm text-ink-dim sm:mt-6 sm:max-w-xl sm:text-base"
          >
            Scan your website and test how ChatGPT, Perplexity, Claude, Gemini
            and Grok answer real questions from your content.
          </motion.p>

          {/* Two-button hero CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-9"
          >
            <button
              type="button"
              onClick={openScan}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine shadow-lg shadow-black/20 transition-transform hover:scale-[1.03] sm:px-7 sm:py-3"
            >
              Run Free Scan
            </button>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("how")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="rounded-full border border-line-strong bg-white/[0.02] px-6 py-2.5 text-sm text-ink transition-colors hover:border-mint hover:text-mint sm:px-7 sm:py-3"
            >
              See Demo
            </button>
          </motion.div>

          {/* URL input reveals on Run Free Scan click */}
          <AnimatePresence>
            {scanOpen && (
              <motion.form
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 0.9, 0.28, 1] }}
                onSubmit={runScan}
                className="glass-strong mt-5 flex w-full max-w-xl items-center gap-2 overflow-hidden rounded-full p-2"
              >
                <span className="pl-3 font-mono text-sm text-ink-dim">
                  https://
                </span>
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
                  className="rounded-full bg-mint px-5 py-2 text-sm font-semibold text-pine transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Scanning…" : "Go"}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <p className="mt-3 font-mono text-[11px] text-ink-dim sm:text-xs">
            5 free scans · no signup needed
          </p>
          {err && <p className="mt-2 text-sm text-signal">{err}</p>}
        </div>

        {/* WebGL dot-globe with orbiting provider chips */}
        <div className="relative mx-auto mt-6 w-full max-w-4xl px-2 sm:mt-10 sm:px-4">
          <OrbitGlobe />
        </div>
      </section>

      {/* Curved transition to off-white */}
      <div className="relative -mt-2">
        <svg
          viewBox="0 0 1440 88"
          className="block w-full"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0,88 C420,0 1020,0 1440,88 L1440,88 L0,88 Z"
            fill="var(--ink)"
          />
        </svg>
      </div>

      {/* Stat band on paper */}
      <section className="bg-ink px-4 pt-6 pb-16 text-pine">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-display text-2xl font-semibold sm:text-4xl">
            Built for the AI age. Measured for real.
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-3">
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
                {["chatgpt", "perplexity", "claude", "gemini", "grok"].map(
                  (p) => (
                    <ProviderIcon key={p} provider={p} size={34} />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-ink px-4 py-16 text-pine sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-semibold sm:text-4xl">
            How it works
          </h2>
          <div className="mt-8 grid grid-cols-1 items-center gap-10 sm:mt-10 lg:grid-cols-2">
            <ol className="flex flex-col gap-6">
              {[
                [
                  "Crawl",
                  "We fetch your site like an answer engine — respecting robots, classifying page types, extracting chunks.",
                ],
                [
                  "Ask",
                  "Real questions are generated from your content and put to 5 AI providers.",
                ],
                [
                  "Score",
                  "Answers are graded on coverage, accuracy, attribution and confidence.",
                ],
                [
                  "Fix",
                  "Gap analysis turns weak answers into ready-to-apply content fixes.",
                ],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="font-mono text-sm font-bold text-pine/40">
                    0{i + 1}
                  </span>
                  <div>
                    <p className="font-display text-lg font-semibold">
                      {title}
                    </p>
                    <p className="mt-1 text-sm text-pine/70">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <TerminalPanel
              lines={DEMO_LINES}
              maxHeight={320}
              className="shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="bg-ink px-4 pb-20 text-pine sm:pb-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-semibold sm:text-4xl">
            Everything between you and the answer
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-pine/10 bg-white/50 p-6 transition-shadow hover:shadow-lg"
              >
                <p className="font-mono text-2xl text-[#1d7a4f]" aria-hidden>
                  {f.icon}
                </p>
                <p className="mt-3 font-display text-lg font-semibold">
                  {f.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-pine/70">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section
        id="pricing"
        className="relative overflow-hidden bg-pine px-4 py-20 sm:py-24"
      >
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="font-display text-3xl font-semibold text-ink sm:text-5xl">
            Know what the machines say about you.
          </h2>
          <button
            type="button"
            onClick={() => {
              openScan();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="glow-mint mt-8 rounded-full bg-mint px-8 py-3 font-semibold text-pine transition-transform hover:scale-[1.04]"
          >
            Run your free scan
          </button>
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
            <Link href="/dashboard" className="hover:text-ink">
              Dashboard
            </Link>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

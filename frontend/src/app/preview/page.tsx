"use client";

// TEMPORARY visual-preview route for the Scan Report Overview redesign.
// Renders the scan header + OverviewTab with mock data so the styling can be
// verified without an authenticated scan. Safe to delete.

import AppShell from "@/components/nav/AppShell";
import Logo from "@/components/ui/Logo";
import { StatusChip } from "@/components/ui/BadgeChip";
import AsciiRain from "@/components/bg/AsciiRain";
import OverviewTab from "@/components/scan/OverviewTab";
import type { Scan } from "@/lib/types";

const TABS = [
  "Overview",
  "Pages",
  "Test Lab",
  "Gaps",
  "Fixes",
  "Share of Voice",
];

const scan: Scan = {
  id: 1,
  root_url: "https://acme.com",
  status: "completed",
  page_type_breakdown: [
    { page_type: "docs", n: 12 },
    { page_type: "blog", n: 8 },
    { page_type: "pricing", n: 1 },
    { page_type: "faq", n: 2 },
    { page_type: "landing", n: 3 },
  ],
};

const demo = {
  score: {
    ai_coverage_score: 78,
    llm_signal: {
      avg_confidence: 0.8,
      avg_attribution: 0.71,
      avg_accuracy: 0.74,
      has_test_data: true,
    },
  },
  gaps: [
    {
      question: "No answer for pricing tiers question",
      severity: "high",
      pages_affected: 3,
    },
    {
      question: "Outdated product feature mentioned",
      severity: "medium",
      pages_affected: 1,
    },
    {
      question: "Missing case studies for enterprise",
      severity: "medium",
      pages_affected: 2,
    },
  ],
};

export default function PreviewPage() {
  return (
    <AppShell fullBleed>
      <section className="relative overflow-hidden bg-pine">
        <AsciiRain opacity={0.35} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, rgba(169,229,197,0.10), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-10 pb-8">
          <div className="flex flex-wrap items-center gap-3">
            <Logo size={22} />
            <span className="text-sm text-ink-dim">Scan Report</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-semibold text-ink sm:text-5xl">
              acme.com
            </h1>
            <StatusChip status="completed" />
          </div>
          <div className="glass-strong mt-8 inline-flex flex-wrap items-center gap-1 rounded-full px-2 py-1.5">
            {TABS.map((t, i) => (
              <span
                key={t}
                className={
                  "rounded-full px-4 py-1.5 text-sm " +
                  (i === 0
                    ? "bg-ink font-semibold text-pine"
                    : "text-ink-dim")
                }
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <OverviewTab scan={scan} demo={demo} />
      </div>
    </AppShell>
  );
}

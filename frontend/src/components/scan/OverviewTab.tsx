"use client";

// Overview tab — rendered as a warm "paper" report sheet (per the Scan Report
// design): a pixel-mosaic AI Visibility gauge with sub-score bars, a page-type
// donut with count tiles, and a dark Top Content Gaps card with Generate Fix
// CTAs.

import { useEffect, useState } from "react";
import ScoreGauge, { ScoreBar } from "@/components/ui/ScoreGauge";
import { api } from "@/lib/api";
import type { Gap, Scan } from "@/lib/types";

interface ScoreData {
  ai_coverage_score?: number;
  llm_signal?: {
    avg_confidence: number | null;
    avg_attribution: number | null;
    avg_accuracy: number | null;
    has_test_data: boolean;
  };
}

type TabName =
  | "Overview"
  | "Pages"
  | "Test Lab"
  | "Gaps"
  | "Fixes"
  | "Share of Voice";

const TYPE_COLORS: Record<string, string> = {
  landing: "#5f9c7f",
  docs: "#8fbca9",
  blog: "#a9e5c5",
  pricing: "#e3b341",
  faq: "#e5533c",
  changelog: "#3f7d63",
  integration: "#6b9d8a",
  other: "#c2ccc6",
};

const TYPE_ICONS: Record<string, string> = {
  landing: "\u2302",
  docs: "\u274f",
  blog: "\u270e",
  pricing: "$",
  faq: "?",
  changelog: "\u2261",
  integration: "\u21c4",
  other: "\u00b7",
};

export default function OverviewTab({
  scan,
  onOpenTab,
  demo,
}: {
  scan: Scan;
  onOpenTab?: (tab: TabName) => void;
  demo?: { score: ScoreData; gaps: Gap[] };
}) {
  const [score, setScore] = useState<ScoreData | null>(demo?.score ?? null);
  const [gaps, setGaps] = useState<Gap[]>(demo?.gaps ?? []);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    api
      .get<ScoreData>("/api/scans/" + scan.id + "/score?save=false")
      .then((d) => {
        if (!cancelled) setScore(d);
      })
      .catch(() => {});
    api
      .get<{ gaps: Gap[] }>("/api/scans/" + scan.id + "/gaps")
      .then((d) => {
        if (!cancelled) setGaps(d.gaps ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scan.id]);

  const overall = score?.ai_coverage_score ?? null;
  const sig = score?.llm_signal;
  const hasTest = sig?.has_test_data ?? false;
  const pct = (v: number | null | undefined) =>
    v === null || v === undefined ? null : Math.round(v * 100);

  const breakdown = scan.page_type_breakdown ?? [];
  const tiles = [...breakdown].sort((a, b) => b.n - a.n).slice(0, 4);
  const topGaps = [...gaps]
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity))
    .slice(0, 3);

  return (
    <div className="paper p-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)] sm:p-7">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Score panel */}
        <section className="flex flex-col items-center rounded-2xl border border-pine/10 bg-white/50 px-6 py-8">
          <ScoreGauge
            score={overall}
            label="AI Visibility Score"
            size={280}
            variant="dome"
            surface="light"
          />
          <div className="mt-7 flex w-full max-w-sm flex-col gap-3.5">
            <ScoreBar surface="light" label="Coverage" value={overall} />
            <ScoreBar
              surface="light"
              label="Accuracy"
              value={hasTest ? pct(sig?.avg_accuracy) : null}
            />
            <ScoreBar
              surface="light"
              label="Attribution"
              value={hasTest ? pct(sig?.avg_attribution) : null}
            />
            <ScoreBar
              surface="light"
              label="Confidence"
              value={hasTest ? pct(sig?.avg_confidence) : null}
            />
          </div>
          {!hasTest && (
            <p className="mt-5 text-center text-xs text-pine/55">
              Run a test in the Test Lab to unlock accuracy signals.
            </p>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {/* Page types */}
          <section className="rounded-2xl border border-pine/10 bg-white/50 p-6">
            <div className="flex items-center gap-6">
              <Donut breakdown={breakdown} />
              <div className="grid flex-1 grid-cols-2 gap-3">
                {tiles.map((row) => (
                  <div
                    key={row.page_type}
                    className="rounded-xl border border-pine/10 bg-white/70 px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-pine/60">
                        {row.page_type}
                      </span>
                      <span
                        aria-hidden
                        className="text-pine/35"
                        style={{
                          color:
                            TYPE_COLORS[row.page_type] ?? TYPE_COLORS.other,
                        }}
                      >
                        {TYPE_ICONS[row.page_type] ?? "\u00b7"}
                      </span>
                    </div>
                    <p className="mt-1 font-display text-3xl font-semibold text-pine">
                      {row.n}
                    </p>
                  </div>
                ))}
                {tiles.length === 0 && (
                  <p className="col-span-2 text-sm text-pine/55">
                    No pages crawled yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Top gaps — dark card for contrast */}
          <section className="rounded-2xl bg-pine p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-ink">
                Top Content Gaps
              </h3>
              {gaps.length > 0 && (
                <span className="font-mono text-[11px] text-ink-dim">
                  {gaps.length} total
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {topGaps.length === 0 ? (
                <p className="text-sm text-ink-dim">
                  {gaps.length === 0
                    ? "No gaps detected \u2014 nice coverage. \ud83c\udf89"
                    : "\u2026"}
                </p>
              ) : (
                topGaps.map((gap, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-line/60 bg-white/[0.03] px-3 py-2.5 text-sm transition-colors hover:border-mint/40"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: sevColor(gap.severity),
                        boxShadow: "0 0 6px " + sevColor(gap.severity),
                      }}
                    />
                    <span className="flex-1 truncate text-ink">
                      {gap.question ?? gap.description ?? "Content gap"}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-dim">
                      {gap.pages_affected ?? 0} page
                      {(gap.pages_affected ?? 0) === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenTab?.("Fixes")}
                      className="shrink-0 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-pine transition-colors hover:bg-mint-bright"
                    >
                      Generate Fix
                    </button>
                  </div>
                ))
              )}
            </div>
            {topGaps.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenTab?.("Gaps")}
                className="mt-4 text-xs text-mint hover:text-mint-bright"
              >
                View all gaps \u2192
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function sevRank(sev?: string): number {
  if (sev === "high") return 0;
  if (sev === "medium") return 1;
  return 2;
}

function sevColor(sev?: string): string {
  if (sev === "high") return "var(--red)";
  if (sev === "medium") return "var(--amber)";
  return "var(--sage)";
}

// SVG donut built from the page-type breakdown (light surface).
function Donut({
  breakdown,
}: {
  breakdown: { page_type: string; n: number }[];
}) {
  const total = breakdown.reduce((s, r) => s + r.n, 0);
  const size = 128;
  const r = 48;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  let offset = 0;
  const segs = breakdown.map((row) => {
    const frac = total > 0 ? row.n / total : 0;
    const seg = {
      color: TYPE_COLORS[row.page_type] ?? TYPE_COLORS.other,
      dash: frac * C,
      gap: C - frac * C,
      offset: -offset,
    };
    offset += frac * C;
    return seg;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={"0 0 " + size + " " + size}
      className="shrink-0"
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(14,26,22,0.08)"
        strokeWidth={16}
      />
      {segs.map((s, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={16}
          strokeLinecap="butt"
          strokeDasharray={s.dash + " " + s.gap}
          strokeDashoffset={s.offset}
          transform={"rotate(-90 " + cx + " " + cy + ")"}
        />
      ))}
      <text
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        fill="var(--pine)"
        fontSize="22"
        fontWeight="700"
        fontFamily="var(--font-jetbrains-mono)"
      >
        {total}
      </text>
    </svg>
  );
}

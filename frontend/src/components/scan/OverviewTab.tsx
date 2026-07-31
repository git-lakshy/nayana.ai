"use client";

// Overview tab — ASCII score gauge + sub-score bars, page-type donut with
// count cards, and Top Content Gaps with Generate Fix CTAs.

import { useEffect, useState } from "react";
import GlassCard from "@/components/ui/GlassCard";
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

const TYPE_COLORS: Record<string, string> = {
  landing: "#a9e5c5",
  docs: "#8fbca9",
  blog: "#5f8f7d",
  pricing: "#e3b341",
  faq: "#e5533c",
  changelog: "#7dd3fc",
  integration: "#c4b5fd",
  other: "#6b7f76",
};

const TYPE_ICONS: Record<string, string> = {
  landing: "⌂",
  docs: "❏",
  blog: "✎",
  pricing: "$",
  faq: "?",
  changelog: "≡",
  integration: "⇄",
  other: "·",
};

export default function OverviewTab({ scan }: { scan: Scan }) {
  const [score, setScore] = useState<ScoreData | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);

  useEffect(() => {
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
  const topGaps = [...gaps]
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Score panel */}
      <GlassCard className="flex flex-col items-center justify-center py-10">
        <ScoreGauge
          score={overall}
          label="AI Visibility Score"
          size={260}
          variant="dome"
        />
        <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
          <ScoreBar label="Coverage" value={overall} />
          <ScoreBar label="Accuracy" value={hasTest ? pct(sig?.avg_accuracy) : null} />
          <ScoreBar label="Attribution" value={hasTest ? pct(sig?.avg_attribution) : null} />
          <ScoreBar label="Confidence" value={hasTest ? pct(sig?.avg_confidence) : null} />
        </div>
        {!hasTest && (
          <p className="mt-5 text-sm text-ink-dim">
            Run a test in the Test Lab to unlock accuracy signals.
          </p>
        )}
      </GlassCard>

      <div className="flex flex-col gap-6">
        {/* Page types */}
        <GlassCard className="flex items-center gap-6">
          <Donut breakdown={breakdown} />
          <div className="grid flex-1 grid-cols-2 gap-3">
            {breakdown.map((row) => (
              <div key={row.page_type} className="rounded-xl border border-line px-4 py-3">
                <p className="flex items-center gap-2 text-sm text-ink-dim">
                  <span aria-hidden>{TYPE_ICONS[row.page_type] ?? "·"}</span>
                  {row.page_type}
                </p>
                <p className="mt-0.5 font-display text-2xl font-semibold text-ink">
                  {row.n}
                </p>
              </div>
            ))}
            {breakdown.length === 0 && (
              <p className="col-span-2 text-sm text-ink-dim">No pages crawled yet.</p>
            )}
          </div>
        </GlassCard>

        {/* Top gaps */}
        <GlassCard strong>
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
                  ? "No gaps detected — nice coverage. 🎉"
                  : "…"}
              </p>
            ) : (
              topGaps.map((gap, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-line/60 bg-pine-800/30 px-3 py-2.5 text-sm transition-colors hover:border-mint/40"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: sevColor(gap.severity),
                      boxShadow: "0 0 6px " + sevColor(gap.severity),
                    }}
                  />
                  <span className="flex-1 text-ink">
                    {gap.question ?? gap.description ?? "Content gap"}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-dim">
                    {gap.pages_affected ?? 0} page
                    {(gap.pages_affected ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
              ))
            )}
          </div>
          {topGaps.length > 0 && (
            <p className="mt-4 text-xs text-ink-dim">
              Open the Gaps or Fixes tab to act on these.
            </p>
          )}
        </GlassCard>
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

// SVG donut built from the page-type breakdown.
function Donut({ breakdown }: { breakdown: { page_type: string; n: number }[] }) {
  const total = breakdown.reduce((s, r) => s + r.n, 0);
  const size = 120;
  const r = 46;
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
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(245,244,239,0.08)" strokeWidth={14} />
      {segs.map((s, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={14}
          strokeDasharray={s.dash + " " + s.gap}
          strokeDashoffset={s.offset}
          transform={"rotate(-90 " + cx + " " + cy + ")"}
        />
      ))}
      <text x={cx} y={cy + 5} textAnchor="middle" fill="var(--ink)" fontSize="18" fontWeight="700" fontFamily="var(--font-jetbrains-mono)">
        {total}
      </text>
    </svg>
  );
}

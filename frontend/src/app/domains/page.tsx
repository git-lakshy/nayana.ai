"use client";

// Domains & History — domain cards with trend sparklines, score-over-time
// area chart with "fixes applied" markers, recent scans list with deltas.
// Wiring: GET /api/domains (list of domain strings with score history),
// GET /api/domains/{domain}/history (ScoreHistoryRow[], "history" feature → FREE+).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppShell from "@/components/nav/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import BadgeChip from "@/components/ui/BadgeChip";
import Sparkline from "@/components/ui/Sparkline";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ScoreHistoryRow } from "@/lib/types";

interface ChartPoint {
  date: string;
  score: number;
  scanId: number;
  appliedFixes: number;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DomainsPage() {
  const { hasFeature, loading: authLoading } = useAuth();
  const canHistory = hasFeature("history");

  const [domains, setDomains] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<ScoreHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  // Domain list — public route, cheap.
  useEffect(() => {
    api
      .get<{ domains: string[] }>("/api/domains")
      .then((d) => {
        const list = d.domains ?? [];
        setDomains(list);
        setSelected((cur) => cur ?? list[0] ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadHistory = useCallback(async (domain: string) => {
    try {
      const d = await api.get<{ domain: string; history: ScoreHistoryRow[] }>(
        "/api/domains/" + encodeURIComponent(domain) + "/history?limit=50"
      );
      // History arrives newest-first; charts want oldest-first.
      setHistory((d.history ?? []).slice().reverse());
      setLocked(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        setLocked(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!selected || authLoading) return;
    if (!canHistory) {
      setLocked(true);
      return;
    }
    void loadHistory(selected);
  }, [selected, canHistory, authLoading, loadHistory]);

  const chartData = useMemo<ChartPoint[]>(
    () =>
      history.map((r) => ({
        date: fmtDate(r.recorded_at),
        score: Math.round(r.ai_coverage_score),
        scanId: r.scan_id,
        appliedFixes: r.applied_fix_count ?? 0,
      })),
    [history]
  );

  const latest = history.length ? history[history.length - 1] : null;
  const trendValues = useMemo(
    () => history.map((r) => r.ai_coverage_score),
    [history]
  );

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Domains &amp; History
        </h1>
        <BadgeChip label={domains.length + " tracked"} tone="outline" className="ml-auto" />
      </div>

      {loading ? (
        <p className="mt-16 text-center text-ink-dim">Loading domains…</p>
      ) : domains.length === 0 ? (
        <GlassCard className="mt-10 py-14 text-center">
          <p className="text-ink">No score history yet.</p>
          <p className="mt-1 text-sm text-ink-dim">
            Run a scan and a test from the dashboard — scores land here after each run.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine"
          >
            Go to dashboard
          </Link>
        </GlassCard>
      ) : (
        <>
          {/* Domain cards */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {domains.map((domain) => {
              const active = domain === selected;
              return (
                <button
                  key={domain}
                  onClick={() => setSelected(domain)}
                  className={
                    "glass px-5 py-4 text-left transition-colors " +
                    (active ? "border-mint" : "hover:border-line-strong")
                  }
                >
                  <p className="truncate font-medium text-ink">{domain}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="font-display text-3xl font-semibold text-mint">
                      {active && latest ? Math.round(latest.ai_coverage_score) : "··"}
                    </span>
                    {active && trendValues.length > 1 && (
                      <Sparkline data={trendValues} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* History chart */}
          {locked ? (
            <GlassCard className="mt-6 py-14 text-center">
              <p className="font-display text-3xl">🔒</p>
              <p className="mt-3 text-ink">Score history is a FREE+ feature.</p>
              <p className="mt-1 text-sm text-ink-dim">
                Create a free account to track your AI visibility over time.
              </p>
              <Link
                href="/login"
                className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine"
              >
                Create free account
              </Link>
            </GlassCard>
          ) : (
            <>
              <GlassCard strong className="mt-6">
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-semibold text-ink">
                    AI Visibility Score over time
                  </p>
                  <span className="text-xs text-ink-dim">{selected}</span>
                </div>
                {chartData.length < 2 ? (
                  <p className="py-10 text-center text-sm text-ink-dim">
                    Not enough data points yet — run more tests to build the trend.
                  </p>
                ) : (
                  <div className="mt-4 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                        <defs>
                          <linearGradient id="mintFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a9e5c5" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#a9e5c5" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(169,229,197,0.08)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#b9bdb4", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: "#b9bdb4", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0a1411",
                            border: "1px solid rgba(169,229,197,0.32)",
                            borderRadius: 12,
                            color: "#f5f4ef",
                            fontSize: 13,
                          }}
                          formatter={(value, name) =>
                            name === "score"
                              ? [value ?? "", "Score"]
                              : [value ?? "", String(name)]
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke="#a9e5c5"
                          strokeWidth={2}
                          fill="url(#mintFill)"
                          dot={{ r: 3, fill: "#a9e5c5", strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                        {chartData
                          .filter((p) => p.appliedFixes > 0)
                          .map((p) => (
                            <ReferenceDot
                              key={p.scanId}
                              x={p.date}
                              y={p.score}
                              r={6}
                              fill="#e3b341"
                              stroke="#0a1411"
                              strokeWidth={2}
                            />
                          ))}
                      </AreaChart>
                    </ResponsiveContainer>
                    <p className="mt-1 text-right text-xs text-ink-dim">
                      <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber align-middle" />
                      marker = scan where fixes had been applied
                    </p>
                  </div>
                )}
              </GlassCard>

              {/* Recent runs list */}
              {history.length > 0 && (
                <div className="paper mt-6 overflow-x-auto p-6">
                  <p className="font-display text-lg font-semibold">Recent runs — {selected}</p>
                  <table className="mt-4 w-full min-w-125 text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-pine/50">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">Score</th>
                        <th className="pb-2 pr-4">Δ</th>
                        <th className="pb-2 pr-4">Gaps</th>
                        <th className="pb-2 pr-4">Fixes applied</th>
                        <th className="pb-2">Scan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history
                        .slice()
                        .reverse()
                        .map((row, i, arr) => {
                          const prev = arr[i + 1];
                          const delta = prev
                            ? Math.round(row.ai_coverage_score - prev.ai_coverage_score)
                            : null;
                          return (
                            <tr key={row.scan_id + row.recorded_at} className="border-t border-pine/10">
                              <td className="py-2.5 pr-4">{fmtDate(row.recorded_at)}</td>
                              <td className="py-2.5 pr-4 font-mono font-semibold">
                                {Math.round(row.ai_coverage_score)}
                              </td>
                              <td
                                className={
                                  "py-2.5 pr-4 font-mono " +
                                  (delta === null
                                    ? "text-pine/40"
                                    : delta >= 0
                                      ? "text-[#1d7a4f]"
                                      : "text-signal")
                                }
                              >
                                {delta === null ? "—" : (delta >= 0 ? "+" : "") + delta}
                              </td>
                              <td className="py-2.5 pr-4 font-mono">{row.gap_count ?? "—"}</td>
                              <td className="py-2.5 pr-4 font-mono">{row.applied_fix_count ?? 0}</td>
                              <td className="py-2.5">
                                <Link
                                  href={"/scan/?id=" + row.scan_id}
                                  className="text-xs font-medium text-[#1d7a4f] underline-offset-2 hover:underline"
                                >
                                  #{row.scan_id} →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

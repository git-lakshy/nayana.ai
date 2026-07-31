"use client";

// Share of Voice tab (PRO) — link competitor scans, SOV split bar,
// per-provider battleground table, competitor cards.
// Wiring: GET /api/sov/{scan_id}, GET /api/sov/{scan_id}/competitors,
// POST /api/sov/link. All gated by the "sov" feature (403 → locked card).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GlassCard from "@/components/ui/GlassCard";
import BadgeChip from "@/components/ui/BadgeChip";
import ProviderIcon from "@/components/ui/ProviderIcon";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hostOf } from "@/components/dashboard/RecentScans";
import type { Scan, SovCompare } from "@/lib/types";

const PROVIDER_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
};

// Rate 0..1 → tone class for the battleground cell.
function rateTone(rate: number | null | undefined): {
  cls: string;
  glyph: string;
} {
  if (rate === null || rate === undefined || Number.isNaN(rate))
    return { cls: "text-pine/30", glyph: "–" };
  const r = rate <= 1 ? rate : rate / 100;
  if (r >= 0.6) return { cls: "bg-[#1d7a4f] text-white", glyph: "✓" };
  if (r >= 0.25) return { cls: "bg-amber/80 text-pine", glyph: "○" };
  return { cls: "bg-signal/80 text-white", glyph: "✗" };
}

function pct(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  const n = v <= 1 ? v * 100 : v;
  return Math.round(n) + "%";
}

export default function SovTab({ scan }: { scan: Scan }) {
  const { hasFeature } = useAuth();
  const canSov = hasFeature("sov");

  const [data, setData] = useState<SovCompare | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link-competitor form state
  const [myScans, setMyScans] = useState<Scan[]>([]);
  const [competitorScanId, setCompetitorScanId] = useState<number | "">("");
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<SovCompare>("/api/sov/" + scan.id);
      setData(d);
      setLocked(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setLocked(true);
      else setError("Could not load Share of Voice data.");
    } finally {
      setLoading(false);
    }
  }, [scan.id]);

  useEffect(() => {
    if (canSov) void load();
    else {
      setLocked(true);
      setLoading(false);
    }
  }, [canSov, load]);

  // Load own scans for the competitor picker (exclude this scan).
  useEffect(() => {
    if (!canSov) return;
    api
      .get<{ scans: Scan[] }>("/api/scans?limit=50")
      .then((d) =>
        setMyScans(
          (d.scans ?? []).filter(
            (s) => s.id !== scan.id && s.status === "completed"
          )
        )
      )
      .catch(() => {});
  }, [canSov, scan.id]);

  const linkCompetitor = async () => {
    if (competitorScanId === "") return;
    const comp = myScans.find((s) => s.id === competitorScanId);
    if (!comp) return;
    setLinking(true);
    setLinkMsg(null);
    try {
      await api.post("/api/sov/link", {
        parent_scan_id: scan.id,
        competitor_scan_id: comp.id,
        competitor_url: comp.root_url,
      });
      setLinkMsg("Competitor linked ✓");
      await load();
    } catch (err) {
      setLinkMsg(
        err instanceof ApiError
          ? err.message
          : "Linking failed — try again."
      );
    } finally {
      setLinking(false);
    }
  };

  if (locked) {
    return (
      <GlassCard className="py-16 text-center">
        <p className="font-display text-3xl">🔒</p>
        <p className="mt-3 text-ink">Share of Voice is a PRO feature.</p>
        <p className="mt-1 text-sm text-ink-dim">
          Compare how often AI models mention you vs your competitors.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine"
        >
          Upgrade to PRO
        </Link>
      </GlassCard>
    );
  }

  if (loading)
    return <p className="py-12 text-center text-ink-dim">Loading Share of Voice…</p>;

  if (error)
    return (
      <GlassCard className="py-12 text-center text-sm text-ink-dim">{error}</GlassCard>
    );

  const hasCompetitors = (data?.competitor_count ?? 0) > 0;
  const ownShare = data ? Math.max(0, Math.min(1, data.overall_target_sov <= 1 ? data.overall_target_sov : data.overall_target_sov / 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Share of Voice — {hostOf(scan.root_url)}
        </h2>
        <BadgeChip label="PRO" tone="mint" />
        <span className="ml-auto text-xs text-ink-dim">
          {data?.competitor_count ?? 0} competitor{(data?.competitor_count ?? 0) === 1 ? "" : "s"} linked
        </span>
      </div>

      {/* Link competitor */}
      <GlassCard>
        <p className="text-sm font-medium text-ink">Link a competitor scan</p>
        <p className="mt-1 text-xs text-ink-dim">
          Pick one of your completed scans of a competitor site. Need one? Run a
          scan of their domain from the dashboard first.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={competitorScanId}
            onChange={(e) =>
              setCompetitorScanId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="rounded-full border border-line-strong bg-pine-800 px-4 py-2 text-sm text-ink outline-none focus:border-mint"
          >
            <option value="">Select a scan…</option>
            {myScans.map((s) => (
              <option key={s.id} value={s.id}>
                {hostOf(s.root_url)} — scan #{s.id}
              </option>
            ))}
          </select>
          <button
            onClick={() => void linkCompetitor()}
            disabled={linking || competitorScanId === ""}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-pine transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {linking ? "Linking…" : "Link Competitor Scan"}
          </button>
          {linkMsg && <span className="text-xs text-ink-dim">{linkMsg}</span>}
        </div>
      </GlassCard>

      {!hasCompetitors ? (
        <GlassCard className="py-12 text-center text-sm text-ink-dim">
          No competitors linked yet — link a scan above to see the comparison.
        </GlassCard>
      ) : (
        <>
          {/* SOV split bar */}
          <GlassCard strong>
            <div className="flex h-12 w-full overflow-hidden rounded-xl font-mono text-sm font-semibold">
              <div
                className="flex items-center bg-mint pl-4 text-pine"
                style={{ width: Math.max(8, ownShare * 100) + "%" }}
              >
                {pct(ownShare)}
              </div>
              <div className="flex flex-1 items-center justify-end bg-ink/20 pr-4 text-ink-dim">
                {pct(1 - ownShare)}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-mint">{hostOf(data?.target_url ?? scan.root_url)}</span>
              <span className="text-ink-dim">competitors</span>
            </div>
          </GlassCard>

          {/* Per-provider battleground — provider-icon columns × you+competitors rows */}
          <div className="paper overflow-x-auto p-6">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-semibold">Provider Battleground</p>
              <p className="text-xs text-pine/60">brand mention rate per provider</p>
            </div>
            {(() => {
              const providers = Object.keys(data?.sov_by_provider ?? {});
              const competitors = data?.competitors ?? [];
              return (
                <table className="mt-5 w-full min-w-150 border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr>
                      <th className="w-56 pb-2 text-left text-xs uppercase tracking-wide text-pine/50">
                        Site
                      </th>
                      {providers.map((p) => (
                        <th key={p} className="pb-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <ProviderIcon provider={p} size={30} />
                            <span className="text-[10px] font-medium text-pine/60">
                              {PROVIDER_LABELS[p] ?? p}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* You row */}
                    <tr>
                      <td className="rounded-l-xl bg-mint/25 py-3 pl-4 pr-3 text-left">
                        <p className="text-xs uppercase tracking-wide text-[#1d7a4f]">
                          You
                        </p>
                        <p className="truncate font-medium text-pine">
                          {hostOf(data?.target_url ?? scan.root_url)}
                        </p>
                      </td>
                      {providers.map((p, i) => {
                        const row = data?.sov_by_provider?.[p];
                        const tone = rateTone(row?.target_brand_mention_rate);
                        const isLast = i === providers.length - 1;
                        return (
                          <td
                            key={p}
                            className={
                              "px-2 py-3 text-center " +
                              (isLast ? "rounded-r-xl bg-mint/25" : "bg-mint/25")
                            }
                          >
                            <div
                              className={
                                "mx-auto flex h-9 w-14 items-center justify-center gap-1 rounded-full font-mono text-xs font-semibold " +
                                tone.cls
                              }
                            >
                              <span aria-hidden>{tone.glyph}</span>
                              <span>{pct(row?.target_brand_mention_rate)}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {/* Competitor rows */}
                    {competitors.map((c) => (
                      <tr key={c.scan_id}>
                        <td className="rounded-l-xl bg-pine/5 py-3 pl-4 pr-3 text-left">
                          <p className="text-xs uppercase tracking-wide text-pine/50">
                            Competitor
                          </p>
                          <p className="truncate font-medium text-pine">
                            {hostOf(c.root_url || c.url)}
                          </p>
                        </td>
                        {providers.map((p, i) => {
                          const m = c.per_provider?.[p];
                          const tone = rateTone(m?.brand_mention_rate);
                          const isLast = i === providers.length - 1;
                          return (
                            <td
                              key={p}
                              className={
                                "px-2 py-3 text-center bg-pine/5 " +
                                (isLast ? "rounded-r-xl" : "")
                              }
                            >
                              <div
                                className={
                                  "mx-auto flex h-9 w-14 items-center justify-center gap-1 rounded-full font-mono text-xs font-semibold " +
                                  tone.cls
                                }
                              >
                                <span aria-hidden>{tone.glyph}</span>
                                <span>{pct(m?.brand_mention_rate)}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-pine/60">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-[#1d7a4f]" />
                strong (≥ 60%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-amber" />
                mixed (25–60%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-signal" />
                weak (&lt; 25%)
              </span>
            </div>
          </div>

          {/* Competitor cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(data?.competitors ?? []).map((c) => (
              <GlassCard key={c.scan_id}>
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{hostOf(c.root_url || c.url)}</p>
                  <Link
                    href={"/scan/?id=" + c.scan_id}
                    className="text-xs text-mint underline-offset-2 hover:underline"
                  >
                    scan #{c.scan_id} →
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-dim">
                  {Object.entries(c.per_provider ?? {}).slice(0, 4).map(([prov, m]) => (
                    <div key={prov} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
                      <ProviderIcon provider={prov} size={18} />
                      <span className="flex-1 truncate">{PROVIDER_LABELS[prov] ?? prov}</span>
                      <span className="font-mono text-ink">{pct(m.brand_mention_rate)}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

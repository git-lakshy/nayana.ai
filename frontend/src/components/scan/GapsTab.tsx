"use client";

// Gaps tab — every detected content gap with severity, affected pages and a
// Generate Fix action (FREE+ feature; guests hit the upsell).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import GlassCard from "@/components/ui/GlassCard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Gap, Scan } from "@/lib/types";

export default function GapsTab({ scan }: { scan: Scan }) {
  const { hasFeature } = useAuth();
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ gaps: Gap[] }>("/api/scans/" + scan.id + "/gaps")
      .then((d) => setGaps(d.gaps ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scan.id]);

  useEffect(load, [load]);

  const generate = async () => {
    setGenerating(true);
    setMessage(null);
    setNeedsAccount(false);
    try {
      const d = await api.post<{ generated: number }>(
        "/api/scans/" + scan.id + "/fixes/generate",
        {}
      );
      setMessage("Generated " + d.generated + " fixes — open the Fixes tab.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setNeedsAccount(true);
      } else if (err instanceof ApiError) {
        setMessage(err.message);
      } else {
        setMessage("Generation failed — is an LLM key configured?");
      }
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = hasFeature("fix_generate");

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Content Gaps ({gaps.length})
          </h2>
          <p className="text-sm text-ink-dim">
            Questions AI models can&apos;t answer well from this site&apos;s content.
          </p>
        </div>
        <button
          onClick={() => void generate()}
          disabled={generating || !canGenerate}
          title={canGenerate ? undefined : "Create a free account to generate fixes"}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-pine transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "Generating…" : canGenerate ? "Generate Fixes" : "🔒 Generate Fixes (FREE+)"}
        </button>
      </GlassCard>

      {needsAccount && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          Fix generation needs a free account.{" "}
          <Link href="/login" className="font-semibold underline">
            Register
          </Link>{" "}
          — your scans carry over.
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-line bg-ink/5 px-4 py-3 text-sm text-ink">
          {message}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-ink-dim">Analyzing gaps…</p>
      ) : gaps.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <p className="font-display text-2xl">🎉</p>
          <p className="mt-2 text-ink">No content gaps detected.</p>
          <p className="mt-1 text-sm text-ink-dim">
            AI models answer the tested questions well from this site.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {gaps.map((gap, i) => (
            <GlassCard key={i} padded={false} className="flex items-center gap-4 px-5 py-4">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: sevColor(gap.severity) }}
                title={gap.severity ?? "low"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">
                  {gap.question ?? gap.description ?? "Content gap"}
                </p>
                {gap.page_urls && gap.page_urls.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-ink-dim">
                    {gap.page_urls.join(" · ")}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm text-ink-dim">
                {gap.pages_affected ?? 0} page{(gap.pages_affected ?? 0) === 1 ? "" : "s"}
              </span>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function sevColor(sev?: string): string {
  if (sev === "high") return "var(--red)";
  if (sev === "medium") return "var(--amber)";
  return "var(--sage)";
}

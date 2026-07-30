"use client";

// Fixes tab — filter pills by type, queue cards on the left, diff detail on
// the right, Apply (PRO) / Dismiss / Copy actions.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GlassCard from "@/components/ui/GlassCard";
import BadgeChip from "@/components/ui/BadgeChip";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Fix, Scan } from "@/lib/types";

const TYPE_ICONS: Record<string, string> = {
  faq: "❓",
  rewrite: "✎",
  schema: "⚙",
  new_doc: "❏",
};

export default function FixesTab({ scan }: { scan: Scan }) {
  const { hasFeature } = useAuth();
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Fix | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canView = hasFeature("fixes");
  const canApply = hasFeature("fix_apply");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ fixes: Fix[] }>("/api/scans/" + scan.id + "/fixes");
      setFixes(d.fixes ?? []);
      setLocked(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setLocked(true);
    } finally {
      setLoading(false);
    }
  }, [scan.id]);

  useEffect(() => {
    if (canView) void load();
    else {
      setLocked(true);
      setLoading(false);
    }
  }, [canView, load]);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fixes) counts.set(f.fix_type, (counts.get(f.fix_type) ?? 0) + 1);
    return Array.from(counts.entries());
  }, [fixes]);

  const visible = useMemo(
    () => (filter === "all" ? fixes : fixes.filter((f) => f.fix_type === filter)),
    [fixes, filter]
  );

  const act = async (fix: Fix, action: "apply" | "dismiss") => {
    try {
      await api.post("/api/scans/" + scan.id + "/fixes/" + fix.id + "/" + action, {});
      setToast(action === "apply" ? "fix applied to " + (fix.target_page ?? "page") + " ✓" : "fix dismissed");
      setTimeout(() => setToast(null), 3500);
      await load();
      setSelected(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setToast("🔒 Applying fixes needs the PRO plan");
        setTimeout(() => setToast(null), 3500);
      }
    }
  };

  const copy = async (fix: Fix) => {
    const text = fix.diff ?? fix.content ?? fix.title;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (locked) {
    return (
      <GlassCard className="py-16 text-center">
        <p className="font-display text-3xl">🔒</p>
        <p className="mt-3 text-ink">Fixes are a FREE+ feature.</p>
        <p className="mt-1 text-sm text-ink-dim">
          Create a free account to view and generate content fixes.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine"
        >
          Create free account
        </Link>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill label={"All " + fixes.length} active={filter === "all"} onClick={() => setFilter("all")} />
        {types.map(([type, count]) => (
          <FilterPill
            key={type}
            label={labelFor(type) + " " + count}
            active={filter === type}
            onClick={() => setFilter(type)}
          />
        ))}
        <BadgeChip label="PRO" tone="mint" className="ml-auto" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Queue */}
        <div className="flex flex-col gap-3">
          {loading ? (
            <p className="py-8 text-center text-ink-dim">Loading fixes…</p>
          ) : visible.length === 0 ? (
            <GlassCard className="py-10 text-center text-sm text-ink-dim">
              No fixes here yet — generate them from the Gaps tab.
            </GlassCard>
          ) : (
            visible.map((fix) => (
              <button
                key={fix.id}
                onClick={() => setSelected(fix)}
                className={
                  "glass w-full px-5 py-4 text-left transition-colors " +
                  (selected?.id === fix.id ? "border-mint" : "hover:border-line-strong")
                }
              >
                <p className="flex items-center gap-2 font-medium text-ink">
                  <span aria-hidden>{TYPE_ICONS[fix.fix_type] ?? "❏"}</span>
                  {fix.title}
                </p>
                <p className="mt-1.5 flex items-center gap-3 text-xs text-ink-dim">
                  <span className="flex items-center gap-1.5">
                    Severity:
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: sevColor(fix.severity) }}
                    />
                  </span>
                  <span>Target: {fix.target_page ?? "—"}</span>
                  <span className="ml-auto">
                    <BadgeChip
                      label={fix.status.toUpperCase()}
                      tone={fix.status === "applied" ? "mint" : fix.status === "dismissed" ? "dim" : "amber"}
                    />
                  </span>
                </p>
              </button>
            ))
          )}
        </div>

        {/* Detail */}
        <GlassCard strong className="min-h-64">
          {selected ? (
            <>
              <DiffView text={selected.diff ?? selected.content ?? "(no content)"} />
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => void act(selected, "apply")}
                  disabled={!canApply || selected.status !== "pending"}
                  title={canApply ? undefined : "PRO plan required"}
                  className="rounded-full border border-line-strong px-5 py-2 text-sm font-medium text-ink transition-colors hover:border-mint disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {canApply ? "Apply Fix" : "🔒 Apply Fix"}
                </button>
                <button
                  onClick={() => void act(selected, "dismiss")}
                  disabled={selected.status !== "pending"}
                  className="rounded-full border border-line-strong px-5 py-2 text-sm text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => void copy(selected)}
                  className="text-sm text-ink-dim underline-offset-2 hover:underline"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-ink-dim">
              Select a fix from the queue to preview its diff.
            </p>
          )}
        </GlassCard>
      </div>

      {toast && (
        <div className="rounded-xl border border-line bg-[#060d0a] px-5 py-3 font-mono text-sm text-mint">
          {toast}
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-4 py-1.5 text-sm transition-colors " +
        (active ? "bg-ink font-semibold text-pine" : "border border-line-strong text-ink-dim hover:text-ink")
      }
    >
      {label}
    </button>
  );
}

function labelFor(type: string): string {
  const map: Record<string, string> = {
    faq: "FAQ",
    rewrite: "Rewrite",
    schema: "Schema",
    new_doc: "New Doc",
  };
  return map[type] ?? type;
}

function sevColor(sev?: string): string {
  if (sev === "high") return "var(--red)";
  if (sev === "medium") return "var(--amber)";
  return "var(--sage)";
}

// Monospace red/green diff renderer.
function DiffView({ text }: { text: string }) {
  return (
    <pre className="nice-scroll max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-pine/10 bg-white/70 p-4 font-mono text-[13px] leading-relaxed text-pine">
      {text.split("\n").map((line, i) => {
        const cls = line.startsWith("-")
          ? "bg-signal/15 text-signal"
          : line.startsWith("+")
            ? "bg-mint/40 text-pine"
            : "text-pine/70";
        return (
          <span key={i} className={"block rounded px-1 " + cls}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

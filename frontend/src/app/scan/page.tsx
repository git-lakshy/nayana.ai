"use client";

// Scan Report — dark ASCII-rain header band with domain + status + tab pills,
// then the tab body renders on the light app background below.
// Scan id comes from ?id= (static export → client-side param).

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/nav/AppShell";
import Logo from "@/components/ui/Logo";
import { StatusChip } from "@/components/ui/BadgeChip";
import AsciiRain from "@/components/bg/AsciiRain";
import { api } from "@/lib/api";
import type { Scan } from "@/lib/types";
import { hostOf } from "@/components/dashboard/RecentScans";
import OverviewTab from "@/components/scan/OverviewTab";
import PagesTab from "@/components/scan/PagesTab";
import TestLabTab from "@/components/scan/TestLabTab";
import GapsTab from "@/components/scan/GapsTab";
import FixesTab from "@/components/scan/FixesTab";
import SovTab from "@/components/scan/SovTab";

const TABS = [
  "Overview",
  "Pages",
  "Test Lab",
  "Gaps",
  "Fixes",
  "Share of Voice",
] as const;

type Tab = (typeof TABS)[number];

function ScanReport() {
  const params = useSearchParams();
  const scanId = Number(params.get("id") ?? 0);

  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");

  const load = useCallback(async () => {
    if (!scanId) return;
    try {
      const data = await api.get<Scan>("/api/scans/" + scanId);
      setScan(data);
    } catch {
      setError("Scan not found — it may belong to another account or was deleted.");
    }
  }, [scanId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep polling while the scan is running so counts stay live.
  useEffect(() => {
    if (scan?.status !== "running") return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [scan?.status, load]);

  if (!scanId || error) {
    return (
      <AppShell>
        <div className="glass mx-auto mt-24 max-w-md p-8 text-center">
          <p className="text-ink-dim">
            {error ?? "No scan selected. Pick one from the dashboard."}
          </p>
        </div>
      </AppShell>
    );
  }

  if (!scan) {
    return (
      <AppShell>
        <p className="mt-24 text-center text-ink-dim">Loading scan…</p>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      {/* Dark header band with ASCII rain backdrop */}
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
              {hostOf(scan.root_url)}
            </h1>
            <StatusChip status={scan.status} />
          </div>

          {/* Tab pills */}
          <div className="glass-strong mt-8 inline-flex flex-wrap items-center gap-1 rounded-full px-2 py-1.5">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "rounded-full px-4 py-1.5 text-sm transition-colors " +
                  (tab === t
                    ? "bg-ink font-semibold text-pine"
                    : "text-ink-dim hover:text-ink")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {/* Soft fade into the app background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--pine) 100%)",
          }}
        />
      </section>

      {/* Tab body */}
      <div className="mx-auto max-w-6xl px-6 py-10">
        {tab === "Overview" && (
          <OverviewTab scan={scan} onOpenTab={setTab} />
        )}
        {tab === "Pages" && <PagesTab scan={scan} />}
        {tab === "Test Lab" && <TestLabTab scan={scan} />}
        {tab === "Gaps" && <GapsTab scan={scan} />}
        {tab === "Fixes" && <FixesTab scan={scan} />}
        {tab === "Share of Voice" && <SovTab scan={scan} />}
      </div>
    </AppShell>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-pine text-ink-dim">
          Loading…
        </div>
      }
    >
      <ScanReport />
    </Suspense>
  );
}

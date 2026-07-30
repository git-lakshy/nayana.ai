"use client";

// Dashboard — stat cards, New Scan card, Recent Scans table.
// Wiring: GET /api/scans; while a crawl runs server-side we poll /api/scans
// every 2s so the running row shows live "Crawling… n/m pages"; headline
// score from GET /api/scans/{id}/score?save=false on the latest completed scan.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/nav/AppShell";
import StatCard from "@/components/ui/StatCard";
import NewScanCard from "@/components/dashboard/NewScanCard";
import RecentScans, { hostOf } from "@/components/dashboard/RecentScans";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Scan } from "@/lib/types";

export default function DashboardPage() {
  const { identity, isGuest } = useAuth();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestScore, setLatestScore] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadScans = useCallback(async () => {
    try {
      const data = await api.get<{ scans: Scan[] }>("/api/scans?limit=20");
      setScans(data.scans ?? []);
    } catch {
      // Backend may be down — keep current state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handleStarted = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => void loadScans(), 2000);
  }, [loadScans, stopPolling]);

  const handleSettled = useCallback(() => {
    stopPolling();
    void loadScans();
  }, [loadScans, stopPolling]);

  // Headline score on the most recent completed scan.
  const latestCompleted = useMemo(
    () => scans.find((s) => s.status === "completed"),
    [scans]
  );

  useEffect(() => {
    if (!latestCompleted) {
      setLatestScore(null);
      return;
    }
    let cancelled = false;
    api
      .get<{ ai_coverage_score?: number }>(
        "/api/scans/" + latestCompleted.id + "/score?save=false"
      )
      .then((d) => {
        if (!cancelled && typeof d.ai_coverage_score === "number") {
          setLatestScore(d.ai_coverage_score);
        }
      })
      .catch(() => {
        if (!cancelled) setLatestScore(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latestCompleted]);

  const domainCount = useMemo(
    () => new Set(scans.map((s) => hostOf(s.root_url))).size,
    [scans]
  );
  const pagesTrend = useMemo(
    () => scans.slice(0, 8).map((s) => s.pages_crawled ?? 0).reverse(),
    [scans]
  );

  const quotaRemaining = identity?.guest_scans_remaining ?? null;
  const quotaLimit = identity?.guest_scan_limit ?? 5;

  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="AI Visibility Score"
          value={latestScore === null ? "—" : Math.round(latestScore)}
          sub={latestCompleted ? hostOf(latestCompleted.root_url) : "run a scan"}
          variant="ring"
          ringScore={latestScore}
          delay={0}
        />
        <StatCard
          label="Active Domains"
          value={domainCount}
          sub="across your scans"
          variant="sparkline"
          sparkData={pagesTrend.length ? pagesTrend : [0, 0, 0]}
          delay={0.08}
        />
        {isGuest ? (
          <StatCard
            label="Guest scans left"
            value={quotaRemaining === null ? "—/" + quotaLimit : quotaRemaining + "/" + quotaLimit}
            sub="free scans remaining"
            variant="meter"
            meterDone={quotaRemaining ?? 0}
            meterTotal={quotaLimit}
            delay={0.16}
          />
        ) : (
          <StatCard
            label="Current plan"
            value={(identity?.plan ?? "free").toUpperCase()}
            sub={identity?.role ? "role: " + identity.role : "member"}
            delay={0.16}
          />
        )}
      </div>

      <NewScanCard onStarted={handleStarted} onSettled={handleSettled} />

      <RecentScans scans={scans} loading={loading} />
    </AppShell>
  );
}

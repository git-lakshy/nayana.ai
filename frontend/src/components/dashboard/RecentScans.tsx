"use client";

// Recent Scans table — off-white paper card with status pills, live crawling
// progress row, and block-character sparkline.

import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/ui/BadgeChip";
import Sparkline, { AsciiProgress } from "@/components/ui/Sparkline";
import type { Scan } from "@/lib/types";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RecentScans({
  scans,
  loading,
}: {
  scans: Scan[];
  loading: boolean;
}) {
  const router = useRouter();

  return (
    <section className="paper mt-10 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-5 pb-3">
        <h2 className="font-display text-lg font-semibold text-pine">
          Recent Scans
        </h2>
        <p className="font-mono text-[11px] text-pine/50">
          {loading ? "loading…" : scans.length + " total"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-pine">
          <thead>
            <tr className="border-b border-pine/10 text-xs uppercase tracking-wide text-pine/50">
              <th className="px-6 py-2 font-medium">Site</th>
              <th className="px-6 py-2 font-medium">Status</th>
              <th className="px-6 py-2 font-medium">Pages Crawled</th>
              <th className="px-6 py-2 font-medium">Trend</th>
              <th className="px-6 py-2 font-medium">Date</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-pine/40">
                  Loading scans…
                </td>
              </tr>
            ) : scans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-pine/40">
                  No scans yet — run your first scan above.
                </td>
              </tr>
            ) : (
              scans.map((scan) => (
                <ScanRow key={scan.id} scan={scan} onOpen={() => router.push("/scan?id=" + scan.id)} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScanRow({ scan, onOpen }: { scan: Scan; onOpen: () => void }) {
  const running = scan.status === "running";
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-pine/5 transition-colors last:border-0 hover:bg-pine/5"
    >
      <td className="px-6 py-4">
        <span className="flex items-center gap-2 font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-mint">
            {hostOf(scan.root_url).slice(0, 1).toUpperCase()}
          </span>
          {hostOf(scan.root_url)}
        </span>
      </td>
      <td className="px-6 py-4">
        <StatusChip status={scan.status} />
      </td>
      <td className="px-6 py-4 font-mono">
        {running ? (
          <span className="flex items-center gap-2">
            Crawling… {scan.pages_crawled ?? 0}/{scan.pages_found ?? "?"} pages
            <AsciiProgress
              done={scan.pages_crawled ?? 0}
              total={scan.pages_found ?? 1}
              width={8}
              className="text-pine"
            />
          </span>
        ) : (
          scan.pages_crawled ?? 0
        )}
      </td>
      <td className="px-6 py-4">
        <Sparkline
          data={[scan.pages_found ?? 0, scan.pages_crawled ?? 0, scan.chunks_count ?? 0]}
          className="text-pine/70"
        />
      </td>
      <td className="px-6 py-4 text-pine/60">{formatDate(scan.created_at)}</td>
      <td className="px-6 py-4 text-right text-pine/40">›</td>
    </tr>
  );
}

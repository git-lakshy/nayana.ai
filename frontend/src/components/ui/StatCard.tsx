"use client";

// Dashboard stat card: label, big mono value, optional ASCII visualisation
// (ring gauge, sparkline or block meter) exactly per the dashboard wireframe.

import GlassCard from "./GlassCard";
import ScoreGauge from "./ScoreGauge";
import Sparkline from "./Sparkline";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  variant?: "ring" | "sparkline" | "meter";
  ringScore?: number | null;
  sparkData?: number[];
  meterDone?: number;
  meterTotal?: number;
  delay?: number;
}

export default function StatCard({
  label,
  value,
  sub,
  variant,
  ringScore,
  sparkData,
  meterDone,
  meterTotal,
  delay = 0,
}: StatCardProps) {
  return (
    <GlassCard
      className="relative overflow-hidden"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-dim">{label}</p>
          <p className="mt-1 font-mono text-4xl font-bold text-ink">{value}</p>
          {sub && <p className="mt-1 truncate text-xs text-ink-dim">{sub}</p>}
        </div>

        {variant === "ring" && (
          <ScoreGauge
            score={ringScore ?? null}
            variant="ring"
            size={76}
            segments={24}
            showValue={false}
          />
        )}
        {variant === "sparkline" && sparkData && (
          <Sparkline data={sparkData} className="mt-3 text-2xl" />
        )}
        {variant === "meter" && (
          <BlockMeter done={meterDone ?? 0} total={meterTotal ?? 5} />
        )}
      </div>
    </GlassCard>
  );
}

// Small block meter (■■■■□) for quotas like "4/5 guest scans left".
function BlockMeter({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-2 flex items-end gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-2.5 rounded-sm ${
            i < done ? "bg-mint" : "bg-ink/12"
          }`}
          style={{ height: `${10 + (i % 3) * 5}px` }}
        />
      ))}
    </div>
  );
}

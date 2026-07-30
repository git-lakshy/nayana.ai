"use client";

// ASCII/dot-matrix arc gauge. A semicircle (or full ring) of block ticks —
// filled ticks glow mint, the rest sit dim. Used for the AI Visibility Score.

interface ScoreGaugeProps {
  score: number | null; // 0..100
  label?: string;
  size?: number; // px diameter
  segments?: number;
  variant?: "arc" | "ring";
  showValue?: boolean;
}

export default function ScoreGauge({
  score,
  label,
  size = 220,
  segments = 48,
  variant = "arc",
  showValue = true,
}: ScoreGaugeProps) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const filled = score === null ? 0 : Math.round((value / 100) * segments);
  const isArc = variant === "arc";
  const cx = size / 2;
  const cy = isArc ? size / 2 : size / 2;
  const r = size / 2 - 10;

  const ticks = Array.from({ length: segments }, (_, i) => {
    // Arc spans 180° (left to right over the top); ring spans 360°.
    const angle = isArc
      ? Math.PI - (i / (segments - 1)) * Math.PI
      : -Math.PI / 2 + (i / segments) * Math.PI * 2;
    const x = cx + r * Math.cos(angle);
    const y = isArc ? cy - r * Math.sin(angle) : cy + r * Math.sin(angle);
    const deg = (angle * 180) / Math.PI;
    const on = i < filled;
    return (
      <rect
        key={i}
        x={x - 2}
        y={y - 4}
        width={4}
        height={8}
        rx={1}
        transform={`rotate(${isArc ? -deg + 90 : deg + 90} ${x} ${y})`}
        fill={on ? "var(--mint)" : "rgba(245,244,239,0.10)"}
        style={on ? { filter: "drop-shadow(0 0 3px rgba(169,229,197,0.6))" } : undefined}
      />
    );
  });

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: isArc ? size / 2 + 24 : size }}>
      <svg width={size} height={isArc ? size / 2 + 10 : size}>
        {ticks}
      </svg>
      {showValue && (
        <div
          className={`absolute flex flex-col items-center ${isArc ? "bottom-0" : ""}`}
        >
          {label && (
            <span className="text-xs font-medium text-ink-dim tracking-wide">
              {label}
            </span>
          )}
          <span
            className="font-display font-bold text-mint text-glow leading-none"
            style={{ fontSize: size * (isArc ? 0.28 : 0.3) }}
          >
            {score === null ? "—" : Math.round(value)}
          </span>
        </div>
      )}
    </div>
  );
}

// Sub-score bar row (Coverage / Accuracy / Attribution / Confidence).
export function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-ink-dim">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-mint"
          style={{ width: `${v}%`, boxShadow: "0 0 8px rgba(169,229,197,0.45)" }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-sm text-ink">
        {value === null ? "—" : Math.round(v)}
      </span>
    </div>
  );
}

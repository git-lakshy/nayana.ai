"use client";

// ASCII/dot-matrix score gauge.
// - variant="arc":  original tick semicircle.
// - variant="ring": full ring of ticks.
// - variant="dome": halftone dome of small dots arranged as concentric arcs
//                    (per the Scan Report wireframe). Dots fill left → right,
//                    inner → outer, brightness gated on score percentage.

interface ScoreGaugeProps {
  score: number | null; // 0..100
  label?: string;
  size?: number; // px diameter
  segments?: number; // tick count for arc/ring variants
  variant?: "arc" | "ring" | "dome";
  showValue?: boolean;
}

export default function ScoreGauge({
  score,
  label,
  size = 220,
  segments = 48,
  variant = "dome",
  showValue = true,
}: ScoreGaugeProps) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const isArc = variant === "arc";
  const isRing = variant === "ring";
  const isDome = variant === "dome";

  const cx = size / 2;
  const cy = size / 2;

  // --- Dome (halftone dot dome) -------------------------------------------
  if (isDome) {
    const rings = 8; // number of concentric arcs
    const dotsPerRing = 26; // dots on the outermost arc; inner arcs scale down
    const rMax = size / 2 - 6;
    const rMin = rMax * 0.32;

    interface Dot {
      x: number;
      y: number;
      r: number;
      progress: number; // 0..1 how far along the sweep this dot sits
    }
    const dots: Dot[] = [];

    for (let ri = 0; ri < rings; ri++) {
      const t = ri / (rings - 1); // 0 inner → 1 outer
      const rr = rMin + (rMax - rMin) * t;
      const nDots = Math.max(8, Math.round(dotsPerRing * (0.55 + 0.45 * t)));
      for (let i = 0; i < nDots; i++) {
        // Sweep from left (180°) over the top to right (0°)
        const p = i / (nDots - 1); // 0 left → 1 right
        const angle = Math.PI - p * Math.PI;
        const x = cx + rr * Math.cos(angle);
        const y = cy - rr * Math.sin(angle);
        // Fill along the sweep first, then bias slightly by radius so the
        // dome fills from the base outward
        const progress = p * 0.75 + t * 0.25;
        // dot size lightly scales with ring radius
        const dotR = 1.4 + t * 1.6;
        dots.push({ x, y, r: dotR, progress });
      }
    }

    const threshold = score === null ? 0 : value / 100;

    return (
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size / 2 + 40 }}
      >
        <svg
          width={size}
          height={size / 2 + 12}
          viewBox={`0 0 ${size} ${size / 2 + 12}`}
          className="overflow-visible"
        >
          {dots.map((d, i) => {
            const on = d.progress <= threshold;
            // fade near the threshold edge for a softer halftone transition
            const edge = Math.max(0, 1 - Math.abs(d.progress - threshold) * 6);
            const fill = on
              ? "var(--mint)"
              : `rgba(169,229,197,${(0.08 + edge * 0.12).toFixed(3)})`;
            return (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={d.r}
                fill={fill}
                style={
                  on
                    ? { filter: "drop-shadow(0 0 2.5px rgba(169,229,197,0.65))" }
                    : undefined
                }
              />
            );
          })}
        </svg>
        {showValue && (
          <div className="absolute bottom-0 flex flex-col items-center">
            {label && (
              <span className="text-xs font-medium tracking-wide text-ink-dim">
                {label}
              </span>
            )}
            <span
              className="text-glow font-display leading-none font-bold text-mint"
              style={{ fontSize: size * 0.28 }}
            >
              {score === null ? "—" : Math.round(value)}
            </span>
            <span className="mt-0.5 font-mono text-[10px] text-ink-dim">
              /100
            </span>
          </div>
        )}
      </div>
    );
  }

  // --- Arc / Ring (original tick-based) -----------------------------------
  const filled =
    score === null ? 0 : Math.round((value / 100) * segments);
  const r = size / 2 - 10;

  const ticks = Array.from({ length: segments }, (_, i) => {
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
        style={
          on
            ? { filter: "drop-shadow(0 0 3px rgba(169,229,197,0.6))" }
            : undefined
        }
      />
    );
  });

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: isArc ? size / 2 + 24 : size }}
    >
      <svg width={size} height={isArc ? size / 2 + 10 : size}>
        {ticks}
      </svg>
      {showValue && (
        <div
          className={`absolute flex flex-col items-center ${
            isArc ? "bottom-0" : ""
          }`}
        >
          {label && (
            <span className="text-xs font-medium tracking-wide text-ink-dim">
              {label}
            </span>
          )}
          <span
            className="text-glow font-display leading-none font-bold text-mint"
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
          style={{
            width: `${v}%`,
            boxShadow: "0 0 8px rgba(169,229,197,0.45)",
          }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-sm text-ink">
        {value === null ? "—" : Math.round(v)}
      </span>
    </div>
  );
}

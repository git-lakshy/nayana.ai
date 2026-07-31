"use client";

// ASCII/dot-matrix score gauge.
// - variant="arc":  original tick semicircle.
// - variant="ring": full ring of ticks.
// - variant="dome": pixel-mosaic arch (per the Scan Report design). A grid of
//                    small squares masked to a semicircular band fills
//                    left -> right based on the score.
// The `surface` prop adapts colors for a light "paper" card vs the dark pine UI.

interface ScoreGaugeProps {
  score: number | null; // 0..100
  label?: string;
  size?: number; // px diameter
  segments?: number; // tick count for arc/ring variants
  variant?: "arc" | "ring" | "dome";
  showValue?: boolean;
  surface?: "dark" | "light";
}

export default function ScoreGauge({
  score,
  label,
  size = 220,
  segments = 48,
  variant = "dome",
  showValue = true,
  surface = "dark",
}: ScoreGaugeProps) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const isArc = variant === "arc";
  const isDome = variant === "dome";
  const light = surface === "light";

  const cx = size / 2;
  const cy = size / 2;

  // --- Dome (pixel-mosaic arch) -------------------------------------------
  if (isDome) {
    const rOuter = size / 2 - 2;
    const rInner = rOuter * 0.64;
    const cell = Math.max(6, Math.round(size / 42)); // grid step
    const sq = cell * 0.7; // square side (leaves a gap => mosaic look)
    const baseY = rOuter; // flat side of the dome sits along the bottom
    const threshold = score === null ? 0 : value / 100;

    interface Cell {
      x: number;
      y: number;
      on: boolean;
      t: number; // 0 inner -> 1 outer
    }
    const cells: Cell[] = [];
    for (let gy = 0; gy <= rOuter; gy += cell) {
      for (let gx = 0; gx <= size; gx += cell) {
        const px = gx + cell / 2;
        const py = gy + cell / 2;
        const dx = px - cx;
        const dy = baseY - py; // y up
        const rr = Math.hypot(dx, dy);
        if (rr < rInner || rr > rOuter) continue;
        const ang = Math.atan2(dy, dx); // 0..PI across the top
        if (ang < 0) continue;
        const p = 1 - ang / Math.PI; // 0 left -> 1 right
        const t = (rr - rInner) / (rOuter - rInner);
        cells.push({ x: px, y: py, on: p <= threshold + 1e-6, t });
      }
    }

    const svgH = rOuter + 6;
    return (
      <div
        className="relative inline-flex items-end justify-center"
        style={{ width: size, height: rOuter + 10 }}
      >
        <svg
          width={size}
          height={svgH}
          viewBox={`0 0 ${size} ${svgH}`}
          className="overflow-visible"
        >
          {cells.map((c, i) => {
            const a = 0.42 + 0.58 * c.t;
            const fill = c.on
              ? light
                ? `rgba(74,143,113,${a.toFixed(3)})`
                : `rgba(169,229,197,${a.toFixed(3)})`
              : light
                ? "rgba(14,26,22,0.07)"
                : "rgba(169,229,197,0.07)";
            return (
              <rect
                key={i}
                x={c.x - sq / 2}
                y={c.y - sq / 2}
                width={sq}
                height={sq}
                rx={1.2}
                fill={fill}
                style={
                  c.on && !light
                    ? { filter: "drop-shadow(0 0 2px rgba(169,229,197,0.55))" }
                    : undefined
                }
              />
            );
          })}
        </svg>
        {showValue && (
          <div className="absolute bottom-0 flex flex-col items-center">
            {label && (
              <span
                className={`text-xs font-medium tracking-wide ${
                  light ? "text-pine/55" : "text-ink-dim"
                }`}
              >
                {label}
              </span>
            )}
            <span
              className={`font-display leading-none font-bold ${
                light ? "text-[#3f7d63]" : "text-glow text-mint"
              }`}
              style={{ fontSize: size * 0.26 }}
            >
              {score === null ? "\u2014" : Math.round(value)}
            </span>
            <span
              className={`mt-0.5 font-mono text-[10px] ${
                light ? "text-pine/40" : "text-ink-dim"
              }`}
            >
              /100
            </span>
          </div>
        )}
      </div>
    );
  }

  // --- Arc / Ring (original tick-based) -----------------------------------
  const filled = score === null ? 0 : Math.round((value / 100) * segments);
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
          on ? { filter: "drop-shadow(0 0 3px rgba(169,229,197,0.6))" } : undefined
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
            {score === null ? "\u2014" : Math.round(value)}
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
  surface = "dark",
}: {
  label: string;
  value: number | null;
  surface?: "dark" | "light";
}) {
  const light = surface === "light";
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className={light ? "text-pine/70" : "text-ink-dim"}>{label}</span>
        <span
          className={`font-mono font-semibold ${light ? "text-pine" : "text-ink"}`}
        >
          {value === null ? "\u2014" : Math.round(v)}
        </span>
      </div>
      <div
        className={`mt-1.5 h-1.5 w-full overflow-hidden rounded-full ${
          light ? "bg-pine/10" : "bg-ink/10"
        }`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${v}%`,
            background: light
              ? "linear-gradient(90deg,#8fbca9,#5f9c7f)"
              : "var(--mint)",
            boxShadow: light ? "none" : "0 0 8px rgba(169,229,197,0.45)",
          }}
        />
      </div>
    </div>
  );
}

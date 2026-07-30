// Rounded score chip — green / amber / red per the score matrix design.

interface ScorePillProps {
  score: number | null | undefined;
  size?: "sm" | "md";
}

function tone(score: number): string {
  if (score >= 7) return "bg-mint/90 text-pine";
  if (score >= 5) return "bg-amber/90 text-pine";
  return "bg-signal/90 text-ink";
}

export default function ScorePill({ score, size = "md" }: ScorePillProps) {
  if (score === null || score === undefined) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full font-mono bg-ink/10 text-ink-dim ${
          size === "sm" ? "min-w-9 px-2 py-0.5 text-xs" : "min-w-11 px-2.5 py-1 text-sm"
        }`}
      >
        —
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-mono font-semibold ${tone(
        score
      )} ${size === "sm" ? "min-w-9 px-2 py-0.5 text-xs" : "min-w-11 px-2.5 py-1 text-sm"}`}
    >
      {score.toFixed(1)}
    </span>
  );
}

// Score colour helper for text (used by gauges and cards).
export function scoreTextClass(score: number): string {
  if (score >= 70) return "text-mint";
  if (score >= 50) return "text-amber";
  return "text-signal";
}

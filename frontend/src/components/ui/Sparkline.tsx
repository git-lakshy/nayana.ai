// ASCII block-character sparkline (▁▂▃▄▅▆▇█) used in tables and stat cards.

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

interface SparklineProps {
  data: number[];
  className?: string;
  // Optional explicit color override — use when the default mint would clash
  // with the container (e.g. mint-filled selected domain card).
  color?: string;
}

export default function Sparkline({
  data,
  className = "",
  color,
}: SparklineProps) {
  if (!data.length) {
    return <span className={`font-mono text-ink-dim ${className}`}>—</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const chars = data
    .map((v) => {
      const idx = Math.round(((v - min) / span) * (BLOCKS.length - 1));
      return BLOCKS[idx];
    })
    .join("");
  const colorCls = color ? "" : "text-mint";
  return (
    <span
      className={`font-mono tracking-tight ${colorCls} ${className}`}
      style={color ? { color } : undefined}
      aria-hidden
    >
      {chars}
    </span>
  );
}

// ASCII progress bar like [###......] used by the crawling progress row.
export function AsciiProgress({
  done,
  total,
  width = 10,
  className = "",
}: {
  done: number;
  total: number;
  width?: number;
  className?: string;
}) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(ratio * width);
  return (
    <span className={`font-mono text-mint ${className}`}>
      [{"#".repeat(filled)}
      {".".repeat(Math.max(0, width - filled))}]
    </span>
  );
}

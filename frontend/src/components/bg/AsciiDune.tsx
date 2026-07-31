"use client";

// ASCII dune — a dotted terrain silhouette rising from the bottom edge,
// built from mono glyphs with density increasing toward the base.
// Deterministic (SSR-safe), static, decorative.

interface AsciiDuneProps {
  className?: string;
  opacity?: number;
  cols?: number;
  rows?: number;
}

export default function AsciiDune({
  className = "",
  opacity = 0.55,
  cols = 140,
  rows = 16,
}: AsciiDuneProps) {
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const nx = x / cols;
      // two soft gaussian dune peaks
      const h =
        0.6 * Math.exp(-Math.pow((nx - 0.3) / 0.17, 2)) +
        0.42 * Math.exp(-Math.pow((nx - 0.74) / 0.21, 2));
      const depth = y / rows; // 0 top → 1 bottom
      const surface = 1 - h;
      if (depth < surface) {
        line += " ";
        continue;
      }
      const r = Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
      const density = 0.2 + depth * 0.8;
      if (r > density) line += " ";
      else if (r < density * 0.35) line += ".";
      else if (r < density * 0.7) line += ":";
      else line += "'";
    }
    lines.push(line);
  }

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden ${className}`}
      style={{
        opacity,
        maskImage: "linear-gradient(to bottom, transparent, black 45%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 45%)",
      }}
    >
      <pre className="select-none text-center font-mono text-[9px] leading-[9px] tracking-[1px] text-mint">
        {lines.join("\n")}
      </pre>
    </div>
  );
}

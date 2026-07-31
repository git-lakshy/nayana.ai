// Provider brand-ish glyphs in rounded tiles — used on the landing orbit,
// the SOV battleground header and the settings provider rows.

interface ProviderIconProps {
  provider: string; // chatgpt | perplexity | claude | gemini | grok
  size?: number; // tile edge in px
  className?: string;
  glow?: boolean;
}

const TILE: Record<string, string> = {
  chatgpt: "bg-[#10a37f]/20 text-[#8fe3c6]",
  perplexity: "bg-[#20808d]/20 text-[#8fd8e2]",
  claude: "bg-[#d97757]/20 text-[#f0b49b]",
  gemini: "bg-[#1c7fe0]/20 text-[#a8ccff]",
  grok: "bg-ink/10 text-ink",
};

function Glyph({ provider, size }: { provider: string; size: number }) {
  const s = "currentColor";
  switch (provider) {
    case "chatgpt":
      // Six-petal flower. Coordinates are hardcoded (not computed with
      // Math.sin/cos) so the SVG renders identically on the server and
      // client — avoids a hydration mismatch on floating point precision.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          {[
            { cx: 17.2, cy: 12 },
            { cx: 14.6, cy: 16.503 },
            { cx: 9.4, cy: 16.503 },
            { cx: 6.8, cy: 12 },
            { cx: 9.4, cy: 7.497 },
            { cx: 14.6, cy: 7.497 },
          ].map((p, i) => (
            <circle
              key={i}
              cx={p.cx}
              cy={p.cy}
              r="4.3"
              stroke={s}
              strokeWidth="1.5"
            />
          ))}
        </svg>
      );
    case "perplexity":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3v18M5 8l7-5 7 5M5 8v8l7 5 7-5V8"
            stroke={s}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "claude":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 19L12 5l7 14"
            stroke={s}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M8.4 13.2h7.2" stroke={s} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "gemini":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3l1.9 6.1L20 12l-6.1 1.9L12 20l-1.9-6.1L4 12l6.1-1.9z"
            stroke={s}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "grok":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M16.5 4L7.5 20" stroke={s} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ProviderIcon({
  provider,
  size = 36,
  className = "",
  glow = false,
}: ProviderIconProps) {
  const p = provider.toLowerCase();
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl border border-ink/12 backdrop-blur-sm ${
        TILE[p] ?? "bg-ink/10 text-ink"
      } ${glow ? "shadow-[0_0_18px_rgba(169,229,197,0.25)]" : ""} ${className}`}
      style={{ width: size, height: size }}
      title={provider}
    >
      <Glyph provider={p} size={Math.round(size * 0.62)} />
    </span>
  );
}

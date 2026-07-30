// nayana.ai logo — mint N glyph + wordmark.

export default function Logo({
  size = 26,
  withWordmark = true,
  className = "",
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
      >
        <path
          d="M7 25V7l18 18V7"
          stroke="var(--mint)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <span className="font-display text-xl font-semibold tracking-tight text-ink">
          nayana.ai
        </span>
      )}
    </span>
  );
}

// Small pill badge for statuses and labels.

interface BadgeChipProps {
  label: string;
  tone?: "mint" | "sage" | "red" | "amber" | "dim" | "outline";
  pulse?: boolean;
  className?: string;
}

const TONES: Record<NonNullable<BadgeChipProps["tone"]>, string> = {
  mint: "bg-mint text-pine font-semibold",
  sage: "bg-sage/20 text-sage border border-sage/40",
  red: "bg-signal/15 text-signal border border-signal/40",
  amber: "bg-amber/15 text-amber border border-amber/40",
  dim: "bg-ink/8 text-ink-dim border border-ink/15",
  outline: "border border-line-strong text-ink",
};

export default function BadgeChip({
  label,
  tone = "dim",
  pulse = false,
  className = "",
}: BadgeChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {label}
    </span>
  );
}

// Map a scan status string to a chip.
export function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "completed")
    return <BadgeChip label="Completed" tone="mint" />;
  if (s === "running")
    return <BadgeChip label="Running" tone="outline" pulse />;
  if (s === "failed") return <BadgeChip label="Failed" tone="red" />;
  return <BadgeChip label={status} tone="dim" />;
}

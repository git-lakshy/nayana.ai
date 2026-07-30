"use client";

// Terminal-style log panel — JetBrains Mono, near-black, mint text.

import { useEffect, useRef } from "react";

interface TerminalPanelProps {
  lines: string[];
  className?: string;
  maxHeight?: number;
}

export default function TerminalPanel({
  lines,
  className = "",
  maxHeight = 220,
}: TerminalPanelProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={boxRef}
      className={`nice-scroll overflow-y-auto rounded-xl border border-line bg-[#060d0a] p-4 font-mono text-[13px] leading-relaxed text-mint/90 ${className}`}
      style={{ maxHeight }}
    >
      {lines.length === 0 ? (
        <span className="text-ink-dim">// idle — run a test to see live output</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))
      )}
      <span className="inline-block h-4 w-2 animate-pulse bg-mint/70 align-text-bottom" />
    </div>
  );
}

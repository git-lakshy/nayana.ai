"use client";

// New Scan card — URL input, Max Pages / Depth pill groups, Start Scan CTA.
// Handles 422 inline errors and the 402 guest-limit upsell.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CrawlResponse } from "@/lib/types";

const PAGE_OPTIONS = [10, 25, 50];
const DEPTH_OPTIONS = [1, 2, 3];

interface NewScanCardProps {
  onStarted: () => void;
  onSettled: () => void;
}

export default function NewScanCard({ onStarted, onSettled }: NewScanCardProps) {
  const router = useRouter();
  const { identity, refreshIdentity } = useAuth();
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(25);
  const [depth, setDepth] = useState(2);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  const quotaLimit = identity?.guest_scan_limit ?? 5;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLimitHit(false);
    const trimmed = url.trim();
    if (!trimmed || starting) return;
    setStarting(true);
    onStarted(); // dashboard starts polling /api/scans for the live row
    try {
      const res = await api.post<CrawlResponse>("/api/crawl", {
        root_url: trimmed.startsWith("http") ? trimmed : "https://" + trimmed,
        max_pages: maxPages,
        max_depth: depth,
        per_host_delay_ms: 200,
      });
      if (res.guest_quota) await refreshIdentity();
      setUrl("");
      const newId = res.scan?.id;
      if (newId && res.scan?.status === "completed") {
        router.push("/scan?id=" + newId);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setLimitHit(true);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Network error — is the backend running on :8000?");
      }
    } finally {
      setStarting(false);
      onSettled();
    }
  };

  return (
    <GlassCard
      strong
      className="mx-auto mt-10 max-w-md text-center"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <h2 className="font-display text-xl font-semibold text-ink">New Scan</h2>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yoursite.com"
          className="rounded-full border border-line bg-ink/5 px-5 py-3 text-center font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink-dim/60 focus:border-mint"
        />

        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <PillGroup label="Max Pages" options={PAGE_OPTIONS} value={maxPages} onChange={setMaxPages} />
          <PillGroup label="Depth" options={DEPTH_OPTIONS} value={depth} onChange={setDepth} />
        </div>

        {formError && (
          <p className="rounded-xl border border-signal/40 bg-signal/10 px-4 py-2 text-sm text-signal">
            {formError}
          </p>
        )}

        {limitHit && (
          <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
            You&apos;ve used all {quotaLimit} free scans.{" "}
            <Link href="/login" className="font-semibold underline">
              Create a free account
            </Link>{" "}
            to keep scanning.
          </div>
        )}

        <button
          type="submit"
          disabled={starting || !url.trim()}
          className="rounded-full bg-ink py-3 font-semibold text-pine transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? "Crawling…" : "Start Scan"}
        </button>
      </form>
    </GlassCard>
  );
}

function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-ink-dim">{label}</span>
      {options.map((n) => (
        <button
          type="button"
          key={n}
          onClick={() => onChange(n)}
          className={
            "rounded-full px-3 py-1 transition-colors " +
            (value === n
              ? "bg-mint font-semibold text-pine"
              : "border border-line-strong text-ink-dim hover:text-ink")
          }
        >
          {n}
        </button>
      ))}
    </div>
  );
}

"use client";

// Settings — Profile and Plan & features (user-facing only).
// Wiring: identity from /api/auth/me (auth context).
// Admin-only configuration (AI provider sessions) lives at /admin —
// mapped to admin.<domain> in production. Nothing admin-scoped renders here.

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/nav/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import BadgeChip from "@/components/ui/BadgeChip";
import { useAuth } from "@/lib/auth";

const SECTIONS = ["Profile", "Plan"] as const;
type Section = (typeof SECTIONS)[number];

const PLAN_FEATURES: { feature: string; label: string }[] = [
  { feature: "crawl", label: "Site crawling" },
  { feature: "llm_test", label: "AI provider testing" },
  { feature: "basic_score", label: "Visibility scoring" },
  { feature: "gaps", label: "Gap analysis" },
  { feature: "fixes", label: "Content fixes" },
  { feature: "fix_generate", label: "AI fix generation" },
  { feature: "history", label: "Score history" },
  { feature: "domains", label: "Domain tracking" },
  { feature: "sov", label: "Share of Voice" },
  { feature: "fix_apply", label: "Apply fixes" },
  { feature: "api_access", label: "API access" },
  { feature: "multi_domain", label: "Multi-domain" },
];

export default function SettingsPage() {
  const { identity, user, orgPlan, isGuest, hasFeature, logout } = useAuth();
  const [section, setSection] = useState<Section>("Profile");
  const isAdmin = identity?.role === "admin";

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink">Settings</h1>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Sidebar */}
        <nav className="flex shrink-0 flex-row gap-1 lg:w-52 lg:flex-col">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={
                "rounded-full px-4 py-2 text-left text-sm transition-colors lg:rounded-xl " +
                (section === s
                  ? "bg-mint font-semibold text-pine"
                  : "text-ink-dim hover:text-ink")
              }
            >
              {s}
            </button>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-full px-4 py-2 text-left text-sm text-ink-dim transition-colors hover:text-ink lg:rounded-xl"
            >
              Admin console
              <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-[10px] text-ink-dim">
                ↗
              </span>
            </Link>
          )}
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {section === "Profile" && (
            <ProfileSection
              isGuest={isGuest}
              email={user?.email ?? null}
              name={user?.name ?? null}
              role={identity?.role ?? "—"}
              plan={(orgPlan ?? identity?.plan ?? "guest").toUpperCase()}
              onLogout={() => void logout()}
            />
          )}
          {section === "Plan" && (
            <PlanSection
              plan={(orgPlan ?? identity?.plan ?? "guest").toUpperCase()}
              hasFeature={hasFeature}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ProfileSection({
  isGuest,
  email,
  name,
  role,
  plan,
  onLogout,
}: {
  isGuest: boolean;
  email: string | null;
  name: string | null;
  role: string;
  plan: string;
  onLogout: () => void;
}) {
  if (isGuest) {
    return (
      <GlassCard className="py-14 text-center">
        <p className="text-ink">You&apos;re browsing as a guest.</p>
        <p className="mt-1 text-sm text-ink-dim">
          Create a free account to keep your scans and unlock fixes &amp; history.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine"
        >
          Create free account
        </Link>
      </GlassCard>
    );
  }
  return (
    <GlassCard>
      <p className="font-display text-lg font-semibold text-ink">Profile</p>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProfileField label="Name" value={name ?? "—"} />
        <ProfileField label="Email" value={email ?? "—"} />
        <ProfileField label="Role" value={role} />
        <ProfileField label="Plan" value={plan} />
      </dl>
      <button
        onClick={onLogout}
        className="mt-6 rounded-full border border-line-strong px-5 py-2 text-sm text-ink-dim transition-colors hover:border-signal hover:text-signal"
      >
        Sign out
      </button>
    </GlassCard>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-ink-dim">{label}</dt>
      <dd className="mt-1 truncate text-sm text-ink">{value}</dd>
    </div>
  );
}

function PlanSection({
  plan,
  hasFeature,
}: {
  plan: string;
  hasFeature: (f: string) => boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <GlassCard>
        <div className="flex items-center gap-3">
          <p className="font-display text-lg font-semibold text-ink">Current plan</p>
          <BadgeChip label={plan} tone="mint" />
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PLAN_FEATURES.map(({ feature, label }) => {
            const on = hasFeature(feature);
            return (
              <li
                key={feature}
                className={
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
                  (on ? "border-line text-ink" : "border-line text-ink-dim opacity-60")
                }
              >
                <span className={on ? "text-mint" : "text-ink-dim"}>
                  {on ? "✓" : "–"}
                </span>
                {label}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-ink-dim">
          Plans are managed by your organization admin — there is no self-serve
          billing yet.
        </p>
      </GlassCard>

      <GlassCard>
        <p className="font-display text-lg font-semibold text-ink">API keys</p>
        <p className="mt-2 text-sm text-ink-dim">
          API-key authentication is supported by the backend (PRO), but
          self-serve key management hasn&apos;t shipped yet. Keys are provisioned
          manually for now — contact your admin.
        </p>
      </GlassCard>
    </div>
  );
}

"use client";

// Settings — Profile, Plan & features, API keys (PRO+), and AI Providers (admin).
// Wiring:
//   - identity   → /api/auth/me (auth context)
//   - api keys   → GET/POST/DELETE /api/orgs/{slug}/api-keys
//   - providers  → GET /api/admin/llm-auth/status, POST /api/admin/llm-auth/start/{provider},
//                  DELETE /api/admin/llm-auth/{provider}   (admin only)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/nav/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import BadgeChip from "@/components/ui/BadgeChip";
import ProviderIcon from "@/components/ui/ProviderIcon";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ApiKey, ProviderAuthStatus } from "@/lib/types";

type Section = "profile" | "plan" | "apiKeys" | "providers";

interface SectionDef {
  id: Section;
  label: string;
  glyph: string;
  hint: string;
  adminOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "profile", label: "Profile", glyph: "◎", hint: "account" },
  { id: "plan", label: "Plan & features", glyph: "◇", hint: "tier" },
  { id: "apiKeys", label: "API keys", glyph: "⚿", hint: "programmatic access" },
  {
    id: "providers",
    label: "AI Providers",
    glyph: "✦",
    hint: "connect models",
    adminOnly: true,
  },
];

const PLAN_FEATURES: { feature: string; label: string; hint: string }[] = [
  { feature: "crawl", label: "Site crawling", hint: "discover pages" },
  { feature: "llm_test", label: "AI provider testing", hint: "question runs" },
  { feature: "basic_score", label: "Visibility scoring", hint: "AI coverage %" },
  { feature: "gaps", label: "Gap analysis", hint: "missing content" },
  { feature: "fixes", label: "Content fixes", hint: "suggested edits" },
  { feature: "fix_generate", label: "AI fix generation", hint: "draft fixes" },
  { feature: "history", label: "Score history", hint: "trend over time" },
  { feature: "domains", label: "Domain tracking", hint: "per-site view" },
  { feature: "sov", label: "Share of Voice", hint: "competitor compare" },
  { feature: "fix_apply", label: "Apply fixes", hint: "push updates live" },
  { feature: "api_access", label: "API access", hint: "headless usage" },
  { feature: "multi_domain", label: "Multi-domain", hint: "track many sites" },
];

const PROVIDERS: { id: string; label: string }[] = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "perplexity", label: "Perplexity" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok" },
];

export default function SettingsPage() {
  const {
    identity,
    user,
    orgSlug,
    orgPlan,
    isGuest,
    hasFeature,
    logout,
  } = useAuth();
  const [section, setSection] = useState<Section>("profile");
  const isAdmin = identity?.role === "admin";

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Settings
        </h1>
        <p className="text-xs text-ink-dim">
          {isGuest
            ? "Guest session"
            : user?.email
              ? user.email + " · " + (identity?.role ?? "—")
              : ""}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Dark sidebar card */}
        <aside
          className="shrink-0 rounded-2xl border border-line-strong/70 bg-frame/70 p-3 lg:w-64"
          style={{
            boxShadow: "inset 0 0 0 1px rgba(169,229,197,0.06)",
          }}
        >
          <nav className="flex flex-row gap-1 lg:flex-col">
            {visibleSections.map((s) => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors " +
                    (active
                      ? "bg-mint text-pine"
                      : "text-ink-dim hover:bg-pine-800/60 hover:text-ink")
                  }
                >
                  <span
                    className={
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-sm " +
                      (active
                        ? "bg-pine/20 text-pine"
                        : "bg-pine-800 text-mint")
                    }
                  >
                    {s.glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.label}</p>
                    <p
                      className={
                        "truncate text-[10px] font-mono uppercase tracking-wide " +
                        (active ? "text-pine/70" : "text-ink-dim/70")
                      }
                    >
                      {s.hint}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
          <div className="mt-3 rounded-xl border border-line/60 bg-pine-800/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-dim">
              plan
            </p>
            <div className="mt-1 flex items-center gap-2">
              <BadgeChip
                label={(orgPlan ?? identity?.plan ?? "guest").toUpperCase()}
                tone="mint"
              />
              {isAdmin && (
                <span className="rounded-full border border-mint/40 px-2 py-0.5 text-[10px] text-mint">
                  admin
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {section === "profile" && (
            <ProfileSection
              isGuest={isGuest}
              email={user?.email ?? null}
              name={user?.name ?? null}
              role={identity?.role ?? "—"}
              plan={(orgPlan ?? identity?.plan ?? "guest").toUpperCase()}
              onLogout={() => void logout()}
            />
          )}
          {section === "plan" && (
            <PlanSection
              plan={(orgPlan ?? identity?.plan ?? "guest").toUpperCase()}
              hasFeature={hasFeature}
            />
          )}
          {section === "apiKeys" && (
            <ApiKeysSection
              orgSlug={orgSlug}
              canApi={hasFeature("api_access")}
              isGuest={isGuest}
            />
          )}
          {section === "providers" && isAdmin && <ProvidersSection />}
        </div>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

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
          Create a free account to keep your scans and unlock fixes &amp;
          history.
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

  const initials = (name || email || "?")
    .split(/\s+|@|\./)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  return (
    <GlassCard>
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-mint text-lg font-semibold text-pine"
          style={{ boxShadow: "0 0 24px rgba(169,229,197,0.35)" }}
        >
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold text-ink">
            {name || email || "Account"}
          </p>
          <p className="truncate text-xs text-ink-dim">{email ?? "—"}</p>
        </div>
        <BadgeChip label={plan} tone="mint" />
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      <dd className="mt-1 truncate font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function PlanSection({
  plan,
  hasFeature,
}: {
  plan: string;
  hasFeature: (f: string) => boolean;
}) {
  return (
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="font-display text-lg font-semibold text-ink">
            Current plan
          </p>
          <BadgeChip label={plan} tone="mint" />
        </div>
        <p className="font-mono text-xs text-ink-dim">
          managed by your organization admin
        </p>
      </div>

      <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PLAN_FEATURES.map(({ feature, label, hint }) => {
          const on = hasFeature(feature);
          return (
            <li
              key={feature}
              className={
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors " +
                (on
                  ? "border-mint/40 bg-mint/[0.04] text-ink"
                  : "border-line text-ink-dim opacity-60")
              }
            >
              <span
                className={
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                  (on
                    ? "bg-mint text-pine"
                    : "border border-line text-ink-dim")
                }
              >
                {on ? "✓" : "–"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{label}</p>
                <p className="truncate text-[10px] font-mono uppercase tracking-wide text-ink-dim">
                  {hint}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

function ApiKeysSection({
  orgSlug,
  canApi,
  isGuest,
}: {
  orgSlug: string | null;
  canApi: boolean;
  isGuest: boolean;
}) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<{ name: string; key: string } | null>(
    null
  );
  const [err, setErr] = useState<string | null>(null);

  const base = orgSlug ? "/api/orgs/" + encodeURIComponent(orgSlug) + "/api-keys" : null;

  const load = useCallback(async () => {
    if (!base) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await api.get<{ keys: ApiKey[] }>(base);
      setKeys(d.keys ?? []);
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 403) {
        setErr("Could not load API keys.");
      }
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (canApi && base && !isGuest) void load();
    else setLoading(false);
  }, [canApi, base, isGuest, load]);

  const create = async () => {
    if (!base || !newName.trim()) return;
    setCreating(true);
    try {
      const d = await api.post<{ key: string; name?: string; label?: string }>(
        base,
        { name: newName.trim() }
      );
      setFreshKey({ name: d.name ?? d.label ?? newName.trim(), key: d.key });
      setNewName("");
      await load();
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : "Failed to create API key."
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: number) => {
    if (!base) return;
    try {
      await api.delete(base + "/" + id);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to revoke key.");
    }
  };

  if (isGuest) {
    return (
      <GlassCard className="py-14 text-center">
        <p className="text-ink">Sign in to manage API keys.</p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-pine"
        >
          Sign in
        </Link>
      </GlassCard>
    );
  }

  if (!canApi) {
    return (
      <GlassCard className="py-12 text-center">
        <p className="font-display text-3xl">🔒</p>
        <p className="mt-3 text-ink">API access is a PRO feature.</p>
        <p className="mt-1 text-sm text-ink-dim">
          Upgrade your plan to create programmatic API keys.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-lg font-semibold text-ink">
              API keys
            </p>
            <p className="mt-1 text-xs text-ink-dim">
              Use these keys to call the Nayana API from CI, scripts, or your
              own tools. Keep them secret.
            </p>
          </div>
          <span className="font-mono text-xs text-ink-dim">
            {keys.length} key{keys.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Create */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (e.g. ci-runner)"
            className="min-w-0 flex-1 rounded-full border border-line-strong bg-pine-800 px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-dim/60 focus:border-mint"
          />
          <button
            onClick={() => void create()}
            disabled={creating || !newName.trim()}
            className="rounded-full bg-mint px-5 py-2 text-sm font-semibold text-pine transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </div>

        {/* Just-created key */}
        {freshKey && (
          <div className="mt-4 rounded-xl border border-mint/50 bg-mint/[0.06] p-4">
            <p className="text-xs uppercase tracking-wide text-mint">
              New key — copy now, it won&apos;t be shown again
            </p>
            <p className="mt-1 truncate font-mono text-sm text-ink">
              {freshKey.name}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-line-strong bg-pine-800 px-3 py-2 font-mono text-xs text-mint">
                {freshKey.key}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(freshKey.key);
                }}
                className="rounded-full border border-line-strong px-3 py-2 text-xs text-ink-dim hover:border-mint hover:text-mint"
              >
                Copy
              </button>
              <button
                onClick={() => setFreshKey(null)}
                className="rounded-full border border-line-strong px-3 py-2 text-xs text-ink-dim hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {err && (
          <p className="mt-3 rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-xs text-signal">
            {err}
          </p>
        )}

        {/* Table */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-100 text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-ink-dim">
                <th className="pb-2 pr-4 font-medium">Label</th>
                <th className="pb-2 pr-4 font-medium">Key</th>
                <th className="pb-2 pr-4 font-medium">Created</th>
                <th className="pb-2 pr-4 font-medium">Last used</th>
                <th className="pb-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink-dim">
                    Loading…
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-dim">
                    No API keys yet.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr
                    key={k.id}
                    className="border-t border-line/60 text-ink"
                  >
                    <td className="py-2.5 pr-4 font-medium">{k.name}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-ink-dim">
                      {maskKey(k.prefix)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-ink-dim">
                      {k.created_at ? fmtShort(k.created_at) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-ink-dim">
                      {k.last_used_at ? fmtShort(k.last_used_at) : "never"}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => void revoke(k.id)}
                        className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-dim transition-colors hover:border-signal hover:text-signal"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

function maskKey(prefix: string | null | undefined): string {
  if (!prefix) return "—";
  return prefix + "•".repeat(24);
}

function fmtShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// AI Providers (admin only)
// ---------------------------------------------------------------------------

function ProvidersSection() {
  const [statuses, setStatuses] = useState<Record<string, ProviderAuthStatus>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ providers: Record<string, ProviderAuthStatus> }>(
        "/api/admin/llm-auth/status"
      );
      setStatuses(d.providers ?? {});
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError) setErr(e.message);
      else setErr("Could not load provider status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (provider: string) => {
    setBusy(provider);
    try {
      const d = await api.post<{ url?: string }>(
        "/api/admin/llm-auth/start/" + provider,
        {}
      );
      if (d.url && typeof window !== "undefined") {
        window.open(d.url, "_blank", "noopener,noreferrer");
      }
      // Poll once after a short delay to pick up new status
      setTimeout(() => void load(), 2000);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to start auth flow.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (provider: string) => {
    setBusy(provider);
    try {
      await api.delete("/api/admin/llm-auth/" + provider);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to disconnect.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-display text-lg font-semibold text-ink">
              AI Providers
            </p>
            <span className="rounded-full border border-mint/40 px-2 py-0.5 text-[10px] font-medium text-mint">
              admin
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-dim">
            Connect provider accounts so scans can query them for real answers.
            Sessions are stored securely and shared across your org.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-dim hover:border-mint hover:text-mint"
        >
          Refresh
        </button>
      </div>

      {err && (
        <p className="mt-3 rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-xs text-signal">
          {err}
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-2">
        {PROVIDERS.map((p) => {
          const st = statuses[p.id];
          const authed = st?.authenticated ?? false;
          const sessionOk = st?.session_valid ?? authed;
          const isBusy = busy === p.id;
          const detail =
            st?.detail ||
            (authed
              ? sessionOk
                ? "connected"
                : "session expired — reconnect"
              : "not connected");
          return (
            <li
              key={p.id}
              className={
                "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 transition-colors " +
                (authed && sessionOk
                  ? "border-mint/40 bg-mint/[0.04]"
                  : authed
                    ? "border-amber/40 bg-amber/[0.04]"
                    : "border-line bg-pine-800/30")
              }
            >
              <ProviderIcon provider={p.id} size={28} glow={authed && sessionOk} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{p.label}</p>
                <p className="truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
                  {loading ? "checking…" : detail}
                </p>
              </div>
              <span
                className={
                  "flex h-2 w-2 shrink-0 rounded-full " +
                  (authed && sessionOk
                    ? "bg-mint shadow-[0_0_8px_var(--mint)]"
                    : authed
                      ? "bg-amber shadow-[0_0_8px_var(--amber)]"
                      : "bg-ink/20")
                }
              />
              {authed ? (
                <button
                  onClick={() => void disconnect(p.id)}
                  disabled={isBusy}
                  className="rounded-full border border-line-strong px-4 py-1.5 text-xs text-ink-dim transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
                >
                  {isBusy ? "…" : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={() => void connect(p.id)}
                  disabled={isBusy}
                  className="rounded-full bg-mint px-4 py-1.5 text-xs font-semibold text-pine transition-transform hover:scale-[1.03] disabled:opacity-50"
                >
                  {isBusy ? "Starting…" : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-ink-dim">
        Provider auth flows open in a new tab — return here after signing in.
      </p>
    </GlassCard>
  );
}

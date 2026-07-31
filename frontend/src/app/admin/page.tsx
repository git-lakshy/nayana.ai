"use client";

// Admin console — /admin. In production, admin.<domain> is redirected here by
// the backend (host-based redirect in backend/app/main.py).
// Manages AI provider browser sessions for the whole project:
// GET /api/admin/llm-auth/status · POST /api/admin/llm-auth/start/{provider}
// DELETE /api/admin/llm-auth/{provider} — all endpoints require the ADMIN role,
// so non-admins get a 403 and see the lock card below.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/nav/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import BadgeChip from "@/components/ui/BadgeChip";
import { api, ApiError } from "@/lib/api";

const PROVIDERS = ["chatgpt", "perplexity", "claude", "gemini", "grok"] as const;
const PROVIDER_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
};

interface ProviderStatus {
  authenticated: boolean;
  savedAt?: string | null;
  note?: string;
}

interface LlmAuthStatus {
  puppeteer_installed: boolean;
  browser_ready: boolean;
  providers: Record<string, ProviderStatus>;
}

export default function AdminPage() {
  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">Admin</h1>
        <BadgeChip label="ADMIN CONSOLE" tone="amber" />
      </div>
      <p className="mt-1 text-sm text-ink-dim">
        Project-level configuration. In production this console lives at{" "}
        <span className="font-mono text-ink">admin.&lt;domain&gt;</span>.
      </p>

      <div className="mt-6 max-w-3xl">
        <ProvidersSection />
      </div>
    </AppShell>
  );
}

function ProvidersSection() {
  const [status, setStatus] = useState<LlmAuthStatus | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<LlmAuthStatus>("/api/admin/llm-auth/status");
      setStatus(d);
      setDenied(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        setDenied(true);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (provider: string) => {
    setBusy(provider);
    setMsg("A browser window is opening on the server — log in to " + PROVIDER_LABELS[provider] + " there…");
    try {
      await api.post("/api/admin/llm-auth/start/" + provider + "?timeout=300");
      setMsg(PROVIDER_LABELS[provider] + " session saved ✓");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Login failed or timed out.");
    } finally {
      setBusy(null);
      await load();
    }
  };

  const disconnect = async (provider: string) => {
    setBusy(provider);
    try {
      await api.delete("/api/admin/llm-auth/" + provider);
      setMsg(PROVIDER_LABELS[provider] + " session cleared.");
    } catch {
      setMsg("Could not clear session.");
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (denied) {
    return (
      <GlassCard className="py-14 text-center">
        <p className="font-display text-3xl">🔒</p>
        <p className="mt-3 text-ink">Admin only.</p>
        <p className="mt-1 text-sm text-ink-dim">
          This console is reserved for workspace admins.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-full border border-line-strong px-6 py-2.5 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          Back to dashboard
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-display text-lg font-semibold text-ink">AI Providers</p>
        {status && (
          <BadgeChip
            label={status.browser_ready ? "Browser ready" : "Browser not ready"}
            tone={status.browser_ready ? "mint" : "amber"}
            className="ml-auto"
          />
        )}
      </div>
      <p className="mt-1 text-xs text-ink-dim">
        Connecting opens a real browser window on the server machine (local dev
        only) — log in there and the session is saved for test runs.
      </p>

      {!status ? (
        <p className="py-8 text-center text-sm text-ink-dim">Loading provider status…</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {PROVIDERS.map((p) => {
            const st = status.providers?.[p];
            const authed = st?.authenticated ?? false;
            const optional = p === "chatgpt" || p === "perplexity";
            return (
              <li
                key={p}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3"
              >
                <span
                  className={
                    "inline-block h-2 w-2 rounded-full " +
                    (authed ? "bg-mint" : optional ? "bg-sage" : "bg-amber")
                  }
                />
                <span className="font-medium text-ink">{PROVIDER_LABELS[p]}</span>
                <span className="text-xs text-ink-dim">
                  {authed
                    ? st?.savedAt
                      ? "Session saved " + new Date(st.savedAt).toLocaleString()
                      : "Works without login"
                    : optional
                      ? "Works without login — connect for higher limits"
                      : "Login required"}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {authed && st?.savedAt ? (
                    <button
                      onClick={() => void disconnect(p)}
                      disabled={busy !== null}
                      className="rounded-full border border-line-strong px-4 py-1.5 text-xs text-ink-dim transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => void connect(p)}
                      disabled={busy !== null}
                      className="rounded-full bg-mint px-4 py-1.5 text-xs font-semibold text-pine transition-transform hover:scale-[1.03] disabled:opacity-50"
                    >
                      {busy === p ? "Waiting for login…" : "Connect"}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {msg && (
        <p className="mt-4 rounded-xl border border-line bg-[#060d0a] px-4 py-3 font-mono text-xs text-mint">
          {msg}
        </p>
      )}
    </GlassCard>
  );
}

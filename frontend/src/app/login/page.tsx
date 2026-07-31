"use client";

// Sign in / Create account — glass card floating in a soft mint glow bloom,
// ASCII dune silhouette along the bottom, dark filled pill inputs, and the
// "Try as Guest — 5 free scans" ghost button. Matches the Phase-1 wireframe.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Logo from "@/components/ui/Logo";
import AsciiDune from "@/components/bg/AsciiDune";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

type Mode = "signin" | "register";

const INPUT_CLS =
  "rounded-full border border-line bg-[#060d0a]/70 px-5 py-3 text-sm text-ink outline-none transition-all placeholder:text-ink-dim/50 focus:border-mint focus:shadow-[0_0_0_3px_rgba(169,229,197,0.15)]";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError("Invalid email or password.");
        } else if (err.status === 409) {
          setError("An account with this email already exists.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Is the backend running?");
      }
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuest = () => {
    // No call needed — the first API hit sets the nayana_guest cookie.
    router.push("/dashboard");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-pine px-4">
      {/* Mint glow bloom behind the card */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(169,229,197,0.20), rgba(169,229,197,0.06) 55%, transparent 75%)",
        }}
      />
      <AsciiDune opacity={0.5} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-strong relative z-10 w-full max-w-sm p-8"
      >
        <div className="mb-8 flex justify-center">
          <Logo size={30} />
        </div>

        {/* Tabs */}
        <div className="mb-6 grid grid-cols-2 text-center text-sm font-medium">
          {(
            [
              ["signin", "Sign in"],
              ["register", "Create account"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`border-b-2 pb-2 transition-colors ${
                mode === m
                  ? "border-mint text-ink"
                  : "border-transparent text-ink-dim hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "register" && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink-dim">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={INPUT_CLS}
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-dim">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={INPUT_CLS}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-dim">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={INPUT_CLS}
            />
          </label>

          {error && (
            <p className="rounded-xl border border-signal/40 bg-signal/10 px-4 py-2 text-sm text-signal">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-full bg-ink py-3 font-semibold text-pine transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-dim">
          or continue as guest — 5 free scans
        </p>
        <button
          onClick={continueAsGuest}
          className="mt-3 w-full rounded-full border border-mint/60 py-2.5 text-sm font-medium text-mint transition-colors hover:bg-mint/10"
        >
          Try as Guest
        </button>
      </motion.div>
    </main>
  );
}

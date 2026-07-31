"use client";

// Glass pill navigation bar — logo left, animated pill nav centre, avatar / CTA right.
// Active item uses a framer-motion layoutId so the mint pill slides between
// items instead of hard-cutting.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Logo from "../ui/Logo";
import { useAuth } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
}

interface PillNavProps {
  items: NavItem[];
}

export default function PillNav({ items }: PillNavProps) {
  const pathname = usePathname();
  const { isAuthenticated, isGuest, user, logout } = useAuth();

  return (
    <header className="sticky top-3 z-50 mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 sm:top-4 sm:gap-4 sm:px-4">
      <Link href="/dashboard" aria-label="nayana.ai home">
        <Logo />
      </Link>

      <nav className="glass flex items-center gap-0.5 rounded-full px-1.5 py-1 sm:gap-1 sm:px-2 sm:py-1.5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`relative rounded-full px-3 py-1 text-xs transition-colors sm:px-4 sm:py-1.5 sm:text-sm ${
                active
                  ? "font-semibold text-pine"
                  : "text-ink-dim hover:text-ink"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="pill-nav-active"
                  className="absolute inset-0 -z-0 rounded-full bg-mint"
                  style={{ boxShadow: "0 0 22px rgba(169,229,197,0.35)" }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32,
                    mass: 0.6,
                  }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <button
            onClick={() => void logout()}
            title={user?.email ?? "Sign out"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-pine-800 font-display text-sm font-semibold text-mint transition-colors hover:border-mint"
          >
            {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
          </button>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-pine transition-transform hover:scale-[1.03]"
          >
            {isGuest ? "Sign in" : "Sign in"}
          </Link>
        )}
      </div>
    </header>
  );
}

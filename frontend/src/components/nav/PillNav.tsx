"use client";

// Glass pill navigation bar — logo left, pill nav centre, avatar / CTA right.

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    <header className="sticky top-4 z-50 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4">
      <Link href="/dashboard" aria-label="nayana.ai home">
        <Logo />
      </Link>

      <nav className="glass hidden items-center gap-1 rounded-full px-2 py-1.5 sm:flex">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-mint font-semibold text-pine"
                  : "text-ink-dim hover:text-ink"
              }`}
            >
              {item.label}
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

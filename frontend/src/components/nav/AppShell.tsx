"use client";

// Authenticated app chrome: PillNav + centered content container on dark pine.

import PillNav from "./PillNav";

const ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/domains", label: "Domains" },
  { href: "/settings", label: "Settings" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-pine text-ink">
      <div className="pt-4">
        <PillNav items={ITEMS} />
      </div>
      <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-24">{children}</main>
    </div>
  );
}

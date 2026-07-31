"use client";

// Authenticated app chrome: PillNav + content container on dark pine.
// When `fullBleed` is true, children render edge-to-edge so pages can supply
// their own dark hero band (e.g. Scan Report ASCII-rain header).
//
// Route transitions are handled here (not in a top-level template.tsx) so
// the shell, backgrounds, and PillNav layoutId animation stay mounted — only
// the page content fades between routes. Opacity-only, no blur or big translate.

import PillNav from "./PillNav";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/domains", label: "Domains" },
  { href: "/settings", label: "Settings" },
];

export default function AppShell({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const initial = reduce ? { opacity: 1 } : { opacity: 0, y: 4 };
  const animate = { opacity: 1, y: 0 };
  const exit = reduce ? { opacity: 1 } : { opacity: 0, y: -3 };

  return (
    <div className="min-h-screen bg-pine text-ink">
      <div className="pt-4">
        <PillNav items={ITEMS} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={initial}
          animate={animate}
          exit={exit}
          transition={{ duration: 0.22, ease: [0.22, 0.9, 0.28, 1] }}
        >
          {fullBleed ? (
            <main className="w-full pt-6 pb-24">{children}</main>
          ) : (
            <main className="mx-auto w-full max-w-6xl px-3 pt-6 pb-24 sm:px-4 sm:pt-10">
              {children}
            </main>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

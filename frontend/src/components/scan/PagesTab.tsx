"use client";

// Pages tab — crawled pages table (URL, title, type, chunks) with an
// expandable chunk drilldown per page.

import { useEffect, useState } from "react";
import BadgeChip from "@/components/ui/BadgeChip";
import { api } from "@/lib/api";
import type { ChunkRow, PageRow, Scan } from "@/lib/types";

export default function PagesTab({ scan }: { scan: Scan }) {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<Record<number, ChunkRow[]>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ pages: PageRow[] }>("/api/scans/" + scan.id + "/pages?limit=500")
      .then((d) => {
        if (!cancelled) setPages(d.pages ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scan.id]);

  const toggle = async (pageId: number) => {
    if (openId === pageId) {
      setOpenId(null);
      return;
    }
    setOpenId(pageId);
    if (chunks[pageId]) return;
    try {
      const d = await api.get<{ chunks: ChunkRow[] }>(
        "/api/scans/" + scan.id + "/chunks?page_id=" + pageId + "&limit=100"
      );
      setChunks((prev) => ({ ...prev, [pageId]: d.chunks ?? [] }));
    } catch {
      setChunks((prev) => ({ ...prev, [pageId]: [] }));
    }
  };

  const pathOf = (url: string) => {
    try {
      const u = new URL(url);
      return u.pathname === "/" ? "/" : u.pathname;
    } catch {
      return url;
    }
  };

  return (
    <section className="paper overflow-hidden">
      <h2 className="px-6 pt-5 pb-3 font-display text-lg font-semibold text-pine">
        Crawled Pages ({pages.length})
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-pine">
          <thead>
            <tr className="border-b border-pine/10 text-xs uppercase tracking-wide text-pine/50">
              <th className="px-6 py-2 font-medium">Path</th>
              <th className="px-6 py-2 font-medium">Title</th>
              <th className="px-6 py-2 font-medium">Type</th>
              <th className="px-6 py-2 font-medium">Words</th>
              <th className="px-6 py-2 font-medium">Chunks</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-pine/40">
                  Loading pages…
                </td>
              </tr>
            ) : pages.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-pine/40">
                  No pages crawled in this scan.
                </td>
              </tr>
            ) : (
              pages.map((page) => (
                <PageRowView
                  key={page.id}
                  page={page}
                  open={openId === page.id}
                  chunks={chunks[page.id]}
                  onToggle={() => void toggle(page.id)}
                  pathOf={pathOf}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PageRowView({
  page,
  open,
  chunks,
  onToggle,
  pathOf,
}: {
  page: PageRow;
  open: boolean;
  chunks?: ChunkRow[];
  onToggle: () => void;
  pathOf: (url: string) => string;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-pine/5 transition-colors hover:bg-pine/5"
      >
        <td className="max-w-56 truncate px-6 py-3 font-mono text-xs">
          {pathOf(page.url)}
        </td>
        <td className="max-w-64 truncate px-6 py-3">{page.title ?? "—"}</td>
        <td className="px-6 py-3">
          <BadgeChip label={page.page_type} tone="sage" />
        </td>
        <td className="px-6 py-3 font-mono">{page.word_count ?? 0}</td>
        <td className="px-6 py-3 font-mono">{page.chunk_count ?? "—"}</td>
        <td className="px-6 py-3 text-right text-pine/40">{open ? "⌃" : "›"}</td>
      </tr>
      {open && (
        <tr className="border-b border-pine/5 bg-pine/[0.03]">
          <td colSpan={6} className="px-6 py-4">
            {chunks === undefined ? (
              <p className="text-xs text-pine/50">Loading chunks…</p>
            ) : chunks.length === 0 ? (
              <p className="text-xs text-pine/50">No chunks stored for this page.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {chunks.map((c) => (
                  <div key={c.id} className="rounded-lg border border-pine/10 bg-white/60 p-3">
                    <p className="font-mono text-xs font-semibold text-pine">
                      {c.heading || "(no heading)"}
                      <span className="ml-2 font-normal text-pine/50">{c.word_count ?? 0}w</span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-pine/70">{c.preview ?? ""}</p>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

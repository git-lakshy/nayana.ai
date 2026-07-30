"use client";

// Test Lab — provider chips, Run Test, terminal progress panel, and the
// question × provider score matrix with expandable answer rows.

import { useCallback, useEffect, useState } from "react";
import GlassCard from "@/components/ui/GlassCard";
import TerminalPanel from "@/components/ui/TerminalPanel";
import ScorePill from "@/components/ui/ScorePill";
import BadgeChip from "@/components/ui/BadgeChip";
import { api } from "@/lib/api";
import type { Answer, Question, Scan, TestRunResult } from "@/lib/types";
import { hostOf } from "@/components/dashboard/RecentScans";

const PROVIDERS = ["chatgpt", "perplexity", "claude", "gemini", "grok"];
const LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
};

export default function TestLabTab({ scan }: { scan: Scan }) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [openQ, setOpenQ] = useState<number | null>(null);

  const loadResults = useCallback(async () => {
    try {
      const qs = await api.get<{ questions: Question[] }>(
        "/api/test/" + scan.id + "/questions"
      );
      setQuestions(qs.questions ?? []);
      const as = await api.get<{ answers: Answer[] }>(
        "/api/test/" + scan.id + "/answers?limit=500"
      );
      setAnswers(as.answers ?? []);
    } catch {
      // No test data yet.
    }
  }, [scan.id]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const runTest = async () => {
    if (running) return;
    setRunning(true);
    const domain = hostOf(scan.root_url);
    setLines([
      "> run test — scan #" + scan.id,
      "> brand: " + domain,
      "> asking providers (this can take a minute)…",
    ]);
    try {
      const res = await api.post<TestRunResult>("/api/test/run", {
        scan_id: scan.id,
        brand: domain,
        domain,
        competitors: [],
      });
      setLines((prev) => [
        ...prev,
        "> providers: " + (res.providers ?? []).join(", "),
        "> questions generated: " + res.questions_generated,
        "> answers generated: " + res.answers_generated,
        ...(res.errors ?? []).map((e) => "> error: " + e),
        "> done — status: " + res.status,
      ]);
      await loadResults();
    } catch {
      setLines((prev) => [...prev, "> run failed — check provider keys / backend"]);
    } finally {
      setRunning(false);
    }
  };

  // answers indexed by question -> provider
  const byQuestion = new Map<number, Map<string, Answer>>();
  for (const a of answers) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, new Map());
    byQuestion.get(a.question_id)!.set(a.provider, a);
  }

  const activeProviders = new Set(answers.map((a) => a.provider));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Test Lab — {hostOf(scan.root_url)}
        </h2>
        <button
          onClick={() => void runTest()}
          disabled={running}
          className="glow-mint rounded-full bg-ink px-6 py-3 font-semibold text-pine transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          {running ? "Running…" : "Run Test"}
        </button>
      </div>

      {/* Provider chips */}
      <div className="flex flex-wrap gap-3">
        {PROVIDERS.map((p) => {
          const active = activeProviders.has(p);
          return (
            <div
              key={p}
              className="glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
            >
              <span
                className={
                  "h-2 w-2 rounded-full " + (active ? "bg-mint" : "bg-ink/25")
                }
              />
              <span className="text-ink">{LABELS[p]}</span>
              <span className="text-xs text-ink-dim">
                {active ? "Active" : "Inactive"}
              </span>
            </div>
          );
        })}
      </div>

      <TerminalPanel lines={lines} />

      {/* Score matrix */}
      <section className="paper overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-pine">
            <thead>
              <tr className="border-b border-pine/10 text-xs uppercase tracking-wide text-pine/50">
                <th className="px-6 py-3 font-medium">Question</th>
                {PROVIDERS.map((p) => (
                  <th key={p} className="px-4 py-3 text-center font-medium">
                    {LABELS[p]}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {questions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-pine/40">
                    No test data yet — hit Run Test.
                  </td>
                </tr>
              ) : (
                questions.map((q) => {
                  const row = byQuestion.get(q.id);
                  const open = openQ === q.id;
                  return (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      row={row}
                      open={open}
                      onToggle={() => setOpenQ(open ? null : q.id)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function QuestionRow({
  q,
  row,
  open,
  onToggle,
}: {
  q: Question;
  row?: Map<string, Answer>;
  open: boolean;
  onToggle: () => void;
}) {
  const firstAnswer = row ? Array.from(row.values()).find((a) => a.answer_text) : undefined;
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-pine/5 transition-colors hover:bg-pine/5"
      >
        <td className="max-w-64 px-6 py-3 font-medium">{q.question}</td>
        {PROVIDERS.map((p) => {
          const a = row?.get(p);
          const score =
            a && !a.error && a.confidence !== null && a.confidence !== undefined
              ? a.confidence * 10
              : null;
          return (
            <td key={p} className="px-4 py-3 text-center">
              <ScorePill score={score} size="sm" />
            </td>
          );
        })}
        <td className="px-4 py-3 text-right text-pine/40">{open ? "⌃" : "›"}</td>
      </tr>
      {open && (
        <tr className="border-b border-pine/5 bg-pine/[0.03]">
          <td colSpan={7} className="px-6 py-4">
            {firstAnswer ? (
              <>
                <p className="text-sm text-pine/80">{firstAnswer.answer_text}</p>
                <div className="mt-2 flex gap-2">
                  <span className="text-xs text-pine/50">
                    Source: {firstAnswer.provider}
                  </span>
                  {firstAnswer.has_domain_citation ? (
                    <BadgeChip label="cited: your domain" tone="mint" />
                  ) : (
                    <BadgeChip label="no citation" tone="dim" />
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-pine/50">No answer captured.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

"use client";
import { HeartPulse, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { humanDate } from "./format";
import { SeanceProgress } from "./SeanceProgress";
import { NumberTicker } from "./ui/NumberTicker";
import { RunLivePanel } from "./ui/RunLivePanel";
import { useNdjsonStream } from "./useNdjsonStream";

// Local structural types: client components must not import from lib/.
export type TestSuiteLabel = "available" | "not available" | "adapted from upstream";
export interface RebirthReportData {
  package: string;
  generatedAt: string;
  source: "live" | "stored";
  seed: number;
  n: number;
  partial: boolean;
  score: { matched: number; scored: number; total: number; excluded: number; mismatches: number };
  scoreText: string;
  intentionalDifferences: { id: string; reason: string; advisory: string; covered: number }[];
  mismatchSamples: { evidenceId: string; summary: string }[];
  vulnerabilitiesRemoved: { advisory: string; basis: string }[];
  originalTestSuite: { label: TestSuiteLabel; detail: string; passed?: number; total?: number };
}
type Score = { matched: number; scored: number; total: number; excluded: number; mismatches: number };

interface LiveSample {
  index: number;
  reasons?: string[];
  original?: { outcome?: { kind?: string } };
  rebuild?: { outcome?: { kind?: string } };
}
type DiffLine =
  | { type: "start"; seed: number; n: number }
  | { type: "progress"; done: number; matched: number; intentional: number; mismatched: number }
  | { type: "mismatch"; sample: LiveSample }
  | {
      type: "end";
      summary: { matched: number; scored: number; total: number; intentional: number; mismatches: number; scoreText: string };
      partial: boolean;
    }
  | { type: "error"; message: string };

function describe(s: LiveSample): string {
  const reasons = s.reasons && s.reasons.length ? s.reasons.join(", ") : "unspecified";
  return `input #${s.index}: original ${s.original?.outcome?.kind ?? "unknown"}, rebuild ${s.rebuild?.outcome?.kind ?? "unknown"} (${reasons})`;
}

/** Ring showing matched / scored, with excluded inputs as a separate arc. Text carries the same numbers. */
function ScoreRing({ score }: { score: Score }) {
  const reduce = useReducedMotion();
  const total = Math.max(1, score.total);
  const r = 52;
  const c = 2 * Math.PI * r;
  const matched = score.matched / total;
  const excluded = score.excluded / total;
  const mismatched = score.mismatches / total;
  const arc = (frac: number) => `${frac * c} ${c}`;
  const pctText = score.scored > 0 ? ((score.matched / score.scored) * 100).toFixed(1) : "0.0";
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`${score.matched} of ${score.scored} scored inputs matched; ${score.excluded} excluded on purpose; ${score.mismatches} mismatches`}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#221f30" strokeWidth="10" />
          <motion.circle
            cx="60" cy="60" r={r} fill="none" stroke="#7be0a4" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={arc(matched)}
            initial={reduce ? false : { strokeDasharray: arc(0) }}
            whileInView={{ strokeDasharray: arc(matched) }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          />
          {excluded > 0 && (
            <motion.circle
              cx="60" cy="60" r={r} fill="none" stroke="#b79cff" strokeWidth="10"
              strokeDasharray={arc(excluded)}
              strokeDashoffset={-matched * c}
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 1.2 }}
            />
          )}
          {mismatched > 0 && (
            <circle cx="60" cy="60" r={r} fill="none" stroke="#ff7a7a" strokeWidth="10" strokeDasharray={arc(mismatched)} strokeDashoffset={-(matched + excluded) * c} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl text-ectoplasm">{pctText}%</span>
          <span className="text-xs text-ash">of scored inputs</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm" aria-label="Score legend">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-ectoplasm" />
          <span className="text-bone">
            <NumberTicker value={score.matched} /> matched
          </span>
          <span className="text-ash">same result in both</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-wisp" />
          <span className="text-bone">{score.excluded.toLocaleString("en-US")} excluded</span>
          <span className="text-ash">deliberate fixes, listed below</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-blood" />
          <span className="text-bone">{score.mismatches.toLocaleString("en-US")} mismatched</span>
          <span className="text-ash">unexplained differences</span>
        </li>
      </ul>
    </div>
  );
}

export function RebirthReportView({
  report,
  scoreText,
  partial,
  samples,
  score,
}: {
  report: RebirthReportData | null;
  scoreText: string;
  partial: boolean;
  samples: { key: string; summary: string }[];
  score?: Score;
}) {
  const s = score ?? report?.score;
  const diffs = report?.intentionalDifferences ?? [];
  const removed = report?.vulnerabilitiesRemoved ?? [];
  return (
    <>
      <div className="card p-6">
        <p className="mb-4 font-display text-2xl text-bone">
          {scoreText}
          {partial && <span className="ml-2 rounded-full border border-candle/40 px-2 py-0.5 align-middle font-sans text-sm text-candle">partial result</span>}
        </p>
        {s && <ScoreRing score={s} />}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="flex items-center gap-2 font-sans text-base font-semibold text-bone">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-wisp" /> Intentional differences
          </h3>
          <p className="mt-1 text-xs text-ash">Behavior changed on purpose, each tied to a published advisory, and left out of the score.</p>
          {diffs.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm" aria-label="Intentional differences">
              {diffs.map((d) => (
                <li key={d.id} className="rounded-xl border border-wisp/30 bg-crypt p-3">
                  <strong className="font-mono text-xs text-wisp">{d.id}</strong>
                  <p className="mt-1 text-bone">{d.reason}</p>
                  <p className="mt-1 text-xs text-ash">
                    advisory {d.advisory}, {d.covered} inputs excluded from the score
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ash">None recorded.</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-sans text-base font-semibold text-bone">Mismatches</h3>
          <p className="mt-1 text-xs text-ash">Inputs where the rebuild did something different and no rule explains why.</p>
          {samples.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-blood" aria-label="Mismatches">
              {samples.map((m) => (
                <li key={m.key}>{m.summary}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ectoplasm">No mismatches sampled.</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-sans text-base font-semibold text-bone">Vulnerabilities removed</h3>
          <p className="mt-1 text-xs text-ash">Listed only when the original showed the vulnerable behavior and the rebuild did not.</p>
          {removed.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm" aria-label="Vulnerabilities removed">
              {removed.map((v) => (
                <li key={v.advisory}>
                  <span className="font-semibold text-ectoplasm">{v.advisory}</span>: {v.basis}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ash">None recorded.</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-sans text-base font-semibold text-bone">Original test suite</h3>
          <p className="mt-1 text-xs text-ash">The tests that shipped with the original package, run against the rebuild.</p>
          {report?.originalTestSuite ? (
            <p className="mt-3 text-sm">
              <span className="rounded-full border border-candle/40 px-2 py-0.5 text-candle">{report.originalTestSuite.label}</span>{" "}
              {report.originalTestSuite.detail}
              {typeof report.originalTestSuite.passed === "number" && typeof report.originalTestSuite.total === "number"
                ? ` (${report.originalTestSuite.passed} / ${report.originalTestSuite.total} passed)`
                : ""}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ash">Not recorded.</p>
          )}
        </div>
      </div>
    </>
  );
}

export function RebirthReport({
  name,
  report,
  resurrected,
}: {
  name: string;
  report: RebirthReportData | null;
  resurrected: boolean;
}) {
  const stream = useNdjsonStream<DiffLine>();
  const start = stream.events.find((e) => e.type === "start");
  const lastProgress = [...stream.events].reverse().find((e) => e.type === "progress");
  const end = stream.events.find((e) => e.type === "end");
  const streamError = stream.events.find((e) => e.type === "error");
  const total = start?.type === "start" ? start.n : 0;
  const done = end?.type === "end" ? end.summary.total : lastProgress?.type === "progress" ? lastProgress.done : 0;
  const liveSamples = stream.events.flatMap((e, i) =>
    e.type === "mismatch" ? [{ key: `live-${i}`, summary: describe(e.sample) }] : [],
  );
  const hasLive = stream.running || stream.events.length > 0;
  const showLiveResult = end?.type === "end";
  const httpNotResurrected = stream.error === "HTTP 409";
  const notRebuilt = !resurrected || httpNotResurrected;

  return (
    <div>
      {notRebuilt && (
        <div className="rounded-2xl border border-candle/40 bg-tomb p-6" id="rebirth-not-rebuilt">
          <p className="flex items-center gap-2 font-semibold text-candle">
            <HeartPulse aria-hidden="true" className="h-5 w-5" /> Not rebuilt yet, so there is nothing to compare
          </p>
          <p className="mt-2 text-sm leading-relaxed text-bone">
            A Rebirth Report compares the original with a rebuild on the same inputs. Nobody has rebuilt {name} yet. To see a
            finished report, open <a href="/package/lodash.set#rebirth-report">lodash.set</a>. To make one for this package,
            download its spec bundle, rebuild it in Kiro, then run <code className="font-mono text-xs">npm run resurrect -- {name}</code>.
          </p>
        </div>
      )}

      {!notRebuilt &&
        (showLiveResult && end.type === "end" ? (
          <>
            <p className="mb-3 flex items-center gap-2 text-sm text-ash">
              <span className="rounded-full border border-ectoplasm/40 px-2.5 py-0.5 text-xs font-semibold text-ectoplasm">live</span>
              {end.partial ? "The time budget expired, so these are partial results." : "Fresh comparison on newly generated inputs."}
            </p>
            <RebirthReportView
              report={report}
              scoreText={end.summary.scoreText}
              partial={end.partial}
              samples={liveSamples}
              score={{
                matched: end.summary.matched,
                scored: end.summary.scored,
                total: end.summary.total,
                excluded: end.summary.intentional,
                mismatches: end.summary.mismatches,
              }}
            />
          </>
        ) : report ? (
          <>
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ash">
              <span className="rounded-full border border-candle/40 px-2.5 py-0.5 text-xs font-semibold text-candle">stored</span>
              Compared <time dateTime={report.generatedAt}>{humanDate(report.generatedAt, new Date(report.generatedAt)).text}</time> · seed{" "}
              {report.seed} · {report.n.toLocaleString("en-US")} inputs
            </p>
            <RebirthReportView
              report={report}
              scoreText={report.scoreText}
              partial={report.partial}
              samples={(report.mismatchSamples ?? []).map((m) => ({ key: m.evidenceId + m.summary, summary: `${m.evidenceId}: ${m.summary}` }))}
            />
          </>
        ) : (
          !hasLive && <p className="text-candle">No stored report for this package. Use Compare again.</p>
        ))}

      <RunLivePanel
        id="diff-live-desc"
        copy={{
          title: "Compare again, live",
          what: "The original and the rebuild run side by side in the sandbox on the same freshly generated inputs.",
          takes: "Up to 60 seconds. If time runs out, you get a result marked “partial”.",
          changesNothing: "The stored report stays as it is.",
        }}
        action={
          <button
            type="button"
            disabled={stream.running || !resurrected}
            aria-describedby={resurrected ? "diff-live-desc" : "diff-live-desc rebirth-not-rebuilt"}
            onClick={() => void stream.start(`/api/diff/${encodeURIComponent(name)}`, { method: "POST" })}
            className="btn-outline"
          >
            {stream.running ? "Comparing…" : "Compare again"}
          </button>
        }
      >
        {hasLive && !showLiveResult && (
          <div>
            <SeanceProgress done={done} total={total} label="Differential run" />
            {lastProgress?.type === "progress" && (
              <p className="mt-1 text-sm text-ash">
                {lastProgress.matched} matched, {lastProgress.intentional} intentional, {lastProgress.mismatched} mismatched so far
              </p>
            )}
            {liveSamples.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm" aria-label="Mismatches so far">
                {liveSamples.map((s) => (
                  <li key={s.key}>{s.summary}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {stream.error && !httpNotResurrected && (
          <p className="text-sm text-candle">Live run failed: {stream.error}. Showing the stored report. Nothing was changed.</p>
        )}
        {streamError?.type === "error" && (
          <p className="text-sm text-candle">Live run failed: {streamError.message}. Showing the stored report. Nothing was changed.</p>
        )}
      </RunLivePanel>
    </div>
  );
}

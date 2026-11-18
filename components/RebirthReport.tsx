"use client";
import { SeanceProgress } from "./SeanceProgress";
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

const headingFont = { fontFamily: "var(--font-display), Georgia, serif" } as const;

function describe(s: LiveSample): string {
  const reasons = s.reasons && s.reasons.length ? s.reasons.join(", ") : "unspecified";
  return `input #${s.index}: original ${s.original?.outcome?.kind ?? "unknown"}, rebuild ${s.rebuild?.outcome?.kind ?? "unknown"} (${reasons})`;
}

export function RebirthReportView({
  report,
  scoreText,
  partial,
  samples,
}: {
  report: RebirthReportData | null;
  scoreText: string;
  partial: boolean;
  samples: { key: string; summary: string }[];
}) {
  return (
    <>
      <p className="mb-3 text-lg">
        {scoreText}
        {partial && <span className="ml-2 rounded border border-mist px-2 py-0.5 text-sm text-candle">partial result</span>}
      </p>
      <h3 className="mb-1 mt-4 text-bone">Intentional differences</h3>
      {report && report.intentionalDifferences.length > 0 ? (
        <ul className="space-y-1 text-sm" aria-label="Intentional differences">
          {report.intentionalDifferences.map((d) => (
            <li key={d.id}>
              <strong>{d.id}</strong>: {d.reason} (advisory {d.advisory}, {d.covered} inputs excluded from the score)
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ash">None recorded.</p>
      )}
      <h3 className="mb-1 mt-4 text-bone">Mismatches</h3>
      {samples.length > 0 ? (
        <ul className="space-y-1 text-sm" aria-label="Mismatches">
          {samples.map((m) => (
            <li key={m.key}>{m.summary}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ash">No mismatches sampled.</p>
      )}
      <h3 className="mb-1 mt-4 text-bone">Vulnerabilities removed</h3>
      {report && report.vulnerabilitiesRemoved.length > 0 ? (
        <ul className="space-y-1 text-sm" aria-label="Vulnerabilities removed">
          {report.vulnerabilitiesRemoved.map((v) => (
            <li key={v.advisory}>
              {v.advisory}: {v.basis}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ash">None recorded.</p>
      )}
      <h3 className="mb-1 mt-4 text-bone">Original test suite</h3>
      {report ? (
        <p className="text-sm">
          <span className="rounded border border-mist px-2 py-0.5 text-candle">{report.originalTestSuite.label}</span>{" "}
          {report.originalTestSuite.detail}
          {typeof report.originalTestSuite.passed === "number" && typeof report.originalTestSuite.total === "number"
            ? ` (${report.originalTestSuite.passed} / ${report.originalTestSuite.total} passed)`
            : ""}
        </p>
      ) : (
        <p className="text-sm text-ash">Not recorded.</p>
      )}
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

  const notResurrected = !resurrected && !report;
  const httpNotResurrected = stream.error === "HTTP 409";

  return (
    <section id="rebirth-report" aria-labelledby="rebirth-heading" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="rebirth-heading" className="text-2xl text-bone" style={headingFont}>
          Rebirth Report
        </h2>
        <button
          type="button"
          disabled={stream.running || !resurrected}
          onClick={() => void stream.start(`/api/diff/${encodeURIComponent(name)}`, { method: "POST" })}
          className="rounded border border-pumpkin px-3 py-1 text-sm text-pumpkin disabled:opacity-60"
        >
          {stream.running ? "Running…" : "Run live"}
        </button>
      </div>
      <div className="rounded-md border border-mist bg-tomb p-5" aria-live="polite">
        {!resurrected && <p className="mb-3 text-candle">not resurrected</p>}
        {httpNotResurrected && <p className="mb-3 text-candle">not resurrected</p>}
        {stream.error && !httpNotResurrected && (
          <p className="mb-3 text-sm text-candle">Live run failed: {stream.error}. Showing the stored report.</p>
        )}
        {streamError?.type === "error" && (
          <p className="mb-3 text-sm text-candle">Live run failed: {streamError.message}. Showing the stored report.</p>
        )}
        {hasLive && !showLiveResult && (
          <div className="mb-4">
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
        {showLiveResult && end.type === "end" ? (
          <>
            <p className="mb-3 text-sm text-ash">
              <span className="rounded border border-mist px-2 py-0.5 text-candle">live</span>
              {end.partial && " The time budget expired, so these are partial results."}
            </p>
            <RebirthReportView report={report} scoreText={end.summary.scoreText} partial={end.partial} samples={liveSamples} />
          </>
        ) : report ? (
          <>
            <p className="mb-3 text-sm text-ash">
              <span className="rounded border border-mist px-2 py-0.5 text-candle">stored</span> generated at{" "}
              <time dateTime={report.generatedAt}>{report.generatedAt}</time> · seed {report.seed} · n {report.n}
            </p>
            <RebirthReportView
              report={report}
              scoreText={report.scoreText}
              partial={report.partial}
              samples={report.mismatchSamples.map((m) => ({ key: m.evidenceId + m.summary, summary: `${m.evidenceId}: ${m.summary}` }))}
            />
          </>
        ) : (
          !notResurrected && !hasLive && <p className="text-candle">No stored report for this package. Use Run live.</p>
        )}
      </div>
    </section>
  );
}

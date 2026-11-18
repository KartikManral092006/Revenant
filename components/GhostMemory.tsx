"use client";
import { useState } from "react";
import { EvidenceTable, type EvidenceRow } from "./EvidenceTable";
import { SeanceProgress } from "./SeanceProgress";
import { useNdjsonStream } from "./useNdjsonStream";

// Local structural types: client components must not import from lib/.
export interface CoverageData {
  measuredAt: string;
  exportedFunctions: { exercised: number; total: number; percent?: number };
  branches: { covered: number; total: number; percent?: number } | null;
}
export interface GhostMemoryData {
  generatedAt: string;
  seed: number;
  n: number;
  stats: { total: number; timeouts: number; threw: number; returned: number; pollution: number };
  rows: EvidenceRow[];
}
interface LiveEvent {
  type: string;
  done?: number;
  total?: number;
  export?: string;
  partial?: boolean;
  message?: string;
  coverageNote?: string;
  recording?: { generatedAt: string; stats: GhostMemoryData["stats"]; evidence: LiveEvidence[] };
}
interface LiveEvidence {
  id: string;
  export: string;
  count: number;
  classId: string;
  outcome: { kind: string; error?: { name?: string } };
}

const headingFont = { fontFamily: "var(--font-display), Georgia, serif" } as const;
const pct = (n: number, d: number, p?: number) => (p ?? (d > 0 ? (n / d) * 100 : 0)).toFixed(1);

function outcomeLabel(o: LiveEvidence["outcome"]): string {
  return o.kind === "threw" && o.error?.name ? `threw ${o.error.name}` : o.kind;
}

export function CoverageFigure({ coverage }: { coverage: CoverageData | null }) {
  if (!coverage) return <p className="text-candle">Coverage unavailable: no stored offline measurement for this package.</p>;
  const f = coverage.exportedFunctions;
  const b = coverage.branches;
  return (
    <div className="text-sm">
      <p className="text-ash">
        coverage from the stored recording, measured offline on <time dateTime={coverage.measuredAt}>{coverage.measuredAt}</time>
      </p>
      <p>
        Exported functions exercised: {f.exercised} / {f.total} ({pct(f.exercised, f.total, f.percent)}%)
      </p>
      <p>
        Branches covered:{" "}
        {b ? `${b.covered} / ${b.total} (${pct(b.covered, b.total, b.percent)}%)` : "coverage unavailable for branches"}
      </p>
    </div>
  );
}

export function GhostMemory({
  name,
  recording,
  coverage,
}: {
  name: string;
  recording: GhostMemoryData | null;
  coverage: CoverageData | null;
}) {
  const stream = useNdjsonStream<LiveEvent>();
  const [live, setLive] = useState(false);
  const progress = [...stream.events].reverse().find((e) => e.type === "progress" && e.total !== undefined);
  const result = stream.events.find((e) => e.type === "result");
  const errEvent = stream.events.find((e) => e.type === "error");

  const liveData: GhostMemoryData | null = result?.recording
    ? {
        generatedAt: result.recording.generatedAt,
        seed: 0,
        n: result.recording.stats.total,
        stats: result.recording.stats,
        rows: result.recording.evidence.map((e) => ({
          id: e.id,
          export: e.export,
          outcome: outcomeLabel(e.outcome),
          classId: e.classId,
          count: e.count,
        })),
      }
    : null;
  const showingLive = live && !!liveData;
  const data = showingLive ? liveData : recording;

  return (
    <section id="ghost-memory" aria-labelledby="ghost-heading" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="ghost-heading" className="text-2xl text-bone" style={headingFont}>
          Ghost Memory
        </h2>
        <button
          type="button"
          disabled={stream.running}
          onClick={() => {
            setLive(true);
            void stream.start(`/api/ghost-memory/${encodeURIComponent(name)}`, { method: "POST" });
          }}
          className="rounded border border-pumpkin px-3 py-1 text-sm text-pumpkin disabled:opacity-60"
        >
          {stream.running ? "Running…" : "Run live"}
        </button>
      </div>
      <div className="rounded-md border border-mist bg-tomb p-5" aria-live="polite">
        {stream.running && (
          <div className="mb-4">
            <SeanceProgress done={progress?.done ?? 0} total={progress?.total ?? 0} label={progress?.export ?? "Starting"} />
          </div>
        )}
        {(stream.error || errEvent) && (
          <p className="mb-3 text-sm text-candle">
            Live run failed: {errEvent?.message ?? stream.error}. Showing the stored recording.
          </p>
        )}
        {data ? (
          <>
            <p className="mb-3 text-sm text-ash">
              <span className="rounded border border-mist px-2 py-0.5 text-candle">{showingLive ? "live" : "stored"}</span>{" "}
              generated at <time dateTime={data.generatedAt}>{data.generatedAt}</time>
              {!showingLive && ` · seed ${data.seed}, N = ${data.n}`}
              {showingLive && result?.partial && " · partial: the run clock expired"}
            </p>
            <p className="mb-3 text-sm">
              {data.stats.total} records: {data.stats.returned} returned, {data.stats.threw} threw, {data.stats.timeouts} timed
              out, {data.stats.pollution} with prototype pollution.
            </p>
            <div className="mb-4">
              {showingLive ? (
                <p className="text-candle">
                  {result?.coverageNote ??
                    "API surface coverage is not measured on live runs. Coverage is shown from the stored recording, measured offline."}
                </p>
              ) : (
                <CoverageFigure coverage={coverage} />
              )}
            </div>
            <EvidenceTable rows={data.rows} total={data.stats.total} />
          </>
        ) : (
          <p className="text-candle">No stored recording for this package. Use Run live.</p>
        )}
      </div>
    </section>
  );
}

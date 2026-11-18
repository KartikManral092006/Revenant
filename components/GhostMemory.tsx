"use client";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { EvidenceTable, type EvidenceRow } from "./EvidenceTable";
import { humanDate } from "./format";
import { SeanceProgress } from "./SeanceProgress";
import { Collapsible } from "./ui/Collapsible";
import { RunLivePanel } from "./ui/RunLivePanel";
import { Term } from "./ui/Term";
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
export interface BehaviorGroupData {
  classId: string;
  label: string;
  count: number;
  polluting: boolean;
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
  pollution?: { detected?: boolean } | null;
}

const TOP = 8;
const pct = (n: number, d: number, p?: number) => (p ?? (d > 0 ? (n / d) * 100 : 0)).toFixed(1);
const BRANCH_TIP = "A branch is a decision point in the code, such as an if. Branches the inputs never reached were not tested.";

function outcomeLabel(o: LiveEvidence["outcome"]): string {
  return o.kind === "threw" && o.error?.name ? `threw ${o.error.name}` : o.kind;
}

function Meter({ value, tone = "accent", label }: { value: number; tone?: "accent" | "success"; label: string }) {
  const reduce = useReducedMotion();
  const w = `${Math.max(0, Math.min(100, value))}%`;
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" role="img" aria-label={label}>
      <motion.div
        className={`h-full rounded-full ${tone === "accent" ? "bg-accent" : "bg-success"}`}
        initial={reduce ? false : { width: 0 }}
        whileInView={{ width: w }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={reduce ? { width: w } : undefined}
      />
    </div>
  );
}

export function CoverageFigure({ coverage, recording }: { coverage: CoverageData | null; recording?: GhostMemoryData | null }) {
  if (!coverage) return <p className="text-warn">Coverage unavailable: no stored offline measurement for this package.</p>;
  const f = coverage.exportedFunctions;
  const b = coverage.branches;
  const measured = humanDate(coverage.measuredAt, new Date(coverage.measuredAt)).text;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card p-5">
        <p className="text-sm text-muted">Functions exercised</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-fg">
          {f.exercised} <span className="text-lg text-muted">of {f.total}</span>
        </p>
        <Meter value={Number(pct(f.exercised, f.total, f.percent))} tone="success" label={`${pct(f.exercised, f.total, f.percent)}% of exported functions exercised`} />
        <p className="mt-2 text-xs text-muted">Exported functions exercised: {f.exercised} / {f.total} ({pct(f.exercised, f.total, f.percent)}%)</p>
      </div>
      <div className="card p-5">
        <p className="text-sm text-muted">
          Code <Term tip={BRANCH_TIP}>branches</Term> reached
        </p>
        {b ? (
          <>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-fg">
              {pct(b.covered, b.total, b.percent)}% <span className="text-lg text-muted">({b.covered} of {b.total})</span>
            </p>
            <Meter value={Number(pct(b.covered, b.total, b.percent))} label={`${pct(b.covered, b.total, b.percent)}% of branches reached`} />
            <p className="mt-2 text-xs text-muted">
              Branches covered: {b.covered} / {b.total}. The rest were not reached by these inputs, one reason the final score is
              evidence, not proof.
            </p>
          </>
        ) : (
          <p className="mt-1 text-warn">coverage unavailable for branches</p>
        )}
      </div>
      <div className="card p-5">
        <p className="text-sm text-muted">Recording</p>
        <p className="mt-1 text-xl font-semibold text-fg">
          {recording ? `${recording.stats.total.toLocaleString("en-US")} inputs` : "—"}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {recording && <>Random seed {recording.seed}: same seed, same inputs, so the recording can be reproduced. </>}
          Coverage measured offline on <time dateTime={coverage.measuredAt}>{measured}</time>.
        </p>
      </div>
    </div>
  );
}

function groupLive(rows: EvidenceRow[], labels: Record<string, string>): BehaviorGroupData[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.classId, (m.get(r.classId) ?? 0) + r.count);
  return [...m]
    .map(([classId, count]) => ({ classId, count, label: labels[classId] ?? classId, polluting: classId.endsWith("prototype-pollution") }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function GroupList({ groups, max, showIds }: { groups: BehaviorGroupData[]; max: number; showIds: boolean }) {
  const reduce = useReducedMotion();
  return (
    <ul className="space-y-2">
      {groups.map((g, i) => {
        const w = `${Math.max(2, (g.count / max) * 100)}%`;
        return (
          <li key={g.classId} className="rounded-xl border border-line bg-canvas/60 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={g.polluting ? "font-semibold text-danger" : "text-fg"}>{g.label}</span>
              <span className="shrink-0 tabular-nums text-muted">{g.count.toLocaleString("en-US")} inputs</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              <motion.div
                className={`h-full rounded-full ${g.polluting ? "bg-danger" : "bg-link"}`}
                initial={reduce ? false : { width: 0 }}
                whileInView={{ width: w }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: Math.min(i, 10) * 0.04 }}
                style={reduce ? { width: w } : undefined}
              />
            </div>
            {showIds && <p className="mt-2 break-all font-mono text-xs text-muted">{g.classId}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function GhostMemory({
  name,
  recording,
  coverage,
  groups,
  labels = {},
}: {
  name: string;
  recording: GhostMemoryData | null;
  coverage: CoverageData | null;
  groups?: BehaviorGroupData[];
  labels?: Record<string, string>;
}) {
  const stream = useNdjsonStream<LiveEvent>();
  const [live, setLive] = useState(false);
  const [showIds, setShowIds] = useState(false);
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
          polluted: e.pollution?.detected === true,
        })),
      }
    : null;
  const showingLive = live && !!liveData;
  const data = showingLive ? liveData : recording;
  // Cheap (a few thousand rows at most), so it is computed on each render.
  const shownGroups =
    showingLive && liveData ? groupLive(liveData.rows, labels) : (groups ?? (recording ? groupLive(recording.rows, labels) : []));
  const max = shownGroups[0]?.count ?? 1;
  const top = shownGroups.slice(0, TOP);
  const rest = shownGroups.slice(TOP);

  return (
    <div>
      {data ? (
        <>
          <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${showingLive ? "border-success/40 text-success" : "border-warn/40 text-warn"}`}>
              {showingLive ? "live" : "stored"}
            </span>
            Recorded <time dateTime={data.generatedAt}>{humanDate(data.generatedAt, new Date(data.generatedAt)).text}</time>
            {!showingLive && ` · seed ${data.seed}, N = ${data.n.toLocaleString("en-US")}`}
            {showingLive && result?.partial && " · partial: the run clock expired"}
          </p>
          <p className="sr-only">
            {data.stats.total} records: {data.stats.returned} returned, {data.stats.threw} threw, {data.stats.timeouts} timed out,{" "}
            {data.stats.pollution} with prototype pollution.
          </p>

          <h3 className="mb-3 font-sans text-base font-semibold text-fg">How much of the package was tested</h3>
          {showingLive ? (
            <p className="text-warn">
              {result?.coverageNote ??
                "API surface coverage is not measured on live runs. Coverage is shown from the stored recording, measured offline."}
            </p>
          ) : (
            <CoverageFigure coverage={coverage} recording={recording} />
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-sans text-base font-semibold text-fg">
              <Term tip="Inputs that look alike (same kind of input, same outcome) are grouped, so you can read a few groups instead of a thousand rows.">
                Behavior groups
              </Term>
              , largest first
            </h3>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} className="h-4 w-4 accent-accent" />
              Show technical IDs
            </label>
          </div>
          <div className="mt-3">
            <GroupList groups={top} max={max} showIds={showIds} />
            {rest.length > 0 && (
              <Collapsible className="mt-3" summary={`Show the other ${rest.length} groups`}>
                <GroupList groups={rest} max={max} showIds={showIds} />
              </Collapsible>
            )}
          </div>

          <Collapsible
            className="mt-6"
            summary="Evidence table: every recorded input (technical)"
            meta={`${data.rows.length.toLocaleString("en-US")} rows`}
          >
            <p className="mb-3 text-sm text-muted">
              Each row is one input and what the original did with it. Every later step relies only on this record, not on
              guesses or the README.
            </p>
            <EvidenceTable rows={data.rows} total={data.stats.total} />
          </Collapsible>
        </>
      ) : (
        <p className="text-warn">No stored recording for this package. Use Record again.</p>
      )}

      <RunLivePanel
        id="ghost-live-desc"
        copy={{
          title: "Record again, live",
          what: "The original runs in the sandbox on freshly generated inputs. Candles light as it goes.",
          takes: "Up to 30 seconds. If time runs out, you get a result marked “partial”.",
          changesNothing: "The stored recording stays as it is. Coverage is not measured live.",
        }}
        action={
          <button
            type="button"
            disabled={stream.running}
            aria-describedby="ghost-live-desc"
            onClick={() => {
              setLive(true);
              void stream.start(`/api/ghost-memory/${encodeURIComponent(name)}`, { method: "POST" });
            }}
            className="btn-outline"
          >
            {stream.running ? "Recording…" : "Record again"}
          </button>
        }
      >
        {stream.running && (
          <SeanceProgress done={progress?.done ?? 0} total={progress?.total ?? 0} label={progress?.export ? `Recording ${progress.export}` : "Starting"} />
        )}
        {(stream.error || errEvent) && (
          <p className="text-sm text-warn">
            Live run failed: {errEvent?.message ?? stream.error}. Showing the stored recording. Nothing was changed.
          </p>
        )}
        {showingLive && !stream.running && (
          <p className="text-sm text-success">Live recording finished. The groups and table above now show the live run.</p>
        )}
      </RunLivePanel>
    </div>
  );
}

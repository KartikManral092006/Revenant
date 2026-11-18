"use client";
import { AlertTriangle, Download, FileText, Link2 } from "lucide-react";
import { useState } from "react";
import { humanDate } from "./format";
import { Collapsible } from "./ui/Collapsible";
import { Reveal } from "./ui/Reveal";
import { RunLivePanel } from "./ui/RunLivePanel";

// Local structural types: client components must not import from lib/.
export interface SpecRequirement {
  id: string;
  statement: string;
  classIds: string[];
  missing?: string[];
  unsupported: boolean;
  resolved?: { classId: string; memberCount: number }[];
}
export interface SpecBundleData {
  generatedAt: string;
  model: string;
  requirements: SpecRequirement[];
  documents: Record<string, string>;
  traceability: { x: number; y: number; text: string };
  citationIssues: { requirementId: string; classId: string; message: string }[];
}
interface LiveResponse {
  source: "live" | "cached";
  message: string | null;
  bundle: SpecBundleData;
  remainingForIp: number;
  remainingTotal: number;
}
export interface Budget {
  remainingForIp: number;
  remainingTotal: number;
}

const UNSUPPORTED_LABEL = "UNSUPPORTED BY RECORDED EVIDENCE";

export function SpecView({ documents, name }: { documents: Record<string, string>; name: string }) {
  const names = Object.keys(documents);
  const [selected, setSelected] = useState(names.includes("requirements.md") ? "requirements.md" : names[0]);
  if (names.length === 0) return <p className="text-warn">The bundle has no documents.</p>;
  return (
    <div>
      <div role="group" aria-label={`Documents for ${name}`} className="mb-3 flex flex-wrap gap-2">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={n === selected}
            onClick={() => setSelected(n)}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              n === selected ? "border-accent bg-canvas text-accent" : "border-line text-muted hover:text-fg"
            }`}
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5" />
            {n}
          </button>
        ))}
      </div>
      <pre
        tabIndex={0}
        aria-label={selected}
        className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-canvas p-4 font-mono text-xs leading-relaxed text-fg"
      >
        {documents[selected]}
      </pre>
    </div>
  );
}

export function GroqBudget({ budget }: { budget: Budget | null }) {
  if (!budget) return <p className="text-sm text-muted">Remaining Groq budget is shown after a live run.</p>;
  return (
    <p className="text-sm text-muted">
      Groq budget remaining today: {budget.remainingForIp} for this visitor, {budget.remainingTotal} in total.
    </p>
  );
}

function citation(r: SpecRequirement): string {
  const groups = r.resolved?.length ?? r.classIds.length;
  const inputs = r.resolved?.reduce((s, x) => s + x.memberCount, 0);
  return `Cites ${groups} ${groups === 1 ? "group" : "groups"}${inputs !== undefined ? ` · ${inputs.toLocaleString("en-US")} inputs` : ""}`;
}

export function RequirementList({ requirements }: { requirements: SpecRequirement[] }) {
  return (
    <ol className="space-y-3">
      {requirements.map((r, i) => (
        <Reveal as="li" key={r.id} delay={Math.min(i, 8) * 0.04}>
          <div className={`rounded-xl border p-4 ${r.unsupported ? "border-warn/50 bg-canvas" : "border-line bg-canvas/60"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-accent">{r.id}</span>
              {r.unsupported ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn">
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> {UNSUPPORTED_LABEL}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <Link2 aria-hidden="true" className="h-3.5 w-3.5" /> {citation(r)}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg">{r.statement}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}

export function ReverseSpec({ name, bundle }: { name: string; bundle: SpecBundleData | null }) {
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/reverse-spec/${encodeURIComponent(name)}`, { method: "POST", cache: "no-store" });
      const body = (await res.json()) as Partial<LiveResponse> & { error?: string; message?: string | null };
      const { remainingForIp, remainingTotal } = body;
      if (typeof remainingForIp === "number" && typeof remainingTotal === "number" && body.bundle) {
        setLive({
          source: body.source ?? "cached",
          message: body.message ?? null,
          bundle: body.bundle,
          remainingForIp,
          remainingTotal,
        });
      }
      if (!res.ok || !body.bundle) setError(body.error ?? body.message ?? `HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setRunning(false);
    }
  }

  const showingLive = live?.source === "live";
  const data = live?.bundle ?? bundle;
  const budget = live ? { remainingForIp: live.remainingForIp, remainingTotal: live.remainingTotal } : null;

  return (
    <div>
      {data ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${showingLive ? "border-success/40 text-success" : "border-warn/40 text-warn"}`}>
                {showingLive ? "live" : "stored"}
              </span>
              Written <time dateTime={data.generatedAt}>{humanDate(data.generatedAt, new Date(data.generatedAt)).text}</time> by{" "}
              <code className="font-mono text-xs text-fg">{data.model}</code> · {data.traceability.text}
            </p>
            <a href={`/api/spec-bundle/${encodeURIComponent(name)}`} download className="btn-primary">
              <Download aria-hidden="true" className="h-4 w-4" />
              Download Kiro spec bundle
            </a>
          </div>
          <h3 className="mb-3 font-sans text-base font-semibold text-fg">The requirements</h3>
          <RequirementList requirements={data.requirements} />
          {data.citationIssues.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-warn" aria-label="Citation issues">
              {data.citationIssues.map((c, i) => (
                <li key={`${c.requirementId}-${c.classId}-${i}`}>
                  {c.requirementId}: {c.classId}, {c.message}
                </li>
              ))}
            </ul>
          )}
          <Collapsible className="mt-6" summary="Read the spec files" meta={`${Object.keys(data.documents).length} files`}>
            <SpecView documents={data.documents} name={name} />
          </Collapsible>
        </>
      ) : (
        <p className="text-warn">No stored spec for this package. Download is unavailable.</p>
      )}

      <RunLivePanel
        id="spec-live-desc"
        copy={{
          title: "Write again, live",
          what: "A live request to an AI model (Groq) writes a fresh spec from the same recorded evidence.",
          takes: "Usually under a minute.",
          changesNothing: "The stored spec and the download stay as they are.",
          limit: "5 live runs per visitor and 50 in total, per day.",
        }}
        action={
          <button type="button" disabled={running} aria-describedby="spec-live-desc" onClick={() => void run()} className="btn-outline">
            {running ? "Writing…" : "Write again"}
          </button>
        }
      >
        {running && <p className="text-sm text-muted">Writing the spec…</p>}
        {error && <p className="text-sm text-warn">Live run failed: {error}. Showing the stored spec. Nothing was changed.</p>}
        {live?.message && <p className="text-sm text-warn">{live.message}</p>}
        <GroqBudget budget={budget} />
      </RunLivePanel>
    </div>
  );
}

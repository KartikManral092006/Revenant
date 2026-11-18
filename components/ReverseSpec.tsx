"use client";
import { useState } from "react";

// Local structural types: client components must not import from lib/.
export interface SpecRequirement {
  id: string;
  statement: string;
  classIds: string[];
  missing?: string[];
  unsupported: boolean;
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

const headingFont = { fontFamily: "var(--font-display), Georgia, serif" } as const;
const UNSUPPORTED_LABEL = "UNSUPPORTED BY RECORDED EVIDENCE";

export function SpecView({ documents, name }: { documents: Record<string, string>; name: string }) {
  const names = Object.keys(documents);
  const [selected, setSelected] = useState(names.includes("requirements.md") ? "requirements.md" : names[0]);
  if (names.length === 0) return <p className="text-candle">The bundle has no documents.</p>;
  return (
    <div>
      <div role="group" aria-label={`Documents for ${name}`} className="mb-2 flex flex-wrap gap-2">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={n === selected}
            onClick={() => setSelected(n)}
            className={`rounded border px-2 py-0.5 text-xs ${n === selected ? "border-pumpkin text-pumpkin" : "border-mist text-ash"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <pre
        tabIndex={0}
        aria-label={selected}
        className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-mist p-3 text-xs"
      >
        {documents[selected]}
      </pre>
    </div>
  );
}

export function GroqBudget({ budget }: { budget: Budget | null }) {
  if (!budget) return <p className="text-sm text-ash">Remaining Groq budget is shown after a live run.</p>;
  return (
    <p className="text-sm text-ash">
      Groq budget remaining today: {budget.remainingForIp} for this visitor, {budget.remainingTotal} in total.
    </p>
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
  const flagged = data ? data.requirements.filter((r) => r.unsupported) : [];
  const budget = live ? { remainingForIp: live.remainingForIp, remainingTotal: live.remainingTotal } : null;

  return (
    <section id="reverse-spec" aria-labelledby="spec-heading" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="spec-heading" className="text-2xl text-bone" style={headingFont}>
          Reverse Spec
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/spec-bundle/${encodeURIComponent(name)}`}
            download
            className="rounded border border-mist px-3 py-1 text-sm text-bone"
          >
            Download Kiro spec bundle
          </a>
          <button
            type="button"
            disabled={running}
            onClick={() => void run()}
            className="rounded border border-pumpkin px-3 py-1 text-sm text-pumpkin disabled:opacity-60"
          >
            {running ? "Running…" : "Run live"}
          </button>
        </div>
      </div>
      {!bundle && (
        <p className="mb-3 text-sm text-candle">
          No stored bundle exists for this package, so the download will report that none is available.
        </p>
      )}
      <div className="rounded-md border border-mist bg-tomb p-5" aria-live="polite">
        {error && <p className="mb-3 text-sm text-candle">Live run failed: {error}. Showing the stored bundle.</p>}
        {live?.message && <p className="mb-3 text-sm text-candle">{live.message}</p>}
        <div className="mb-3">
          <GroqBudget budget={budget} />
        </div>
        {data ? (
          <>
            <p className="mb-3 text-sm text-ash">
              <span className="rounded border border-mist px-2 py-0.5 text-candle">{showingLive ? "live" : "stored"}</span>{" "}
              generated at <time dateTime={data.generatedAt}>{data.generatedAt}</time> · model {data.model}
            </p>
            <p className="mb-3 text-sm">{data.traceability.text}</p>
            {flagged.length > 0 && (
              <ul className="mb-4 space-y-1 text-sm" aria-label="Flagged requirements">
                {flagged.map((r) => (
                  <li key={r.id} className="text-candle">
                    <strong>{UNSUPPORTED_LABEL}</strong>: {r.id}, {r.statement}
                  </li>
                ))}
              </ul>
            )}
            {data.citationIssues.length > 0 && (
              <ul className="mb-4 space-y-1 text-sm text-candle" aria-label="Citation issues">
                {data.citationIssues.map((c, i) => (
                  <li key={`${c.requirementId}-${c.classId}-${i}`}>
                    {c.requirementId}: {c.classId}, {c.message}
                  </li>
                ))}
              </ul>
            )}
            <SpecView documents={data.documents} name={name} />
          </>
        ) : (
          <p className="text-candle">No stored bundle for this package. Use Run live.</p>
        )}
      </div>
    </section>
  );
}

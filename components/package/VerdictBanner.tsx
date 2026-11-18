import { ArrowDown, Calendar, Download, FolderGit2, Gauge, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "../ui/Reveal";

export type FactTone = "dead" | "warn" | "ok" | "neutral";

export interface VerdictFactData {
  key: "last-release" | "vulnerabilities" | "match" | "fix" | "rebuild";
  label: string;
  value: string;
  detail: string;
  tone: FactTone;
}

const TONE_TEXT: Record<FactTone, string> = {
  dead: "text-danger",
  warn: "text-warn",
  ok: "text-success",
  neutral: "text-fg",
};
const TONE_BORDER: Record<FactTone, string> = {
  dead: "border-danger/30",
  warn: "border-warn/30",
  ok: "border-success/30",
  neutral: "border-line",
};

function FactIcon({ k, tone }: { k: VerdictFactData["key"]; tone: FactTone }) {
  const cls = `h-4 w-4 ${TONE_TEXT[tone]}`;
  if (k === "last-release") return <Calendar aria-hidden="true" className={cls} />;
  if (k === "vulnerabilities") return <ShieldAlert aria-hidden="true" className={cls} />;
  if (k === "match") return <Gauge aria-hidden="true" className={cls} />;
  if (k === "fix") return <ShieldCheck aria-hidden="true" className={cls} />;
  return <Wrench aria-hidden="true" className={cls} />;
}

/** The answer first: one sentence, four facts, the next actions, and the honesty line. */
export function VerdictBanner({
  headline,
  facts,
  name,
  rebuilt,
  repoUrl,
  honesty,
}: {
  headline: string;
  facts: VerdictFactData[];
  name: string;
  rebuilt: boolean;
  repoUrl: string;
  honesty: ReactNode;
}) {
  const enc = encodeURIComponent(name);
  return (
    <Reveal>
      <section aria-labelledby="summary-heading" className="card relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: rebuilt ? "rgb(74 222 128 / 0.08)" : "rgb(167 139 250 / 0.08)" }}
        />
        <h2 id="summary-heading" className="text-sm font-medium text-muted">
          Summary
        </h2>
        <p className="relative mt-2 max-w-3xl text-xl font-semibold leading-snug tracking-tight text-fg sm:text-2xl">{headline}</p>
        <dl className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.key} className={`rounded-xl border bg-canvas/70 p-4 ${TONE_BORDER[f.tone]}`}>
              <dt className="flex items-center gap-2 text-xs font-medium text-muted">
                <FactIcon k={f.key} tone={f.tone} />
                {f.label}
              </dt>
              <dd className="mt-2">
                <span className={`block text-lg font-semibold leading-snug ${TONE_TEXT[f.tone]}`}>{f.value}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{f.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <a href={rebuilt ? "#rebirth-report" : "#autopsy"} className="btn-primary">
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
            {rebuilt ? "Read the Rebirth Report" : "Start with the Autopsy"}
          </a>
          <a href={`/api/spec-bundle/${enc}`} download className="btn-ghost">
            <Download aria-hidden="true" className="h-4 w-4" />
            Download Kiro spec bundle
          </a>
          {rebuilt && (
            <a href={`${repoUrl}/tree/main/resurrected/${enc}`} className="btn-ghost">
              <FolderGit2 aria-hidden="true" className="h-4 w-4" />
              View the rebuild on GitHub
            </a>
          )}
        </div>
        <p className="relative mt-5 max-w-3xl text-sm leading-relaxed text-muted">{honesty}</p>
      </section>
    </Reveal>
  );
}

import { ArrowDown, Download, FolderGit2 } from "lucide-react";
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
const TONE_DOT: Record<FactTone, string> = {
  dead: "bg-danger",
  warn: "bg-warn",
  ok: "bg-success",
  neutral: "bg-muted",
};

/**
 * The answer first: one sentence, four facts in a row separated by hairlines, the next actions,
 * and the honesty line. No box around it.
 */
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
    <section aria-labelledby="summary-heading" className="pb-12">
      <Reveal>
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <p className="max-w-3xl text-xl leading-snug tracking-tight text-fg sm:text-2xl">{headline}</p>
      </Reveal>
      <Reveal delay={0.1}>
        <dl className="mt-10 grid grid-cols-1 border-y border-line sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
          {facts.map((f, i) => (
            <div
              key={f.key}
              className={`py-6 lg:px-6 lg:first:pl-0 lg:last:pr-0 ${i > 0 ? "border-t border-line sm:border-t-0" : ""} ${
                i >= 2 ? "sm:border-t lg:border-t-0" : ""
              }`}
            >
              <dt className="flex items-center gap-2 text-sm text-muted">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[f.tone]}`} />
                {f.label}
              </dt>
              <dd className="mt-2">
                <span className={`block text-xl font-semibold leading-snug tracking-tight ${TONE_TEXT[f.tone]}`}>{f.value}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{f.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
      <Reveal delay={0.15}>
        <div className="mt-8 flex flex-wrap gap-3">
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
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">{honesty}</p>
      </Reveal>
    </section>
  );
}

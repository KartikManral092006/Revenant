// Builds the verdict banner and home-card summary from the stored data. Server-side, pure.
// The banner numbers come from the same loaded objects as the step sections, so they cannot drift.
import { compactCount, humanDate, monthYear, plural } from "../../components/format";

type Field<T> = { value: T } | { unknown: true; reason: string };

export interface CertificateLike {
  lastPublish: Field<string>;
  inactive: Field<boolean>;
  deprecation: Field<string | null>;
  vulnerabilities: Field<{ id: string; aliases?: string[]; summary?: string }[]>;
  weeklyDownloads: Field<number>;
  repo: Field<{ archived: boolean; pushedAt: string }>;
}

export interface ReportLike {
  scoreText: string;
  partial: boolean;
  score?: { mismatches: number; excluded: number };
  intentionalDifferences?: { covered: number }[];
  vulnerabilitiesRemoved?: { advisory: string; basis: string }[];
}

export type Tone = "dead" | "warn" | "ok" | "neutral";

export interface VerdictFact {
  key: "last-release" | "vulnerabilities" | "match" | "fix" | "rebuild";
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface Chip {
  text: string;
  tone: Tone;
}

export interface PackageSummary {
  headline: string;
  facts: VerdictFact[];
  rebuilt: boolean;
  chips: Chip[];
  /** The result in one sentence, without the download figure. */
  result: string;
  /** One sentence for the home card: the result plus weekly downloads. */
  cardVerdict: string;
}

const val = <T,>(f: Field<T> | undefined): T | undefined => (f && "value" in f ? f.value : undefined);

function vulnName(v: { id: string; aliases?: string[]; summary?: string }): string {
  const alias = v.aliases?.find((a) => a.startsWith("CVE-"));
  const what = v.summary ? v.summary.replace(/\s+in\s+\S+\s*(package)?$/i, "").trim() : "Known issue";
  return alias ? `${what} (${alias})` : `${what} (${v.id})`;
}

export function buildSummary(input: {
  name: string;
  cert: CertificateLike | null;
  report: ReportLike | null;
  resurrected: boolean;
  now: Date;
}): PackageSummary {
  const { name, cert, report, resurrected, now } = input;
  const last = val(cert?.lastPublish);
  const inactive = val(cert?.inactive);
  const vulns = val(cert?.vulnerabilities);
  const deprecated = val(cert?.deprecation);
  const repo = val(cert?.repo);
  const rebuilt = resurrected && report !== null;

  // Headline
  const state = inactive === true ? "is unmaintained" : inactive === false ? "is still maintained" : "has an unknown maintenance status";
  const vulnPart =
    vulns === undefined
      ? "its vulnerability status is unknown"
      : vulns.length === 0
        ? "has no known vulnerability"
        : `has ${plural(vulns.length, "known vulnerability", "known vulnerabilities")}`;
  const rebuildPart = rebuilt ? "and a rebuild has been compared with it" : "and no rebuild exists yet";
  const headline = `${name} ${state}, ${vulnPart}, ${rebuildPart}.`;

  // Facts
  const facts: VerdictFact[] = [];
  if (last) {
    const h = humanDate(last, now);
    facts.push({ key: "last-release", label: "Last release", value: monthYear(last), detail: h.relative, tone: inactive ? "dead" : "neutral" });
  } else {
    facts.push({ key: "last-release", label: "Last release", value: "Unknown", detail: "The npm registry did not answer.", tone: "warn" });
  }

  if (vulns === undefined) {
    facts.push({ key: "vulnerabilities", label: "Known vulnerabilities", value: "Unknown", detail: "The OSV database did not answer.", tone: "warn" });
  } else if (vulns.length === 0) {
    facts.push({ key: "vulnerabilities", label: "Known vulnerabilities", value: "None", detail: "OSV lists none for this version.", tone: "ok" });
  } else {
    facts.push({ key: "vulnerabilities", label: "Known vulnerabilities", value: String(vulns.length), detail: vulns.map(vulnName).join("; "), tone: "dead" });
  }

  if (rebuilt && report) {
    const mismatches = report.score?.mismatches ?? 0;
    facts.push({
      key: "match",
      label: "Behavior match",
      value: report.scoreText,
      detail: `${plural(mismatches, "unexplained mismatch", "unexplained mismatches")}${report.partial ? " · partial run" : ""}`,
      tone: mismatches === 0 ? "ok" : "warn",
    });
    const removed = report.vulnerabilitiesRemoved ?? [];
    const excluded = (report.intentionalDifferences ?? []).reduce((s, d) => s + d.covered, 0);
    if (removed.length > 0) {
      facts.push({
        key: "fix",
        label: "Vulnerability in rebuild",
        value: "Removed",
        detail: `${plural(excluded, "input")} that trigger it are listed separately`,
        tone: "ok",
      });
    } else if (vulns && vulns.length > 0) {
      facts.push({
        key: "fix",
        label: "Vulnerability in rebuild",
        value: "Not observed",
        detail: "No recorded input triggered it in the original, so a fix cannot be shown",
        tone: "warn",
      });
    } else {
      facts.push({ key: "fix", label: "Vulnerability in rebuild", value: "Nothing to fix", detail: "No known vulnerability to remove", tone: "ok" });
    }
  } else {
    facts.push({ key: "match", label: "Behavior match", value: "No score", detail: "A score needs a rebuild to compare with", tone: "neutral" });
    facts.push({ key: "rebuild", label: "Rebuild", value: "Not yet", detail: "Nobody has rebuilt this package in Kiro yet", tone: "neutral" });
  }

  // Chips for the home card
  const chips: Chip[] = [];
  if (last) chips.push({ text: inactive ? `Unmaintained since ${monthYear(last)}` : `Last release ${monthYear(last)}`, tone: inactive ? "dead" : "neutral" });
  if (deprecated) chips.push({ text: "Deprecated on npm", tone: "dead" });
  if (repo?.archived) chips.push({ text: "Repository archived", tone: "dead" });
  if (vulns) chips.push(vulns.length > 0 ? { text: plural(vulns.length, "known vulnerability", "known vulnerabilities"), tone: "warn" } : { text: "No known vulnerability", tone: "ok" });
  chips.push(rebuilt ? { text: "Rebuilt", tone: "ok" } : { text: "Not rebuilt yet", tone: "neutral" });

  const downloads = val(cert?.weeklyDownloads);
  let result: string;
  if (rebuilt && report) {
    const removed = (report.vulnerabilitiesRemoved ?? []).length > 0;
    result = `The rebuild matched the original: ${report.scoreText}.${removed ? " The known vulnerability is gone in the rebuild." : ""}`;
  } else {
    result = "Behavior is recorded and a spec is ready to download. No rebuild yet, so no match score.";
  }
  const cardVerdict = downloads !== undefined ? `${result} About ${compactCount(downloads)} downloads a week.` : result;

  return { headline, facts, rebuilt, chips, result, cardVerdict };
}

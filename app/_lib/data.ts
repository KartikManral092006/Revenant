// Server-side loaders for the stored data files under data/<package>/. Each returns null when the
// file is missing or unreadable, so pages degrade to their "no stored data" states.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CertificateData } from "../../components/DeathCertificate";
import type { CoverageData, GhostMemoryData } from "../../components/GhostMemory";
import type { RebirthReportData } from "../../components/RebirthReport";
import type { SpecBundleData } from "../../components/ReverseSpec";
import type { Manifest } from "../../lib/graveyard/manifest-schema";
import { loadStoredReport } from "../../lib/report/stored";

function readJson<T>(name: string, file: string): T | null {
  const p = path.join(process.cwd(), "data", name, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadCertificate(name: string): CertificateData | null {
  const data = readJson<CertificateData>(name, "autopsy.json");
  return data ? { ...data, source: "snapshot" } : null;
}

export function loadRecording(name: string): GhostMemoryData | null {
  const r = readJson<{
    generatedAt: string;
    seed: number;
    n: number;
    stats: GhostMemoryData["stats"];
    evidence: {
      id: string;
      export: string;
      count: number;
      classId: string;
      input?: unknown;
      outcome: { kind: string; error?: { name?: string } };
      pollution?: { detected?: boolean } | null;
    }[];
  }>(name, "ghost-memory.json");
  if (!r) return null;
  return {
    generatedAt: r.generatedAt,
    seed: r.seed,
    n: r.n,
    stats: r.stats,
    rows: r.evidence.map((e) => ({
      id: e.id,
      export: e.export,
      outcome: e.outcome.kind === "threw" && e.outcome.error?.name ? `threw ${e.outcome.error.name}` : e.outcome.kind,
      classId: e.classId,
      count: e.count,
      input: previewInput(e.input),
      polluted: e.pollution?.detected === true,
    })),
  };
}

/** Short, single-line preview of a recorded input. Tagged values (e.g. {"$t": ...}) are summarized. */
export function previewInput(input: unknown, max = 60): string {
  let text: string;
  try {
    text = JSON.stringify(input, (_k, v: unknown) => {
      if (v && typeof v === "object" && !Array.isArray(v) && "$t" in v) return `‹${String((v as { $t: unknown }).$t)}›`;
      return v;
    });
  } catch {
    text = "‹unprintable›";
  }
  if (text === undefined) text = "undefined";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function loadCoverage(name: string): CoverageData | null {
  return readJson<CoverageData>(name, "coverage.json");
}

export function loadBundle(name: string): SpecBundleData | null {
  return readJson<SpecBundleData>(name, "reverse-spec.json");
}

export function loadReport(manifest: Manifest): RebirthReportData | null {
  return loadStoredReport(manifest) satisfies RebirthReportData | null;
}

export function isResurrected(name: string): boolean {
  return existsSync(path.join(process.cwd(), "resurrected", name, "src", "index.js"));
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeathCertificate, type CertificateData } from "../../../components/DeathCertificate";
import { GhostMemory, type CoverageData, type GhostMemoryData } from "../../../components/GhostMemory";
import { RebirthReport, type RebirthReportData } from "../../../components/RebirthReport";
import { ReverseSpec, type SpecBundleData } from "../../../components/ReverseSpec";
import { listGraveyard } from "../../../lib/graveyard/loader";

export const dynamic = "force-dynamic";

const headingFont = { fontFamily: "var(--font-display), Georgia, serif" } as const;

function loadSnapshot(name: string): CertificateData | null {
  const file = path.join(process.cwd(), "data", name, "autopsy.json");
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as CertificateData;
    return { ...data, source: "snapshot" };
  } catch {
    return null;
  }
}

function readJson<T>(name: string, file: string): T | null {
  const p = path.join(process.cwd(), "data", name, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadRecording(name: string): GhostMemoryData | null {
  const r = readJson<{
    generatedAt: string;
    seed: number;
    n: number;
    stats: GhostMemoryData["stats"];
    evidence: { id: string; export: string; count: number; classId: string; outcome: { kind: string; error?: { name?: string } } }[];
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
    })),
  };
}

export default async function PackagePage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw);
  const manifest = listGraveyard().find((m) => m.name === name);
  if (!manifest) notFound();

  return (
    <main id="main" className="mx-auto max-w-5xl p-6 sm:p-10">
      <p className="mb-4 text-sm">
        <Link href="/">← The Graveyard</Link>
      </p>
      <header className="mb-8">
        <h1 className="break-words text-4xl text-pumpkin" style={headingFont}>
          {manifest.name}
        </h1>
        <p className="text-ash">v{manifest.version}</p>
      </header>
      <DeathCertificate name={manifest.name} initial={loadSnapshot(manifest.name)} />
      <GhostMemory
        name={manifest.name}
        recording={loadRecording(manifest.name)}
        coverage={readJson<CoverageData>(manifest.name, "coverage.json")}
      />
      <ReverseSpec name={manifest.name} bundle={readJson<SpecBundleData>(manifest.name, "reverse-spec.json")} />
      <RebirthReport
        name={manifest.name}
        report={readJson<RebirthReportData>(manifest.name, "diff-run.json")}
        resurrected={existsSync(path.join(process.cwd(), "resurrected", manifest.name, "src", "index.js"))}
      />
    </main>
  );
}

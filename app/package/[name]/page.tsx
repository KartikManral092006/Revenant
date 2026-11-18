import { ArrowLeft, Ghost, Hammer, HeartPulse, ScrollText, Stethoscope } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeathCertificate } from "../../../components/DeathCertificate";
import { compactCount, monthYear, plural } from "../../../components/format";
import { GhostMemory } from "../../../components/GhostMemory";
import { Glossary } from "../../../components/package/Glossary";
import { ResurrectionDetail } from "../../../components/package/ResurrectionStep";
import { VerdictBanner } from "../../../components/package/VerdictBanner";
import { RebirthReport } from "../../../components/RebirthReport";
import { ReverseSpec } from "../../../components/ReverseSpec";
import { StepNav, type StepNavItem } from "../../../components/ui/StepNav";
import { StepShell } from "../../../components/ui/StepShell";
import { Term } from "../../../components/ui/Term";
import { listGraveyard } from "../../../lib/graveyard/loader";
import { groupClassCounts } from "../../_lib/class-labels";
import { isResurrected, loadBundle, loadCertificate, loadCoverage, loadRecording, loadReport } from "../../_lib/data";
import { packageCopy, REPO_URL } from "../../_lib/package-copy";
import { buildSummary } from "../../_lib/summary";

export const dynamic = "force-dynamic";

const EVIDENCE_TIP = "One recorded input and what the original package did with it. The later steps rely only on this record.";
const INTENTIONAL_TIP =
  "A change made on purpose in the rebuild, such as a security fix. Each one names a published advisory and is left out of the match score.";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} · Revenant` };
}

export default async function PackagePage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw);
  const graveyard = listGraveyard();
  const manifest = graveyard.find((m) => m.name === name);
  if (!manifest) notFound();

  const now = new Date();
  const cert = loadCertificate(name);
  const recording = loadRecording(name);
  const coverage = loadCoverage(name);
  const bundle = loadBundle(name);
  const report = loadReport(manifest);
  const resurrected = isResurrected(name);
  const summary = buildSummary({ name, cert, report, resurrected, now });
  const copy = packageCopy(name);

  const features = manifest.classFeatures.map((f) => f.feature);
  const groups = groupClassCounts(recording?.rows ?? [], features);
  const labels = Object.fromEntries(groups.map((g) => [g.classId, g.label]));
  const rebuiltNames = graveyard.filter((m) => isResurrected(m.name)).map((m) => m.name);

  const steps: StepNavItem[] = [
    { n: 1, slug: "autopsy", label: "Autopsy", state: cert ? "done" : "not-started" },
    { n: 2, slug: "ghost-memory", label: "Ghost Memory", state: recording ? "done" : "not-started" },
    { n: 3, slug: "reverse-spec", label: "Reverse Spec", state: bundle ? "done" : "not-started" },
    { n: 4, slug: "resurrection", label: "Resurrection", state: resurrected ? "in-kiro" : "not-started" },
    { n: 5, slug: "rebirth-report", label: "Rebirth Report", state: !resurrected ? "unavailable" : report ? "done" : "not-started" },
  ];

  // --- "What we found" sentences, all from the same loaded data as the details below ---
  const certVal = <T,>(f: { value: T } | { unknown: true } | undefined) => (f && "value" in f ? f.value : undefined);
  const last = certVal(cert?.lastPublish);
  const vulns = certVal(cert?.vulnerabilities);
  const downloads = certVal(cert?.weeklyDownloads);
  const branches = coverage?.branches;
  const branchPct = branches && branches.total > 0 ? (branches.covered / branches.total) * 100 : null;

  const autopsyFound = cert ? (
    <ul className="space-y-1">
      {last && <li>{certVal(cert.inactive) ? `No release since ${monthYear(last)}.` : `Last release ${monthYear(last)}.`}</li>}
      {vulns && (
        <li>
          {vulns.length === 0 ? "No known vulnerability." : `${plural(vulns.length, "known vulnerability", "known vulnerabilities")}, still unfixed in this version.`}
        </li>
      )}
      {downloads !== undefined && <li>Still downloaded about {compactCount(downloads)} times a week.</li>}
    </ul>
  ) : (
    "No stored snapshot yet. Use Check again below."
  );

  const s = recording?.stats;
  const ghostFound = s ? (
    <ul className="space-y-1">
      <li>
        {s.total.toLocaleString("en-US")} inputs recorded: {s.returned.toLocaleString("en-US")} returned a value, {s.threw} threw an error,{" "}
        {s.timeouts} timed out.
      </li>
      {s.pollution > 0 && (
        <li className="text-danger">
          {s.pollution} inputs changed Object.prototype. That is the vulnerability, seen in action.
        </li>
      )}
      <li>They fall into {groups.length} behavior groups.</li>
    </ul>
  ) : (
    "No stored recording yet."
  );

  const unsupported = bundle?.requirements.filter((r) => r.unsupported).length ?? 0;
  const specFound = bundle ? (
    <ul className="space-y-1">
      <li>
        {plural(bundle.requirements.length, "requirement")}; {bundle.traceability.text}.
      </li>
      <li>{unsupported === 0 ? "None flagged as unsupported by the recorded evidence." : `${unsupported} flagged as unsupported by the recorded evidence.`}</li>
    </ul>
  ) : (
    "No stored spec yet."
  );

  const excluded = report?.score?.excluded ?? 0;
  const rebirthFound =
    resurrected && report ? (
      <ul className="space-y-1">
        <li className="text-success">{report.scoreText}.</li>
        {excluded > 0 ? (
          <li>
            {excluded} inputs left out of the score because the rebuild fixes the vulnerability on purpose (an{" "}
            <Term tip={INTENTIONAL_TIP}>intentional difference</Term>).
          </li>
        ) : (
          <li>No deliberate differences.</li>
        )}
        {(report.vulnerabilitiesRemoved ?? []).length === 0 && vulns && vulns.length > 0 && (
          <li className="text-warn">
            OSV lists a vulnerability, but no recorded input triggered it in the original, so this report cannot show it removed.
          </li>
        )}
      </ul>
    ) : resurrected ? (
      "A rebuild exists, but no comparison is stored yet."
    ) : (
      "No report: there is no rebuild to compare with."
    );

  const honesty = (
    <>
      This is evidence, not proof.{" "}
      {recording && (
        <>
          The match score covers {recording.stats.total.toLocaleString("en-US")} generated inputs
          {branchPct !== null && <>, and about {Math.round(100 - branchPct)}% of the original&apos;s code branches were not reached by them</>}.{" "}
        </>
      )}
      Below, the five steps show how each number was produced.
    </>
  );

  return (
    <main id="main" className="mx-auto max-w-page px-4 pb-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="pt-6 text-sm">
        <Link href="/#graveyard" className="inline-flex items-center gap-1 text-muted no-underline hover:text-fg">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> The Graveyard
        </Link>
      </nav>

      <header className="pb-8 pt-6">
        <h1 className="break-words text-3xl font-semibold tracking-tighter text-fg sm:text-5xl">
          {manifest.name} <span className="align-middle font-sans text-lg font-normal tracking-normal text-muted">v{manifest.version}</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-fg">
          {copy.oneLiner}
          {copy.example && (
            <>
              {" "}
              For example <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-sm">{copy.example}</code>.
            </>
          )}
        </p>
      </header>

      <VerdictBanner
        headline={summary.headline}
        facts={summary.facts}
        name={name}
        rebuilt={summary.rebuilt}
        repoUrl={REPO_URL}
        honesty={honesty}
      />

      {/* No wrapper element: a sticky element only sticks within its parent. */}
      <StepNav items={steps} />

      <StepShell
        n={1}
        slug="autopsy"
        name="Autopsy"
        heading="Death Certificate"
        icon={<Stethoscope className="h-6 w-6" />}
        whatItDoes="Checks the package's health using public sources: the npm registry, the OSV vulnerability database and GitHub."
        whatWeFound={autopsyFound}
      >
        <DeathCertificate name={name} initial={cert} nowIso={now.toISOString()} />
      </StepShell>

      <StepShell
        n={2}
        slug="ghost-memory"
        name="Ghost Memory"
        heading="What the original package really does"
        icon={<Ghost className="h-6 w-6" />}
        whatItDoes={
          <>
            Runs the original package on {recording ? recording.n.toLocaleString("en-US") : "many"} generated inputs in an isolated
            sandbox with no network. For each input we write down what came back: a value, an error, or a side effect. This record is
            the <Term tip={EVIDENCE_TIP}>evidence</Term> every later step uses.
          </>
        }
        whatWeFound={ghostFound}
      >
        <GhostMemory name={name} recording={recording} coverage={coverage} groups={groups} labels={labels} />
      </StepShell>

      <StepShell
        n={3}
        slug="reverse-spec"
        name="Reverse Spec"
        heading="A written spec, built from the evidence"
        icon={<ScrollText className="h-6 w-6" />}
        whatItDoes="An AI model reads the recorded behavior and writes a Kiro spec: requirements, a design, a task list and steering notes. Each requirement must cite the evidence behind it; one without evidence is flagged."
        whatWeFound={specFound}
      >
        <ReverseSpec name={name} bundle={bundle} />
      </StepShell>

      <StepShell
        n={4}
        slug="resurrection"
        name="Resurrection"
        heading={resurrected ? "Rebuilt in Kiro" : "Waiting to be rebuilt"}
        icon={<Hammer className="h-6 w-6" />}
        whatItDoes="A person rebuilds the package in Kiro, an AI coding tool, from the spec bundle. This step happens in Kiro, not on this site."
        whatWeFound={
          resurrected
            ? `A rebuild of ${name} is committed in the repository under resurrected/${name}.`
            : "No rebuild yet. Steps 1 to 3 are ready, so anyone can start one from the spec bundle."
        }
      >
        <ResurrectionDetail name={name} resurrected={resurrected} repoUrl={REPO_URL} rebuiltNames={rebuiltNames} />
      </StepShell>

      <StepShell
        n={5}
        slug="rebirth-report"
        name="Rebirth Report"
        heading="How closely the rebuild behaves like the original"
        icon={<HeartPulse className="h-6 w-6" />}
        whatItDoes="Runs the original and the rebuild on the same inputs and compares every result. Deliberate security fixes are counted separately; anything else that differs is a mismatch."
        whatWeFound={rebirthFound}
      >
        <RebirthReport name={name} report={report} resurrected={resurrected} />
      </StepShell>

      <Glossary />
    </main>
  );
}

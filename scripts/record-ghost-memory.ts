// Offline recording for every Graveyard package (Req 3.2, 3.3, 3.4). For each package it runs the
// recorder with the offline run budget (10 minutes per export, vs 30 s for live runs), assigns real
// class IDs with classifyRecording, and runs the V8 coverage pass. Writes
// data/<package>/ghost-memory.json, classes.json and coverage.json. Timeouts (expected for
// string@3.3.3) are stored as Evidence. A package that fails is reported and not written.
//
// Run: npm run record:ghost-memory [-- <package> ...]
// Node-run code: relative imports only, with .js extensions.
import { listGraveyard } from '../lib/graveyard/loader.js';
import { classifyRecording, writeClasses } from '../lib/ghost-memory/classes.js';
import { measureAndWriteCoverage } from '../lib/ghost-memory/coverage.js';
import { DEFAULT_RECORD_RUN_TIMEOUT_MS, recordPackage, writeRecording } from '../lib/ghost-memory/recorder.js';

async function main(): Promise<number> {
  const root = process.cwd();
  const only = process.argv.slice(2);
  const manifests = listGraveyard({ root }).filter((m) => only.length === 0 || only.includes(m.name));
  if (manifests.length === 0) {
    console.error('no matching Graveyard packages');
    return 2;
  }
  let failures = 0;
  for (const manifest of manifests) {
    const label = `${manifest.name}@${manifest.version}`;
    try {
      const raw = await recordPackage({
        manifest,
        repoRoot: root,
        limits: { runTimeoutMs: DEFAULT_RECORD_RUN_TIMEOUT_MS },
      });
      const { recording, stored } = classifyRecording(manifest, raw);
      const recFile = writeRecording(recording, root);
      const classFile = writeClasses(stored, root);
      const { coverage, file: covFile } = await measureAndWriteCoverage({ manifest, recording, repoRoot: root });
      const s = recording.stats;
      console.log(
        `${label}: total=${s.total} returned=${s.returned} threw=${s.threw} timeouts=${s.timeouts} ` +
          `pollution=${s.pollution} classes=${stored.classes.length} unclassified=${stored.unclassified} ` +
          `fns=${coverage.exportedFunctions.percent.toFixed(0)}% ` +
          `branches=${coverage.branches ? coverage.branches.percent.toFixed(1) + '%' : `null (${coverage.branchesError})`}`,
      );
      console.log(`  wrote ${recFile}\n  wrote ${classFile}\n  wrote ${covFile}`);
    } catch (err) {
      failures++;
      console.error(`${label}: FAILED, nothing written: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : 'unexpected failure');
    process.exitCode = 3;
  },
);

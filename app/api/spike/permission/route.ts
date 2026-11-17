import { spawn } from "node:child_process";
import path from "node:path";
import { hasSpikeAccess, notFound } from "../_guard";

// Temporary spike route (task 2.1). Removed in task 2.3.
export const dynamic = "force-dynamic";

const SPIKE_DIR = path.join(process.cwd(), "spike");
const CHILD = path.join(SPIKE_DIR, "child.mjs");

interface RunResult {
  flags: string[];
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

function run(flags: string[], mode: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...flags, CHILD, mode], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        flags,
        exitCode,
        signal,
        stdout: stdout.slice(0, 2000),
        stderr: stderr.slice(0, 1000),
      });
    });
  });
}

export async function GET(request: Request) {
  if (!hasSpikeAccess(request)) return notFound();

  const maxMb = Number(new URL(request.url).searchParams.get("mb") ?? 64);
  const mb = Number.isFinite(maxMb) ? Math.min(Math.max(maxMb, 16), 512) : 64;
  const read = `--allow-fs-read=${SPIKE_DIR}`;
  const heap = `--max-old-space-size=${mb}`;

  // Try the stable flag first, then the older experimental name.
  const candidates = ["--permission", "--experimental-permission"];
  const attempts: RunResult[] = [];
  let working: string | null = null;
  let info: unknown = null;
  for (const flag of candidates) {
    const r = await run([flag, read, heap], "info");
    attempts.push(r);
    if (r.exitCode === 0) {
      working = flag;
      try {
        info = JSON.parse(r.stdout.trim());
      } catch {
        info = r.stdout;
      }
      break;
    }
  }

  const mem = working ? await run([working, read, heap], "mem") : null;
  const memoryLimitEnforced = mem !== null && (mem.exitCode !== 0 || mem.signal !== null);

  return Response.json({
    serverNodeVersion: process.version,
    workingPermissionFlag: working,
    flagsThatWorked: working ? [working, read, heap] : [],
    info,
    memoryCapMB: mb,
    memoryLimitEnforced,
    memoryRun: mem && {
      exitCode: mem.exitCode,
      signal: mem.signal,
      stderrHead: mem.stderr.slice(0, 300),
    },
    attempts: attempts.map((a) => ({
      flags: a.flags,
      exitCode: a.exitCode,
      stderrHead: a.stderr.slice(0, 300),
    })),
  });
}

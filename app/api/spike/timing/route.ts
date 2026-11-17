import { spawn } from "node:child_process";
import path from "node:path";
import { hasSpikeAccess, notFound } from "../_guard";

// Temporary spike route (task 2.1). Removed in task 2.3.
export const dynamic = "force-dynamic";

const SPIKE_DIR = path.join(process.cwd(), "spike");
const CHILD = path.join(SPIKE_DIR, "child.mjs");

function runWork(calls: number, flag: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const child = spawn(
      process.execPath,
      [flag, `--allow-fs-read=${SPIKE_DIR}`, "--max-old-space-size=64", CHILD, "work", String(calls)],
      { stdio: "ignore" },
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(performance.now() - t0) : reject(new Error(`child exit ${code}`)),
    );
  });
}

/**
 * Synthetic timing: `spawns` sequential child spawns, each doing `calls` cheap calls.
 * Defaults give 1000 calls total (10 x 100). Not a measure of real package timing.
 */
export async function GET(request: Request) {
  if (!hasSpikeAccess(request)) return notFound();

  const params = new URL(request.url).searchParams;
  const spawns = Math.min(Math.max(Number(params.get("spawns") ?? 10) || 10, 1), 100);
  const calls = Math.min(Math.max(Number(params.get("calls") ?? 100) || 100, 1), 10_000);
  const flag = params.get("flag") === "--experimental-permission" ? "--experimental-permission" : "--permission";

  const t0 = performance.now();
  const perSpawnMs: number[] = [];
  try {
    for (let i = 0; i < spawns; i++) perSpawnMs.push(await runWork(calls, flag));
  } catch (e) {
    return Response.json({ error: String(e), completedSpawns: perSpawnMs.length }, { status: 500 });
  }
  const totalMs = performance.now() - t0;
  const sorted = [...perSpawnMs].sort((a, b) => a - b);
  return Response.json({
    flag,
    spawns,
    callsPerSpawn: calls,
    totalCalls: spawns * calls,
    totalMs: Math.round(totalMs),
    meanSpawnMs: Math.round(perSpawnMs.reduce((a, b) => a + b, 0) / spawns),
    medianSpawnMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
    maxSpawnMs: Math.round(sorted[sorted.length - 1]),
    note: "Synthetic timing only; real package timing is checked in task 13.",
  });
}

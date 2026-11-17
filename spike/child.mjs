// Temporary spike child process (task 2.1). Runs under --permission.
// Modes: info | mem | work
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import v8 from "node:v8";

const mode = process.argv[2] ?? "info";

if (mode === "info") {
  let writeDenied = false;
  let writeError = null;
  try {
    fs.writeFileSync(path.join(os.tmpdir(), "revenant-spike-write-test"), "x");
  } catch (e) {
    writeDenied = e?.code === "ERR_ACCESS_DENIED";
    writeError = `${e?.name}: ${e?.code ?? e?.message}`;
  }
  let spawnDenied = false;
  try {
    const cp = await import("node:child_process");
    cp.spawnSync("echo", ["hi"]);
  } catch (e) {
    spawnDenied = e?.code === "ERR_ACCESS_DENIED";
  }
  console.log(
    JSON.stringify({
      nodeVersion: process.version,
      permissionEnabled: process.permission?.has("fs.write") === false,
      heapSizeLimitMB: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576),
      fsWriteDenied: writeDenied,
      fsWriteError: writeError,
      childProcessDenied: spawnDenied,
    }),
  );
} else if (mode === "mem") {
  // Allocate until the heap cap kills the process (fatal OOM, non-zero exit or signal).
  const keep = [];
  for (;;) keep.push(new Array(100000).fill(keep.length));
} else if (mode === "work") {
  const calls = Number(process.argv[3] ?? 20);
  let acc = 0;
  for (let i = 0; i < calls; i++) {
    const o = {};
    o["k" + i] = [i, i + 1, { n: i }];
    acc += JSON.stringify(o).length;
  }
  console.log(acc);
}

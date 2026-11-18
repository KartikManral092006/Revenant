import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

// Uses git's own gitignore semantics. Exit 0 = ignored, 1 = not ignored.
function isIgnored(path: string): boolean {
  const r = spawnSync("git", ["check-ignore", "-q", "--no-index", path], { cwd: root });
  if (r.status !== 0 && r.status !== 1) {
    throw new Error(`git check-ignore failed: ${r.stderr?.toString()}`);
  }
  return r.status === 0;
}

describe("repository checks", () => {
  it(".kiro/ is not ignored", () => {
    for (const p of [".kiro", ".kiro/specs/revenant-mvp/tasks.md", ".kiro/hooks/x.json", ".kiro/steering/x.md"]) {
      expect(isIgnored(p), p).toBe(false);
    }
  });

  it("root LICENSE exists and starts with a recognizable license header", () => {
    const path = resolve(root, "LICENSE");
    expect(existsSync(path)).toBe(true);
    const head = readFileSync(path, "utf8").trimStart().slice(0, 200);
    expect(head).toMatch(
      /^(MIT License|Apache License|BSD \d-Clause License|ISC License|Mozilla Public License|GNU (General|Lesser|Affero) )/i,
    );
  });

  it(".env.local is ignored, .env.example is not", () => {
    expect(isIgnored(".env.local")).toBe(true);
    expect(isIgnored(".env.example")).toBe(false);
  });

  it(".env.example lists GROQ_API_KEY and GITHUB_TOKEN without values", () => {
    const lines = readFileSync(resolve(root, ".env.example"), "utf8").split(/\r?\n/);
    const entries = new Map<string, string>();
    for (const line of lines) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
      if (m) entries.set(m[1], m[2].trim());
    }
    for (const key of ["GROQ_API_KEY", "GITHUB_TOKEN"]) {
      expect(entries.has(key), `${key} listed`).toBe(true);
      expect(entries.get(key), `${key} has no value`).toBe("");
    }
  });
});

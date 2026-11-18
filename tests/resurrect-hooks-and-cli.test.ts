import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runCli, EXIT_MISMATCH, EXIT_USAGE } from "../lib/diff/cli";
import { runDiff } from "../lib/diff/runner";

const root = path.join(__dirname, "..");

// Requirements 13.1, 13.3: hook files
describe("resurrect hook files", () => {
  for (const pkg of ["lodash.set", "lodash.pick"]) {
    const doc = JSON.parse(readFileSync(path.join(root, ".kiro/hooks", `resurrect-${pkg.replace(".", "-")}.json`), "utf8"));
    const hook = doc.hooks[0];
    const re = new RegExp(hook.matcher);

    it(`${pkg}: version, trigger and command`, () => {
      expect(doc.version).toBe("v1");
      expect(doc.hooks).toHaveLength(1);
      expect(hook.trigger).toBe("PostFileSave");
      expect(hook.action).toEqual({ type: "command", command: `npm run resurrect -- ${pkg}` });
    });

    it(`${pkg}: matcher matches its own files only`, () => {
      expect(re.test(`resurrected/${pkg}/src/index.js`)).toBe(true);
      expect(re.test(`${root}/resurrected/${pkg}/src/index.js`)).toBe(true);
      const other = pkg === "lodash.set" ? "lodash.pick" : "lodash.set";
      expect(re.test(`resurrected/${other}/src/index.js`)).toBe(false);
      expect(re.test(`resurrected/${pkg}-extra/src/index.js`)).toBe(false);
      expect(re.test(`resurrected/${pkg.replace(".", "x")}/src/index.js`)).toBe(false);
    });
  }
});

// Requirements 13.1, 13.2: CLI exit codes
describe("resurrect CLI", () => {
  const fixture = path.join(__dirname, "fixtures", "wrong-pick-rebuild");

  it("counts mismatches against a wrong rebuild and exits 1", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["lodash.pick", "--n", "20"], {
      root,
      io: { out: (l) => out.push(l), err: (l) => err.push(l) },
      run: (opts) => runDiff({ ...opts, rebuildDir: fixture }),
    });
    expect(err).toEqual([]);
    expect(code).toBe(EXIT_MISMATCH);
    const line = out.find((l) => l.startsWith("mismatches: "));
    expect(line).toBeDefined();
    expect(Number(line!.slice("mismatches: ".length))).toBeGreaterThan(0);
  }, 60_000);

  // Requirements 7.1, 7.2, 13.1: seed and N come from the manifest or flags, and are stored with the run.
  async function capture(argv: string[]) {
    const seen: { seed: number; n: number; inputs: unknown[] }[] = [];
    const written: Record<string, string> = {};
    const out: string[] = [];
    const code = await runCli(argv, {
      root,
      io: { out: (l) => out.push(l), err: () => {} },
      write: (f, t) => {
        written[f] = t;
      },
      run: async (opts) => {
        const inputs: unknown[] = [];
        for await (const i of opts.inputs) inputs.push(i);
        seen.push({ seed: opts.seed, n: opts.n, inputs });
        return {
          seed: opts.seed,
          n: opts.n,
          summary: { total: 0, matched: 0, intentional: 0, mismatches: 0, scoreText: "0 / 0 inputs matched", partial: false } as never,
          partial: false,
          samples: [],
        };
      },
    });
    return { code, seen: seen[0], written, out };
  }

  it("uses the manifest seed and N=1000 by default, and --seed/--n override them", async () => {
    const manifest = JSON.parse(readFileSync(path.join(root, "graveyard/lodash.set/manifest.json"), "utf8"));
    const def = await capture(["lodash.set"]);
    expect(def.seen.seed).toBe(manifest.generator.seed);
    expect(def.seen.n).toBe(1000);
    expect(def.seen.inputs.length).toBeGreaterThan(0);

    const a = await capture(["lodash.set", "--seed", "7", "--n", "50"]);
    const b = await capture(["lodash.set", "--seed", "7", "--n", "50"]);
    const c = await capture(["lodash.set", "--seed", "8", "--n", "50"]);
    expect(a.seen.seed).toBe(7);
    expect(a.seen.n).toBe(50);
    expect(a.seen.inputs).toEqual(b.seen.inputs);
    expect(a.seen.inputs).not.toEqual(c.seen.inputs);
  });

  it("--write stores the seed and N in data/<package>/diff-run.json", async () => {
    const r = await capture(["lodash.set", "--seed", "7", "--n", "50", "--write"]);
    const file = Object.keys(r.written).find((f) => f.endsWith(path.join("data", "lodash.set", "diff-run.json")));
    expect(file).toBeDefined();
    const doc = JSON.parse(r.written[file!]);
    expect(doc.seed).toBe(7);
    expect(doc.n).toBe(50);
  });

  it("exits 2 for an unknown package", async () => {
    const err: string[] = [];
    const code = await runCli(["not-a-package"], { root, io: { out: () => {}, err: (l) => err.push(l) } });
    expect(code).toBe(EXIT_USAGE);
    expect(err.join("\n")).toContain("Unknown package");
  });
});

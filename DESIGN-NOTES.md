# Design Notes: input for the revenant-mvp design phase

These are decisions already made. The design must follow them or state clearly why it changes one.

## 1. Evidence grouping before the LLM (behavior classes)
- Ghost Memory records every call as one Evidence record.
- Before any Groq call, deterministic code (no LLM) groups records into **behavior classes**.
- A class key is built from per-package features defined in the package manifest. For `lodash.set`: path shape (dot, bracket-index, mixed, empty, `__proto__`/`constructor.prototype`), target type (plain object, array, primitive, null/undefined), and outcome (returned, threw `<ErrorName>`, timeout, global prototype pollution).
- Groq receives each class with its count and up to 3 representative Evidence records with their IDs, never the full recording.
- Records that fit no defined feature value go into an **unclassified** class. They are never dropped. Up to 10 are sent to Groq individually, and the report shows the unclassified count, so the gap is visible.
- Each generated requirement cites class IDs. A class ID resolves to its Evidence_IDs. A citation of a missing class or Evidence_ID is flagged.
- Traceability = requirements citing at least one existing class / total requirements.

## 2. Evidence IDs
- Format: `<package>:<export>:<first 12 hex chars of sha256(canonical serialized input)>`.
- Same input gives the same ID across runs, so citations stay valid when a recording is regenerated with the same seed.
- The fast-check seed and N are stored alongside each recording.

## 3. Sandbox file access
- The child process runs with the Node permission model enabled.
- Filesystem read is granted only to `sandbox/` and `node_modules/<package>/`. Filesystem write, child processes, workers, WASI and addons are not granted.
- Verify exact flag names (`--permission` vs `--experimental-permission`, `--allow-fs-read`) for the Node version pinned in `engines` and used on Render.
- Network modules and global `fetch` are replaced with throwing stubs before the package is loaded.

## 4. Intentional differences are rules
- `graveyard/<package>/intentional-differences.json` holds rules: `{ id, reason, advisory (CVE/GHSA), when: { original, rebuild } }`.
- Example for `lodash.set`: when the original shows global prototype pollution AND the rebuild either throws or leaves global prototypes untouched, the case is intentional (CVE-2020-8203).
- A difference that no rule explains is a mismatch and counts against the score.
- The report lists each rule with how many inputs it covered.

## 5. Fast for judges (Render cold start)
- Every page renders first from precomputed JSON in `data/<package>/` (Autopsy snapshot with its fetch timestamp, Ghost Memory recording, behavior classes, spec bundle, last differential run).
- A "Run live" action triggers a real Autopsy fetch or a real sandboxed run, with streamed progress.
- Precomputed data always shows when it was generated, so cached results are never presented as live.

## 6. Verified facts (checked 2026-11-17; re-check before submission)

**Node permission model (tested on Node v22.23.1):**
- `--permission` works on Node 22 (alias `--experimental-permission`). Grant flags: `--allow-fs-read=<path>`, `--allow-fs-write=<path>`, `--allow-child-process`, `--allow-worker`, `--allow-addons`, `--allow-wasi`. With `--permission` and only `--allow-fs-read`, fs writes and `child_process` fail with `ERR_ACCESS_DENIED`.
- The permission model does **not** block network on Node 22: `fetch` to an external URL succeeded under `--permission`. The network stubs from section 3 are required, not optional. They are a JavaScript-level defense, not OS isolation; the design must say so and rely on the curated Graveyard as the main safeguard.
- **V8 coverage does not work inside the sandbox.** Under `--permission`, `NODE_V8_COVERAGE` writes no files (even with `--allow-fs-write` to the coverage dir), and `inspector.Session.connect()` throws `ERR_ACCESS_DENIED` (permission: Inspector).

**Graveyard data (live npm registry, npm downloads, OSV with version query):**

| Package@version | Last publish | npm deprecated | Weekly downloads | OSV vulns affecting this version |
|---|---|---|---|---|
| lodash.set@4.3.2 | 2016-08-13 | no | ~2.0M | GHSA-p6mc-m468-83gw (CVE-2020-8203) |
| lodash.pick@4.4.0 | 2016-08-13 | yes ("Use destructuring assignment syntax instead.") | ~2.2M | GHSA-p6mc-m468-83gw (CVE-2020-8203) |
| string@3.3.3 | 2016-10-11 | no | ~80K | GHSA-g36h-6r4f-3mqp (CVE-2017-16116, ReDoS) |
| deep-extend@0.6.0 | 2018-05-22 | no | ~60M | none (CVE-2018-3750 exists but does not affect 0.6.0) |

All four are MIT. Download counts change weekly; the app must show live values.

**Monorepo caveat:** `lodash.set` and `lodash.pick` point to `github.com/lodash/lodash`, which is not archived and was pushed to recently. The repo status describes the monorepo, not the per-method package. The Death Certificate must label this ("source repo is the lodash monorepo") instead of implying the package is maintained, and "dead" for these packages rests on last publish date.

**ReDoS caveat:** `string@3.3.3`'s known issue is ReDoS, so some generated inputs may hit the per-call timeout. Timeouts are Evidence, not crashes.

## 7. Open decision: how to measure coverage (Requirement 3.3)

Because V8 coverage is blocked under the permission model, choose one:
- **(A) Recommended for MVP:** a separate, offline coverage pass for curated packages only (run by a developer or at build time, without `--permission`, network stubs still on). Store coverage in `data/<package>/` with its timestamp; the UI labels it as from the stored recording. Live runs stay fully sandboxed and do not report coverage.
- **(B)** Instrument the pinned package source at build time (e.g. istanbul-lib-instrument) and return counters over IPC, so live sandboxed runs report coverage. Adds a dependency and build step.

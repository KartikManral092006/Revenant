# Implementation Plan: Revenant MVP

## Overview

The plan follows the critical path set for the Kiroween 2026 build: scaffold, a Render spike, the Graveyard, the Sandbox, the differential core, Ghost Memory, Autopsy, Reverse Spec, the Rebirth Report, the UI, the spec bundle download, resurrection skeletons, and deployment checks. The language is TypeScript (strict) on Node 22, matching design.md.

Conventions used in this list:

- Property tests are required sub-tasks, except Properties 24 and 25, which are optional. Each property test is a single fast-check property with `numRuns >= 100` and a comment tag `// Feature: revenant-mvp, Property <n>: <text>`.
- Unit, example and component tests marked `*` are optional.
- Server-only code stays in `lib/` and `sandbox/`. Graveyard packages are loaded only by the sandbox child, never imported by app code.
- Revenant reports evidence for equivalence. Do not write "proven", "guaranteed" or "identical" in code strings, docs or UI text.
- The rebuild code for `lodash.set` and `lodash.pick` is not part of this spec (see task 12).

## Tasks

- [x] 1. Scaffold the project
  - [x] 1.1 Create the Next.js App Router project with TypeScript strict mode, Tailwind CSS, Vitest and fast-check
    - Create `package.json` with `engines.node` set to `"22.x"`, Vitest config, fast-check dev dependency, and Tailwind config
    - Create a `.node-version` file at the repository root containing `22.23.1` (the Node version pinned in design.md)
    - Create the folder layout from structure.md (`app/`, `components/`, `lib/`, `sandbox/`, `graveyard/`, `resurrected/`, `data/`, `tests/`)
    - Do not add runtime dependencies beyond `next`, `react`, `react-dom`, `groq-sdk`
    - Confirm no login or auth middleware exists
    - _Requirements: 11.2_

  - [x] 1.2 Add `tsconfig.node.json`, the build scripts and the import guard
    - Create one `tsconfig.node.json` that compiles `sandbox/`, `lib/graveyard`, `lib/diff` and `lib/ghost-memory` (and anything they import) into a single `outDir` of `build/node/`, with `rootDir` set to the repository root so the output mirrors the source tree
    - Node-run code (everything compiled by `tsconfig.node.json`) uses relative imports only, with no path aliases, because `tsc` does not rewrite aliases in emitted JavaScript; follow the file-extension rules of the chosen `module` setting
    - Add scripts `build:node`, `build` and `resurrect` exactly as in design.md. `build` runs `build:node`, then `node build/node/lib/graveyard/check-pins.js`, then `npm ci --ignore-scripts --prefix graveyard`, then `next build`. `resurrect` runs `node build/node/lib/diff/cli.js`
    - Add an ESLint `no-restricted-imports` rule that blocks imports of Graveyard package names from `app/`, `lib/` and `components/`
    - Add `build/` and `graveyard/node_modules` to `.gitignore` (keep `.kiro/` committed)
    - Add `!.env.example` to `.gitignore`, after any env-file ignore pattern, so `.env.example` stays tracked while `.env.local` and other env files stay ignored
    - _Requirements: 1.2, 1.3, 1.6_

  - [ ]* 1.3 Write static check tests for server-only code and Graveyard imports
    - Test that no file under `components/` or client files in `app/` imports from `lib/` or `sandbox/`
    - Test that no file under `app/`, `lib/` or `components/` imports a Graveyard package name
    - _Requirements: 1.3, 5.9_

- [x] 2. Render spike (early, small)
  - [x] 2.1 Build the minimal spike routes
    - Every spike route requires a secret token, read from the `SPIKE_TOKEN` environment variable and compared with the `x-spike-token` request header, and returns 404 when the token is missing or wrong (or when `SPIKE_TOKEN` is unset). The token is set in Render's environment settings and is never committed; add `SPIKE_TOKEN` to `.env.example` without a value
    - Add a temporary route that spawns a child with `--permission`, `--allow-fs-read=<spike dir>` and `--max-old-space-size=<MB>`, and returns the Node version, the flags that worked, the child's memory limit result and whether fs write is denied
    - Add a temporary route that streams NDJSON lines with a delay between them using a web `ReadableStream`, so buffering by Render's proxy is observable
    - Add a temporary route that echoes the client IP candidates (`X-Forwarded-For` entries and the socket address)
    - Add a synthetic CPU-bound timing route (a loop of child spawns and calls) to give a rough N=1000 timing
    - Add a short `spike/README.md` with the steps for the user to deploy to Render and read the results
    - _Requirements: 4.5, 4.6, 7.6_

  - [x] 2.2 Record the spike results in design.md open items 2, 3, 10, 16, 17
    - The user deploys the spike to Render and supplies the output. Then update only the Status column of items 2 (Render Node version, memory, CPU), 3 (`--permission` and `--max-old-space-size` allowed), 10 (N=1000 fits in 60 s, synthetic timing only; real timing is checked in task 13), 16 (client IP derivation) and 17 (NDJSON not buffered) in the "Known Risks and Open Items" table
    - Write the measured values and the date next to each item
    - _Requirements: 4.5, 4.6, 6.1, 7.6, 7.7_

  - [x] 2.3 Remove the spike routes from the application
    - Delete the temporary spike routes so no public debug endpoint ships
    - Keep `spike/README.md` only if it is marked as historical
    - _Requirements: 4.1_

- [x] 3. Graveyard
  - [x] 3.1 Create `graveyard/package.json` with exact pins and a committed lockfile
    - Pins: `lodash.set@4.3.2`, `lodash.pick@4.4.0`, `string@3.3.3`, `deep-extend@0.6.0`, no range operators
    - Run `npm install --ignore-scripts --prefix graveyard` once to create `graveyard/package-lock.json` and commit it
    - _Requirements: 1.1, 1.2_

  - [x] 3.2 Implement the manifest types and validator in `lib/graveyard/manifest-schema.ts`
    - Hand-written validator for the `Manifest` shape in design.md, including `graveyardCriteria` with a human `pureFunction` judgment
    - Reject non-exact versions; require `"__proto__"`, `"constructor.prototype"` and an array-index path in `edgeCases` when the generator has string, object, array or path inputs; compute effective N (1000 if omitted)
    - _Requirements: 1.4, 1.5, 12.2, 12.3, 12.4_

  - [x] 3.3 Write property test for manifest validation
    - **Property 26: Manifest validation**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 12.2, 12.3, 12.4**

  - [x] 3.4 Implement `lib/graveyard/check-pins.ts`
    - Exact-version regex from design.md, manifest version equals `graveyard/package.json`, lockfile exists and the locked version equals the manifest version
    - Exit non-zero on any failure so the build stops
    - _Requirements: 1.2, 1.6_

  - [x] 3.5 Write property test for the pin validator
    - **Property 1: Pin validator accepts exactly pinned versions**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 1.2, 1.6**

  - [x] 3.6 Implement the allowlist loader in `lib/graveyard/`
    - `resolvePackageDir(name)` returns an absolute path under `graveyard/node_modules/` only for names in the manifest list, otherwise throws
    - Add `listGraveyard()` that returns the 3 to 5 manifests
    - _Requirements: 1.1, 1.3_

  - [x] 3.7 Write property test for the allowlist loader
    - **Property 2: Only allowlisted packages resolve**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 1.3**

  - [x] 3.8 Write the four manifests
    - Create `graveyard/<package>/manifest.json` for `lodash.set`, `lodash.pick`, `string` and `deep-extend`
    - Read the installed packages to confirm the exports under test and arities. Fill `generator`, `edgeCases`, `classFeatures`, `monorepo` (true for the two lodash modules), `resurrection` (`full` for the two lodash modules, `autopsy-and-ghost-memory` for the other two) and `originalTestSuite`
    - Fill `graveyardCriteria` with the evidence and dates from design.md (unmaintained, permissive license, weekly downloads) and a human `pureFunction` note
    - Run the validator over all four manifests in a test
    - _Requirements: 1.1, 1.4, 1.5, 12.1, 12.2, 12.3_

  - [x] 3.9 Checkpoint after task 3
    - Run all tests; stop and ask me if anything fails.

- [x] 4. Sandbox
  - [x] 4.1 Implement `sandbox/protocol.ts` and `sandbox/serialize.ts`
    - Define `ParentMsg`, `ChildMsg`, `Outcome`, `Limits`, `Tagged` and `PollutionReport` from design.md
    - Tagged serializer and deserializer for `undefined`, `NaN`, `Infinity`, `-Infinity`, `-0`, functions (descriptor), errors (`name` and `message` only), circular references, objects with own `$t` keys, and own `__proto__` keys (rebuilt with `Object.defineProperty`)
    - Encode unsupported kinds (bigint, symbol, Date, Map, Set, class instances) as `{"$t":"other"}`
    - `sandbox/` imports nothing from `app/` or `lib/`
    - _Requirements: 4.8, 4.9_

  - [x] 4.2 Write property test for tagged serialization
    - **Property 9: Tagged serialization round trip**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 4.8, 4.9**

  - [x] 4.3 Implement size limit checks in `sandbox/limits.ts`
    - Reject an input larger than the maximum input size and mark an output larger than the maximum as `output-too-large` with the byte count
    - Use the proposed defaults from design.md (64 KiB in, 256 KiB out) as configurable values
    - _Requirements: 4.5_

  - [x] 4.4 Write property test for size limits
    - **Property 10: Size limits are enforced**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 4.5**

  - [x] 4.5 Implement `sandbox/pollution.ts`
    - Snapshot own keys and descriptor `value`, `get`, `set` identities of `Object.prototype`, `Array.prototype` and `Function.prototype`
    - Compare after each call and return a `PollutionReport` (added, removed, changed keys); do not freeze the prototypes
    - Make the comparison testable against stand-in objects
    - _Requirements: 4.10, 4.11_

  - [x] 4.6 Write property test for prototype change detection
    - **Property 11: Prototype change detection**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 4.10**

  - [x] 4.7 Implement `sandbox/stubs.ts`
    - Replace `http`, `https`, `net`, `dgram`, `tls`, `dns`, their `node:` forms, `dns/promises`, and `globalThis.fetch` with stubs that throw an error named `NetworkBlockedError` naming the module
    - Apply through a `Module._load` wrapper plus overwriting the global properties, before the package loads
    - _Requirements: 4.7_

  - [x] 4.8 Implement the child entry `sandbox/child.ts`
    - Handle `init`, `call` and `shutdown` messages over `process.send`
    - Install stubs, take the pollution snapshot, load the package by absolute path, deserialize a fresh copy of the arguments per call, call the export, serialize the outcome and the post-call arguments, apply size limits, discard console output
    - On pollution, send the result and then exit
    - Record thrown errors by `name` and `message`
    - _Requirements: 4.1, 4.5, 4.8, 4.9, 4.10, 4.11_

  - [x] 4.9 Implement the parent runner `lib/ghost-memory/sandbox-runner.ts`
    - Start the child with `process.execPath`, an empty environment, `--permission`, `--allow-fs-read` for `build/node/sandbox` and the package directory under test only, and `--max-old-space-size`; no write, child-process, worker, addon or wasi grants
    - Per-call timer: kill with `SIGKILL`, record a `timeout` result, respawn, continue
    - Per-run wall-clock timer: kill the child and return partial results
    - Respawn after a pollution result and after an unexpected child exit (record the in-flight call as an error)
    - Interface as in design.md (`runBatch` with `inputs`, `limits`, `signal`, `onResult`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.11_

  - [x] 4.10 Write property test for timeout alignment
    - **Property 12: Timeouts keep results aligned with inputs**
    - Create fixture packages under `tests/fixtures/` (never Graveyard packages), including a function that hangs on marked inputs
    - Use fast-check with `numRuns >= 100`; if child-process runs make 100 too slow, lower the batch size per run, not the run count
    - **Validates: Requirements 4.3**

  - [ ]* 4.11 Write sandbox integration tests with fixtures
    - Cover the table in design.md "Sandbox integration tests": network stubs (including `node:` forms and `dns/promises`), fs write denied, child process denied, worker denied, addon denied, read outside the grant denied, environment empty, per-call timeout and respawn, run wall clock partial result, memory cap, prototype pollution and respawn, size limits
    - Show that the stubs, not the permission model, stop network calls
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.10, 4.11_

- [ ] 5. Differential core
  - [x] 5.1 Implement `lib/diff/comparator.ts`
    - Match rule from design.md: same outcome (deep-equal returned values via `node:util` `isDeepStrictEqual`, same error `name`, or both timeouts), deep-equal post-call arguments, same pollution flag
    - A timeout on only one side is a mismatch
    - _Requirements: 7.3, 7.4, 7.8_

  - [x] 5.2 Write property test for the comparator
    - **Property 19: Comparator follows the match rule**
    - Use fast-check with `numRuns >= 100`; include symmetry and single-perturbation cases
    - **Validates: Requirements 7.3, 7.4, 7.8**

  - [x] 5.3 Implement `lib/diff/rules.ts` and the per-package rule files
    - Types `IntentionalDifferenceRule` and `SideMatcher`; validator (non-empty `reason`, `advisory` matches `^(CVE-\d{4}-\d{4,}|GHSA(-[a-z0-9]{4}){3})$`)
    - Evaluation: plain match first, then rules in file order (first match wins), otherwise mismatch
    - Create `graveyard/<package>/intentional-differences.json` for all four packages with an empty rule list for now (rules are authored in task 6.14)
    - _Requirements: 8.1, 8.2_

  - [~] 5.4 Write property test for rule evaluation order
    - **Property 21: Rule evaluation order**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 8.2**

  - [x] 5.5 Implement `lib/diff/scoring.ts`
    - Counts T, M, I, X and S = T - I; score text `M / S inputs matched` with thousands separators; per-rule counts; partial flag; `0 / 0 inputs matched` when S is 0
    - _Requirements: 8.2, 9.4_

  - [~] 5.6 Write property test for score arithmetic
    - **Property 20: Score arithmetic and exclusion of intentional differences**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 8.2, 9.4, 9.5**

  - [~] 5.7 Implement `lib/diff/runner.ts`
    - Take an input source (`AsyncIterable<Tagged[]>`) and a seed and N; start one sandbox runner for the original (`graveyard/node_modules/<package>`) and one for `resurrected/<package>`; send the same serialized inputs in the same order
    - Per input: compare, apply rules, update the score, call a progress callback
    - Budget timer (60 s for live N=1000) stops the run with `partial: true` and T equal to inputs completed on both sides
    - Return seed, N, summary and capped mismatch samples
    - _Requirements: 7.1, 7.3, 7.4, 7.7, 8.2_

  - [~] 5.8 Implement the Resurrection CLI `lib/diff/cli.ts`
    - Arguments: one required allowlisted package name, optional `--n <int>`, `--seed <int>`, `--write` (store the result as `data/<package>/diff-run.json`)
    - Pure function `exitCodeFor(summary)`; exit codes 0 (X = 0), 1 (X > 0), 2 (usage error: missing or unknown package), 3 (sandbox or infrastructure failure)
    - Print the score line, the seed and the first mismatches; keep the `resurrect` npm script from task 1.2 working
    - The input source is wired to the generators in task 6.12
    - _Requirements: 13.1, 13.2, 13.4, 7.2_

  - [~] 5.9 Write property test for the CLI exit code
    - **Property 27: CLI exit code follows mismatches**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 13.2, 13.4**

  - [~] 5.10 Create the `resurrect-lodash-set` hook with the `createHook` tool
    - Call `createHook` with id `resurrect-lodash-set`, name `Resurrect lodash.set`, trigger `PostFileSave`, matcher `resurrected/lodash\.set/`, action type `command`, command `npm run resurrect -- lodash.set`
    - Do not hand-write the JSON file
    - _Requirements: 13.3_

  - [~] 5.11 Create the `resurrect-lodash-pick` hook with the `createHook` tool
    - Call `createHook` with id `resurrect-lodash-pick`, name `Resurrect lodash.pick`, trigger `PostFileSave`, matcher `resurrected/lodash\.pick/`, action type `command`, command `npm run resurrect -- lodash.pick`
    - Do not hand-write the JSON file
    - _Requirements: 13.3_

  - [ ]* 5.12 Write tests for the hook files and the CLI against a wrong fixture rebuild
    - Hook files parse, have `version: "v1"`, trigger `PostFileSave`, the expected command; the matcher matches `resurrected/<package>/src/index.js` and does not match another package or `resurrected/<package>-extra/`
    - CLI run against a deliberately wrong fixture rebuild counts mismatches and exits 1; unknown package exits 2
    - _Requirements: 13.1, 13.2, 13.3_

  - [~] 5.13 Checkpoint after task 5
    - Run all tests; stop and ask me if anything fails.

- [ ] 6. Ghost Memory
  - [x] 6.1 Implement `lib/ghost-memory/evidence-id.ts` and the Evidence and Recording types
    - Canonical JSON over the tagged form (sorted keys, no whitespace); ID is `<package>:<export>:<first 12 hex of sha256>` using `node:crypto`
    - `Evidence`, `Recording` and `BehaviorClass` types from design.md
    - _Requirements: 3.2_

  - [~] 6.2 Write property test for Evidence IDs
    - **Property 6: Evidence ID determinism and format**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 3.2**

  - [x] 6.3 Implement generators in `lib/ghost-memory/generators/<package>.ts`
    - Build fast-check generators for the four packages from the manifest generator config, mixing in the hand-picked edge cases; produce N serialized inputs from a seed
    - Limit generators to the serializable domain; check per package that this is enough for the exports under test
    - _Requirements: 3.1, 7.1, 12.3_

  - [~] 6.4 Write property test for input list reproducibility
    - **Property 18: Same seed gives the same input list**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 7.1, 7.2**

  - [~] 6.5 Implement `lib/ghost-memory/recorder.ts`
    - Run the generated inputs through the sandbox runner against the original package and build a `Recording` (seed, N, node version, limits, evidence, stats)
    - Store a repeated input once with a `count`; fail the recording on an ID collision with different canonical input
    - Write `data/<package>/ghost-memory.json` with `schemaVersion` and `generatedAt`; timeouts and pollution are recorded as Evidence
    - _Requirements: 3.1, 3.2, 3.4, 4.3, 4.11_

  - [~] 6.6 Write property test for the stored JSON round trip
    - **Property 7: Stored JSON round trip**
    - Cover recordings here; the spec-bundle record is covered by the same property in task 8.9
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 3.4, 5.7**

  - [~] 6.7 Implement behavior classes in `lib/ghost-memory/features/` and `classes.ts`
    - Named feature extractors (for example `setPathShape`, `targetType`, `outcome`) referenced from the manifest
    - Class ID `<package>:<export>:class:<key>`; values outside the allowed list go to the `unclassified` class; representatives are up to 3 lowest IDs; write `data/<package>/classes.json`
    - _Requirements: 3.2, 5.2_

  - [~] 6.8 Write property test for the class partition
    - **Property 13: Behavior class partition is total**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 3.2, 5.2**

  - [~] 6.9 Implement the offline coverage pass `lib/ghost-memory/coverage.ts` (Option A)
    - Replay the stored recording's inputs in a child started with `NODE_V8_COVERAGE` and without `--permission` (network stubs stay on)
    - Summarize V8 JSON to exported functions exercised (from Evidence) and branch coverage; write `data/<package>/coverage.json` with `measuredAt`; set `branches` to `null` if the V8 pass fails for a package
    - _Requirements: 3.3_

  - [~] 6.10 Write property test for the coverage summary
    - **Property 8: Coverage summary bounds**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 3.3, 3.5**

  - [~] 6.11 Implement the live Ghost Memory route `app/api/ghost-memory/[package]`
    - Allowlist check (404 otherwise); run the recorder in live mode with the 30 s run limit and stream NDJSON progress and results
    - The live result omits API_Surface_Coverage and says so
    - _Requirements: 3.1, 3.5, 4.4_

  - [~] 6.12 Wire the generators into the Resurrection CLI and the differential runner
    - The CLI and the runner use the manifest seed (or `--seed`) and N (default 1000) and the generators from 6.3
    - Store the seed with the run so it reproduces
    - _Requirements: 7.1, 7.2, 13.1_

  - [~] 6.13 Create the offline recording script and commit the stored data
    - Add a script that runs the recorder, the class builder and the coverage pass for each Graveyard package with a larger run budget than live runs
    - Commit `data/<package>/ghost-memory.json`, `classes.json` and `coverage.json` for all four packages
    - Expect timeouts for `string@3.3.3`; record them as Evidence
    - _Requirements: 3.2, 3.3, 3.4_

  - [~] 6.14 Author the intentional-difference rules for `lodash.set` and `lodash.pick`
    - Use the recordings to see how prototype pollution shows up for each package; write the rules in `graveyard/<package>/intentional-differences.json` with `reason` and `advisory` GHSA-p6mc-m468-83gw / CVE-2020-8203
    - Confirm how `lodash.pick` shows the issue before writing its rule (design open item 22)
    - _Requirements: 8.1_

- [ ] 7. Autopsy
  - [x] 7.1 Implement `lib/autopsy/http.ts`
    - Shared fetch wrapper with `AbortController` timeout (proposed 10 s) returning `{ ok: true, value } | { ok: false, reason }`
    - Define the `Field<T>` type
    - _Requirements: 2.3, 2.4_

  - [x] 7.2 Implement `lib/autopsy/npm.ts` and `lib/autopsy/downloads.ts`
    - Registry document: last publish (latest entry in `time`, excluding `created` and `modified`), deprecation, license, repository URL; downloads from the last-week endpoint
    - Check the field names against live responses (design open item 1)
    - _Requirements: 2.1, 2.4_

  - [x] 7.3 Implement `lib/autopsy/osv.ts`
    - `POST https://api.osv.dev/v1/query` with the package name, `npm` ecosystem and pinned version; return ID, aliases and summary
    - _Requirements: 2.1, 2.4_

  - [x] 7.4 Implement `lib/autopsy/github.ts` with the cache
    - Parse owner and repo from the repository URL; send `Authorization: Bearer` only when `GITHUB_TOKEN` is set (server side only)
    - In-memory cache per repository with a TTL (proposed 1 hour); serve the stored snapshot, labelled with its timestamp, when a live call fails
    - _Requirements: 2.1, 2.5, 2.6_

  - [~] 7.5 Write property test for the GitHub cache
    - **Property 4: GitHub cache limits upstream calls**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 2.6**

  - [x] 7.6 Implement `lib/autopsy/certificate.ts`
    - Assemble the `DeathCertificate`: every required field present, failed sources become `unknown` with a reason, no fabricated values
    - Inactive flag when the latest publish is more than 24 calendar months ago; set `repo.note` to "source repo is the lodash monorepo" when the manifest has `monorepo: true`
    - _Requirements: 2.2, 2.4, 2.7_

  - [~] 7.7 Write property test for certificate completeness
    - **Property 3: Death Certificate is complete and never fabricated**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 2.2, 2.4**

  - [~] 7.8 Write property test for the Inactive classification
    - **Property 5: Inactive classification**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 2.7**

  - [~] 7.9 Implement the Autopsy route and the stored snapshots
    - `app/api/autopsy/[package]` with allowlist check, returning a live certificate
    - Add a script that writes `data/<package>/autopsy.json` with `source: 'snapshot'` and `fetchedAt`; commit the four snapshots
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ]* 7.10 Write unit tests for the Autopsy clients with a mocked `fetch`
    - Success, timeout, HTTP 500 and malformed body for each client; token header present only when `GITHUB_TOKEN` is set
    - _Requirements: 2.3, 2.4, 2.5_

- [ ] 8. Reverse Spec
  - [~] 8.1 Implement `lib/reverse-spec/prompt.ts`
    - Build the prompt from `classes.json` only: class ID, features, count, up to 3 representatives with Evidence IDs, and up to 10 unclassified records
    - Drop representatives down to 1 per class if the prompt would exceed the context size
    - _Requirements: 5.2_

  - [~] 8.2 Write property test for the prompt builder
    - **Property 14: Prompt contains classes and respects limits**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 5.2**

  - [~] 8.3 Implement `lib/reverse-spec/citations.ts`
    - Resolve each cited class ID against `classes.json` and attach its Evidence IDs; flag citations to missing classes; mark requirements with no resolving citation "UNSUPPORTED BY RECORDED EVIDENCE" without removing them
    - Compute traceability: X is the number of requirements with at least one resolving citation, Y the total, text `X / Y requirements cite evidence`
    - _Requirements: 5.3, 5.4, 5.5, 5.6_

  - [~] 8.4 Write property test for citation resolution
    - **Property 15: Citations resolve, and failures are flagged**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 5.3, 5.4, 5.5**

  - [~] 8.5 Write property test for the traceability count
    - **Property 16: Traceability count**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 5.6**

  - [x] 8.6 Implement `lib/reverse-spec/rate-limit.ts`
    - In-memory counters keyed by UTC date and IP, and by date; allow at most 5 live calls per IP and 50 in total per UTC day; return remaining budget for IP and total
    - _Requirements: 6.1, 6.2_

  - [x] 8.7 Write property test for the limiter
    - **Property 17: Groq limiter never exceeds its limits**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 6.1, 6.2**

  - [~] 8.8 Implement `lib/reverse-spec/groq-client.ts`
    - Use `groq-sdk`; read `GROQ_API_KEY` only here (server side), never include it in a response body
    - Request structured JSON `{ requirements: [{ id, statement, classIds }] }`; one retry with a stricter prompt on bad JSON; confirm the model name, limits and context size (design open item 9)
    - _Requirements: 5.1, 5.9_

  - [~] 8.9 Implement the bundle assembler `lib/reverse-spec/bundle.ts`
    - Render `requirements.md` in code from the validated requirement list with cited Evidence IDs; generate `design.md`, `tasks.md` and steering documents as markdown from the same list
    - Write `data/<package>/reverse-spec.json` (`generatedAt`, `model`, `requirements`, `documents`, `traceability`, `citationIssues`, `schemaVersion`) as the cache
    - Include a round trip test for the spec-bundle record under Property 7 (reuse the property from task 6.6 with the bundle record generator, `numRuns >= 100`)
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.7_

  - [~] 8.10 Implement the Reverse Spec route `app/api/reverse-spec/[package]`
    - Allowlist check; derive the client IP using the result from the Render spike (task 2.2); check the limiter; call Groq when allowed; otherwise return the cached bundle with the message "daily Groq cap reached, showing the stored bundle"
    - Return `remainingForIp` and `remainingTotal` in every response
    - _Requirements: 5.7, 5.8, 5.9, 6.1, 6.2_

  - [~] 8.11 Add the cached-bundle generation script and commit the bundles
    - Script that runs prompt, Groq and assembly for each Graveyard package and writes `data/<package>/reverse-spec.json`
    - The user runs it with their own `GROQ_API_KEY`; commit the four cached bundles
    - _Requirements: 5.1, 5.7_

  - [ ]* 8.12 Write tests for Reverse Spec with a mocked Groq client
    - All four document kinds produced; the cap-reached path returns the cached bundle and message; `GROQ_API_KEY` never appears in a response body
    - _Requirements: 5.1, 5.8, 5.9_

- [ ] 9. Rebirth Report
  - [~] 9.1 Implement `lib/report/assemble.ts` and `lib/report/format.ts`
    - Build the `RebirthReport` from a diff run and the manifest: score with denominator, intentional differences listed separately with covered counts, mismatch samples shown alongside matches, original test-suite label (one of "available", "not available", "adapted from upstream") with detail
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6_

  - [~] 9.2 Add the vulnerabilities-removed basis
    - List an advisory as removed only if OSV reports it against the pinned original version and a rule with that advisory ID covered at least one input where the rebuild did not show the behavior
    - The basis text reads "behavior no longer observed in N inputs"
    - _Requirements: 9.1_

  - [~] 9.3 Write property test for report completeness
    - **Property 22: Report completeness**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 9.1, 9.2, 9.6**

  - [x] 9.4 Implement `lib/report/language-guard.ts`
    - `FORBIDDEN = /\b(proven|guaranteed|identical)\b/i`; remove the exact phrase "evidence, not proof" (case-insensitive) before scanning
    - _Requirements: 9.3_

  - [~] 9.5 Write property test for forbidden words
    - **Property 23: Forbidden words never appear**
    - Check generated reports, spec-bundle fixtures, and the phrase "evidence, not proof" next to a forbidden term
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 9.3**

  - [~] 9.6 Apply the language guard to the bundle assembler
    - Replace a sentence with a violation by a marker for human review, so such text is not shown silently
    - _Requirements: 9.3_

  - [~] 9.7 Add the string scan test for UI and app text
    - Test that no string literal in `components/` and `app/` contains a forbidden word as judged by the guard
    - _Requirements: 9.3_

  - [~] 9.8 Checkpoint after task 9
    - Run all tests; stop and ask me if anything fails.

- [ ] 10. UI
  - [x] 10.1 Define the theme tokens and global styles
    - `lib/report/contrast.ts` exports the color tokens and the foreground and background pairs (with large-text flags); map them into the Tailwind theme
    - Wrap animations in `@media (prefers-reduced-motion: no-preference)`; with reduced motion, show static progress
    - _Requirements: 11.1, 11.3, 11.4_

  - [ ]* 10.2 Write property test for contrast ratios
    - **Property 25: Contrast ratios meet AA**
    - Use fast-check with `numRuns >= 100`
    - **Validates: Requirements 11.4**

  - [x] 10.3 Build the root layout and the Graveyard page `/`
    - Tombstone cards for each package with status and stage links, using the allowlist loader; no login
    - Load fonts with `next/font` and use inline SVG icons
    - _Requirements: 1.1, 11.1, 11.2_

  - [~] 10.4 Build the package page and the Death Certificate section
    - `app/package/[name]/page.tsx` renders `data/<package>/autopsy.json` with its timestamp and a "snapshot" label; `DeathCertificate` shows `unknown` fields, the Inactive status and the monorepo note
    - "Run live" button calls the Autopsy route
    - _Requirements: 2.2, 2.4, 2.7, 11.1_

  - [~] 10.5 Build the Ghost Memory section
    - `EvidenceTable`, the API coverage figure labelled "coverage from the stored recording, measured offline on <timestamp>", and `SeanceProgress` (candles, static under reduced motion) fed by a shared NDJSON reader hook in `components/`
    - Live runs show no coverage and say so
    - _Requirements: 3.3, 3.5, 11.1_

  - [~] 10.6 Build the Reverse Spec section
    - `SpecView` as preformatted text, flagged unsupported claims, the `X / Y requirements cite evidence` line, and `GroqBudget` showing remaining budget; show the cap message when present
    - _Requirements: 5.5, 5.6, 5.8, 6.2_

  - [~] 10.7 Implement the differential stream and route
    - `lib/diff/stream.ts` produces the NDJSON lines (`start`, `progress`, `mismatch`, `end`); `app/api/diff/[package]` allows only fully resurrected packages and runs the sandboxed differential on the server
    - _Requirements: 7.6, 7.7_

  - [~] 10.8 Build the Rebirth Report section
    - `RebirthReport` shows the score text, intentional differences listed separately, mismatches, vulnerabilities removed and the test-suite label, from `data/<package>/diff-run.json` when it exists
    - "Run live" streams the differential run in séance progress and shows partial results when the budget expires; packages that are not resurrected show "not resurrected"
    - _Requirements: 7.6, 7.7, 9.1, 9.2, 9.4, 9.5, 9.6, 11.1_

  - [ ]* 10.9 Write component tests
    - `DeathCertificate` (unknown fields, monorepo note), `RebirthReport` (score text, separate intentional differences, the three label values), `GroqBudget`
    - _Requirements: 2.4, 6.2, 9.2, 9.5_

- [ ] 11. Spec bundle download
  - [x] 11.1 Implement the store-only ZIP writer `lib/reverse-spec/zip.ts`
    - Local file headers, stored data (method 0), central directory and end record, with CRC-32 from `zlib.crc32`
    - _Requirements: 10.2_

  - [ ]* 11.2 Write property test for the ZIP writer
    - **Property 24: ZIP writer round trip**
    - Use a small test reader; fast-check with `numRuns >= 100`
    - **Validates: Requirements 10.2**

  - [~] 11.3 Implement `app/api/spec-bundle/[package]`
    - Allowlist check (404 otherwise); read `data/<package>/reverse-spec.json`; return `application/zip` with `Content-Disposition: attachment` containing `requirements.md`, `design.md`, `tasks.md`, `steering/`, `EVIDENCE.json` and a `README.md` with the date and the traceability line
    - Works without Groq
    - _Requirements: 5.1, 10.2_

  - [~] 11.4 Add the "Download Kiro spec bundle" action to the package page
    - Show it for every Graveyard package
    - _Requirements: 10.1_

  - [ ]* 11.5 Write route tests for the spec bundle
    - 200 with the ZIP content type for each allowlisted package; 404 otherwise
    - _Requirements: 10.1, 10.2_

- [ ] 12. Resurrection prep only
  - [~] 12.1 Create the `resurrected/lodash.set` skeleton
    - Create `package.json`, `LICENSE` (copy the original MIT text from `graveyard/node_modules/lodash.set/LICENSE`) and `README.md` crediting the original author named in the original package metadata
    - Do NOT write the rebuild code: no `src/` implementation and no tests of the rebuild. The user will rebuild the package in Kiro from the generated spec bundle in a separate spec
    - _Requirements: 7.5_

  - [~] 12.2 Create the `resurrected/lodash.pick` skeleton
    - Same as 12.1, using the original files from `graveyard/node_modules/lodash.pick/`
    - Do NOT write the rebuild code; the user will rebuild it in a separate spec
    - _Requirements: 7.5_

  - [ ]* 12.3 Write a test for the skeleton files
    - Each skeleton has `package.json`, a `LICENSE` equal to the original text, and a README that names the original author
    - _Requirements: 7.5_

- [ ] 13. Deployment and submission checks
  - [~] 13.1 Add the Render configuration
    - `render.yaml` for a Node web service: Node 22 version, build command `npm run build`, start command `next start`; `GROQ_API_KEY` and `GITHUB_TOKEN` declared as secrets set in the Render dashboard, not in the file
    - Confirm `next build` leaves `build/node/` (sandbox and CLI output) untouched (design open item 20)
    - _Requirements: 5.9, 11.2_

  - [~] 13.2 Write the README
    - Describe the five stages, the commands (`npm run build`, `npm run resurrect -- <package>`), and the "evidence, not proof" stance
    - Include the security note: the JavaScript-level network stubs are not OS isolation, only curated pinned Graveyard packages are run, and user-supplied packages are out of scope
    - _Requirements: 4.7_

  - [~] 13.3 Add a repository checks test
    - `.kiro/` is not ignored by `.gitignore`; a root `LICENSE` file exists and starts with a recognizable license header; `.env.local` is ignored and `.env.example` lists `GROQ_API_KEY` and `GITHUB_TOKEN` without values
    - _Requirements: 5.9, 11.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Properties 24 and 25 are optional; all other property tests are required.
- Each task references requirements by acceptance criterion number for traceability.
- Checkpoints are the last sub-tasks of tasks 3, 5 and 9 (3.9, 5.13, 9.8). They are not in the dependency graph. To keep exactly 13 top-level tasks, they are sub-tasks rather than top-level items.
- Tasks 2.2, 6.13, 7.9 and 8.11 need the user to run something (a Render deploy, or a script that needs network or the Groq key).

## Requirements Coverage

| Criterion | Tasks | Criterion | Tasks |
|---|---|---|---|
| 1.1 | 3.1, 3.6, 3.8, 10.3 | 7.4 | 5.1, 5.7 |
| 1.2 | 1.2, 3.1, 3.4 | 7.5 | 12.1, 12.2, 12.3 (partial, see Gaps) |
| 1.3 | 1.2, 1.3, 3.6 | 7.6 | 2.1, 2.2, 10.7, 10.8 |
| 1.4 | 3.2, 3.8 | 7.7 | 2.2, 5.7, 10.7, 10.8 |
| 1.5 | 3.2, 3.8 | 7.8 | 5.1, 5.2 |
| 1.6 | 1.2, 3.4 | 8.1 | 5.3, 6.14 |
| 2.1 | 7.2, 7.3, 7.4, 7.9 | 8.2 | 5.3, 5.5, 5.7 |
| 2.2 | 7.6, 7.9, 10.4 | 9.1 | 9.1, 9.2, 10.8 |
| 2.3 | 7.1, 7.10 | 9.2 | 9.1, 10.8 |
| 2.4 | 7.1, 7.2, 7.3, 7.6, 10.4 | 9.3 | 9.4, 9.6, 9.7 |
| 2.5 | 7.4, 7.10 | 9.4 | 5.5, 9.1, 10.8 |
| 2.6 | 7.4, 7.5 | 9.5 | 9.1, 10.8 |
| 2.7 | 7.6, 10.4 | 9.6 | 9.1, 10.8 |
| 3.1 | 6.3, 6.5, 6.11 | 10.1 | 11.4 |
| 3.2 | 6.1, 6.5, 6.7, 6.13 | 10.2 | 11.1, 11.3 |
| 3.3 | 6.9, 6.13, 10.5 | 11.1 | 10.1, 10.3, 10.4, 10.5, 10.8 |
| 3.4 | 6.5, 6.13 | 11.2 | 1.1, 10.3, 13.1, 13.3 |
| 3.5 | 6.11, 10.5 | 11.3 | 10.1 |
| 4.1 | 4.8, 4.9 | 11.4 | 10.1 |
| 4.2 | 4.9 | 12.1 | 3.8 |
| 4.3 | 4.9, 4.10, 6.5 | 12.2 | 3.2, 3.8 |
| 4.4 | 4.9, 6.11 | 12.3 | 3.2, 3.8, 6.3 |
| 4.5 | 4.3, 4.8, 4.9 | 12.4 | 3.2 |
| 4.6 | 4.9 | 13.1 | 5.8, 6.12 |
| 4.7 | 4.7, 13.2 | 13.2 | 5.8 |
| 4.8 | 4.1 | 13.3 | 5.10, 5.11 |
| 4.9 | 4.1, 4.8 | 13.4 | 5.8 |
| 4.10 | 4.5, 4.8 | 5.1 | 8.8, 8.9, 11.3 |
| 4.11 | 4.5, 4.9 | 5.2 | 6.7, 8.1, 8.9 |
| 5.3 | 8.3, 8.9 | 5.4 | 8.3 |
| 5.5 | 8.3, 8.9, 10.6 | 5.6 | 8.3, 10.6 |
| 5.7 | 8.9, 8.10, 8.11 | 5.8 | 8.10, 10.6 |
| 5.9 | 8.8, 8.10, 13.1, 13.3 | 6.1 | 8.6, 8.10 |
| 6.2 | 8.6, 8.10, 10.6 | 7.1 | 5.7, 6.3, 6.12 |
| 7.2 | 5.8, 6.12 | 7.3 | 5.1, 5.7 |

## Gaps

- **Requirement 7.5 is only partly covered.** Task 12 creates skeletons only. The rebuild code and the committed rebuilds come from the separate spec, so 7.5 and the live differential runs for `lodash.set` and `lodash.pick` cannot finish until that spec is done. Until then `data/<package>/diff-run.json` does not exist and the Rebirth Report shows "not resurrected" or "no stored data". Run `npm run resurrect -- <package> --write` after the rebuild to produce it.
- **Task order vs. generators.** The runner and CLI (task 5) need generators (task 6.3). They accept an input source interface in task 5 and are wired together in task 6.12.
- **Spike is not purely coding.** Deploying to Render (task 2.2) and running the offline scripts that need network or the Groq key (6.13, 7.9, 8.11) are done by the user. The tasks prepare the code and the instructions.
- **Open item 10 (N=1000 in 60 s)** can only be measured with a synthetic workload in task 2. The real differential timing needs the finished rebuilds, so no task in this list rechecks it. Add one after the separate resurrection spec.
- **Task 13 has no matching acceptance criterion** for the license check, the committed `.kiro/` folder and the README. They come from the hackathon brief, so they cite the closest criteria (4.7, 5.9, 11.2).
- **Language guard on generated text** (design section "Language guard") is split across 9.4 and 9.6 because the bundle assembler (8.9) comes before the guard in the requested order.
- **Open items listed in design.md** that need a decision during implementation have no separate task: Groq counter persistence (15), per-package export lists (7), the sandbox limit values (14) and ESLint availability (21). They are handled inside the tasks that use them.
- **Property numbering.** All 27 properties exist in design.md and match the numbers in the request: 1, 2, 26 (task 3); 9 to 12 (task 4); 19 to 21 and 27 (task 5); 6, 7, 8, 13, 18 (task 6); 3 to 5 (task 7); 14 to 17 (task 8); 22 and 23 (task 9); 25 (task 10); 24 (task 11). No mismatch. Property 7 also covers the spec-bundle record, which is tested in task 8.9. Open item numbers 2, 3, 10, 16 and 17 in design.md match the text used in task 2.2.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.1", "3.2", "4.1", "4.5", "4.7", "7.1", "8.6", "9.4", "10.1", "11.1"] },
    { "id": 3, "tasks": ["2.2", "3.3", "3.4", "3.6", "3.8", "4.2", "4.3", "4.6", "5.1", "5.3", "6.1", "7.2", "7.3", "7.4", "8.7", "10.2", "11.2"] },
    { "id": 4, "tasks": ["2.3", "3.5", "3.7", "4.4", "4.8", "5.2", "5.4", "5.5", "6.2", "6.3", "7.5", "7.6", "10.3"] },
    { "id": 5, "tasks": ["4.9", "5.6", "6.4", "6.5", "7.7", "7.8", "7.9"] },
    { "id": 6, "tasks": ["4.10", "4.11", "5.7", "6.6", "6.7", "6.9", "6.11", "10.4"] },
    { "id": 7, "tasks": ["5.8", "6.8", "6.10", "7.10", "8.1", "8.3", "10.5"] },
    { "id": 8, "tasks": ["5.9", "5.10", "5.11", "5.12", "6.12", "6.13", "8.2", "8.4", "8.5", "8.8", "9.1"] },
    { "id": 9, "tasks": ["6.14", "8.9", "9.2", "10.7", "12.1", "12.2"] },
    { "id": 10, "tasks": ["8.10", "8.11", "8.12", "9.3", "9.6", "11.3", "12.3"] },
    { "id": 11, "tasks": ["9.5", "9.7", "10.6", "11.5"] },
    { "id": 12, "tasks": ["10.8"] },
    { "id": 13, "tasks": ["10.9", "11.4", "13.1", "13.2", "13.3"] }
  ]
}
```

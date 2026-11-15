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

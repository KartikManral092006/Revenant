---
inclusion: always
---

# Tech

## Stack
- Next.js (App Router), TypeScript in strict mode, Tailwind CSS.
- Node.js 22 LTS or later; pin the version in package.json `engines` and on Render.
- Deployed on Render as a long-running Node web service (`next build` + `next start`), not serverless.
- Unit tests: Vitest. Property-based tests: fast-check.
- LLM: Groq via the official `groq-sdk`. Key read from `GROQ_API_KEY`; never committed, never sent to the browser.
- Do not add other runtime dependencies without stating why in the design doc.

## Sandbox (runs original, untrusted package code)
- Each run happens in a separate Node child process, never in the Next.js server process.
- Hard limits: wall-clock timeout per call and per run (kill the process on timeout), `--max-old-space-size` memory cap, max input/output size.
- Use the Node permission model (`--permission`, or `--experimental-permission` on older Node) with no fs write, no child processes, no workers, no addons. Check the exact flags for the pinned Node version.
- No network: also replace `http`, `https`, `net`, `dgram`, `tls`, `dns` and global `fetch` in the child with stubs that throw, so an attempt is recorded as an error instead of succeeding.
- Inputs and outputs cross the process boundary as JSON-safe serialized values with tags for `undefined`, `NaN`, `Infinity`, `-0`, functions, errors and circular references. Errors are recorded by `name` and `message`.
- Graveyard packages are pinned to exact versions and installed at build time with `--ignore-scripts`. The app never installs anything at runtime.

## Differential testing
- The same fast-check seed and generators run against the original and the rebuild; record the seed so runs reproduce.
- A result matches when both return deep-equal values, or both throw the same error type. Mutated input arguments are compared too (lodash.set mutates its target).
- Intentional differences are declared in a per-package file with a reason and a CVE/GHSA ID; matching cases are excluded from the score and reported separately.

## External data
- npm registry `https://registry.npmjs.org/<name>`, npm downloads `https://api.npmjs.org/downloads/point/last-week/<name>`, OSV `POST https://api.osv.dev/v1/query`, GitHub REST `https://api.github.com/repos/<owner>/<repo>`.
- Unauthenticated GitHub allows 60 requests/hour per IP: cache responses and support an optional `GITHUB_TOKEN`.
- Every external call has a timeout; failures show "unknown" in the UI, never fake data.

## Caching and cost
- Ghost Memory recordings and Reverse Spec outputs for Graveyard packages are stored as JSON in the repo and served from there by default.
- Live Groq calls are rate-limited per IP and capped per day; the UI shows the remaining budget.

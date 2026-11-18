# Revenant

Revenant brings dead open-source npm packages back to life. It records what an unmaintained package actually does, turns that record into a Kiro spec, and compares a rebuild against the original with differential property-based tests.

Revenant reports evidence, not proof. A behavior-match score says how many generated inputs produced the same result in the original and the rebuild. It does not show that the two behave the same on every input.

## The five stages

1. **Autopsy.** Pulls public data (npm registry, npm downloads, OSV.dev, GitHub) and shows a Death Certificate: last publish date, deprecation notice, known vulnerabilities, weekly downloads, and repository status.
2. **Ghost Memory.** Runs the original package in a sandbox on generated inputs and records input to output or error pairs, with the API surface coverage reached.
3. **Reverse Spec.** Generates a Kiro-ready spec bundle (`requirements.md`, `design.md`, `tasks.md` and steering docs) from the recorded behavior. Claims in the spec cite recorded evidence. Uses Groq, so it needs `GROQ_API_KEY`.
4. **Resurrection.** The rebuild is written in Kiro from that spec. A Kiro hook in `.kiro/hooks` reruns the differential tests when a rebuilt file is saved. Rebuilds live in `resurrected/<package>/`.
5. **Rebirth Report.** Shows the behavior-match score with input counts, vulnerabilities removed, the intentional differences that remain, and the replacement package.

Stages 1, 2, 3 and 5 are available in the web app. Stage 4 happens in Kiro.

## Graveyard

The Graveyard is a curated set of pinned packages, defined in `graveyard/<package>/manifest.json`: `deep-extend`, `lodash.pick`, `lodash.set` and `string`. `lodash.pick` and `lodash.set` have rebuilds in `resurrected/`. Intentional differences (deliberate security fixes) are listed in each package's `intentional-differences.json` and are reported separately from mismatches.

## Requirements

- Node.js 22 (see `.node-version` and `engines` in `package.json`)
- npm

Optional environment variables go in `.env.local` (see `.env.example`):

- `GROQ_API_KEY`, for Reverse Spec generation
- `GITHUB_TOKEN`, for GitHub API requests in Autopsy

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs the app dependencies. |
| `npm run dev` | Starts the Next.js dev server. |
| `npm run build` | Compiles the Node code, checks the Graveyard pins, installs the Graveyard packages with `npm ci --ignore-scripts`, then runs `next build`. |
| `npm start` | Starts the built Next.js server. |
| `npm run resurrect -- <package>` | Runs the differential test for one Graveyard package. Needs `npm run build` first. |
| `npm run autopsy:snapshots` | Compiles, then writes the Autopsy snapshots to `data/`. Needs network access. |
| `npm run reverse-spec:bundles` | Compiles, then writes the Reverse Spec bundles to `data/`. Needs `GROQ_API_KEY`. |
| `npm run record:ghost-memory` | Compiles, then records Ghost Memory results to `data/`. |
| `npm test` | Runs the test suite once (Vitest). |
| `npm run lint` | Runs ESLint. |

### `npm run resurrect`

```
npm run resurrect -- <package> [--n <int>] [--seed <int>] [--write]
```

- `--n` sets the number of generated inputs and `--seed` sets the generator seed. Both default to the values in the package manifest.
- `--write` saves the run to `data/<package>/diff-run.json`.
- Output: the score line, the seed, and the first mismatches.

Exit codes: `0` no unexplained mismatches, `1` one or more mismatches, `2` usage error (including an unknown package), `3` sandbox or infrastructure failure. Intentional differences do not count as mismatches.

Example:

```
npm run build
npm run resurrect -- lodash.set
```

## Security note

- **The network stubs are not OS isolation.** The sandbox blocks network access from inside the JavaScript runtime, by replacing `http`, `https`, `net`, `dgram`, `tls`, `dns` (and their `node:` forms, plus `dns/promises`) and `fetch` with stubs that throw `NetworkBlockedError`. This stops ordinary package code from making calls. It is not a firewall or a container, and code that escapes the JavaScript layer is not stopped by it. The sandbox also runs the child process with Node's permission model, an empty environment, and time and memory limits, but none of that replaces running in a container or VM if you need strong isolation.
- **Only curated, pinned Graveyard packages are run.** Versions are pinned and checked at build time, and installs use `--ignore-scripts`.
- **User-supplied packages are out of scope.** The app does not install or execute packages named by users. Do not point Revenant at code you do not trust and expect the sandbox to contain it.

## Project layout

- `app/`, `components/`: the Next.js web app
- `lib/`: Autopsy, Ghost Memory, Reverse Spec, differential testing, and report code
- `sandbox/`: the sandboxed runner and network stubs
- `graveyard/`: pinned original packages and their manifests
- `resurrected/`: rebuilds made in Kiro
- `data/`: committed snapshots per package
- `.kiro/`: specs, steering and hooks used to build the project

## License

MIT. See `LICENSE`. Rebuilt packages keep the license and credit of the originals.

---
inclusion: always
---

# Structure

```
.kiro/                 specs, steering, hooks (always committed)
app/                   Next.js App Router pages and API routes
components/            UI components
lib/
  autopsy/             npm, downloads, OSV, GitHub clients and Death Certificate assembly
  ghost-memory/        generators, recording, coverage
  reverse-spec/        Groq client, prompt building, evidence citation checks
  diff/                differential runner and match scoring
  report/              Rebirth Report assembly
sandbox/               child-process entry point and serialization; imports nothing from app/
graveyard/
  <package>/
    manifest.json      pinned version, exports to test, generator config
    intentional-differences.json
resurrected/
  <package>/           rebuilt package: src, tests, package.json, LICENSE with original credit
data/
  <package>/           cached autopsy, ghost-memory and reverse-spec JSON
tests/                 Vitest unit and property-based tests
```

## Conventions
- Files and folders use kebab-case; React components use PascalCase.
- Server-only code lives in `lib/` and `sandbox/`; never import it into client components.
- Each resurrected package keeps the original LICENSE text and credits the original author in its README.
- One module per external API; no fetch calls scattered through UI code.

---
inclusion: always
---

# Product: Revenant

Revenant brings dead npm packages back to life and gathers evidence that the rebuilt version behaves like the original.

## Target user
A JavaScript/TypeScript developer who depends on a small, unmaintained, pure-function npm package and wants a safe, modern, drop-in replacement without changing their calling code.

## The five stages
1. **Autopsy**: fetch live public data and show a Death Certificate (last publish, deprecation notice, known vulnerabilities, weekly downloads, repo archived/last push, license).
2. **Ghost Memory**: run the original package in a sandbox on generated inputs (property-based testing) and record input → output/thrown-error pairs plus API coverage.
3. **Reverse Spec**: generate a Kiro spec bundle (requirements.md, design.md, tasks.md, steering) from recorded behavior. Every requirement cites the recorded evidence IDs that support it; unsupported claims are flagged, not hidden.
4. **Resurrection**: the rebuild is written in Kiro from that spec. A Kiro hook reruns differential tests on save.
5. **Rebirth Report**: behavior-match score with input counts, vulnerabilities removed, intentional differences, original test-suite results.

## Language rules
- Revenant reports **evidence**, never proof. Never use "proven", "guaranteed" or "identical" for equivalence.
- Scores always show the denominator, e.g. "9,812 / 10,000 inputs matched".
- Intentional differences (security fixes) are excluded from the match score and always listed explicitly.

## MVP scope
- A curated Graveyard of 3–5 real dead packages, installed at build time.
- Stages 1, 2, 3 and 5 work live in the browser at the public URL, with no login.
- At least 2 packages fully resurrected and committed; the app runs old vs new differential tests live for them.
- "Download Kiro spec bundle" for any Graveyard package.
- Halloween-themed UI: graveyard, death certificate, séance progress during test runs, rebirth report.

## Out of scope
- Packages with network, file I/O, timers, randomness or global side effects.
- Installing or running packages typed in by users.
- Languages other than JavaScript/TypeScript.
- Fully automatic rebuilds without a human in the loop.

## Graveyard shortlist (re-verify with Autopsy before relying on it)
- `lodash.set@4.3.2` and `lodash.pick@4.4.0`: CVE-2020-8203 prototype pollution open in latest; planned full resurrections.
- `string@3.3.3`: repo archived, CVE-2017-16116 ReDoS open; Autopsy + Ghost Memory only.
- `deep-extend@0.6.0`: unmaintained since 2018, no open vulnerability; Autopsy + Ghost Memory only.

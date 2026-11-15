# Revenant — Project Brief

> Kiroween 2026 · Category: **Resurrection** · Also targeting: Best Student Project (Resurrection), Best Demo, Bonus Blog, Social Blitz
> Deadline: **Friday, Dec 4, 2026, 2:00 PM PT**
> This brief is the starting input for a Kiro Spec session. Kiro writes the requirements, design and tasks. This file says *what* and *why*, not *how*.

---

## 1. One-liner

Revenant brings dead open-source packages back to life, and proves the rebuilt version behaves like the original.

## 2. Problem

Many projects depend on npm packages that no one maintains anymore: no releases, no security fixes, open vulnerabilities, unanswered issues. Today a developer has three options:

1. **Keep it** and live with the risk.
2. **Rewrite it by hand**, which is slow and easy to get subtly wrong.
3. **Ask an AI to rewrite it**, with no evidence that the new code behaves like the old code.

What's missing is a way to replace a dead dependency **and prove** the replacement is faithful.

## 3. Target user

A JavaScript/TypeScript developer or maintainer who depends on a small, unmaintained utility package and needs a safe, modern, drop-in replacement.

## 4. Core idea

Record the dead package's **observed behavior** as evidence. Turn that evidence into a **Kiro spec**. Accept a rebuild only when **differential property-based tests** show it matches the original, except for deliberate, documented security fixes.

## 5. The five stages (product flow)

| Stage | Name | What the user sees |
|---|---|---|
| 1 | **Autopsy** | Pick a package. Revenant pulls public data and shows a **Death Certificate**: last publish date, deprecation notice, known vulnerabilities, weekly downloads, repo archived/inactive status. |
| 2 | **Ghost Memory** | Revenant runs the original package on many generated inputs (property-based testing) and records input → output/error pairs. It shows how much of the API surface was covered. |
| 3 | **Reverse Spec** | Revenant generates a Kiro-ready spec bundle (`requirements.md`, `design.md`, `tasks.md` and steering docs) based on the recorded behavior, not only the README. Every claim in the spec must trace back to recorded evidence. |
| 4 | **Resurrection** | The rebuild happens **in Kiro**, from that spec. A Kiro hook reruns the differential tests on every save. |
| 5 | **Rebirth Report** | Behavior-match score, vulnerabilities removed, remaining intentional differences, and the replacement package. |

## 6. MVP scope (what must work for judges)

- **A curated "Graveyard" of 3–5 real dead packages**, pre-installed at build time. The deployed app never installs arbitrary packages from user input.
- Stages 1, 2, 3 and 5 work **live in the browser** at the public URL, with no Kiro needed on the judge's machine.
- **At least 2 packages fully resurrected** during the hackathon (rebuilt in Kiro, committed to the repo). For these, the app runs old vs new differential tests live.
- A "Download Kiro spec bundle" button for any Graveyard package.
- A Halloween-themed UI: graveyard, death certificate, séance progress while tests run, rebirth report.

## 7. Out of scope (for this hackathon)

- Packages that do network calls, file I/O, timers, randomness or global side effects.
- Installing or running arbitrary packages typed in by users on the hosted demo.
- Languages other than JavaScript/TypeScript.
- Fully automatic rebuilds without a person in the loop.
- Claims of *proven* equivalence. Revenant reports **evidence**, not proof.

## 8. Choosing Graveyard packages (do this first, with the Autopsy feature itself)

Each candidate must be:

- **Unmaintained:** deprecated on npm, archived repo, or no publish for several years.
- **Pure functions:** same input gives the same output, with no I/O.
- **Permissively licensed:** MIT, ISC, BSD or Apache-2.0. Keep the original license and credit in the rebuild.
- **Still used:** has meaningful weekly downloads.
- Ideally has **at least one known vulnerability** in the OSV database, so the rebuild can show a fix.

Check every fact about each candidate against the live data sources below. Do not rely on memory or AI output for "is it dead / does it have a vulnerability".

## 9. Public data sources (verify exact endpoints during design)

- npm registry metadata (versions, publish times, deprecation, license)
- npm downloads API (weekly downloads)
- OSV.dev vulnerability database
- GitHub REST API (archived flag, last commit, open issues)

## 10. Constraints and non-negotiables

- **Built with Kiro.** Specs, hooks, steering, MCP and property-based testing must be real and visible in `/.kiro`. Never gitignore `/.kiro`.
- **Sandbox execution.** Run original package code in an isolated worker with time and memory limits and no network. Install with lifecycle scripts disabled.
- **Public GitHub repo** with an open-source license that GitHub can detect.
- **Live app URL** that judges can test without logging in. If a login is needed, put the credentials in the private Devpost form.
- **Demo video under 3 minutes.**
- **LLM usage:** Reverse Spec needs an LLM. Provider: **TBD**. Show a cost/usage limit in the app and cache results for Graveyard packages.

## 11. How we know it works (success metrics)

For each resurrected package:

- **Behavior match:** % of N generated inputs where the rebuild matches the original, excluding documented fixes.
- **Original test suite:** if the package shipped tests, the rebuild passes them.
- **Vulnerabilities:** known vulnerabilities in the original vs. in the rebuild.
- **Spec traceability:** % of spec requirements linked to recorded evidence.

Report these honestly, including failures and mismatches.

## 12. Known risks and failure modes

| Risk | Mitigation |
|---|---|
| Property-based tests miss edge cases, so "match" ≠ "identical" | Report it as a score with input counts; add the original tests and hand-picked edge cases |
| LLM-written spec invents behavior | Every requirement must cite recorded evidence; flag unsupported claims |
| Running untrusted package code | Curated list only on the hosted demo; isolated worker, no network, timeouts, `--ignore-scripts` |
| The original's behavior includes the bug/vulnerability being fixed | Mark intentional differences explicitly; they're excluded from the match score but listed in the report |
| Scope creep with 19 days left | Pure-function packages only; 2 full resurrections beat 10 half-done ones |
| Similar project already exists | Check Kiroween 2025/2026 galleries early; sharpen the angle if needed |

## 13. Timeline

| Dates | Milestone |
|---|---|
| Nov 15–18 | Kiro spec + steering for Revenant; Autopsy working with live data; Graveyard candidates chosen |
| Nov 19–24 | Ghost Memory: sandboxed runner + property-based behavior recording + differential test harness |
| Nov 25–29 | Reverse Spec generation; resurrect 2 packages in Kiro start to finish |
| Nov 30–Dec 2 | Rebirth Report, themed UI, deployment |
| Dec 3–4 | Demo video, Kiro write-up, README, license, final `/.kiro` check, submit **early** |

## 14. Demo video outline (under 3 min)

1. **0:00–0:20:** The problem: a dead dependency with a known vulnerability, still downloaded every week.
2. **0:20–0:50:** Autopsy → Death Certificate.
3. **0:50–1:30:** Ghost Memory recording behavior; Reverse Spec appears.
4. **1:30–2:20:** The spec in Kiro, rebuilding with a hook running differential tests on save.
5. **2:20–2:50:** Rebirth Report: match score, vulnerability removed, intentional differences.
6. **2:50–3:00:** Who it's for and why it matters.

## 15. Open decisions

- [x] LLM provider for Reverse Spec: **Groq**
- [x] Hosting platform: **Next.js (TypeScript) deployed as a Node server on Render**
- [ ] Final Graveyard package list (after live checks). Shortlist checked live on 2026-11-15: `lodash.set`, `lodash.pick` (both CVE-2020-8203, to be fully resurrected), `string` (CVE-2017-16116), `deep-extend` (no vulnerability)
- [x] Solo or team: **Solo**

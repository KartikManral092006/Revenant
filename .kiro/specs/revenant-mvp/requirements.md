# Requirements Document

## Introduction

Revenant brings dead, unmaintained open-source npm packages back to life and gathers evidence that the rebuilt version behaves like the original. It records the dead package's observed behavior as evidence, turns that evidence into a Kiro spec bundle, and accepts a rebuild only when differential property-based tests show it matches the original, except for deliberate, documented security fixes.

The Revenant application is a Next.js web service that runs five stages live in the browser: Autopsy (Death Certificate), Ghost Memory (behavior recording in a sandbox), Reverse Spec (Kiro spec bundle generation via Groq), Resurrection (rebuild in Kiro with differential tests on save), and the Rebirth Report (honest behavior-match scoring). Revenant reports evidence, never proof.

This document specifies the MVP scope for the Kiroween 2026 hackathon. It covers the Graveyard of curated dead packages, the Autopsy data fetch, the sandboxed Ghost Memory recorder, the Groq-backed Reverse Spec generator with evidence citation, the differential testing harness, the honest Rebirth Report, the spec bundle download, and the Halloween-themed no-login UI.

## Glossary

- **Revenant**: The Next.js web application that orchestrates the five stages and serves the public UI.
- **Graveyard**: The curated list of 3 to 5 real, dead, pre-installed npm packages available for autopsy and resurrection.
- **Graveyard_Manager**: The component that curates, pins, and validates Graveyard packages and exposes them to the rest of the application.
- **Graveyard_Package**: A single package entry in the Graveyard, pinned to an exact version and installed at build time.
- **Manifest**: The per-package configuration file that records the pinned version, exports under test, fast-check generator config, hand-picked edge cases, and input count N.
- **Autopsy**: Stage 1. The component that fetches live public data about a package and assembles a Death Certificate.
- **Death_Certificate**: The assembled display of a package's deadness: last publish date, deprecation notice, known vulnerabilities, weekly downloads, repository archived status or Inactive status, and license.
- **Inactive**: A package status indicating the package has not been published in 24 months.
- **Ghost_Memory**: Stage 2. The component that runs the original package on generated inputs and records input to output or thrown-error pairs plus API surface coverage.
- **API_Surface_Coverage**: The percentage of exported functions exercised plus branch coverage of the original package measured with V8 coverage.
- **Sandbox**: The isolated execution environment that runs untrusted original package code in a separate Node child process with hard limits and no network.
- **Sandbox_Runner**: The component within the Sandbox that spawns the child process, enforces limits, and serializes values across the process boundary.
- **Generator**: The fast-check property-based generator that produces inputs for Ghost Memory and differential testing.
- **Evidence**: A recorded input to output or input to thrown-error pair captured from the original package.
- **Evidence_ID**: The stable identifier assigned to each recorded Evidence record so that spec requirements can cite it.
- **Reverse_Spec**: Stage 3. The component that generates a Kiro-ready spec bundle from recorded behavior using the Groq LLM.
- **Spec_Bundle**: The downloadable Kiro spec files for a package: requirements.md, design.md, tasks.md, and steering documents.
- **Groq**: The LLM provider used by Reverse_Spec, accessed via the groq-sdk with the GROQ_API_KEY.
- **Resurrection**: Stage 4. The act of rebuilding a Graveyard package in Kiro from its generated spec bundle.
- **Resurrected_Package**: A Graveyard package that has been rebuilt in Kiro and committed to the repository.
- **Resurrection_CLI**: The npm script command that runs differential tests for a single package and exits non-zero on unexplained mismatches.
- **Kiro_Hook**: The hook configured in .kiro/hooks that runs the Resurrection_CLI when files under resurrected/<package>/ are saved.
- **Differential_Testing**: The harness that runs the same fast-check seed and generators against the original package and a Resurrected_Package and scores matches.
- **Intentional_Difference**: A behavior change between the original and the rebuild that is deliberate, documented with a reason and a CVE or GHSA ID, and excluded from the match score.
- **Rebirth_Report**: Stage 5. The component that presents the behavior-match score, vulnerabilities removed, remaining Intentional_Differences, and original test-suite results.
- **Original_Test_Suite**: The test suite shipped with the original package, run against the rebuild.

## Requirements

### Requirement 1: Graveyard Curation and Build-Time Installation

**User Story:** As a developer, I want a curated set of real dead packages pre-installed at build time, so that I can explore and resurrect safe candidates without the application ever installing arbitrary packages.

#### Acceptance Criteria

1. THE Graveyard_Manager SHALL expose a curated list of 3 to 5 real, dead npm packages as Graveyard_Packages.
2. THE Graveyard_Manager SHALL pin each Graveyard_Package to an exact version installed at build time with the `--ignore-scripts` flag.
3. THE Revenant SHALL install and run only packages included in the curated Graveyard list.
4. WHEN a candidate package is evaluated for the Graveyard, THE Graveyard_Manager SHALL record Autopsy evidence for each Graveyard criterion (unmaintained, pure-function, permissive-license, weekly-downloads) in the package Manifest.
5. THE Graveyard_Manager SHALL note package purity in the Manifest as a human judgment.
6. IF any package version is not exactly pinned, THEN THE Revenant SHALL fail the build.

### Requirement 2: Autopsy and Death Certificate

**User Story:** As a developer, I want to see live public data about a dead package, so that I can judge whether it is safe and worth resurrecting.

#### Acceptance Criteria

1. WHEN a Graveyard_Package is selected, THE Autopsy SHALL fetch live public data from the npm registry, the npm downloads API, the OSV.dev vulnerability database, and the GitHub REST API.
2. THE Death_Certificate SHALL display last publish date, deprecation notice, known vulnerabilities, weekly downloads, repository archived status or Inactive status, and license.
3. THE Autopsy SHALL apply a timeout to every external call.
4. IF an external call times out or fails, THEN THE Autopsy SHALL display "unknown" for that field and SHALL show no fabricated data.
5. WHERE the optional `GITHUB_TOKEN` environment variable is set, THE Autopsy SHALL use it to raise the GitHub API rate limit.
6. WHILE unauthenticated GitHub requests are used, THE Autopsy SHALL cache GitHub responses to stay within the 60 requests per hour per IP limit.
7. WHEN a package has not been published in 24 months, THE Death_Certificate SHALL mark the package as Inactive.

### Requirement 3: Ghost Memory Behavior Recording

**User Story:** As a developer, I want the original package run on many generated inputs, so that I can record its observed behavior as Evidence.

#### Acceptance Criteria

1. WHEN Ghost Memory is invoked for a Graveyard_Package, THE Ghost_Memory SHALL run the original package on inputs produced by fast-check Generators inside the Sandbox.
2. THE Ghost_Memory SHALL record each input to output or thrown-error pair as Evidence and assign it an Evidence_ID.
3. THE Ghost_Memory SHALL display the API_Surface_Coverage from the stored recording's offline coverage pass, labelled with the measurement timestamp of that pass.
4. THE Ghost_Memory SHALL store recordings as JSON in the repository and serve them from there by default.
5. WHEN a live sandboxed run executes, THE Ghost_Memory SHALL omit API_Surface_Coverage from the live run results.

### Requirement 4: Sandbox Isolation for Untrusted Package Code

**User Story:** As a maintainer, I want untrusted original package code run in isolation with hard limits and no network, so that it cannot harm the host application.

#### Acceptance Criteria

1. THE Sandbox_Runner SHALL run one batch of inputs in a single Node child process, separate from the Next.js server process.
2. THE Sandbox_Runner SHALL enforce a per-call timeout within the batch.
3. WHEN a per-call timeout is exceeded, THE Sandbox_Runner SHALL kill the child process, record that input's result as a "timeout" Evidence, respawn a new child process, and continue with the next input.
4. THE Sandbox_Runner SHALL enforce a wall-clock timeout per run, killing the child process on timeout.
5. THE Sandbox_Runner SHALL enforce a memory cap via the `--max-old-space-size` flag and a maximum input size and output size.
6. THE Sandbox_Runner SHALL enable the Node permission model with no filesystem write, no child processes, no workers, and no addons.
7. THE Sandbox_Runner SHALL replace the `http`, `https`, `net`, `dgram`, `tls`, and `dns` modules and the global `fetch` with stubs that throw, so a network attempt is recorded as an error instead of succeeding.
8. WHEN inputs and outputs cross the process boundary, THE Sandbox_Runner SHALL serialize them as JSON-safe values with tags for `undefined`, `NaN`, `Infinity`, `-0`, functions, errors, and circular references.
9. THE Sandbox_Runner SHALL record thrown errors by `name` and `message`.
10. WHEN a call completes, THE Sandbox_Runner SHALL detect changes to built-in prototypes (Object.prototype, Array.prototype, Function.prototype).
11. IF any built-in prototype changed after a call, THEN THE Sandbox_Runner SHALL record "global prototype pollution" as part of that Evidence and SHALL respawn the child process before the next input.

### Requirement 5: Reverse Spec Generation from Recorded Behavior

**User Story:** As a developer, I want a Kiro-ready spec bundle generated from recorded behavior, so that I can rebuild the package in Kiro with evidence-backed requirements.

#### Acceptance Criteria

1. WHEN Reverse Spec is invoked for a Graveyard_Package, THE Reverse_Spec SHALL generate a Spec_Bundle containing requirements.md, design.md, tasks.md, and steering documents.
2. THE Reverse_Spec SHALL base the generated Spec_Bundle on recorded Evidence, not only on the package README.
3. THE Reverse_Spec SHALL cite the supporting Evidence_IDs for every requirement in the generated Spec_Bundle.
4. THE Reverse_Spec SHALL verify that every cited Evidence_ID exists in the recorded Evidence.
5. IF a generated requirement is not supported by recorded Evidence, THEN THE Reverse_Spec SHALL flag the unsupported claim rather than hide it.
6. THE Reverse_Spec SHALL report spec traceability as "X / Y requirements cite evidence".
7. THE Reverse_Spec SHALL cache generated Spec_Bundle outputs for Graveyard_Packages.
8. WHEN the daily Groq cap is reached, THE Reverse_Spec SHALL serve the cached Spec_Bundle with a message indicating the cap was reached.
9. WHERE the Groq LLM is used for generation, THE Reverse_Spec SHALL read the `GROQ_API_KEY` from the server environment only and SHALL keep it out of version control and out of browser-bound responses.

### Requirement 6: Groq Usage Limits and Budget Visibility

**User Story:** As a maintainer, I want Groq usage bounded and visible, so that cost stays controlled during the hackathon.

#### Acceptance Criteria

1. THE Reverse_Spec SHALL rate-limit live Groq calls to 5 per client IP per day and 50 total per day.
2. THE Revenant UI SHALL display the remaining Groq usage budget.

### Requirement 7: Differential Testing of Original versus Resurrected Package

**User Story:** As a developer, I want old versus new behavior compared under the same inputs, so that I can see how closely the rebuild matches the original.

#### Acceptance Criteria

1. WHEN differential testing runs, THE Differential_Testing SHALL run the same fast-check seed and Generators against the original Graveyard_Package and the Resurrected_Package.
2. THE Differential_Testing SHALL record the fast-check seed so that runs reproduce.
3. WHEN the original and the rebuild both return deep-equal values, both throw an error with the same name, or both time out, AND the post-call arguments are deep-equal on both sides, AND the global prototype pollution flag is the same on both sides, THE Differential_Testing SHALL count the result as a match.
4. WHILE comparing results, THE Differential_Testing SHALL compare mutated input arguments in addition to return values.
5. THE Revenant SHALL fully resurrect at least 2 Graveyard_Packages and commit each Resurrected_Package to the repository.
6. WHEN a fully Resurrected_Package is viewed, THE Revenant SHALL run old versus new differential tests on the server inside the Sandbox and SHALL stream progress and results to the browser; the browser SHALL display the streamed progress and results and SHALL not execute the tests.
7. WHEN a live differential run with N=1000 inputs exceeds 60 seconds, THE Revenant SHALL report partial results.
8. IF a call times out on only one of the original and the rebuild, THEN THE Differential_Testing SHALL count the result as a mismatch.

### Requirement 8: Intentional Differences and Security Fixes

**User Story:** As a developer, I want documented security fixes separated from the match score, so that the report stays honest.

#### Acceptance Criteria

1. THE Revenant SHALL declare each Intentional_Difference in a per-package file with a reason and a CVE or GHSA ID.
2. THE Differential_Testing SHALL exclude Intentional_Difference cases from the match score and report them separately.

### Requirement 9: Rebirth Report and Honest Scoring

**User Story:** As a developer, I want an honest behavior-match report, so that I can trust the Evidence Revenant presents.

#### Acceptance Criteria

1. THE Rebirth_Report SHALL present a behavior-match score, vulnerabilities removed, remaining Intentional_Differences, and Original_Test_Suite results.
2. THE Rebirth_Report SHALL label Original_Test_Suite results as "available", "not available", or "adapted from upstream" and SHALL state which applies.
3. THE Revenant SHALL report Evidence for equivalence and SHALL phrase match results without the terms "proven", "guaranteed", or "identical".
4. THE Rebirth_Report SHALL display the match score with its denominator, in the form "X / Y inputs matched".
5. THE Rebirth_Report SHALL list Intentional_Differences separately from the match score.
6. THE Rebirth_Report SHALL include failures and mismatches alongside matches.

### Requirement 10: Kiro Spec Bundle Download

**User Story:** As a developer, I want to download the Kiro spec bundle for any Graveyard package, so that I can rebuild it in Kiro myself.

#### Acceptance Criteria

1. THE Revenant SHALL provide a "Download Kiro spec bundle" action for every Graveyard_Package.
2. WHEN the download action is invoked, THE Revenant SHALL deliver the full Spec_Bundle containing requirements.md, design.md, tasks.md, and steering documents.

### Requirement 11: Halloween-Themed No-Login UI

**User Story:** As a judge, I want a Halloween-themed web app that works live without logging in, so that I can test Revenant at the public URL.

#### Acceptance Criteria

1. THE Revenant UI SHALL present a Halloween theme with a graveyard, a Death_Certificate, séance progress during test runs, and a Rebirth_Report.
2. THE Revenant SHALL be accessible live in the browser at the public URL without requiring login.
3. THE Revenant UI SHALL respect the prefers-reduced-motion media query.
4. THE Revenant UI SHALL meet WCAG AA text contrast standards.

### Requirement 12: Per-Package Manifest

**User Story:** As a developer, I want a per-package manifest defining what to test and how, so that Ghost Memory and differential testing run reproducibly with edge cases included.

#### Acceptance Criteria

1. THE Graveyard_Manager SHALL provide a Manifest for each Graveyard_Package.
2. THE Manifest SHALL record the pinned version, the exports under test, the fast-check generator config, hand-picked edge cases, and the input count N.
3. IF the fast-check generator config for the package specifies string inputs or object inputs, THEN THE Manifest SHALL include hand-picked edge cases containing at minimum "__proto__", "constructor.prototype", and array-index paths.
4. IF N is not specified in the Manifest, THEN THE Manifest SHALL default N to 1000 for live runs. A live run executes the exports under test on generated inputs instead of using cached or stored results.

### Requirement 13: Resurrection CLI and Kiro Hook

**User Story:** As a developer, I want a CLI command and a Kiro hook that rerun differential tests on save, so that the rebuild stays faithful to the original as I edit it.

#### Acceptance Criteria

1. THE Revenant SHALL provide a Resurrection_CLI as an npm script that runs Differential_Testing for a single package supplied as a command argument.
2. IF Differential_Testing finds mismatches that are not documented as Intentional_Differences, THEN THE Resurrection_CLI SHALL exit with a non-zero status.
3. WHEN a file under resurrected/<package>/ is saved, THE Kiro_Hook SHALL run the Resurrection_CLI for that package.
4. WHEN Differential_Testing finds no mismatches, or only mismatches documented as Intentional_Differences, THEN THE Resurrection_CLI SHALL exit with a status of zero.

## Out of Scope

The following are explicitly excluded from the Revenant MVP:

- Packages that perform network calls, file I/O, timers, randomness, or global side effects.
- Installing or running packages typed in by users on the hosted demo.
- Languages other than JavaScript and TypeScript.
- Fully automatic rebuilds without a human in the loop.
- Claims of proven equivalence. Revenant reports Evidence, not proof.

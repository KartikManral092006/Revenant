import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { DeathCertificateView, type CertificateData } from "../../components/DeathCertificate";
import { RebirthReportView, type RebirthReportData, type TestSuiteLabel } from "../../components/RebirthReport";
import { GroqBudget } from "../../components/ReverseSpec";

const cert: CertificateData = {
  package: "x",
  version: "1.0.0",
  fetchedAt: "2024-01-01T00:00:00Z",
  source: "snapshot",
  lastPublish: { value: "2020-01-01" },
  inactive: { value: true },
  deprecation: { value: null },
  vulnerabilities: { value: [] },
  weeklyDownloads: { value: 1234 },
  repo: { value: { archived: false, pushedAt: "2021-01-01" } },
  license: { value: "MIT" },
};

describe("DeathCertificateView (Requirements 2.4, 6.2)", () => {
  it("renders unknown fields with their reason, not a value", () => {
    const html = renderToStaticMarkup(
      <DeathCertificateView
        cert={{
          ...cert,
          weeklyDownloads: { unknown: true, reason: "downloads API unreachable" },
          license: { unknown: true, reason: "no license field" },
        }}
      />,
    );
    expect(html).toContain("downloads API unreachable");
    expect(html).toContain("no license field");
    expect(html.match(/unknown/g)?.length).toBe(2);
    expect(html).not.toContain("1,234");
  });

  it("renders the monorepo note when present and omits it otherwise", () => {
    const note = "Repository is a monorepo; activity reflects all packages.";
    const withNote = renderToStaticMarkup(
      <DeathCertificateView cert={{ ...cert, repo: { value: { archived: false, pushedAt: "2021-01-01" }, note } }} />,
    );
    expect(withNote).toContain("Repository note");
    expect(withNote).toContain(note);
    expect(renderToStaticMarkup(<DeathCertificateView cert={cert} />)).not.toContain("Repository note");
  });
});

const report: RebirthReportData = {
  package: "x",
  generatedAt: "2024-01-01T00:00:00Z",
  source: "stored",
  seed: 1,
  n: 100,
  partial: false,
  score: { matched: 90, scored: 95, total: 100, excluded: 5, mismatches: 5 },
  scoreText: "90 of 95 scored inputs matched (5 excluded)",
  intentionalDifferences: [{ id: "ID-1", reason: "prototype pollution fixed", advisory: "GHSA-xxxx", covered: 5 }],
  mismatchSamples: [],
  vulnerabilitiesRemoved: [],
  originalTestSuite: { label: "available", detail: "ran upstream tests" },
};
const view = (r: RebirthReportData) =>
  renderToStaticMarkup(<RebirthReportView report={r} scoreText={r.scoreText} partial={r.partial} samples={[]} />);

describe("RebirthReportView (Requirements 6.2, 9.2, 9.5)", () => {
  it("shows the score text", () => {
    expect(view(report)).toContain("90 of 95 scored inputs matched (5 excluded)");
  });

  it("lists intentional differences separately from mismatches", () => {
    const html = view(report);
    const intentional = html.indexOf('aria-label="Intentional differences"');
    const mismatchHeading = html.indexOf("<h3");
    expect(intentional).toBeGreaterThan(-1);
    expect(html).toContain("prototype pollution fixed");
    expect(html).toContain("No mismatches sampled.");
    const mismatchPos = html.indexOf("Mismatches</h3>");
    expect(mismatchPos).toBeGreaterThan(mismatchHeading);
    expect(html.slice(mismatchPos)).not.toContain("prototype pollution fixed");
  });

  it.each<TestSuiteLabel>(["available", "not available", "adapted from upstream"])("renders test-suite label %s", (label) => {
    const html = view({ ...report, originalTestSuite: { label, detail: "d" } });
    expect(html).toContain(`>${label}</span>`);
  });
});

describe("GroqBudget (Requirement 9.2)", () => {
  it("shows both remaining counts", () => {
    const html = renderToStaticMarkup(<GroqBudget budget={{ remainingForIp: 3, remainingTotal: 42 }} />);
    expect(html).toContain("3 for this visitor");
    expect(html).toContain("42 in total");
  });
  it("shows a placeholder before any live run", () => {
    expect(renderToStaticMarkup(<GroqBudget budget={null} />)).toContain("shown after a live run");
  });
});

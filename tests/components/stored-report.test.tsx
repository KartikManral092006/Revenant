import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { RebirthReport, type RebirthReportData } from "../../components/RebirthReport";
import { listGraveyard } from "../../lib/graveyard/loader";
import { loadStoredReport } from "../../lib/report/stored";

const manifests = listGraveyard();
const find = (n: string) => manifests.find((m) => m.name === n)!;
const render = (name: string, report: RebirthReportData | null) =>
  renderToStaticMarkup(<RebirthReport name={name} report={report} resurrected={true} />);

describe("stored report from real data/<pkg>/diff-run.json", () => {
  it("lodash.set: renders score, intentional difference and removed advisory", () => {
    const report = loadStoredReport(find("lodash.set"));
    expect(report).not.toBeNull();
    const html = render("lodash.set", report);
    expect(html).toContain("942 / 942 inputs matched");
    expect(html).toContain("lodash.set-prototype-pollution");
    expect(html).toContain("GHSA-p6mc-m468-83gw");
    expect(html).toContain("behavior no longer observed in 58 inputs");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(=|>|\s)/);
  });

  it("lodash.pick: renders score with no intentional differences", () => {
    const report = loadStoredReport(find("lodash.pick"));
    expect(report).not.toBeNull();
    const html = render("lodash.pick", report);
    expect(html).toContain("1,000 / 1,000 inputs matched");
    expect(html).toContain("None recorded.");
  });
});

describe("malformed diff-run.json", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "revenant-stored-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  function rootWith(content: string): string {
    const root = mkdtempSync(path.join(tmp, "r-"));
    cpSync(path.join(process.cwd(), "graveyard", "lodash.set"), path.join(root, "graveyard", "lodash.set"), { recursive: true });
    mkdirSync(path.join(root, "data", "lodash.set"), { recursive: true });
    writeFileSync(path.join(root, "data", "lodash.set", "diff-run.json"), content);
    return root;
  }

  it.each([
    ["invalid JSON", "{not json"],
    ["wrong shape", JSON.stringify({ package: "lodash.set", score: 1 })],
    ["missing summary fields", JSON.stringify({ seed: 1, n: 1, partial: false, samples: [], summary: {} })],
  ])("%s yields null and the fallback renders", (_label, content) => {
    const report = loadStoredReport(find("lodash.set"), rootWith(content));
    expect(report).toBeNull();
    expect(render("lodash.set", report)).toContain("No stored report");
  });

  it("component does not crash on a report missing its arrays", () => {
    const bad = { package: "x", generatedAt: "t", source: "stored", seed: 1, n: 1, partial: false, scoreText: "1 / 1 inputs matched" };
    const html = render("x", bad as unknown as RebirthReportData);
    expect(html).toContain("1 / 1 inputs matched");
  });
});

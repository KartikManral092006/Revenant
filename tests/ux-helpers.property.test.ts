import fc from "fast-check";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeClass, groupClassCounts } from "../app/_lib/class-labels";
import { buildSummary, type CertificateLike, type ReportLike } from "../app/_lib/summary";
import { compactCount, humanDate, monthYear } from "../components/format";
import { findViolations } from "../lib/report/language-guard";

const LODASH = ["pathShape", "targetType", "outcome"];

// Feature: revenant-ux, Property 1: Class labels are total and reversible
describe("Property 1: class labels are total and reversible", () => {
  it("never throws, never returns an empty label, and keeps the raw id", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string(), { maxLength: 4 }), (id, feats) => {
        const r = describeClass(id, feats);
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.technicalId).toBe(id);
      }),
      { numRuns: 300 },
    );
  });

  it("labels the real lodash.set groups in plain words", () => {
    expect(describeClass("lodash.set:default:class:dot|plain-object|returned", LODASH).label).toBe(
      "Dotted path (a.b) on a plain object: returned a value",
    );
    expect(describeClass("lodash.set:default:class:proto-path|plain-object|prototype-pollution", LODASH).label).toBe(
      "Prototype-polluting path on a plain object: changed Object.prototype",
    );
    expect(describeClass("lodash.set:default:class:unclassified", LODASH).label).toBe("Inputs that fit no group");
    expect(describeClass("string:camelize:class:ascii|returned", ["inputShape", "outcome"]).label).toBe(
      "camelize() · Plain text: returned a value",
    );
  });

  it("labels every stored class of every package without falling back to raw segments for known features", () => {
    for (const pkg of ["lodash.set", "lodash.pick", "string", "deep-extend"]) {
      const manifest = JSON.parse(readFileSync(path.join("graveyard", pkg, "manifest.json"), "utf8")) as {
        classFeatures: { feature: string }[];
      };
      const classes = JSON.parse(readFileSync(path.join("data", pkg, "classes.json"), "utf8")) as { classes: { classId: string }[] };
      const feats = manifest.classFeatures.map((f) => f.feature);
      for (const c of classes.classes) {
        const label = describeClass(c.classId, feats).label;
        expect(label, c.classId).not.toContain("|");
        expect(findViolations(label)).toEqual([]);
      }
    }
  });
});

// Feature: revenant-ux, Property 2: Group counts are conserved
describe("Property 2: group counts are conserved", () => {
  it("sums equal and output is sorted by count descending", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ classId: fc.constantFrom("a:x:class:dot|array|returned", "a:x:class:empty|array|returned", "a:x:class:unclassified", "zzz"), count: fc.nat(1000) })),
        (rows) => {
          const g = groupClassCounts(rows, LODASH);
          expect(g.reduce((s, x) => s + x.count, 0)).toBe(rows.reduce((s, x) => s + x.count, 0));
          for (let i = 1; i < g.length; i++) expect(g[i - 1].count).toBeGreaterThanOrEqual(g[i].count);
          expect(new Set(g.map((x) => x.classId)).size).toBe(g.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: revenant-ux, Property 3: Human dates are consistent with their input
describe("Property 3: human dates are consistent with their input", () => {
  it("shows the right year and a relative phrase within one year of the truth", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2030-01-01T00:00:00Z"), noInvalidDate: true }),
        fc.integer({ min: 0, max: 20 * 365 }),
        (d, gapDays) => {
          const now = new Date(d.getTime() + gapDays * 86_400_000);
          const h = humanDate(d.toISOString(), now);
          expect(h.text).toContain(String(d.getUTCFullYear()));
          const m = /about (\d+) years ago/.exec(h.relative);
          if (m) expect(Math.abs(Number(m[1]) - gapDays / 365.25)).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("formats the boundaries", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    expect(humanDate("2016-08-13T17:44:16.595Z", now)).toEqual({ text: "Aug 13, 2016", relative: "about 10 years ago" });
    expect(humanDate("2026-11-18T00:00:00Z", now).relative).toBe("today");
    expect(humanDate("not a date", now)).toEqual({ text: "not a date", relative: "" });
    expect(monthYear("2018-05-22T18:13:17.476Z")).toBe("May 2018");
    expect(compactCount(2034648)).toBe("2.0 million");
    expect(compactCount(80321)).toBe("80 thousand");
  });
});

const field = <T>(v: T | null) => (v === null ? { unknown: true as const, reason: "test" } : { value: v });
const arbCert: fc.Arbitrary<CertificateLike | null> = fc.option(
  fc.record({
    lastPublish: fc.constantFrom("2016-08-13T00:00:00Z", null).map(field),
    inactive: fc.option(fc.boolean(), { nil: null }).map(field),
    deprecation: fc.constantFrom("Deprecated", null).map((v) => ({ value: v })),
    vulnerabilities: fc
      .option(fc.array(fc.record({ id: fc.constantFrom("GHSA-aaaa-bbbb-cccc"), summary: fc.constant("Prototype Pollution in x") }), { maxLength: 2 }), { nil: null })
      .map(field),
    weeklyDownloads: fc.option(fc.nat(), { nil: null }).map(field),
    repo: fc.option(fc.record({ archived: fc.boolean(), pushedAt: fc.constant("2020-01-01T00:00:00Z") }), { nil: null }).map(field),
  }),
  { nil: null },
);
const arbReport: fc.Arbitrary<ReportLike | null> = fc.option(
  fc.record({
    scoreText: fc.constantFrom("942 / 942 inputs matched", "1,000 / 1,000 inputs matched"),
    partial: fc.boolean(),
    score: fc.record({ mismatches: fc.nat(5), excluded: fc.nat(60) }),
    intentionalDifferences: fc.array(fc.record({ covered: fc.nat(60) }), { maxLength: 2 }),
    vulnerabilitiesRemoved: fc.array(fc.record({ advisory: fc.constant("GHSA-x"), basis: fc.constant("b") }), { maxLength: 1 }),
  }),
  { nil: null },
);

// Feature: revenant-ux, Property 4: The summary banner agrees with its sources
// Feature: revenant-ux, Property 5: Banner never overstates
describe("Properties 4 and 5: summary agrees with its sources and never overstates", () => {
  it("always four non-empty facts; match equals scoreText when rebuilt; 'No score' otherwise", () => {
    fc.assert(
      fc.property(arbCert, arbReport, fc.boolean(), (cert, report, resurrected) => {
        const s = buildSummary({ name: "pkg", cert, report, resurrected, now: new Date("2026-11-18T00:00:00Z") });
        expect(s.facts).toHaveLength(4);
        for (const f of s.facts) {
          expect(f.value.length).toBeGreaterThan(0);
          expect(f.detail.length).toBeGreaterThan(0);
        }
        const match = s.facts.find((f) => f.key === "match")!;
        if (resurrected && report) {
          expect(s.rebuilt).toBe(true);
          expect(match.value).toBe(report.scoreText);
        } else {
          expect(s.rebuilt).toBe(false);
          expect(match.value).toBe("No score");
          expect(s.headline).not.toMatch(/has been rebuilt|rebuild has been compared/);
          expect(s.chips.some((c) => c.text === "Rebuilt")).toBe(false);
        }
        // Property 6 for helper output: no forbidden words.
        for (const text of [s.headline, s.cardVerdict, ...s.facts.flatMap((f) => [f.value, f.detail]), ...s.chips.map((c) => c.text)]) {
          expect(findViolations(text)).toEqual([]);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("only claims a removed vulnerability when the report lists one", () => {
    const cert: CertificateLike = {
      lastPublish: { value: "2016-08-13T00:00:00Z" },
      inactive: { value: true },
      deprecation: { value: null },
      vulnerabilities: { value: [{ id: "GHSA-p6mc-m468-83gw", aliases: ["CVE-2020-8203"], summary: "Prototype Pollution in lodash" }] },
      weeklyDownloads: { value: 2_000_000 },
      repo: { value: { archived: false, pushedAt: "2026-01-01T00:00:00Z" } },
    };
    const base: ReportLike = { scoreText: "1,000 / 1,000 inputs matched", partial: false, score: { mismatches: 0, excluded: 0 } };
    const pick = buildSummary({ name: "lodash.pick", cert, report: { ...base, vulnerabilitiesRemoved: [] }, resurrected: true, now: new Date() });
    expect(pick.facts.find((f) => f.key === "fix")?.value).toBe("Not observed");
    expect(pick.result).not.toContain("vulnerability is gone");
    const set = buildSummary({
      name: "lodash.set",
      cert,
      report: { ...base, vulnerabilitiesRemoved: [{ advisory: "GHSA-p6mc-m468-83gw", basis: "b" }], intentionalDifferences: [{ covered: 58 }] },
      resurrected: true,
      now: new Date(),
    });
    expect(set.facts.find((f) => f.key === "fix")?.value).toBe("Removed");
    expect(set.facts.find((f) => f.key === "fix")?.detail).toContain("58 inputs");
  });
});

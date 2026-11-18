import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { assembleCertificate } from "../lib/autopsy/certificate";
import type { Field } from "../lib/autopsy/http";
import type { NpmInfo } from "../lib/autopsy/npm";
import type { RepoInfo } from "../lib/autopsy/github";
import type { Vulnerability } from "../lib/autopsy/osv";

const REQUIRED = [
  "package",
  "version",
  "fetchedAt",
  "source",
  "lastPublish",
  "inactive",
  "deprecation",
  "vulnerabilities",
  "weeklyDownloads",
  "repo",
  "license",
] as const;

const fieldOf = <T>(value: fc.Arbitrary<T>): fc.Arbitrary<Field<T>> =>
  fc.oneof(
    value.map((v): Field<T> => ({ value: v })),
    fc.string({ minLength: 1 }).map((reason): Field<T> => ({ unknown: true, reason })),
  );

const isoDate = fc
  .date({ min: new Date("2010-01-01T00:00:00Z"), max: new Date("2030-01-01T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString());

const vuln: fc.Arbitrary<Vulnerability> = fc.record({
  id: fc.string({ minLength: 1 }),
  aliases: fc.array(fc.string()),
  summary: fc.string(),
}) as fc.Arbitrary<Vulnerability>;

const repoInfo: fc.Arbitrary<RepoInfo> = fc.record({ archived: fc.boolean(), pushedAt: isoDate });

const npmResult = fc.oneof(
  fc.string({ minLength: 1 }).map((reason) => ({ ok: false as const, reason })),
  fc
    .record({
      lastPublish: fieldOf(isoDate),
      deprecation: fieldOf(fc.oneof(fc.constant(null), fc.string())),
      license: fieldOf(fc.string()),
      repositoryUrl: fieldOf(fc.string()),
    })
    .map((value) => ({ ok: true as const, value: value as NpmInfo })),
);

const downloadsResult = fc.oneof(
  fc.string({ minLength: 1 }).map((reason) => ({ ok: false as const, reason })),
  fc.nat().map((value) => ({ ok: true as const, value })),
);

const hasValue = (f: unknown): boolean => typeof f === "object" && f !== null && "value" in f;
const isUnknown = (f: unknown): boolean =>
  typeof f === "object" &&
  f !== null &&
  (f as { unknown?: unknown }).unknown === true &&
  typeof (f as { reason?: unknown }).reason === "string" &&
  !("value" in f);

// Feature: revenant-mvp, Property 3: Death Certificate is complete and never fabricated
describe("Property 3: Death Certificate is complete and never fabricated", () => {
  it("has every required field, and every failed source yields unknown with no value", () => {
    fc.assert(
      fc.property(
        npmResult,
        downloadsResult,
        fieldOf(fc.array(vuln)),
        fieldOf(repoInfo),
        fc.boolean(),
        isoDate,
        (npm, downloads, vulnerabilities, repo, monorepo, nowIso) => {
          const cert = assembleCertificate({
            name: "pkg",
            version: "1.0.0",
            monorepo,
            npm,
            downloads,
            vulnerabilities,
            repo: { repo },
            now: new Date(nowIso),
          });

          // Completeness
          for (const key of REQUIRED) {
            expect(cert).toHaveProperty(key);
            expect((cert as unknown as Record<string, unknown>)[key]).not.toBeUndefined();
          }
          for (const key of ["lastPublish", "inactive", "deprecation", "vulnerabilities", "weeklyDownloads", "repo", "license"] as const) {
            const f = cert[key];
            expect(hasValue(f) !== isUnknown(f)).toBe(true);
          }

          // npm-derived fields
          if (!npm.ok) {
            for (const f of [cert.lastPublish, cert.deprecation, cert.license, cert.inactive]) {
              expect(isUnknown(f)).toBe(true);
            }
          } else {
            for (const key of ["lastPublish", "deprecation", "license"] as const) {
              expect(cert[key]).toEqual(npm.value[key]);
            }
            if (!hasValue(npm.value.lastPublish)) expect(isUnknown(cert.inactive)).toBe(true);
            else expect(hasValue(cert.inactive)).toBe(true);
          }

          // downloads
          if (!downloads.ok) expect(isUnknown(cert.weeklyDownloads)).toBe(true);
          else expect(cert.weeklyDownloads).toEqual({ value: downloads.value });

          // passthrough sources
          expect(isUnknown(cert.vulnerabilities)).toBe(isUnknown(vulnerabilities));
          expect(isUnknown(cert.repo)).toBe(isUnknown(repo));
          if (hasValue(repo)) expect((cert.repo as { value: RepoInfo }).value).toEqual((repo as { value: RepoInfo }).value);
          if (hasValue(vulnerabilities)) expect(cert.vulnerabilities).toEqual(vulnerabilities);
        },
      ),
      { numRuns: 200 },
    );
  });
});

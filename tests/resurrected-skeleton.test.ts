import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Requirement 7.5: each resurrected skeleton has package.json, a LICENSE equal
// to the original text, and a README that names the original author.
const root = resolve(__dirname, "..");

function authorName(author: unknown): string {
  const raw = typeof author === "string" ? author : (author as { name?: string })?.name ?? "";
  return raw.replace(/\s*[<(].*$/, "").trim();
}

describe.each(["lodash.set", "lodash.pick"])("resurrected/%s skeleton", (pkg) => {
  const dir = resolve(root, "resurrected", pkg);
  const original = resolve(root, "graveyard", "node_modules", pkg);

  it("has a package.json", () => {
    expect(existsSync(resolve(dir, "package.json"))).toBe(true);
    expect(JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")).name).toBe(pkg);
  });

  it("has a LICENSE equal to the original text", () => {
    expect(readFileSync(resolve(dir, "LICENSE"), "utf8")).toBe(
      readFileSync(resolve(original, "LICENSE"), "utf8"),
    );
  });

  it("has a README naming the original author", () => {
    const meta = JSON.parse(readFileSync(resolve(original, "package.json"), "utf8"));
    const name = authorName(meta.author);
    expect(name.length).toBeGreaterThan(0);
    expect(readFileSync(resolve(dir, "README.md"), "utf8")).toContain(name);
  });
});

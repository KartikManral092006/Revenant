import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

export interface ImportRef {
  specifier: string;
  kind: "import" | "export-from" | "import-equals" | "dynamic-import" | "require" | "import-type";
  typeOnly: boolean;
}

function parse(source: string, fileName = "x.tsx"): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Every module specifier in a source text, covering static, re-export, require and dynamic forms. */
export function collectImports(source: string, fileName?: string): ImportRef[] {
  const out: ImportRef[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteralLike(n.moduleSpecifier)) {
      const clause = n.importClause;
      const allNamedTypeOnly =
        !!clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        !clause.name &&
        clause.namedBindings.elements.length > 0 &&
        clause.namedBindings.elements.every((e) => e.isTypeOnly);
      out.push({
        specifier: n.moduleSpecifier.text,
        kind: "import",
        typeOnly: !!clause?.isTypeOnly || allNamedTypeOnly,
      });
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)) {
      out.push({ specifier: n.moduleSpecifier.text, kind: "export-from", typeOnly: n.isTypeOnly });
    } else if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference) &&
      ts.isStringLiteralLike(n.moduleReference.expression)
    ) {
      out.push({ specifier: n.moduleReference.expression.text, kind: "import-equals", typeOnly: n.isTypeOnly });
    } else if (ts.isCallExpression(n) && n.arguments.length > 0) {
      const arg = n.arguments[0];
      const lit = ts.isStringLiteralLike(arg) ? arg.text : undefined;
      if (lit !== undefined) {
        if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
          out.push({ specifier: lit, kind: "dynamic-import", typeOnly: false });
        } else if (ts.isIdentifier(n.expression) && n.expression.text === "require") {
          out.push({ specifier: lit, kind: "require", typeOnly: false });
        } else if (
          ts.isPropertyAccessExpression(n.expression) &&
          ts.isIdentifier(n.expression.expression) &&
          n.expression.expression.text === "require" &&
          n.expression.name.text === "resolve"
        ) {
          out.push({ specifier: lit, kind: "require", typeOnly: false });
        }
      }
    } else if (
      ts.isImportTypeNode(n) &&
      ts.isLiteralTypeNode(n.argument) &&
      ts.isStringLiteralLike(n.argument.literal)
    ) {
      out.push({ specifier: n.argument.literal.text, kind: "import-type", typeOnly: true });
    }
    ts.forEachChild(n, visit);
  };
  visit(parse(source, fileName));
  return out;
}

export function hasUseClientDirective(source: string): boolean {
  const sf = parse(source);
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === "use client") return true;
    } else break;
  }
  return false;
}

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "build"]);

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...listFiles(p));
    } else if (SOURCE_RE.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Resolves a relative or `@/` specifier to a project file, or undefined. */
function resolveLocal(fromFile: string, spec: string, base: string): string | undefined {
  let target: string;
  if (spec.startsWith(".")) target = resolve(dirname(fromFile), spec);
  else if (spec.startsWith("@/")) target = resolve(base, spec.slice(2));
  else return undefined;
  const candidates = [
    target,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"].map((e) => target + e),
    ...["index.ts", "index.tsx", "index.js"].map((i) => join(target, i)),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile() && SOURCE_RE.test(c));
}

/** Top-level directory of a specifier that resolves inside `base`, e.g. "lib". */
function topDirOf(fromFile: string, spec: string, base: string): string | undefined {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return undefined;
  const target = spec.startsWith(".") ? resolve(dirname(fromFile), spec) : resolve(base, spec.slice(2));
  const rel = relative(base, target);
  if (rel.startsWith("..")) return undefined;
  return rel.split(/[\\/]/)[0];
}

export interface Violation {
  file: string;
  specifier: string;
  kind: ImportRef["kind"];
  typeOnly: boolean;
  via?: string;
}

/** Client files = files in `components/` + files with "use client" elsewhere in `app/`, plus their transitive local imports. */
export function findClientFiles(base: string): Set<string> {
  const roots = [
    ...listFiles(join(base, "components")),
    ...listFiles(join(base, "app")).filter((f) => hasUseClientDirective(readFileSync(f, "utf8"))),
  ];
  const seen = new Set<string>(roots);
  const queue = [...roots];
  while (queue.length) {
    const f = queue.pop()!;
    for (const imp of collectImports(readFileSync(f, "utf8"), f)) {
      const r = resolveLocal(f, imp.specifier, base);
      if (r && !seen.has(r)) {
        seen.add(r);
        queue.push(r);
      }
    }
  }
  return seen;
}

export function findServerOnlyViolations(base: string): Violation[] {
  const v: Violation[] = [];
  for (const f of findClientFiles(base)) {
    for (const imp of collectImports(readFileSync(f, "utf8"), f)) {
      const top = topDirOf(f, imp.specifier, base);
      if (top === "lib" || top === "sandbox") {
        v.push({ file: relative(base, f), ...imp });
      }
    }
  }
  return v;
}

export function graveyardNames(base: string): string[] {
  const dir = join(base, "graveyard");
  return readdirSync(dir)
    .map((d) => join(dir, d, "manifest.json"))
    .filter((p) => existsSync(p))
    .map((p) => (JSON.parse(readFileSync(p, "utf8")) as { name: string }).name);
}

export function matchesPackage(spec: string, names: string[]): string | undefined {
  const bare = spec.replace(/^node:/, "");
  return names.find((n) => bare === n || bare.startsWith(n + "/"));
}

export function findGraveyardImportViolations(base: string, names: string[]): Violation[] {
  const v: Violation[] = [];
  for (const d of ["app", "lib", "components"]) {
    for (const f of listFiles(join(base, d))) {
      for (const imp of collectImports(readFileSync(f, "utf8"), f)) {
        if (matchesPackage(imp.specifier, names)) v.push({ file: relative(base, f), ...imp });
      }
    }
  }
  return v;
}

function fmt(vs: Violation[]): string {
  return vs.map((x) => `${x.file}: ${x.kind}${x.typeOnly ? " (type-only)" : ""} "${x.specifier}"`).join("\n");
}

describe("static import checks (real repository)", () => {
  it("client code (components/, 'use client' files, and their transitive imports) never imports lib/ or sandbox/", () => {
    const clients = findClientFiles(root);
    expect(clients.size).toBeGreaterThan(0);
    const v = findServerOnlyViolations(root);
    expect(v, "\n" + fmt(v)).toEqual([]);
  });

  it("no file under app/, lib/ or components/ imports a Graveyard package name", () => {
    const names = graveyardNames(root);
    expect(names.length).toBeGreaterThanOrEqual(3);
    const v = findGraveyardImportViolations(root, names);
    expect(v, "\n" + fmt(v)).toEqual([]);
  });
});

describe("static import scanner (seeded violations)", () => {
  const names = ["string", "lodash.set"];

  it("detects every import form", () => {
    const src = `
      import a from "string";
      import { b } from "lodash.set/index";
      export * from "string";
      import c = require("string");
      const d = require("string");
      const e = await import("string");
      type T = import("string").X;
      import type { Q } from "../lib/x";
    `;
    const refs = collectImports(src);
    expect(refs.map((r) => r.kind)).toEqual([
      "import", "import", "export-from", "import-equals", "require", "dynamic-import", "import-type", "import",
    ]);
    expect(refs[7].typeOnly).toBe(true);
    expect(refs[0].typeOnly).toBe(false);
    expect(refs.filter((r) => matchesPackage(r.specifier, names))).toHaveLength(7);
  });

  it("matches names exactly or as subpaths, not as prefixes", () => {
    expect(matchesPackage("string", names)).toBe("string");
    expect(matchesPackage("string/lib/x", names)).toBe("string");
    expect(matchesPackage("strings", names)).toBeUndefined();
    expect(matchesPackage("./string", names)).toBeUndefined();
  });

  it("detects the 'use client' directive only as a leading directive", () => {
    expect(hasUseClientDirective(`"use client";\nimport x from "y";`)).toBe(true);
    expect(hasUseClientDirective(`'use client'\n`)).toBe(true);
    expect(hasUseClientDirective(`import x from "y";\n"use client";`)).toBe(false);
  });

  it("flags lib/ and sandbox/ imports in client files, including transitive and dynamic ones", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const base = mkdtempSync(join(tmpdir(), "static-scan-"));
    try {
      for (const d of ["app/p", "components", "lib", "sandbox", "graveyard/string"]) mkdirSync(join(base, d), { recursive: true });
      writeFileSync(join(base, "graveyard/string/manifest.json"), JSON.stringify({ name: "string" }));
      writeFileSync(join(base, "lib/server.ts"), `export const x = 1;`);
      writeFileSync(join(base, "sandbox/s.ts"), `export const y = 1;`);
      writeFileSync(join(base, "components/A.tsx"), `"use client";\nimport { x } from "../lib/server";\nimport h from "./helper";`);
      writeFileSync(join(base, "components/helper.ts"), `export default async () => import("../sandbox/s");`);
      // Page-level client component, reaches lib transitively via a non-component helper in app/.
      writeFileSync(join(base, "app/p/page.tsx"), `"use client";\nimport "./util";`);
      writeFileSync(join(base, "app/p/util.ts"), `import type { x } from "../../lib/server";\nexport {};`);
      // Server page that is not client: lib import is allowed.
      writeFileSync(join(base, "app/server-page.tsx"), `import { x } from "../lib/server";\nimport s from "string";`);

      const v = findServerOnlyViolations(base);
      expect(v.map((x) => x.file).sort()).toEqual(
        ["app/p/util.ts", "components/A.tsx", "components/helper.ts"].map((p) => p.replace(/\//g, "/")).sort(),
      );
      expect(v.find((x) => x.file === "app/p/util.ts")?.typeOnly).toBe(true);

      const g = findGraveyardImportViolations(base, graveyardNames(base));
      expect(g.map((x) => x.file)).toEqual(["app/server-page.tsx"]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

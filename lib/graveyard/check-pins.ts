// Build-time pin check. Compiled to build/node/lib/graveyard/check-pins.js and run before `next build`.
// Node-run code: relative imports only, with .js extensions.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isExactVersion } from './manifest-schema.js';

export interface PinInputs {
  /** `dependencies` object of graveyard/package.json. */
  dependencies: Record<string, unknown>;
  /** Manifest name/version per package directory (only these two fields are read). */
  manifests: { dir: string; name: unknown; version: unknown }[];
  /** Parsed graveyard/package-lock.json, or null when the file is missing. */
  lockfile: unknown;
}

export interface PinCheckResult {
  ok: boolean;
  errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Pure validator: no file access, so it can be tested directly. */
export function validatePins(input: PinInputs): PinCheckResult {
  const errors: string[] = [];
  const deps = input.dependencies;

  for (const [name, version] of Object.entries(deps)) {
    if (!isExactVersion(version)) {
      errors.push(`graveyard/package.json: "${name}" version ${JSON.stringify(version)} is not an exact version`);
    }
  }

  const lockPackages =
    isRecord(input.lockfile) && isRecord(input.lockfile.packages) ? input.lockfile.packages : null;
  if (input.lockfile === null) {
    errors.push('graveyard/package-lock.json is missing');
  } else if (lockPackages === null) {
    errors.push('graveyard/package-lock.json has no "packages" object');
  }

  const seen = new Set<string>();
  for (const m of input.manifests) {
    const where = `graveyard/${m.dir}/manifest.json`;
    if (typeof m.name !== 'string' || m.name === '') {
      errors.push(`${where}: name must be a non-empty string`);
      continue;
    }
    seen.add(m.name);
    if (!isExactVersion(m.version)) {
      errors.push(`${where}: version ${JSON.stringify(m.version)} is not an exact version`);
    }
    if (!Object.prototype.hasOwnProperty.call(deps, m.name)) {
      errors.push(`${where}: "${m.name}" is not listed in graveyard/package.json`);
    } else if (deps[m.name] !== m.version) {
      errors.push(
        `${where}: version ${JSON.stringify(m.version)} differs from graveyard/package.json ${JSON.stringify(deps[m.name])}`,
      );
    }
    if (lockPackages !== null) {
      const entry = lockPackages[`node_modules/${m.name}`];
      const locked = isRecord(entry) ? entry.version : undefined;
      if (locked === undefined) {
        errors.push(`graveyard/package-lock.json: no entry for "${m.name}"`);
      } else if (locked !== m.version) {
        errors.push(
          `graveyard/package-lock.json: "${m.name}" locked at ${JSON.stringify(locked)}, manifest says ${JSON.stringify(m.version)}`,
        );
      }
    }
  }

  for (const name of Object.keys(deps)) {
    if (!seen.has(name)) errors.push(`graveyard/package.json: "${name}" has no manifest`);
  }

  return { ok: errors.length === 0, errors };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Reads the Graveyard files under `root` and validates the pins. */
export function checkPins(root: string = process.cwd()): PinCheckResult {
  const gy = join(root, 'graveyard');
  const errors: string[] = [];

  let dependencies: Record<string, unknown> = {};
  try {
    const pkg = readJson(join(gy, 'package.json'));
    if (isRecord(pkg) && isRecord(pkg.dependencies)) dependencies = pkg.dependencies;
    else errors.push('graveyard/package.json has no "dependencies" object');
  } catch (e) {
    errors.push(`graveyard/package.json unreadable: ${(e as Error).message}`);
  }

  let lockfile: unknown = null;
  const lockPath = join(gy, 'package-lock.json');
  if (existsSync(lockPath)) {
    try {
      lockfile = readJson(lockPath);
    } catch (e) {
      errors.push(`graveyard/package-lock.json unreadable: ${(e as Error).message}`);
      lockfile = {};
    }
  }

  const manifests: PinInputs['manifests'] = [];
  for (const entry of readdirSync(gy, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const manifestPath = join(gy, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = readJson(manifestPath);
      manifests.push({
        dir: entry.name,
        name: isRecord(m) ? m.name : undefined,
        version: isRecord(m) ? m.version : undefined,
      });
    } catch (e) {
      errors.push(`graveyard/${entry.name}/manifest.json unreadable: ${(e as Error).message}`);
    }
  }

  const result = validatePins({ dependencies, manifests, lockfile });
  errors.push(...result.errors);
  return { ok: errors.length === 0, errors };
}

function main(): void {
  const result = checkPins();
  if (!result.ok) {
    console.error('Graveyard pin check failed:');
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('Graveyard pin check passed.');
}

// Run only when executed directly (`node build/node/lib/graveyard/check-pins.js`), not when imported by tests.
// Avoids import.meta/require.main so it compiles under either module format.
if (/check-pins\.js$/.test(process.argv[1] ?? '')) {
  main();
}

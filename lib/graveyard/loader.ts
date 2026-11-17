// Allowlist loader: the manifest list under graveyard/ is the only source of package names.
// Node-run code: relative imports only, with .js extensions.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateManifest, type Manifest } from './manifest-schema.js';

export interface LoaderOptions {
  /** Repo root. Defaults to process.cwd() (the Next.js server and npm scripts run from the repo root). */
  root?: string;
}

function graveyardDir(opts?: LoaderOptions): string {
  return path.join(path.resolve(opts?.root ?? process.cwd()), 'graveyard');
}

/**
 * Reads and validates every graveyard/<dir>/manifest.json, sorted by name.
 * Throws if a manifest is unreadable or invalid, or if its name differs from its folder.
 */
export function listGraveyard(opts?: LoaderOptions): Manifest[] {
  const dir = graveyardDir(opts);
  if (!existsSync(dir)) return [];
  const manifests: Manifest[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry === 'node_modules') continue;
    const folder = path.join(dir, entry);
    const file = path.join(folder, 'manifest.json');
    if (!statSync(folder).isDirectory() || !existsSync(file)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`graveyard/${entry}/manifest.json is not valid JSON: ${(err as Error).message}`);
    }
    const result = validateManifest(parsed);
    if (!result.ok) {
      throw new Error(`graveyard/${entry}/manifest.json is invalid: ${result.errors.join('; ')}`);
    }
    if (result.manifest.name !== entry) {
      throw new Error(`graveyard/${entry}/manifest.json name "${result.manifest.name}" does not match its folder`);
    }
    manifests.push(result.manifest);
  }
  return manifests;
}

/** Names from the manifest list, in the same order as listGraveyard. */
export function listGraveyardNames(opts?: LoaderOptions): string[] {
  return listGraveyard(opts).map((m) => m.name);
}

export function isAllowlisted(name: unknown, opts?: LoaderOptions): name is string {
  return typeof name === 'string' && listGraveyardNames(opts).includes(name);
}

/**
 * Absolute path of graveyard/node_modules/<name>, only for names in the manifest list.
 * Throws for every other input (including path-like strings such as "../x").
 */
export function resolvePackageDir(name: string, opts?: LoaderOptions): string {
  if (!isAllowlisted(name, opts)) {
    throw new Error(`"${String(name)}" is not in the Graveyard allowlist`);
  }
  const base = path.join(graveyardDir(opts), 'node_modules');
  const resolved = path.join(base, name);
  if (path.dirname(resolved) !== base) {
    throw new Error(`"${name}" does not resolve under graveyard/node_modules/`);
  }
  return resolved;
}

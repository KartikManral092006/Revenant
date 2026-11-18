/**
 * Request logic for the Reverse Spec route (Req 5.1, 5.7, 5.8, 5.9, 6.1, 6.2). Server-only.
 * Kept out of the route file so tests can inject a fake Groq function and limiter.
 * GROQ_API_KEY is never read here and no response field carries upstream error text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isAllowlisted } from '../graveyard/loader';
import type { BehaviorClass } from '../ghost-memory/evidence-id';
import { assembleBundle, readBundle, type StoredBundle } from './bundle';
import { generateRequirements, type GroqResult } from './groq-client';
import { buildPrompt } from './prompt';
import { rateLimiter, type RateLimiter } from './rate-limit';

export const CAP_MESSAGE = 'daily Groq cap reached, showing the stored bundle';
export const GROQ_FAILED_MESSAGE = 'live generation failed, showing the stored bundle';

/**
 * Client IP behind Render's proxy (design open item 16, measured 2026-11-17):
 * `cf-connecting-ip` if present, else the `x-forwarded-for` entry 3rd from the right
 * (real IP, Cloudflare edge, internal). Never the leftmost entry, which a client can prepend.
 * Fewer than 3 entries (local dev, unknown proxy) falls back to one shared 'unknown' key.
 * Not yet tested: whether a client can spoof `cf-connecting-ip` itself.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const parts = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts[parts.length - 3] : 'unknown';
}

export interface ReverseSpecDeps {
  limiter: RateLimiter;
  generate: (prompt: string) => Promise<GroqResult>;
  readCache: (pkg: string) => StoredBundle | null;
  readClasses: (pkg: string) => { version: string; classes: BehaviorClass[] } | null;
  isAllowed: (name: unknown) => boolean;
  now: () => Date;
}

function readClassesFile(pkg: string): { version: string; classes: BehaviorClass[] } | null {
  try {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'data', pkg, 'classes.json'), 'utf8')) as {
      version?: string;
      classes?: BehaviorClass[];
    };
    return Array.isArray(raw.classes) ? { version: String(raw.version ?? ''), classes: raw.classes } : null;
  } catch {
    return null;
  }
}

export const defaultDeps: ReverseSpecDeps = {
  limiter: rateLimiter,
  generate: (prompt) => generateRequirements(prompt),
  readCache: (pkg) => readBundle(pkg),
  readClasses: readClassesFile,
  isAllowed: (name) => isAllowlisted(name),
  now: () => new Date(),
};

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function handleReverseSpec(
  request: Request,
  pkg: string,
  overrides: Partial<ReverseSpecDeps> = {},
): Promise<Response> {
  const d = { ...defaultDeps, ...overrides };
  if (!d.isAllowed(pkg)) {
    return json({ error: 'package is not in the Graveyard' }, 404);
  }
  const ip = clientIp(request.headers);
  const now = d.now();
  const cached = d.readCache(pkg);

  const decision = d.limiter.tryConsume(ip, now);
  if (!decision.allowed) {
    return cachedResponse(cached, CAP_MESSAGE, decision);
  }

  const data = d.readClasses(pkg);
  if (!data) return json({ error: 'stored classes are missing for this package', ...budgetOf(decision) }, 500);

  let result: GroqResult;
  try {
    const { prompt } = buildPrompt({ package: pkg, version: data.version, classes: data.classes });
    result = await d.generate(prompt);
  } catch {
    result = { ok: false, reason: 'request-failed' };
  }
  if (!result.ok) {
    return cachedResponse(cached, GROQ_FAILED_MESSAGE, decision);
  }
  const bundle = assembleBundle({
    package: pkg,
    model: result.model,
    requirements: result.requirements,
    classes: data.classes,
    generatedAt: d.now().toISOString(),
  });
  return json({ source: 'live', message: null, bundle, ...budgetOf(decision) });
}

function budgetOf(b: { remainingForIp: number; remainingTotal: number }) {
  return { remainingForIp: b.remainingForIp, remainingTotal: b.remainingTotal };
}

function cachedResponse(
  cached: StoredBundle | null,
  message: string,
  budget: { remainingForIp: number; remainingTotal: number },
): Response {
  if (!cached) {
    return json({ error: 'no stored bundle is available', message, ...budgetOf(budget) }, 503);
  }
  return json({ source: 'cached', message, bundle: cached, ...budgetOf(budget) });
}

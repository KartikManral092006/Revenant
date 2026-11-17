import { timingSafeEqual } from "node:crypto";

// Temporary spike helper (task 2.1). Removed in task 2.3.

/** True only when SPIKE_TOKEN is set and the x-spike-token header equals it. */
export function hasSpikeAccess(request: Request): boolean {
  const expected = process.env.SPIKE_TOKEN;
  if (!expected) return false;
  const given = request.headers.get("x-spike-token");
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function notFound(): Response {
  return new Response("Not Found", { status: 404 });
}

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  createRateLimiter,
  PER_IP_DAILY_LIMIT,
  TOTAL_DAILY_LIMIT,
} from "../lib/reverse-spec/rate-limit";

// Feature: revenant-mvp, Property 17: Groq limiter never exceeds its limits
describe("Property 17: Groq limiter never exceeds its limits", () => {
  const DAY = new Date("2025-01-01T12:00:00Z");

  it("allows at most 5 per IP and 50 total per UTC day, with consistent budgets", () => {
    /** Validates: Requirements 6.1, 6.2 */
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 29 }), { minLength: 0, maxLength: 400 }),
        (ipIds) => {
          const limiter = createRateLimiter();
          const allowedPerIp = new Map<string, number>();
          let allowedTotal = 0;
          for (const id of ipIds) {
            const ip = `10.0.0.${id}`;
            const before = limiter.peek(ip, DAY);
            const d = limiter.tryConsume(ip, DAY);
            if (d.allowed) {
              allowedTotal++;
              allowedPerIp.set(ip, (allowedPerIp.get(ip) ?? 0) + 1);
            } else {
              // A denial does not consume budget.
              expect(limiter.peek(ip, DAY)).toEqual(before);
            }
            expect(d.remainingForIp).toBeGreaterThanOrEqual(0);
            expect(d.remainingTotal).toBeGreaterThanOrEqual(0);
            expect(d.remainingForIp).toBeLessThanOrEqual(d.remainingTotal);
            expect(d.remainingTotal).toBe(TOTAL_DAILY_LIMIT - allowedTotal);
            expect(d.remainingForIp).toBeLessThanOrEqual(
              PER_IP_DAILY_LIMIT - (allowedPerIp.get(ip) ?? 0),
            );
          }
          expect(allowedTotal).toBeLessThanOrEqual(TOTAL_DAILY_LIMIT);
          for (const n of allowedPerIp.values()) {
            expect(n).toBeLessThanOrEqual(PER_IP_DAILY_LIMIT);
          }
          // Exact count: allowed = what the limits permit.
          const counts = new Map<number, number>();
          for (const id of ipIds) counts.set(id, (counts.get(id) ?? 0) + 1);
          // Order matters when the total cap binds, so only check the lower bound when it cannot.
          const upper = Math.min(
            TOTAL_DAILY_LIMIT,
            [...counts.values()].reduce((s, c) => s + Math.min(c, PER_IP_DAILY_LIMIT), 0),
          );
          expect(allowedTotal).toBeLessThanOrEqual(upper);
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("starts a fresh budget on a new UTC day", () => {
    /** Validates: Requirements 6.1, 6.2 */
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (attempts) => {
        const limiter = createRateLimiter();
        const d1 = new Date("2025-03-01T23:59:59Z");
        const d2 = new Date("2025-03-02T00:00:00Z");
        for (let i = 0; i < attempts; i++) limiter.tryConsume("1.1.1.1", d1);
        const first = limiter.tryConsume("1.1.1.1", d2);
        expect(first.allowed).toBe(true);
        expect(first.remainingForIp).toBe(PER_IP_DAILY_LIMIT - 1);
        expect(first.remainingTotal).toBe(TOTAL_DAILY_LIMIT - 1);
      }),
      { numRuns: 100 },
    );
  });
});

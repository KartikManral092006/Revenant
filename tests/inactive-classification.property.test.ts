import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isInactive, addMonthsUtc, INACTIVE_MONTHS } from "../lib/autopsy/certificate";

const MIN = Date.UTC(2000, 0, 1);
const MAX = Date.UTC(2040, 11, 31);
const dateArb = fc.integer({ min: MIN, max: MAX }).map((ms) => new Date(ms));

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Independent oracle: whole calendar-month difference plus time-of-month tiebreak. */
function oracle(last: Date, now: Date): boolean {
  const months =
    (now.getUTCFullYear() - last.getUTCFullYear()) * 12 + (now.getUTCMonth() - last.getUTCMonth());
  if (months !== INACTIVE_MONTHS) return months > INACTIVE_MONTHS;
  const day = Math.min(last.getUTCDate(), daysInMonth(now.getUTCFullYear(), now.getUTCMonth()));
  const tail = (d: number, x: Date) =>
    (((d * 24 + x.getUTCHours()) * 60 + x.getUTCMinutes()) * 60 + x.getUTCSeconds()) * 1000 +
    x.getUTCMilliseconds();
  return tail(now.getUTCDate(), now) > tail(day, last);
}

describe("Property 5: Inactive classification", () => {
  /** **Validates: Requirements 2.7** */
  it("is inactive iff more than 24 calendar months have passed since the latest publish", () => {
    fc.assert(
      fc.property(dateArb, dateArb, (last, now) => {
        expect(isInactive(last, now)).toBe(oracle(last, now));
      }),
      { numRuns: 500 },
    );
  });

  /** **Validates: Requirements 2.7** */
  it("flips exactly at the 24-month boundary", () => {
    fc.assert(
      fc.property(dateArb, (last) => {
        const boundary = addMonthsUtc(last, INACTIVE_MONTHS);
        expect(isInactive(last, boundary)).toBe(false);
        expect(isInactive(last, new Date(boundary.getTime() + 1))).toBe(true);
        expect(isInactive(last, new Date(boundary.getTime() - 1))).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

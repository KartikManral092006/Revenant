import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { colorTokens, contrastPairs } from "../lib/report/contrast";

// Independent WCAG 2.x implementation (does not reuse app code).
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Bad hex colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Feature: revenant-mvp, Property 25: Contrast ratios meet AA
describe("Property 25: Contrast ratios meet AA", () => {
  it("declares at least one pair and all tokens are valid hex", () => {
    expect(contrastPairs.length).toBeGreaterThan(0);
    for (const hex of Object.values(colorTokens)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("every declared pair meets 4.5:1 (3:1 for large text)", () => {
    /** Validates: Requirements 11.4 */
    fc.assert(
      fc.property(fc.constantFrom(...contrastPairs), (p) => {
        const r = ratio(colorTokens[p.foreground], colorTokens[p.background]);
        const min = p.largeText ? 3.0 : 4.5;
        expect(
          r,
          `${p.foreground} on ${p.background}${p.largeText ? " (large)" : ""} = ${r.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(min);
      }),
      { numRuns: 200 },
    );
  });
});

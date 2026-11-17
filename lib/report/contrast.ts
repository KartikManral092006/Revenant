/**
 * Theme color tokens and the foreground/background pairs used in the UI.
 * Mapped into Tailwind's theme by tailwind.config.ts. A test checks each pair
 * against WCAG AA (4.5:1, or 3:1 when `largeText` is true).
 */

export const colorTokens = {
  crypt: "#0b0a10", // page background
  tomb: "#16141f", // card / panel background
  slab: "#221f30", // raised surface, table stripes
  mist: "#2e2a3d", // borders and dividers
  bone: "#ece8f5", // primary text
  ash: "#b3adc7", // secondary text
  pumpkin: "#ff8a2b", // primary accent
  ectoplasm: "#7be0a4", // match / success
  blood: "#ff7a7a", // mismatch / error
  wisp: "#b79cff", // links and focus rings
  candle: "#ffd166", // warnings and "unknown"
} as const;

export type ColorToken = keyof typeof colorTokens;

export interface ContrastPair {
  readonly foreground: ColorToken;
  readonly background: ColorToken;
  /** Large text (at least 24px, or 18.66px bold) only needs 3:1. */
  readonly largeText: boolean;
}

const pair = (
  foreground: ColorToken,
  background: ColorToken,
  largeText = false,
): ContrastPair => ({ foreground, background, largeText });

export const contrastPairs: readonly ContrastPair[] = [
  pair("bone", "crypt"),
  pair("bone", "tomb"),
  pair("bone", "slab"),
  pair("ash", "crypt"),
  pair("ash", "tomb"),
  pair("ash", "slab"),
  pair("pumpkin", "crypt"),
  pair("pumpkin", "tomb"),
  pair("pumpkin", "crypt", true),
  pair("ectoplasm", "crypt"),
  pair("ectoplasm", "tomb"),
  pair("blood", "crypt"),
  pair("blood", "tomb"),
  pair("wisp", "crypt"),
  pair("wisp", "tomb"),
  pair("candle", "crypt"),
  pair("candle", "tomb"),
  // Text on filled accent buttons and badges.
  pair("crypt", "pumpkin"),
  pair("crypt", "ectoplasm"),
  pair("crypt", "blood"),
  pair("crypt", "candle"),
];

/**
 * Theme color tokens and the foreground/background pairs used in the UI.
 * Mapped into Tailwind's theme by tailwind.config.ts. A test checks each pair
 * against WCAG AA (4.5:1, or 3:1 when `largeText` is true).
 *
 * Refined dark theme: neutral zinc surfaces, one violet accent, and muted
 * status colours. Token names describe their role, not a colour.
 */

export const colorTokens = {
  canvas: "#09090b", // page background
  surface: "#111114", // card / panel background
  raised: "#1a1a1f", // raised surface, inputs, bar tracks
  line: "#27272a", // borders and dividers
  fg: "#ededef", // primary text
  muted: "#a1a1aa", // secondary text
  accent: "#a78bfa", // brand accent (violet)
  success: "#4ade80", // match / success
  danger: "#f87171", // mismatch / error
  link: "#c4b5fd", // links and focus rings
  warn: "#fbbf24", // warnings and "unknown"
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
  pair("fg", "canvas"),
  pair("fg", "surface"),
  pair("fg", "raised"),
  pair("muted", "canvas"),
  pair("muted", "surface"),
  pair("muted", "raised"),
  pair("accent", "canvas"),
  pair("accent", "surface"),
  pair("success", "canvas"),
  pair("success", "surface"),
  pair("danger", "canvas"),
  pair("danger", "surface"),
  pair("link", "canvas"),
  pair("link", "surface"),
  pair("warn", "canvas"),
  pair("warn", "surface"),
  // Text on filled buttons and badges.
  pair("canvas", "fg"),
  pair("canvas", "accent"),
  pair("canvas", "success"),
  pair("canvas", "danger"),
  pair("canvas", "warn"),
];

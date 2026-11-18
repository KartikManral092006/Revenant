import type { ReactNode } from "react";

export type ChipTone = "dead" | "warn" | "ok" | "neutral" | "info";

// Text colour always carries a word, so colour is never the only signal. Only contrast-tested
// pairs are used: accent text on crypt/tomb.
const TONES: Record<ChipTone, string> = {
  dead: "border-blood/40 text-blood",
  warn: "border-candle/40 text-candle",
  ok: "border-ectoplasm/40 text-ectoplasm",
  neutral: "border-mist text-ash",
  info: "border-wisp/40 text-wisp",
};

export function Chip({ tone = "neutral", children, icon }: { tone?: ChipTone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-crypt px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

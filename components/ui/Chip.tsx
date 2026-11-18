import type { ReactNode } from "react";

export type ChipTone = "dead" | "warn" | "ok" | "neutral" | "info";

// Text colour always carries a word, so colour is never the only signal. Only contrast-tested
// pairs are used: status text on canvas/surface.
const TONES: Record<ChipTone, string> = {
  dead: "border-danger/40 text-danger",
  warn: "border-warn/40 text-warn",
  ok: "border-success/40 text-success",
  neutral: "border-line text-muted",
  info: "border-link/40 text-link",
};

export function Chip({ tone = "neutral", children, icon }: { tone?: ChipTone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-canvas px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

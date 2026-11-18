"use client";
import type { ReactNode, PointerEvent } from "react";

/**
 * Card with a soft light that follows the pointer (in the style of Magic UI's MagicCard).
 * The light is decorative; the card reads the same without it.
 */
export function SpotlightCard({
  children,
  className = "",
  glow = "183 156 255",
}: {
  children: ReactNode;
  className?: string;
  /** RGB triple for the light colour. */
  glow?: string;
}) {
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
  }
  return (
    <div
      onPointerMove={onMove}
      className={`group card relative overflow-hidden ${className}`}
      style={{ ["--glow" as string]: glow }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "radial-gradient(22rem circle at var(--x, 50%) var(--y, 0%), rgb(var(--glow) / 0.12), transparent 60%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

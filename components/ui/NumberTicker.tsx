"use client";
import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * Counts up to `value` when it first scrolls into view. The server renders the final value, so the
 * number is correct without JavaScript and for screen readers; only the visual count animates.
 */
export function NumberTicker({ value, className, duration = 1.4 }: { value: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const reduce = useReducedMotion();
  const final = value.toLocaleString("en-US");

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !inView) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = Math.round(v).toLocaleString("en-US");
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {final}
    </span>
  );
}

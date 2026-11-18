"use client";
import { useAnimate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades and lifts its children into place the first time they scroll into view (a "blur fade" in
 * the style of Magic UI).
 *
 * Content is visible by default: the server HTML is never hidden, so the page reads fine without
 * JavaScript, in print, and in screenshot tools. After hydration, only blocks that start below the
 * fold are hidden and then animated in. Under reduced motion nothing animates.
 */
export function Reveal({
  children,
  delay = 0,
  y = 12,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLElement>();
  const inView = useInView(scope, { once: true, margin: "0px 0px -60px 0px" });
  const armed = useRef(false);

  // Arm: hide only if the block is below the fold at mount time.
  useEffect(() => {
    const el = scope.current;
    if (reduce || !el) return;
    if (el.getBoundingClientRect().top > window.innerHeight) {
      armed.current = true;
      void animate(el, { opacity: 0, y, filter: "blur(4px)" }, { duration: 0 });
    }
  }, [reduce, animate, scope, y]);

  // Reveal when it scrolls into view.
  useEffect(() => {
    const el = scope.current;
    if (!inView || !armed.current || !el) return;
    armed.current = false;
    void animate(el, { opacity: 1, y: 0, filter: "blur(0px)" }, { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] });
  }, [inView, animate, scope, delay]);

  // One element type for the ref; the tag only changes semantics (div, li, section).
  const Tag = as as "div";
  return (
    <Tag ref={scope as unknown as React.RefObject<HTMLDivElement>} className={className}>
      {children}
    </Tag>
  );
}

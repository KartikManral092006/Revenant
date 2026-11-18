"use client";
import { Check, CircleDashed, Hammer, Minus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export type StepState = "done" | "in-kiro" | "not-started" | "unavailable";

export interface StepNavItem {
  n: 1 | 2 | 3 | 4 | 5;
  slug: string;
  label: string;
  state: StepState;
}

const STATE_TEXT: Record<StepState, string> = {
  done: "done",
  "in-kiro": "happens in Kiro, done",
  "not-started": "not started",
  unavailable: "needs a rebuild",
};

function StateIcon({ state }: { state: StepState }) {
  const cls = "h-3.5 w-3.5";
  if (state === "done") return <Check aria-hidden="true" className={`${cls} text-success`} />;
  if (state === "in-kiro") return <Hammer aria-hidden="true" className={`${cls} text-success`} />;
  if (state === "not-started") return <CircleDashed aria-hidden="true" className={`${cls} text-warn`} />;
  return <Minus aria-hidden="true" className={`${cls} text-muted`} />;
}

/**
 * Sticky five-step navigation. Links are ordinary anchors (deep links keep working); the step in
 * view gets aria-current="step" and a sliding highlight.
 */
export function StepNav({ items }: { items: StepNavItem[] }) {
  const [current, setCurrent] = useState(items[0]?.slug);
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const sections = items.map((i) => document.getElementById(i.slug)).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        // The first section (in page order) that is meaningfully visible wins.
        const first = items.find((i) => (visible.get(i.slug) ?? 0) > 0);
        if (first) setCurrent(first.slug);
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: [0, 0.01, 0.25] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items]);

  // Keep the current pill visible on narrow screens where the list scrolls sideways. Scroll only the
  // list, horizontally: scrollIntoView on an element inside a sticky bar also scrolls the window back
  // toward the bar's original position, which yanks the page while the visitor is scrolling.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-slug="${current}"]`);
    if (!list || !el) return;
    const left = el.offsetLeft - list.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: Math.max(0, left - 16), behavior: reduce ? "auto" : "smooth" });
    }
  }, [current, reduce]);

  return (
    <nav aria-label="Steps" className="sticky top-0 z-20 -mx-4 border-b border-line bg-canvas/80 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <ol ref={listRef} className="flex gap-6 overflow-x-auto [scrollbar-width:none] sm:gap-8">
        {items.map((item) => {
          const active = item.slug === current;
          return (
            <li key={item.slug} data-slug={item.slug} className="shrink-0">
              <a
                href={`#${item.slug}`}
                aria-current={active ? "step" : undefined}
                onClick={() => setCurrent(item.slug)}
                className={`relative flex min-h-[52px] items-center gap-2 text-sm no-underline transition-colors duration-300 ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <span aria-hidden="true" className={`font-mono text-xs ${active ? "text-accent" : "text-muted"}`}>
                  0{item.n}
                </span>
                {item.label}
                <StateIcon state={item.state} />
                <span className="sr-only">({STATE_TEXT[item.state]})</span>
                {active && (
                  <motion.span
                    layoutId="step-underline"
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 36 }}
                  />
                )}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

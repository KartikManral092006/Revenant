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
  if (state === "done") return <Check aria-hidden="true" className={`${cls} text-ectoplasm`} />;
  if (state === "in-kiro") return <Hammer aria-hidden="true" className={`${cls} text-ectoplasm`} />;
  if (state === "not-started") return <CircleDashed aria-hidden="true" className={`${cls} text-candle`} />;
  return <Minus aria-hidden="true" className={`${cls} text-ash`} />;
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
    <nav aria-label="Steps" className="sticky top-0 z-20 -mx-4 mt-10 border-b border-mist bg-crypt/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
      <ol ref={listRef} className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {items.map((item) => {
          const active = item.slug === current;
          return (
            <li key={item.slug} data-slug={item.slug} className="shrink-0">
              <a
                href={`#${item.slug}`}
                aria-current={active ? "step" : undefined}
                onClick={() => setCurrent(item.slug)}
                className={`relative flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 text-sm no-underline transition-colors ${
                  active ? "border-pumpkin text-bone" : "border-mist text-ash hover:text-bone"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="step-highlight"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-tomb"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                      active ? "bg-pumpkin text-crypt" : "bg-slab text-bone"
                    }`}
                  >
                    {item.n}
                  </span>
                  {item.label}
                  <StateIcon state={item.state} />
                  <span className="sr-only">({STATE_TEXT[item.state]})</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

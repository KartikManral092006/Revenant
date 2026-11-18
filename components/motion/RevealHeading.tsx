"use client";
import { stagger, useAnimate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * A heading whose words rise into place one after another when it scrolls into view.
 *
 * Like Reveal, the text is visible in the server HTML; only headings that start below the fold are
 * hidden after hydration and then animated. Words are plain inline spans, so screen readers and
 * find-in-page read the heading normally.
 */
export function RevealHeading({
  text,
  as = "h2",
  id,
  className,
}: {
  text: string;
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLHeadingElement>();
  const inView = useInView(scope, { once: true, margin: "0px 0px -80px 0px" });
  const armed = useRef(false);

  useEffect(() => {
    const el = scope.current;
    if (reduce || !el) return;
    if (el.getBoundingClientRect().top > window.innerHeight) {
      armed.current = true;
      void animate("[data-w]", { opacity: 0, y: "0.45em", filter: "blur(6px)" }, { duration: 0 });
    }
  }, [reduce, animate, scope]);

  useEffect(() => {
    if (!inView || !armed.current) return;
    armed.current = false;
    void animate(
      "[data-w]",
      { opacity: 1, y: 0, filter: "blur(0px)" },
      { duration: 0.7, delay: stagger(0.045), ease: [0.16, 1, 0.3, 1] },
    );
  }, [inView, animate]);

  const words = text.split(" ");
  const Tag = as as "h2";
  return (
    <Tag ref={scope} id={id} className={className}>
      {words.map((w, i) => (
        <span key={i} data-w="" className="inline-block whitespace-pre">
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

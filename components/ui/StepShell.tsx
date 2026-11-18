import type { ReactNode } from "react";
import { RevealHeading } from "../motion/RevealHeading";
import { Reveal } from "./Reveal";

/**
 * One step of the package page. Every step has the same shape, so a visitor learns it once:
 * a large step number, a plain heading, "What this step does" / "What we found" as two columns of
 * text, then the detail. No boxes: steps are separated by a hairline and whitespace.
 */
export function StepShell({
  n,
  slug,
  name,
  heading,
  whatItDoes,
  whatWeFound,
  children,
}: {
  n: 1 | 2 | 3 | 4 | 5;
  slug: string;
  name: string;
  heading: string;
  /** Kept for API compatibility; the large step number replaces the icon tile. */
  icon?: ReactNode;
  whatItDoes: ReactNode;
  whatWeFound: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${slug}-heading`;
  return (
    <section id={slug} aria-labelledby={headingId} className={`scroll-mt-24 py-16 sm:py-20 ${n > 1 ? "border-t border-line" : ""}`}>
      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[12rem_1fr]">
        <Reveal>
          <p aria-hidden="true" className="font-mono text-5xl font-medium tracking-tighter text-line sm:text-6xl">
            0{n}
          </p>
          <p className="kicker mt-2">
            Step {n} of 5 · {name}
          </p>
        </Reveal>
        <div className="min-w-0">
          <RevealHeading id={headingId} text={heading} className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl" />
          <Reveal delay={0.1}>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-muted">What this step does</h3>
                <div className="mt-2 leading-relaxed text-fg">{whatItDoes}</div>
              </div>
              <div className="border-l-2 border-accent/60 pl-5">
                <h3 className="text-sm font-medium text-accent">What we found</h3>
                <div className="mt-2 leading-relaxed text-fg">{whatWeFound}</div>
              </div>
            </div>
          </Reveal>
          <div className="mt-10">{children}</div>
        </div>
      </div>
    </section>
  );
}

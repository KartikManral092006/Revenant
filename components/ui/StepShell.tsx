import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/**
 * One step of the package page. Every step has the same shape, so a visitor learns it once:
 * kicker, plain heading, "What this step does" / "What we found", then the detail.
 */
export function StepShell({
  n,
  slug,
  name,
  heading,
  icon,
  whatItDoes,
  whatWeFound,
  children,
}: {
  n: 1 | 2 | 3 | 4 | 5;
  slug: string;
  name: string;
  heading: string;
  icon: ReactNode;
  whatItDoes: ReactNode;
  whatWeFound: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${slug}-heading`;
  return (
    <section id={slug} aria-labelledby={headingId} className="scroll-mt-28 py-12 sm:py-16">
      <Reveal>
        <div className="flex items-start gap-4">
          <div
            aria-hidden="true"
            className="mt-1 hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-mist bg-tomb text-pumpkin sm:flex"
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="kicker">
              Step {n} of 5 · {name}
            </p>
            <h2 id={headingId} className="mt-1 text-2xl text-bone sm:text-3xl">
              {heading}
            </h2>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-ash">What this step does</h3>
            <div className="mt-2 text-sm leading-relaxed text-bone">{whatItDoes}</div>
          </div>
          <div className="card border-pumpkin/30 p-5">
            <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-pumpkin">What we found</h3>
            <div className="mt-2 text-sm leading-relaxed text-bone">{whatWeFound}</div>
          </div>
        </div>
      </Reveal>
      <div className="mt-6">{children}</div>
    </section>
  );
}

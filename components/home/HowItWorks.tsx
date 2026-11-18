import { Ghost, Hammer, HeartPulse, ScrollText, Stethoscope } from "lucide-react";
import { Reveal } from "../ui/Reveal";

const STEPS = [
  {
    n: 1,
    name: "Autopsy",
    icon: Stethoscope,
    text: "Check the package's health: last release, known vulnerabilities, weekly downloads.",
    where: "In your browser",
  },
  {
    n: 2,
    name: "Ghost Memory",
    icon: Ghost,
    text: "Run the original on 1,000 generated inputs in a sandbox and write down what each one did.",
    where: "In your browser",
  },
  {
    n: 3,
    name: "Reverse Spec",
    icon: ScrollText,
    text: "Turn that record into a written spec. Every requirement points to the evidence behind it.",
    where: "In your browser",
  },
  {
    n: 4,
    name: "Resurrection",
    icon: Hammer,
    text: "A person rebuilds the package from the spec. A hook re-runs the comparison on every save.",
    where: "In Kiro",
  },
  {
    n: 5,
    name: "Rebirth Report",
    icon: HeartPulse,
    text: "Run old and new on the same inputs: match score, security fixes, and every difference.",
    where: "In your browser",
  },
] as const;

/** Five-step pipeline. A beam travels along the line (static under reduced motion). */
export function HowItWorks() {
  return (
    <div className="relative">
      {/* Horizontal track on wide screens */}
      <div aria-hidden="true" className="absolute left-[10%] right-[10%] top-7 hidden h-px overflow-hidden bg-line lg:block">
        <span className="pipeline-dot absolute top-0 h-px w-1/5 bg-gradient-to-r from-transparent via-accent to-transparent" />
      </div>
      {/* Vertical track on narrow screens */}
      <div aria-hidden="true" className="absolute bottom-6 left-7 top-6 w-px overflow-hidden bg-line lg:hidden">
        <span className="pipeline-dot-y absolute left-0 h-1/5 w-px bg-gradient-to-b from-transparent via-accent to-transparent" />
      </div>
      <ol className="relative grid gap-6 lg:grid-cols-5 lg:gap-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const kiro = s.where === "In Kiro";
          return (
            <Reveal as="li" key={s.n} delay={i * 0.08} className="flex gap-4 lg:flex-col lg:items-center lg:text-center">
              <div
                className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-surface ${
                  kiro ? "border-link text-link" : "border-accent/60 text-accent"
                }`}
              >
                <Icon aria-hidden="true" className="h-6 w-6" />
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-canvas">
                  {s.n}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-fg">{s.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
                <p className={`mt-2 text-xs font-medium ${kiro ? "text-link" : "text-success"}`}>{s.where}</p>
              </div>
            </Reveal>
          );
        })}
      </ol>
    </div>
  );
}

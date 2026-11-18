"use client";
import { Ghost, Hammer, HeartPulse, ScrollText, Stethoscope } from "lucide-react";
import { motion, useInView, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useRef } from "react";

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

function Step({ step, last }: { step: (typeof STEPS)[number]; last: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  // A step "lights up" once it reaches the middle of the viewport, in time with the line.
  const lit = useInView(ref, { margin: "0px 0px -45% 0px", once: true });
  const reduce = useReducedMotion();
  const Icon = step.icon;
  const kiro = step.where === "In Kiro";
  const on = lit || reduce;
  return (
    <li ref={ref} className={`relative grid grid-cols-[3rem_1fr] gap-5 ${last ? "" : "pb-12"}`}>
      <div
        className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-700 ease-out ${
          on ? (kiro ? "border-link bg-canvas text-link" : "border-accent bg-canvas text-accent") : "border-line bg-canvas text-muted"
        }`}
      >
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <div className={`pt-2 transition-all duration-700 ease-out ${on ? "translate-x-0 opacity-100" : "translate-x-2 opacity-60"}`}>
        <p className="text-sm text-muted">Step {step.n}</p>
        <h3 className="mt-0.5 text-lg font-semibold text-fg">{step.name}</h3>
        <p className="mt-1 max-w-md leading-relaxed text-muted">{step.text}</p>
        <p className={`mt-2 text-sm font-medium ${kiro ? "text-link" : "text-success"}`}>{step.where}</p>
      </div>
    </li>
  );
}

/**
 * The five steps as a vertical timeline. The line fills as you scroll through it and each step
 * lights up when the line reaches it. Under reduced motion the line is full and every step is lit.
 */
export function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 55%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <div className="relative">
      {/* Track and scroll-linked fill, centred on the step icons. */}
      <div aria-hidden="true" className="absolute bottom-6 left-6 top-6 w-px -translate-x-1/2 bg-line">
        <motion.div
          className="absolute inset-x-0 top-0 h-full origin-top bg-gradient-to-b from-accent via-link to-success"
          style={{ scaleY: reduce ? 1 : fill }}
        />
      </div>
      <ol ref={ref} className="relative">
        {STEPS.map((s, i) => (
          <Step key={s.n} step={s} last={i === STEPS.length - 1} />
        ))}
      </ol>
    </div>
  );
}

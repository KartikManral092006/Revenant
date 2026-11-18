"use client";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { HeroBackdrop } from "./HeroBackdrop";

/**
 * Home hero with scroll-linked parallax: as you scroll past it, the 3D scene sinks and fades while
 * the text drifts up a little faster. Static under reduced motion.
 */
export function Hero({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const sceneY = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-18%"]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
      <motion.div className="absolute inset-0" style={reduce ? undefined : { y: sceneY, opacity: sceneOpacity }}>
        <HeroBackdrop />
      </motion.div>
      <motion.div
        className="relative mx-auto grid min-h-[86vh] max-w-page items-center px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.15fr_1fr]"
        style={reduce ? undefined : { y: textY, opacity: textOpacity }}
      >
        {children}
      </motion.div>
    </section>
  );
}

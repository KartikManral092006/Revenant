"use client";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

/** A hairline along the top of the window that fills as you scroll down the page. Decorative. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-accent via-link to-success"
      style={{ scaleX: reduce ? scrollYProgress : scaleX }}
    />
  );
}

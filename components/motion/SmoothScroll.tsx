"use client";
import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Inertial smooth scrolling (Lenis) for mouse and trackpad. Native scrolling is kept underneath, so
 * position: sticky, find-in-page and keyboard scrolling keep working. Same-page anchor links glide
 * to their target; Lenis honours each section's CSS scroll-margin-top, so that alone sets where a
 * section lands (below the sticky step bar).
 *
 * Off when the visitor asks for reduced motion, and off on touch-first devices: phones already
 * scroll with native momentum, and after a tapped anchor link Lenis kept overriding programmatic
 * scrolls (focus scrolling, scroll restoration). There, CSS `scroll-behavior: smooth` animates
 * anchor jumps instead.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    const lenis = new Lenis({
      lerp: 0.09,
      smoothWheel: true,
      autoRaf: true,
      allowNestedScroll: true,
      anchors: true,
      stopInertiaOnNavigate: true,
    });
    return () => lenis.destroy();
  }, []);
  return null;
}

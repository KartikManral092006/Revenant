"use client";
import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// three.js is ~600 kB, so it loads only in the browser, after the page is interactive.
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false, loading: () => null });

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The hero background. Shows a static gradient until the 3D scene is ready, and keeps the static
 * version when WebGL is unavailable. The scene pauses when scrolled out of view.
 */
export function HeroBackdrop() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [canRender, setCanRender] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    // Defer the WebGL check until after hydration; it touches the DOM.
    const id = requestAnimationFrame(() => setCanRender(webglAvailable()));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Static fallback: moon glow, fog and a ground line. Always present underneath the canvas. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(18rem 18rem at 22% 18%, rgb(233 226 255 / 0.20), transparent 60%), radial-gradient(30rem 14rem at 65% 75%, rgb(123 224 164 / 0.10), transparent 70%), linear-gradient(180deg, #0b0a10 0%, #121019 70%, #0b0a10 100%)",
        }}
      />
      {canRender && (
        <div className="absolute inset-0 opacity-0" style={{ animation: "fadein 1.2s ease-out forwards" }}>
          <HeroScene animate={!reduce} active={active} />
        </div>
      )}
      {/* Readability scrim: keeps the hero text at full contrast over the scene. On narrow screens the
          text spans the full width, so the scrim covers everything. */}
      <div className="absolute inset-0 bg-crypt/75 md:bg-transparent md:bg-gradient-to-r md:from-crypt md:via-crypt/80 md:to-crypt/10" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-crypt to-transparent" />
      <style>{`@keyframes fadein { to { opacity: 1 } }`}</style>
    </div>
  );
}

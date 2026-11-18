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
            "radial-gradient(30rem 16rem at 70% 70%, rgb(167 139 250 / 0.08), transparent 70%), linear-gradient(180deg, #09090b 0%, #0f0f12 70%, #09090b 100%)",
        }}
      />
      {canRender && (
        <div className="absolute inset-0 opacity-0" style={{ animation: "fadein 1.2s ease-out forwards" }}>
          <HeroScene animate={!reduce} active={active} />
        </div>
      )}
      {/* Readability scrim: keeps the hero text at full contrast over the scene. On narrow screens the
          text spans the full width, so the scrim covers everything. */}
      <div className="absolute inset-0 bg-canvas/75 md:bg-transparent md:bg-gradient-to-r md:from-canvas md:via-canvas/80 md:to-canvas/10" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-canvas to-transparent" />
      <style>{`@keyframes fadein { to { opacity: 0.85 } }`}</style>
    </div>
  );
}

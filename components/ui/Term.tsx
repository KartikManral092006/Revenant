"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A glossary term with a short explanation. The term is a real button: it opens on hover, focus,
 * click or tap, and closes on Escape or when focus leaves. The explanation is linked with
 * aria-describedby so screen readers read it with the term.
 */
export function Term({ children, tip }: { children: ReactNode; tip: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-help border-b border-dashed border-wisp text-inherit"
      >
        {children}
      </button>
      {/* Always in the DOM so aria-describedby resolves; only the visual card toggles. */}
      <span id={id} role="tooltip" className="sr-only">
        {tip}
      </span>
      <AnimatePresence>
        {open && (
          <motion.span
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-full z-30 mt-2 block w-72 max-w-[80vw] -translate-x-1/2 rounded-xl border border-mist bg-tomb p-3 text-left text-sm font-normal normal-case leading-relaxed tracking-normal text-bone shadow-2xl shadow-black/60"
          >
            {tip}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

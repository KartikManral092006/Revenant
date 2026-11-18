import type { ReactNode } from "react";
import { Reveal } from "../ui/Reveal";
import { RevealHeading } from "./RevealHeading";

/** Kicker, word-by-word heading and an optional lead paragraph. Used by every home section. */
export function SectionHeader({
  kicker,
  title,
  id,
  children,
}: {
  kicker: string;
  title: string;
  id: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <Reveal>
        <p className="kicker">{kicker}</p>
      </Reveal>
      <RevealHeading id={id} text={title} className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl" />
      {children && (
        <Reveal delay={0.15}>
          <div className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{children}</div>
        </Reveal>
      )}
    </div>
  );
}

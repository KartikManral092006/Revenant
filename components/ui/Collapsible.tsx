import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** Native details/summary with a consistent summary line. Keyboard operable without JavaScript. */
export function Collapsible({
  summary,
  meta,
  children,
  defaultOpen = false,
  className = "",
}: {
  summary: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={`group rounded-2xl border border-mist bg-tomb/60 ${className}`}>
      <summary className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl px-5 py-3 hover:bg-tomb">
        <span className="font-semibold text-bone">{summary}</span>
        <span className="flex items-center gap-3 text-sm text-ash">
          {meta}
          <ChevronDown aria-hidden="true" className="chevron h-4 w-4 transition-transform duration-200" />
        </span>
      </summary>
      <div className="border-t border-mist px-5 py-4">{children}</div>
    </details>
  );
}

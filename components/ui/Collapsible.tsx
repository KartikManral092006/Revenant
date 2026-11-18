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
    <details open={defaultOpen} className={`group rounded-xl border border-line bg-surface/60 ${className}`}>
      <summary className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-5 py-3 hover:bg-surface">
        <span className="font-semibold text-fg">{summary}</span>
        <span className="flex items-center gap-3 text-sm text-muted">
          {meta}
          <ChevronDown aria-hidden="true" className="chevron h-4 w-4 transition-transform duration-200" />
        </span>
      </summary>
      <div className="border-t border-line px-5 py-4">{children}</div>
    </details>
  );
}

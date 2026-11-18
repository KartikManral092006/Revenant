import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Native details/summary as a divider row (no box). Keyboard operable without JavaScript. The open
 * panel eases in via `interpolate-size` where the browser supports it.
 */
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
    <details open={defaultOpen} className={`disclosure group border-b border-line ${className}`}>
      <summary className="flex min-h-[56px] items-center justify-between gap-4 py-4 text-left transition-colors hover:text-link">
        <span className="font-medium text-fg group-hover:text-inherit">{summary}</span>
        <span className="flex shrink-0 items-center gap-3 text-sm text-muted">
          {meta}
          <ChevronDown aria-hidden="true" className="chevron h-4 w-4 transition-transform duration-300 ease-out" />
        </span>
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}

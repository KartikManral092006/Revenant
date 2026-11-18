import { Clock, ShieldCheck, Zap } from "lucide-react";
import type { ReactNode } from "react";

export interface RunLiveCopy {
  title: string;
  what: string;
  takes: string;
  changesNothing: string;
  limit?: string;
}

/**
 * Explains a live action before it is run: what happens, how long it takes, and what it leaves
 * untouched. A plain section under a hairline, not a box. Hosts the action button and the live
 * status area.
 */
export function RunLivePanel({
  copy,
  action,
  children,
  id,
}: {
  copy: RunLiveCopy;
  action: ReactNode;
  children?: ReactNode;
  /** Id of the description, for aria-describedby on the button. */
  id: string;
}) {
  return (
    <div className="mt-10 border-t border-line pt-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Zap aria-hidden="true" className="h-4 w-4 text-accent" />
            {copy.title}
          </h3>
          <dl id={id} className="mt-3 grid gap-x-6 gap-y-1.5 text-sm text-muted sm:grid-cols-[auto_1fr]">
            <dt className="text-fg">What happens</dt>
            <dd>{copy.what}</dd>
            <dt className="flex items-center gap-1.5 text-fg">
              <Clock aria-hidden="true" className="h-3.5 w-3.5" /> Takes
            </dt>
            <dd>{copy.takes}</dd>
            <dt className="flex items-center gap-1.5 text-fg">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> Changes nothing
            </dt>
            <dd>{copy.changesNothing}</dd>
            {copy.limit && (
              <>
                <dt className="text-fg">Limit</dt>
                <dd>{copy.limit}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children && (
        <div className="mt-4" aria-live="polite">
          {children}
        </div>
      )}
    </div>
  );
}

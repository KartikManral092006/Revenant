"use client";

// Candles light as work completes. The flicker animation is defined in globals.css only for
// `prefers-reduced-motion: no-preference`, so under reduced motion the candles are static.
export function SeanceProgress({ done, total, label }: { done: number; total: number; label?: string }) {
  const count = 10;
  const safeTotal = total > 0 ? total : 1;
  const lit = Math.min(count, Math.round((Math.max(0, done) / safeTotal) * count));
  return (
    <div role="progressbar" aria-label={label ?? "Séance progress"} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <svg key={i} width="14" height="34" viewBox="0 0 14 34">
            <rect x="3" y="14" width="8" height="20" fill={i < lit ? "#d4d4d8" : "#27272a"} rx="1.5" />
            {i < lit && <ellipse className="animate-flicker" cx="7" cy="8" rx="3" ry="6" fill="#fbbf24" />}
          </svg>
        ))}
      </div>
      <p className="mt-1 text-sm text-muted">
        {label ? `${label}: ` : ""}
        {done} / {total}
      </p>
    </div>
  );
}

"use client";
import { useState } from "react";

export interface EvidenceRow {
  id: string;
  export: string;
  outcome: string;
  classId: string;
  count: number;
  /** Short preview of the recorded input, when available. */
  input?: string;
  /** True when the original changed a shared prototype on this input. */
  polluted?: boolean;
}

const PAGE = 50;

function happened(r: EvidenceRow): string {
  const base =
    r.outcome === "returned" ? "Returned a value" : r.outcome.startsWith("threw") ? `Threw ${r.outcome.slice(6) || "an error"}` : r.outcome === "timeout" ? "Timed out" : r.outcome;
  return r.polluted ? `${base}, and changed Object.prototype` : base;
}

export function EvidenceTable({ rows, total }: { rows: EvidenceRow[]; total: number }) {
  const [shown, setShown] = useState(PAGE);
  if (rows.length === 0) return <p className="text-muted">No evidence.</p>;
  const multiExport = new Set(rows.map((r) => r.export)).size > 1;
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Recorded evidence: each row is one input and what the original did with it</caption>
          <thead className="bg-canvas text-muted">
            <tr>
              {multiExport && <th scope="col" className="px-3 py-2">Function</th>}
              <th scope="col" className="px-3 py-2">Input given</th>
              <th scope="col" className="px-3 py-2">What happened</th>
              <th scope="col" className="px-3 py-2 text-right">Times seen</th>
              <th scope="col" className="px-3 py-2">Evidence ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                {multiExport && <td className="px-3 py-2 font-mono text-xs">{r.export}</td>}
                <td className="max-w-[18rem] break-all px-3 py-2 font-mono text-xs text-fg">{r.input ?? "—"}</td>
                <td className={`px-3 py-2 ${r.polluted ? "text-danger" : r.outcome.startsWith("threw") ? "text-warn" : "text-fg"}`}>{happened(r)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                <td className="break-all px-3 py-2 font-mono text-xs text-muted">{r.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">
        Showing {Math.min(shown, rows.length).toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} distinct inputs ({total.toLocaleString("en-US")} recorded in total; repeats are counted in “Times seen”).
        {shown < rows.length && (
          <button type="button" className="ml-3 font-semibold text-link underline" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, rows.length - shown)} more
          </button>
        )}
      </p>
    </div>
  );
}

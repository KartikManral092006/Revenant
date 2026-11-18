"use client";
import { useState } from "react";

export interface EvidenceRow {
  id: string;
  export: string;
  outcome: string;
  classId: string;
  count: number;
}

const PAGE = 50;

export function EvidenceTable({ rows, total }: { rows: EvidenceRow[]; total: number }) {
  const [shown, setShown] = useState(PAGE);
  if (rows.length === 0) return <p className="text-ash">No evidence.</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Recorded evidence</caption>
          <thead className="text-ash">
            <tr>
              <th scope="col" className="py-1 pr-3">Evidence ID</th>
              <th scope="col" className="py-1 pr-3">Export</th>
              <th scope="col" className="py-1 pr-3">Outcome</th>
              <th scope="col" className="py-1 pr-3">Class</th>
              <th scope="col" className="py-1">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id} className="border-t border-mist align-top">
                <td className="break-all py-1 pr-3 font-mono text-xs">{r.id}</td>
                <td className="py-1 pr-3">{r.export}</td>
                <td className="py-1 pr-3">{r.outcome}</td>
                <td className="break-all py-1 pr-3 font-mono text-xs">{r.classId}</td>
                <td className="py-1">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-ash">
        Showing {Math.min(shown, rows.length)} of {total} records.
        {shown < rows.length && (
          <button type="button" className="ml-3 text-wisp underline" onClick={() => setShown((n) => n + PAGE)}>
            Show more
          </button>
        )}
      </p>
    </div>
  );
}

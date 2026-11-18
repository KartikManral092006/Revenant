"use client";

import { useState } from "react";
import { compactCount, humanDate } from "./format";
import { RunLivePanel } from "./ui/RunLivePanel";
import { Term } from "./ui/Term";

// Local structural types: client components must not import from lib/.
type Field<T> = { value: T } | { unknown: true; reason: string };

export interface CertificateData {
  package: string;
  version: string;
  fetchedAt: string;
  source: "live" | "snapshot";
  lastPublish: Field<string>;
  inactive: Field<boolean>;
  deprecation: Field<string | null>;
  vulnerabilities: Field<{ id: string; aliases?: string[]; summary?: string }[]>;
  weeklyDownloads: Field<number>;
  repo: Field<{ archived: boolean; pushedAt: string }> & { note?: string };
  license: Field<string>;
}

const POLLUTION_TIP =
  "A bug where a crafted key such as __proto__ changes the shared template every object inherits from, so unrelated code can behave differently.";
const REDOS_TIP =
  "Regular-expression denial of service: a crafted input makes a pattern match take so long that the program stalls.";

function Unknown({ reason }: { reason: string }) {
  return (
    <span className="text-warn">
      unknown <span className="text-muted">({reason})</span>
    </span>
  );
}

function Row<T>({ label, field, render }: { label: string; field: Field<T>; render: (v: T) => React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 text-sm last:border-b-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">
        {"value" in field ? render(field.value) : <Unknown reason={field.reason} />}
      </dd>
    </div>
  );
}

function VulnSummary({ summary }: { summary?: string }) {
  if (!summary) return <>Known issue</>;
  if (/prototype pollution/i.test(summary)) {
    return (
      <>
        <Term tip={POLLUTION_TIP}>Prototype pollution</Term>
        {summary.replace(/prototype pollution/i, "")}
      </>
    );
  }
  if (/denial of service/i.test(summary)) {
    return (
      <>
        <Term tip={REDOS_TIP}>{summary}</Term>
      </>
    );
  }
  return <>{summary}</>;
}

export function DeathCertificateView({ cert, now }: { cert: CertificateData; now?: Date }) {
  const at = now ?? new Date();
  const taken = humanDate(cert.fetchedAt, at).text;
  return (
    <div>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cert.source === "live" ? "border-success/40 text-success" : "border-warn/40 text-warn"}`}>
          {cert.source === "live" ? "live" : "stored snapshot"}
        </span>
        <span>
          {cert.source === "live" ? "Checked " : "Taken "}
          <time dateTime={cert.fetchedAt}>{taken}</time>
          {cert.source === "live" ? "." : ". Use “Check again” for today’s data."}
        </span>
      </p>
      <dl>
        <Row
          label="Status"
          field={cert.inactive}
          render={(v) =>
            v ? (
              <>
                <strong className="text-danger">Unmaintained</strong>{" "}
                <span className="text-muted">No release for more than two years.</span>
              </>
            ) : (
              <strong className="text-success">Active</strong>
            )
          }
        />
        <Row
          label="Last release"
          field={cert.lastPublish}
          render={(v) => {
            const h = humanDate(v, at);
            return (
              <time dateTime={v}>
                {h.text} <span className="text-muted">({h.relative})</span>
              </time>
            );
          }}
        />
        <Row label="Deprecation notice" field={cert.deprecation} render={(v) => v ?? "None on npm"} />
        <Row
          label="Known vulnerabilities"
          field={cert.vulnerabilities}
          render={(v) =>
            v.length === 0 ? (
              <span className="text-success">None reported</span>
            ) : (
              <ul className="space-y-2">
                {v.map((x) => (
                  <li key={x.id}>
                    <VulnSummary summary={x.summary} />
                    <span className="mt-0.5 block text-xs text-muted">
                      {x.id}
                      {x.aliases && x.aliases.length > 0 ? `, also known as ${x.aliases.join(", ")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        />
        <Row
          label="Weekly downloads"
          field={cert.weeklyDownloads}
          render={(v) => (
            <>
              {v.toLocaleString("en-US")} <span className="text-muted">(about {compactCount(v)})</span>
            </>
          )}
        />
        <Row
          label="Source repository"
          field={cert.repo}
          render={(v) => `${v.archived ? "Archived" : "Not archived"}, last push ${humanDate(v.pushedAt, at).text}`}
        />
        {cert.repo.note && (
          <div className="grid gap-1 border-b border-line py-3 text-sm sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-muted">Repository note</dt>
            <dd className="text-fg">{cert.repo.note}</dd>
          </div>
        )}
        <Row label="License" field={cert.license} render={(v) => v} />
      </dl>
    </div>
  );
}

export function DeathCertificate({ name, initial, nowIso }: { name: string; initial: CertificateData | null; nowIso?: string }) {
  const [cert, setCert] = useState<CertificateData | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = nowIso ? new Date(nowIso) : undefined;

  async function runLive(pkg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/autopsy/${encodeURIComponent(pkg)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCert((await res.json()) as CertificateData);
    } catch (e) {
      setError(
        `Live check failed: ${e instanceof Error ? e.message : String(e)}. Showing the stored snapshot. Nothing was changed.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div aria-live="polite">
        <p className="mb-2 text-base font-semibold text-fg">Certificate of Death · {name}</p>
        <div>
          {cert ? (
            <DeathCertificateView cert={cert} now={now} />
          ) : (
            <p className="text-warn">No stored snapshot for this package. Use Check again.</p>
          )}
        </div>
      </div>
      <RunLivePanel
        id="autopsy-live-desc"
        copy={{
          title: "Check again with live data",
          what: "We ask npm, OSV and GitHub for today's facts.",
          takes: "A few seconds.",
          changesNothing: "The stored snapshot stays as it is; only your view updates.",
        }}
        action={
          <button type="button" onClick={() => runLive(name)} disabled={busy} aria-describedby="autopsy-live-desc" className="btn-outline">
            {busy ? "Checking…" : "Check again"}
          </button>
        }
      >
        {busy && <p className="text-sm text-muted">Working… this can take a few seconds.</p>}
        {error && <p className="text-sm text-warn">{error}</p>}
      </RunLivePanel>
    </div>
  );
}

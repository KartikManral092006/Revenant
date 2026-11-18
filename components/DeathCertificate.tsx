"use client";

import { useState } from "react";

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

const headingFont = { fontFamily: "var(--font-display), Georgia, serif" } as const;

function Unknown({ reason }: { reason: string }) {
  return (
    <span className="text-candle">
      unknown <span className="text-ash">({reason})</span>
    </span>
  );
}

function Row<T>({ label, field, render }: { label: string; field: Field<T>; render: (v: T) => React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 border-b border-mist py-2 text-sm">
      <dt className="text-ash">{label}</dt>
      <dd className="min-w-0 break-words text-bone">
        {"value" in field ? render(field.value) : <Unknown reason={field.reason} />}
      </dd>
    </div>
  );
}

export function DeathCertificateView({ cert }: { cert: CertificateData }) {
  const label = cert.source === "live" ? "live" : "snapshot";
  return (
    <div>
      <p className="mb-3 text-sm text-ash">
        <span className="rounded border border-mist px-2 py-0.5 text-candle">{label}</span>{" "}
        <time dateTime={cert.fetchedAt}>{cert.fetchedAt}</time>
      </p>
      <dl>
        <Row
          label="Status"
          field={cert.inactive}
          render={(v) => (v ? <strong className="text-pumpkin">Inactive</strong> : "Active")}
        />
        <Row label="Last publish" field={cert.lastPublish} render={(v) => v} />
        <Row label="Deprecation" field={cert.deprecation} render={(v) => v ?? "not deprecated"} />
        <Row
          label="Vulnerabilities"
          field={cert.vulnerabilities}
          render={(v) =>
            v.length === 0 ? (
              "none reported"
            ) : (
              <ul>
                {v.map((x) => (
                  <li key={x.id}>
                    {x.id}
                    {x.aliases && x.aliases.length > 0 ? ` (${x.aliases.join(", ")})` : ""}
                    {x.summary ? `: ${x.summary}` : ""}
                  </li>
                ))}
              </ul>
            )
          }
        />
        <Row label="Weekly downloads" field={cert.weeklyDownloads} render={(v) => v.toLocaleString("en-US")} />
        <Row
          label="Repository"
          field={cert.repo}
          render={(v) => `${v.archived ? "archived" : "not archived"}, last push ${v.pushedAt}`}
        />
        {cert.repo.note && (
          <div className="grid grid-cols-[10rem_1fr] gap-3 border-b border-mist py-2 text-sm">
            <dt className="text-ash">Repository note</dt>
            <dd className="text-bone">{cert.repo.note}</dd>
          </div>
        )}
        <Row label="License" field={cert.license} render={(v) => v} />
      </dl>
    </div>
  );
}

export function DeathCertificate({ name, initial }: { name: string; initial: CertificateData | null }) {
  const [cert, setCert] = useState<CertificateData | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runLive(pkg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/autopsy/${encodeURIComponent(pkg)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCert((await res.json()) as CertificateData);
    } catch (e) {
      setError(`Live run failed: ${e instanceof Error ? e.message : String(e)}. Showing the stored snapshot.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="autopsy" aria-labelledby="autopsy-heading" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="autopsy-heading" className="text-2xl text-bone" style={headingFont}>
          Death Certificate
        </h2>
        <button
          type="button"
          onClick={() => runLive(name)}
          disabled={busy}
          className="rounded border border-pumpkin px-3 py-1 text-sm text-pumpkin disabled:opacity-60"
        >
          {busy ? "Running…" : "Run live"}
        </button>
      </div>
      <div className="rounded-md border border-mist bg-tomb p-5" aria-live="polite">
        {cert ? (
          <DeathCertificateView cert={cert} />
        ) : (
          <p className="text-candle">No stored snapshot for this package. Use Run live.</p>
        )}
        {error && <p className="mt-3 text-sm text-candle">{error}</p>}
      </div>
    </section>
  );
}

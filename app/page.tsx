import { listGraveyard } from "../lib/graveyard/loader";

export const dynamic = "force-static";

const headingFont = { fontFamily: "var(--font-display), Georgia, serif" } as const;

const STAGES = [
  { slug: "autopsy", label: "Autopsy" },
  { slug: "ghost-memory", label: "Ghost Memory" },
  { slug: "reverse-spec", label: "Reverse Spec" },
  { slug: "rebirth-report", label: "Rebirth Report" },
] as const;

function GhostIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="animate-drift text-wisp">
      <path d="M5 21V10a7 7 0 0 1 14 0v11l-2.5-2-2 2-2.5-2-2.5 2-2-2L5 21Z" />
      <circle cx="9.5" cy="10" r="1" fill="currentColor" />
      <circle cx="14.5" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function TombstoneIcon() {
  return (
    <svg viewBox="0 0 24 32" width="32" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-ash">
      <path d="M4 30V11a8 8 0 0 1 16 0v19H4Z" />
      <path d="M12 9v9M8.5 12.5h7" />
      <path d="M2 30h20" />
    </svg>
  );
}

export default function Home() {
  const packages = listGraveyard();

  return (
    <main id="main" className="mx-auto max-w-5xl p-6 sm:p-10">
      <header className="mb-10">
        <div className="flex items-center gap-3">
          <GhostIcon />
          <h1 className="text-4xl text-pumpkin animate-flicker" style={headingFont}>
            Revenant
          </h1>
        </div>
        <p className="mt-3 max-w-2xl text-ash">
          Dead npm packages, brought back to life. Each rebuild comes with evidence about how closely it behaves like
          the original. No login needed.
        </p>
      </header>

      <section aria-labelledby="graveyard-heading">
        <h2 id="graveyard-heading" className="mb-4 text-2xl text-bone" style={headingFont}>
          The Graveyard
        </h2>
        <ul className="grid gap-5 sm:grid-cols-2">
          {packages.map((pkg) => {
            const resurrected = pkg.resurrection === "full";
            return (
              <li key={pkg.name} className="rounded-t-[3rem] rounded-b-md border border-mist bg-tomb p-5">
                <div className="flex items-start gap-4">
                  <TombstoneIcon />
                  <div className="min-w-0">
                    <h3 className="break-words text-xl text-bone" style={headingFont}>
                      {pkg.name}
                    </h3>
                    <p className="text-sm text-ash">v{pkg.version}</p>
                    <p className={`mt-2 text-sm ${resurrected ? "text-ectoplasm" : "text-candle"}`}>
                      {resurrected ? "Resurrection: full rebuild" : "Autopsy and Ghost Memory only"}
                    </p>
                  </div>
                </div>
                <nav aria-label={`${pkg.name} stages`} className="mt-4">
                  <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {STAGES.filter((s) => resurrected || s.slug !== "rebirth-report").map((s) => (
                      <li key={s.slug}>
                        <a href={`/package/${encodeURIComponent(pkg.name)}#${s.slug}`}>{s.label}</a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </li>
            );
          })}
        </ul>
        {packages.length === 0 && <p className="text-candle">The Graveyard is empty: no manifests found.</p>}
      </section>
    </main>
  );
}

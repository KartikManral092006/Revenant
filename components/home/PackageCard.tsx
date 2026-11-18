import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Chip, type ChipTone } from "../ui/Chip";

export interface PackageCardData {
  name: string;
  version: string;
  oneLiner: string;
  example: string;
  chips: { text: string; tone: ChipTone }[];
  verdict: string;
  rebuilt: boolean;
  startHere: boolean;
}

/**
 * One Graveyard package as a list row: no box, separated from its neighbours by a hairline. The
 * whole row is one link, so there is one obvious thing to do.
 */
export function PackageRow({ pkg }: { pkg: PackageCardData }) {
  const href = `/package/${encodeURIComponent(pkg.name)}`;
  return (
    <Link
      href={href}
      className="group relative grid gap-4 py-8 text-fg no-underline transition-colors duration-300 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:gap-10"
    >
      {/* Hover wash that extends past the content edges. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-4 inset-y-0 rounded-lg bg-surface opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:-inset-x-6"
      />
      <div className="relative min-w-0">
        {pkg.startHere && <p className="mb-2 text-sm font-medium text-accent">Start here</p>}
        <h3 className="break-words text-2xl font-semibold tracking-tight">
          {pkg.name} <span className="text-base font-normal tracking-normal text-muted">v{pkg.version}</span>
        </h3>
        <p className="mt-1 text-muted">{pkg.oneLiner}</p>
        {pkg.example && <code className="mt-3 inline-block font-mono text-sm text-muted">{pkg.example}</code>}
      </div>
      <div className="relative min-w-0">
        <ul className="flex flex-wrap gap-2" aria-label={`${pkg.name} status`}>
          {pkg.chips.map((c) => (
            <li key={c.text}>
              <Chip tone={c.tone}>{c.text}</Chip>
            </li>
          ))}
        </ul>
        <p className="mt-3 leading-relaxed text-muted">{pkg.verdict}</p>
      </div>
      <span className="relative flex items-center gap-1 self-start text-sm font-medium text-fg md:pt-1">
        <span className="sr-only md:not-sr-only">Open</span>
        <ArrowUpRight
          aria-hidden="true"
          className="h-5 w-5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}

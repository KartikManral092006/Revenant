import { ArrowRight, Package, Sparkles } from "lucide-react";
import Link from "next/link";
import { Chip, type ChipTone } from "../ui/Chip";
import { SpotlightCard } from "../ui/SpotlightCard";

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

function PackageMark({ rebuilt }: { rebuilt: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
        rebuilt ? "border-success/30 bg-success/10 text-success" : "border-line bg-raised text-muted"
      }`}
    >
      <Package className="h-5 w-5" />
    </div>
  );
}

/** One Graveyard package. A single link, so there is one obvious thing to do. */
export function PackageCard({ pkg }: { pkg: PackageCardData }) {
  const href = `/package/${encodeURIComponent(pkg.name)}`;
  return (
    <div className={`h-full rounded-xl transition-transform duration-300 ease-out hover:-translate-y-0.5 ${pkg.startHere ? "highlight-ring" : ""}`}>
      <SpotlightCard className="flex h-full flex-col p-6" glow={pkg.rebuilt ? "74 222 128" : "167 139 250"}>
        {pkg.startHere && (
          <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Start here · most complete example
          </p>
        )}
        <div className="flex items-start gap-4">
          <PackageMark rebuilt={pkg.rebuilt} />
          <div className="min-w-0">
            <h3 className="break-words text-xl font-semibold tracking-tight text-fg">
              {pkg.name} <span className="font-sans text-sm font-normal tracking-normal text-muted">v{pkg.version}</span>
            </h3>
            <p className="mt-1 text-sm text-muted">{pkg.oneLiner}</p>
            {pkg.example && <code className="mt-2 inline-block rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs text-fg">{pkg.example}</code>}
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${pkg.name} status`}>
          {pkg.chips.map((c) => (
            <li key={c.text}>
              <Chip tone={c.tone}>{c.text}</Chip>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{pkg.verdict}</p>
        <Link
          href={href}
          className="group/link mt-5 inline-flex items-center gap-2 self-start text-sm font-medium text-fg no-underline hover:text-link"
        >
          Open {pkg.name}
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
        </Link>
      </SpotlightCard>
    </div>
  );
}

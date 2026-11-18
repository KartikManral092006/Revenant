import { ArrowRight, Sparkles } from "lucide-react";
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

function Tombstone({ glowing }: { glowing: boolean }) {
  return (
    <svg viewBox="0 0 24 32" width="30" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={glowing ? "text-ectoplasm" : "text-ash"}>
      <path d="M4 30V11a8 8 0 0 1 16 0v19H4Z" />
      <path d="M12 9v9M8.5 12.5h7" />
      <path d="M2 30h20" />
    </svg>
  );
}

/** One Graveyard package. A single link, so there is one obvious thing to do. */
export function PackageCard({ pkg }: { pkg: PackageCardData }) {
  const href = `/package/${encodeURIComponent(pkg.name)}`;
  return (
    <div className={`h-full rounded-t-[2.5rem] rounded-b-2xl ${pkg.startHere ? "beam" : ""}`}>
      <SpotlightCard className="flex h-full flex-col rounded-t-[2.5rem] rounded-b-2xl p-6" glow={pkg.rebuilt ? "123 224 164" : "183 156 255"}>
        {pkg.startHere && (
          <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-pumpkin">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Start here · most complete example
          </p>
        )}
        <div className="flex items-start gap-4">
          <Tombstone glowing={pkg.rebuilt} />
          <div className="min-w-0">
            <h3 className="break-words text-2xl text-bone">
              {pkg.name} <span className="font-sans text-sm font-normal text-ash">v{pkg.version}</span>
            </h3>
            <p className="mt-1 text-sm text-ash">{pkg.oneLiner}</p>
            {pkg.example && <code className="mt-2 inline-block rounded-md bg-crypt px-2 py-0.5 font-mono text-xs text-bone">{pkg.example}</code>}
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${pkg.name} status`}>
          {pkg.chips.map((c) => (
            <li key={c.text}>
              <Chip tone={c.tone}>{c.text}</Chip>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-bone">{pkg.verdict}</p>
        <Link
          href={href}
          className="group/link mt-5 inline-flex items-center gap-2 self-start font-semibold text-wisp no-underline hover:underline"
        >
          Open {pkg.name}
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
        </Link>
      </SpotlightCard>
    </div>
  );
}

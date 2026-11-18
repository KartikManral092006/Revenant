import { FolderGit2, Terminal } from "lucide-react";

/** Step 4 happens in Kiro, not on this site. Explains it and points to the rebuild. */
export function ResurrectionDetail({
  name,
  resurrected,
  repoUrl,
  rebuiltNames,
}: {
  name: string;
  resurrected: boolean;
  repoUrl: string;
  rebuiltNames: string[];
}) {
  const enc = encodeURIComponent(name);
  const soFar =
    rebuiltNames.length === 0
      ? "No package has been rebuilt yet."
      : `So far ${rebuiltNames.length === 1 ? rebuiltNames[0] : `${rebuiltNames.slice(0, -1).join(", ")} and ${rebuiltNames[rebuiltNames.length - 1]}`} ${rebuiltNames.length === 1 ? "has" : "have"} been rebuilt.`;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className={`rounded-2xl border p-6 ${resurrected ? "border-ectoplasm/40" : "border-candle/40"} bg-tomb`}>
        <p className={`font-semibold ${resurrected ? "text-ectoplasm" : "text-candle"}`}>
          {resurrected ? "A rebuild exists and is in the repository." : "No rebuild yet."}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-bone">
          {resurrected
            ? `A person rebuilt ${name} in Kiro from the spec bundle in step 3. While they worked, a Kiro hook re-ran the comparison every time a file was saved, so mismatches showed up straight away.`
            : `Rebuilding is done by a person in Kiro, starting from the spec bundle in step 3. ${soFar}`}
        </p>
        {resurrected && (
          <a href={`${repoUrl}/tree/main/resurrected/${enc}`} className="btn-ghost mt-4">
            <FolderGit2 aria-hidden="true" className="h-4 w-4" />
            View resurrected/{name} on GitHub
          </a>
        )}
      </div>
      <div className="rounded-2xl border border-mist bg-crypt p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-bone">
          <Terminal aria-hidden="true" className="h-4 w-4 text-pumpkin" /> Run the comparison yourself
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-tomb p-3 font-mono text-xs text-bone">
          <span className="text-ash">$ </span>npm run resurrect -- {name}
        </pre>
        <p className="mt-3 text-xs leading-relaxed text-ash">
          Exits with an error if any input differs in a way no documented rule explains. This is the same command the Kiro hook
          runs on save.
        </p>
      </div>
    </div>
  );
}

import { FolderGit2, Ghost } from "lucide-react";
import Link from "next/link";

export function SiteHeader({ repoUrl }: { repoUrl: string }) {
  return (
    <header className="relative z-30 border-b border-line/60 bg-canvas/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-fg no-underline">
          <Ghost aria-hidden="true" className="h-6 w-6 animate-drift text-link" />
          <span className="text-base font-semibold tracking-tight text-fg">Revenant</span>
        </Link>
        <nav aria-label="Site">
          <ul className="flex items-center gap-1 text-sm sm:gap-2">
            <li className="hidden sm:block">
              <Link href="/#how-it-works" className="rounded-full px-3 py-2 text-muted no-underline hover:text-fg">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/#graveyard" className="whitespace-nowrap rounded-full px-3 py-2 text-muted no-underline hover:text-fg">
                <span className="hidden sm:inline">The </span>Graveyard
              </Link>
            </li>
            <li className="hidden sm:block">
              <Link href="/#questions" className="rounded-full px-3 py-2 text-muted no-underline hover:text-fg">
                Questions
              </Link>
            </li>
            <li>
              <a href={repoUrl} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-muted no-underline hover:text-fg">
                <FolderGit2 aria-hidden="true" className="h-4 w-4" />
                <span>Source</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ repoUrl }: { repoUrl: string }) {
  return (
    <footer className="mt-16 border-t border-line/60">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
        <p>
          Revenant is open source (MIT). Original packages keep their own licenses and credit.{" "}
          <a href={repoUrl}>Source on GitHub</a>.
        </p>
        <p>Evidence, not proof.</p>
      </div>
    </footer>
  );
}

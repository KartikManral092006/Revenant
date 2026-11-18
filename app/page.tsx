import { ArrowRight, Check, CircleAlert, HeartPulse, X } from "lucide-react";
import Link from "next/link";
import { HeroBackdrop } from "../components/home/HeroBackdrop";
import { HowItWorks } from "../components/home/HowItWorks";
import { PackageCard, type PackageCardData } from "../components/home/PackageCard";
import { Collapsible } from "../components/ui/Collapsible";
import { NumberTicker } from "../components/ui/NumberTicker";
import { Reveal } from "../components/ui/Reveal";
import { SpotlightCard } from "../components/ui/SpotlightCard";
import { listGraveyard } from "../lib/graveyard/loader";
import { isResurrected, loadCertificate, loadReport } from "./_lib/data";
import { packageCopy, START_HERE } from "./_lib/package-copy";
import { buildSummary } from "./_lib/summary";

export const dynamic = "force-static";

// Fixed reference date for the static home page: only month-year phrases are shown here, so nothing
// goes stale between builds. Relative phrases appear only on the dynamic package page.
const BUILD_NOW = new Date();

const FAQ = [
  {
    q: "Does a high match score mean the rebuild is safe to use?",
    a: "It is evidence, not proof. The score counts how many of the generated inputs gave the same result in the original and the rebuild. Inputs that were never generated are not covered, so read the coverage figures next to the score.",
  },
  {
    q: "Can I try my own package?",
    a: "Not on this site. It only runs the packages in the Graveyard, inside an isolated sandbox, and never installs code you type in. To use the method on your own package, download a spec bundle and follow the repository README.",
  },
  {
    q: "Do I need an account?",
    a: "No. Everything on this site works without logging in.",
  },
  {
    q: "What does “dead” mean here?",
    a: "No new release for more than two years, or the package is deprecated on npm, or its repository is archived. Each package page shows which of these apply.",
  },
];

export default function Home() {
  const manifests = listGraveyard();
  const cards: (PackageCardData & { downloads: number; matched: number; mismatches: number; result: string })[] = manifests.map((m) => {
    const cert = loadCertificate(m.name);
    const report = loadReport(m);
    const summary = buildSummary({ name: m.name, cert, report, resurrected: isResurrected(m.name), now: BUILD_NOW });
    const copy = packageCopy(m.name);
    const dl = cert && "value" in cert.weeklyDownloads ? cert.weeklyDownloads.value : 0;
    return {
      name: m.name,
      version: m.version,
      oneLiner: copy.oneLiner,
      example: copy.example,
      chips: summary.chips,
      verdict: summary.cardVerdict,
      result: summary.result,
      rebuilt: summary.rebuilt,
      startHere: m.name === START_HERE,
      downloads: dl,
      matched: summary.rebuilt && report ? report.score?.matched ?? 0 : 0,
      mismatches: summary.rebuilt && report ? report.score?.mismatches ?? 0 : 0,
    };
  });
  // Start-here card first, then rebuilt packages, then the rest.
  cards.sort((a, b) => Number(b.startHere) - Number(a.startHere) || Number(b.rebuilt) - Number(a.rebuilt) || a.name.localeCompare(b.name));

  const totalDownloadsMillions = Math.round(cards.reduce((s, c) => s + c.downloads, 0) / 1_000_000);
  const rebuiltCount = cards.filter((c) => c.rebuilt).length;
  const mismatches = cards.reduce((s, c) => s + c.mismatches, 0);
  const example = cards.find((c) => c.startHere);

  return (
    <main id="main">
      {/* Hero */}
      <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
        <HeroBackdrop />
        <div className="relative mx-auto grid min-h-[72vh] max-w-page items-center px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_1fr]">
          <Reveal>
            <p className="eyebrow">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
              For JavaScript and TypeScript developers
            </p>
            <h1 id="hero-heading" className="mt-6 text-4xl font-semibold leading-[1.06] tracking-tighter text-fg sm:text-6xl">
              Bring dead npm packages back,{" "}
              <span className="bg-gradient-to-r from-accent via-link to-fg bg-clip-text text-transparent">with evidence.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Many projects still install packages that nobody maintains. They get no security fixes, and some have known
              vulnerabilities. Revenant records what a dead package actually does, builds a replacement from that record,
              then runs both on the same inputs and shows you how closely they agree.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/package/${encodeURIComponent(START_HERE)}`} className="btn-primary">
                See a full example: {START_HERE}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <a href="#graveyard" className="btn-ghost">
                Browse the {cards.length} packages
              </a>
            </div>
            <p className="mt-6 max-w-xl text-sm text-muted">
              No login. Revenant reports evidence, not proof: a match score tells you how many tested inputs agreed, not
              that every input would.
            </p>
          </Reveal>

        </div>
      </section>

      <div className="mx-auto max-w-page px-4 sm:px-6">
        {/* At a glance */}
        <section aria-label="At a glance" className="-mt-8 relative z-10">
          <dl className="card grid grid-cols-2 divide-line p-2 sm:grid-cols-4 sm:divide-x">
            {[
              { n: cards.length, label: "dead packages in the Graveyard" },
              { n: totalDownloadsMillions, label: "million downloads a week between them", prefix: "~" },
              { n: rebuiltCount, label: "rebuilt and compared so far" },
              { n: mismatches, label: "unexplained mismatches in those rebuilds" },
            ].map((s) => (
              <div key={s.label} className="p-4 text-center">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                    {s.prefix}
                    <NumberTicker value={s.n} />
                  </span>
                  <span aria-hidden="true" className="mt-1 block text-xs text-muted sm:text-sm">
                    {s.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Example result: before and after, for the most complete package */}
        {example && (
          <section aria-labelledby="example-heading" className="pt-16">
            <Reveal>
              <div className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
                <div>
                  <p className="kicker">Example result</p>
                  <h2 id="example-heading" className="mt-2 text-2xl font-semibold text-fg sm:text-3xl">
                    {example.name}, before and after
                  </h2>
                  <p className="mt-2 text-sm text-muted">{example.oneLiner}</p>
                  <Link
                    href={`/package/${encodeURIComponent(example.name)}`}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
                  >
                    See how each number was produced <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border border-danger/30 bg-canvas p-4">
                    <p className="flex items-center gap-1.5 font-semibold text-danger">
                      <CircleAlert aria-hidden="true" className="h-4 w-4" /> Before
                    </p>
                    <ul className="mt-2 space-y-1 text-fg">
                      {example.chips
                        .filter((c) => c.tone === "dead" || c.tone === "warn")
                        .map((c) => (
                          <li key={c.text}>{c.text}</li>
                        ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-success/30 bg-canvas p-4">
                    <p className="flex items-center gap-1.5 font-semibold text-success">
                      <HeartPulse aria-hidden="true" className="h-4 w-4" /> After
                    </p>
                    <p className="mt-2 text-fg">{example.result}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </section>
        )}

        {/* Why */}
        <section aria-labelledby="why-heading" className="py-20">
          <Reveal>
            <p className="kicker">Why this exists</p>
            <h2 id="why-heading" className="mt-2 text-2xl font-semibold text-fg sm:text-3xl">
              When a dependency dies, every option has a catch
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Reveal>
              <SpotlightCard className="h-full p-6" glow="248 113 113">
                <h3 className="text-lg font-semibold text-danger">Without Revenant</h3>
                <ul className="mt-4 space-y-3 text-fg">
                  {[
                    ["Keep it", "and live with unfixed security bugs."],
                    ["Rewrite it by hand:", "slow, and easy to get subtly wrong."],
                    ["Ask an AI to rewrite it,", "with nothing to show the new code behaves like the old."],
                  ].map(([b, rest]) => (
                    <li key={b} className="flex gap-3">
                      <X aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                      <span>
                        <strong>{b}</strong> {rest}
                      </span>
                    </li>
                  ))}
                </ul>
              </SpotlightCard>
            </Reveal>
            <Reveal delay={0.1}>
              <SpotlightCard className="h-full p-6" glow="74 222 128">
                <h3 className="text-lg font-semibold text-success">With Revenant</h3>
                <ul className="mt-4 space-y-3 text-fg">
                  {[
                    ["The old package's behavior is recorded", "as evidence, input by input."],
                    ["The evidence becomes a spec", "an AI coding tool can build from."],
                    ["The rebuild is compared with the original", "on 1,000 inputs. Deliberate security fixes are listed, not hidden."],
                  ].map(([b, rest]) => (
                    <li key={b} className="flex gap-3">
                      <Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                      <span>
                        <strong>{b}</strong> {rest}
                      </span>
                    </li>
                  ))}
                </ul>
              </SpotlightCard>
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 py-12">
          <Reveal>
            <p className="kicker">How it works</p>
            <h2 id="how-heading" className="mt-2 text-2xl font-semibold text-fg sm:text-3xl">
              Five steps, from autopsy to rebirth
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Each package page walks through these steps in order. Steps 1, 2, 3 and 5 run right here in your browser.
              Step 4 happens in Kiro, the AI coding tool used to do the rebuild.
            </p>
          </Reveal>
          <div className="mt-10">
            <HowItWorks />
          </div>
        </section>

        {/* Graveyard */}
        <section id="graveyard" aria-labelledby="graveyard-heading" className="scroll-mt-20 py-20">
          <Reveal>
            <p className="kicker">The Graveyard</p>
            <h2 id="graveyard-heading" className="mt-2 text-2xl font-semibold text-fg sm:text-3xl">
              {cards.length} real, unmaintained packages
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Only these packages can be run on this site; it never installs code you type in. Not sure where to begin?
              Open <Link href={`/package/${encodeURIComponent(START_HERE)}`}>{START_HERE}</Link>, the most complete example.
            </p>
          </Reveal>
          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {cards.map((c, i) => (
              <Reveal as="li" key={c.name} delay={(i % 2) * 0.1}>
                <PackageCard pkg={c} />
              </Reveal>
            ))}
          </ul>
          {cards.length === 0 && <p className="text-warn">The Graveyard is empty: no manifests found.</p>}
        </section>

        {/* Who */}
        <section aria-labelledby="who-heading" className="py-12">
          <Reveal>
            <p className="kicker">Who this is for</p>
            <h2 id="who-heading" className="mt-2 text-2xl font-semibold text-fg sm:text-3xl">
              Developers stuck with a dead dependency
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Reveal className="card p-6">
              <h3 className="text-base font-semibold text-fg">You will get the most from it if</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
                <li>You depend on a small utility package that nobody maintains.</li>
                <li>You want a modern replacement you can read, not a black box.</li>
                <li>You want to see what changed, and why, before you switch.</li>
              </ul>
            </Reveal>
            <Reveal className="card p-6" delay={0.1}>
              <h3 className="text-base font-semibold text-fg">What you can do here</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
                <li>Read the health check of each package.</li>
                <li>Download a Kiro spec bundle and rebuild a package yourself.</li>
                <li>Inspect a rebuild and how its match score was produced.</li>
              </ul>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="questions" aria-labelledby="faq-heading" className="scroll-mt-20 py-20">
          <Reveal>
            <p className="kicker">Questions</p>
            <h2 id="faq-heading" className="mt-2 text-2xl font-semibold text-fg sm:text-3xl">
              Before you trust a score
            </h2>
          </Reveal>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <Collapsible key={f.q} summary={f.q}>
                <p className="leading-relaxed text-muted">{f.a}</p>
              </Collapsible>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { Hero } from "../components/home/Hero";
import { HowItWorks } from "../components/home/HowItWorks";
import { PackageRow, type PackageCardData } from "../components/home/PackageCard";
import { SectionHeader } from "../components/motion/SectionHeader";
import { Collapsible } from "../components/ui/Collapsible";
import { NumberTicker } from "../components/ui/NumberTicker";
import { Reveal } from "../components/ui/Reveal";
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

const WITHOUT = [
  ["Keep it", "and live with unfixed security bugs."],
  ["Rewrite it by hand:", "slow, and easy to get subtly wrong."],
  ["Ask an AI to rewrite it,", "with nothing to show the new code behaves like the old."],
];
const WITH = [
  ["The old package's behavior is recorded", "as evidence, input by input."],
  ["The evidence becomes a spec", "an AI coding tool can build from."],
  ["The rebuild is compared with the original", "on 1,000 inputs. Deliberate security fixes are listed, not hidden."],
];

export default function Home() {
  const manifests = listGraveyard();
  const rows: (PackageCardData & { downloads: number; mismatches: number; result: string })[] = manifests.map((m) => {
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
      mismatches: summary.rebuilt && report ? report.score?.mismatches ?? 0 : 0,
    };
  });
  // Start-here package first, then rebuilt packages, then the rest.
  rows.sort((a, b) => Number(b.startHere) - Number(a.startHere) || Number(b.rebuilt) - Number(a.rebuilt) || a.name.localeCompare(b.name));

  const totalDownloadsMillions = Math.round(rows.reduce((s, c) => s + c.downloads, 0) / 1_000_000);
  const rebuiltCount = rows.filter((c) => c.rebuilt).length;
  const mismatches = rows.reduce((s, c) => s + c.mismatches, 0);
  const example = rows.find((c) => c.startHere);

  const stats = [
    { n: rows.length, label: "dead packages in the Graveyard" },
    { n: totalDownloadsMillions, label: "million downloads a week between them", prefix: "~" },
    { n: rebuiltCount, label: "rebuilt and compared so far" },
    { n: mismatches, label: "unexplained mismatches in those rebuilds" },
  ];

  return (
    <main id="main">
      <Hero>
        <div>
          <p className="eyebrow">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            For JavaScript and TypeScript developers
          </p>
          <h1 id="hero-heading" className="mt-6 text-4xl font-semibold leading-[1.04] tracking-tighter text-fg sm:text-7xl">
            Bring dead npm packages back,{" "}
            <span className="bg-gradient-to-r from-accent via-link to-fg bg-clip-text text-transparent">with evidence.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Many projects still install packages that nobody maintains. Revenant records what a dead package actually does,
            builds a replacement from that record, then runs both on the same inputs and shows you how closely they agree.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={`/package/${encodeURIComponent(START_HERE)}`} className="btn-primary">
              See a full example: {START_HERE}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <a href="#graveyard" className="btn-ghost">
              Browse the {rows.length} packages
            </a>
          </div>
          <p className="mt-8 max-w-xl text-sm text-muted">
            No login. Revenant reports evidence, not proof: a match score tells you how many tested inputs agreed, not that
            every input would.
          </p>
        </div>
      </Hero>

      <div className="mx-auto max-w-page px-4 sm:px-6">
        {/* At a glance: a row of figures separated by hairlines */}
        <section aria-label="At a glance" className="border-y border-line">
          <dl className="grid grid-cols-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <Reveal
                key={s.label}
                delay={i * 0.06}
                className={[
                  "border-line py-8",
                  i % 2 === 1 ? "border-l pl-6" : "",
                  i >= 2 ? "border-t lg:border-t-0" : "",
                  i === 2 ? "lg:border-l lg:pl-6" : "",
                ].join(" ")}
              >
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-4xl font-semibold tracking-tighter text-fg sm:text-5xl">
                    {s.prefix}
                    <NumberTicker value={s.n} />
                  </span>
                  <span aria-hidden="true" className="mt-2 block text-sm text-muted">
                    {s.label}
                  </span>
                </dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* Example result */}
        {example && (
          <section aria-labelledby="example-heading" className="py-28">
            <SectionHeader kicker="Example result" title={`${example.name}, before and after`} id="example-heading">
              {example.oneLiner}
            </SectionHeader>
            <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
              <Reveal className="md:pr-10">
                <p className="text-sm font-medium text-danger">Before</p>
                <ul className="mt-4 space-y-3 text-lg text-fg">
                  {example.chips
                    .filter((c) => c.tone === "dead" || c.tone === "warn")
                    .map((c) => (
                      <li key={c.text}>{c.text}</li>
                    ))}
                </ul>
              </Reveal>
              <Reveal delay={0.12} className="md:pl-10">
                <p className="text-sm font-medium text-success">After</p>
                <p className="mt-4 text-lg leading-relaxed text-fg">{example.result}</p>
                <Link href={`/package/${encodeURIComponent(example.name)}`} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium">
                  See how each number was produced <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Reveal>
            </div>
          </section>
        )}

        {/* Why */}
        <section aria-labelledby="why-heading" className="border-t border-line py-28">
          <SectionHeader kicker="Why this exists" title="When a dependency dies, every option has a catch" id="why-heading" />
          <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-16">
            {[
              { title: "Without Revenant", tone: "text-danger", Icon: X, items: WITHOUT },
              { title: "With Revenant", tone: "text-success", Icon: Check, items: WITH },
            ].map((col, ci) => (
              <div key={col.title}>
                <Reveal delay={ci * 0.1}>
                  <h3 className={`text-sm font-medium ${col.tone}`}>{col.title}</h3>
                </Reveal>
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {col.items.map(([b, rest], i) => (
                    <Reveal as="li" key={b} delay={ci * 0.1 + (i + 1) * 0.06} className="flex gap-3 py-4">
                      <col.Icon aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 ${col.tone}`} />
                      <span className="leading-relaxed text-muted">
                        <strong className="font-medium text-fg">{b}</strong> {rest}
                      </span>
                    </Reveal>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* How it works: sticky intro on the left, scroll-linked timeline on the right */}
        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-t border-line py-28">
          <div className="grid gap-16 lg:grid-cols-[1fr_1.2fr]">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <SectionHeader kicker="How it works" title="Five steps, from autopsy to rebirth" id="how-heading">
                Each package page walks through these steps in order. Steps 1, 2, 3 and 5 run right here in your browser. Step 4
                happens in Kiro, the AI coding tool used to do the rebuild.
              </SectionHeader>
            </div>
            <HowItWorks />
          </div>
        </section>

        {/* Graveyard: list rows separated by hairlines */}
        <section id="graveyard" aria-labelledby="graveyard-heading" className="scroll-mt-20 border-t border-line py-28">
          <SectionHeader kicker="The Graveyard" title={`${rows.length} real, unmaintained packages`} id="graveyard-heading">
            Only these packages can be run on this site; it never installs code you type in. Not sure where to begin? Start with{" "}
            {START_HERE}, the most complete example.
          </SectionHeader>
          <ul className="mt-12 divide-y divide-line border-y border-line">
            {rows.map((r, i) => (
              <Reveal as="li" key={r.name} delay={i * 0.06}>
                <PackageRow pkg={r} />
              </Reveal>
            ))}
          </ul>
          {rows.length === 0 && <p className="text-warn">The Graveyard is empty: no manifests found.</p>}
        </section>

        {/* Who */}
        <section aria-labelledby="who-heading" className="border-t border-line py-28">
          <SectionHeader kicker="Who this is for" title="Developers stuck with a dead dependency" id="who-heading" />
          <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-16">
            {[
              {
                title: "You will get the most from it if",
                items: [
                  "You depend on a small utility package that nobody maintains.",
                  "You want a modern replacement you can read, not a black box.",
                  "You want to see what changed, and why, before you switch.",
                ],
              },
              {
                title: "What you can do here",
                items: [
                  "Read the health check of each package.",
                  "Download a Kiro spec bundle and rebuild a package yourself.",
                  "Inspect a rebuild and how its match score was produced.",
                ],
              },
            ].map((col, ci) => (
              <div key={col.title}>
                <Reveal delay={ci * 0.1}>
                  <h3 className="text-sm font-medium text-fg">{col.title}</h3>
                </Reveal>
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {col.items.map((t, i) => (
                    <Reveal as="li" key={t} delay={ci * 0.1 + (i + 1) * 0.06} className="py-4 leading-relaxed text-muted">
                      {t}
                    </Reveal>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="questions" aria-labelledby="faq-heading" className="scroll-mt-20 border-t border-line py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
            <SectionHeader kicker="Questions" title="Before you trust a score" id="faq-heading" />
            <div className="border-t border-line">
              {FAQ.map((f, i) => (
                <Reveal key={f.q} delay={i * 0.05}>
                  <Collapsible summary={f.q}>
                    <p className="max-w-xl leading-relaxed text-muted">{f.a}</p>
                  </Collapsible>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

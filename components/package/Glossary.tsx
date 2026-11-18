import { BookOpen } from "lucide-react";

const TERMS = [
  {
    term: "Ghost Memory",
    text: "Our name for the recording step: run the original package on many generated inputs and write down what each one returned or threw.",
  },
  { term: "Evidence", text: "One recorded input and what the original package did with it. Every later step relies only on this record." },
  {
    term: "Behavior group",
    text: "Inputs that look alike (same kind of input, same outcome), grouped so you can read a few groups instead of a thousand rows. Called a behavior class in the technical docs.",
  },
  {
    term: "Intentional difference",
    text: "A change made on purpose in the rebuild, such as a security fix. Each one names a published advisory and is left out of the match score.",
  },
  {
    term: "Prototype pollution",
    text: "A bug where a crafted key such as __proto__ changes the shared template every object inherits from, so unrelated code can behave differently.",
  },
  {
    term: "Match score",
    text: "How many generated inputs gave the same result in the original and the rebuild. Evidence, not proof: inputs that were never generated are not covered.",
  },
];

export function Glossary() {
  return (
    <section id="glossary" aria-labelledby="glossary-heading" className="scroll-mt-24 border-t border-line py-20">
      <h2 id="glossary-heading" className="flex items-center gap-2 text-xl font-semibold text-fg">
        <BookOpen aria-hidden="true" className="h-5 w-5 text-accent" /> Glossary
      </h2>
      <dl className="mt-8 grid gap-x-16 sm:grid-cols-2">
        {TERMS.map((t) => (
          <div key={t.term} className="border-t border-line py-5">
            <dt className="font-semibold text-fg">{t.term}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted">{t.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

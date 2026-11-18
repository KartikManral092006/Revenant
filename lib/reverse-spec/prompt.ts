/**
 * Reverse Spec prompt builder (Req 5.2).
 * Input is the stored classes.json only, never the full recording. Each class contributes its ID,
 * features, count and up to 3 representative Evidence IDs. The unclassified class contributes up to
 * 10 of its records. If the prompt exceeds the context budget, representatives drop to 1 per class
 * before the builder fails.
 */
import type { BehaviorClass } from '../ghost-memory/evidence-id.js';

export const MAX_REPRESENTATIVES = 3;
export const MIN_REPRESENTATIVES = 1;
export const MAX_UNCLASSIFIED_RECORDS = 10;
/**
 * Character budget for the prompt (design open item 9, checked against Groq docs).
 * openai/gpt-oss-120b has a 131,072-token context window, but the binding limit is the free-tier
 * 8K tokens per minute. 16,000 characters is about 4K to 5K tokens, which leaves room for the
 * completion (see MAX_COMPLETION_TOKENS in groq-client.ts) inside one minute's budget.
 */
export const DEFAULT_MAX_PROMPT_CHARS = 16_000;

export interface PromptClassesInput {
  package: string;
  version: string;
  classes: BehaviorClass[];
}

export interface BuiltPrompt {
  prompt: string;
  /** Representatives per class actually used: 3 normally, 1 after the fallback. */
  representativesPerClass: number;
  /** Evidence IDs that appear in the prompt. */
  includedEvidenceIds: string[];
}

export class PromptTooLargeError extends Error {
  constructor(public readonly length: number, public readonly maxChars: number) {
    super(`prompt is ${length} characters, over the ${maxChars} limit even with 1 representative per class`);
    this.name = 'PromptTooLargeError';
  }
}

const isUnclassified = (c: BehaviorClass): boolean => c.classId.endsWith(':class:unclassified');

function render(input: PromptClassesInput, reps: number): { prompt: string; ids: string[] } {
  const ids: string[] = [];
  const lines: string[] = [
    `Package: ${input.package}@${input.version}`,
    'Below are the recorded behavior classes for this package. Each class has an ID, feature values,',
    'the number of recorded inputs in it, and representative Evidence IDs.',
    'Write requirements that describe only behavior supported by these classes.',
    'Cite every requirement with the class IDs that support it. Do not invent class IDs.',
    '',
    'Classes:',
  ];
  const unclassified: BehaviorClass[] = [];
  for (const c of input.classes) {
    if (isUnclassified(c)) {
      unclassified.push(c);
      continue;
    }
    const representatives = c.representatives.slice(0, reps);
    ids.push(...representatives);
    lines.push(
      `- classId: ${c.classId}`,
      `  features: ${JSON.stringify(c.features)}`,
      `  count: ${c.count}`,
      `  representatives: ${JSON.stringify(representatives)}`,
    );
  }
  lines.push('', 'Unclassified records (behavior not covered by any class):');
  if (unclassified.length === 0) lines.push('- none');
  for (const c of unclassified) {
    const records = c.evidenceIds.slice(0, MAX_UNCLASSIFIED_RECORDS);
    ids.push(...records);
    lines.push(`- classId: ${c.classId}`, `  count: ${c.count}`, `  records: ${JSON.stringify(records)}`);
  }
  lines.push(
    '',
    'Respond with JSON only: { "requirements": [ { "id": string, "statement": string, "classIds": string[] } ] }',
  );
  return { prompt: lines.join('\n'), ids };
}

export function buildPrompt(input: PromptClassesInput, maxChars: number = DEFAULT_MAX_PROMPT_CHARS): BuiltPrompt {
  const full = render(input, MAX_REPRESENTATIVES);
  if (full.prompt.length <= maxChars) {
    return { prompt: full.prompt, representativesPerClass: MAX_REPRESENTATIVES, includedEvidenceIds: full.ids };
  }
  const reduced = render(input, MIN_REPRESENTATIVES);
  if (reduced.prompt.length <= maxChars) {
    return { prompt: reduced.prompt, representativesPerClass: MIN_REPRESENTATIVES, includedEvidenceIds: reduced.ids };
  }
  throw new PromptTooLargeError(reduced.prompt.length, maxChars);
}

/**
 * Groq client for Reverse Spec (Req 5.1, 5.9). Server-only.
 * GROQ_API_KEY is read here and nowhere else. It is never returned or put into an error message.
 *
 * Model facts checked against console.groq.com/docs/models and /docs/rate-limits (design open item 9):
 * - openai/gpt-oss-120b: context 131,072 tokens, max completion 65,536 tokens, supports JSON mode.
 * - llama-3.3-70b-versatile is listed as enterprise-only now, so it is not the default.
 * - Base limits for gpt-oss-120b: 30 RPM, 1K RPD, 8K TPM, 200K TPD. TPM is the binding limit, which
 *   is why the prompt budget in prompt.ts is 16,000 characters and the completion is capped below.
 */
import Groq from 'groq-sdk';

export const GROQ_MODEL = 'openai/gpt-oss-120b';
export const MAX_COMPLETION_TOKENS = 3_000;

export interface RawRequirement {
  id: string;
  statement: string;
  classIds: string[];
}

export type GroqResult =
  | { ok: true; model: string; requirements: RawRequirement[]; attempts: 1 | 2 }
  | { ok: false; reason: 'no-api-key' | 'bad-json' | 'request-failed' };

/** The slice of the SDK this module uses, so tests can inject a fake. */
export interface ChatLike {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: { role: 'system' | 'user'; content: string }[];
        response_format: { type: 'json_object' };
        max_completion_tokens: number;
        temperature: number;
        reasoning_effort: 'low';
      }): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
}

const SYSTEM = 'You write software requirements from recorded behavior evidence. You output JSON only.';
const STRICT_SUFFIX =
  '\n\nYour previous reply was not valid JSON in the required shape. Reply again with one JSON object and nothing else: ' +
  'no markdown, no code fences, no commentary. The object must be exactly ' +
  '{"requirements":[{"id":"R1","statement":"...","classIds":["..."]}]}. ' +
  'Every id and statement is a non-empty string and classIds is an array of strings.';

/** Returns the validated list, or null if the text is not the required shape. */
export function parseRequirements(text: string | null | undefined): RawRequirement[] | null {
  if (!text) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const list = (value as { requirements?: unknown }).requirements;
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: RawRequirement[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const { id, statement, classIds } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || typeof statement !== 'string' || statement === '') return null;
    if (!Array.isArray(classIds) || !classIds.every((c) => typeof c === 'string')) return null;
    out.push({ id, statement, classIds: classIds as string[] });
  }
  return out;
}

function defaultClient(): ChatLike | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey }) as unknown as ChatLike;
}

/**
 * Ask Groq for requirements. One retry with a stricter prompt when the reply is not valid JSON.
 * Failures return a reason code only; no upstream message or key material is passed on.
 */
export async function generateRequirements(prompt: string, client?: ChatLike): Promise<GroqResult> {
  const c = client ?? defaultClient();
  if (!c) return { ok: false, reason: 'no-api-key' };
  let user = prompt;
  for (const attempt of [1, 2] as const) {
    let text: string | null | undefined;
    try {
      const res = await c.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        temperature: attempt === 1 ? 0.2 : 0,
        reasoning_effort: 'low',
      });
      text = res.choices[0]?.message?.content;
    } catch {
      return { ok: false, reason: 'request-failed' };
    }
    const requirements = parseRequirements(text);
    if (requirements) return { ok: true, model: GROQ_MODEL, requirements, attempts: attempt };
    user = prompt + STRICT_SUFFIX;
  }
  return { ok: false, reason: 'bad-json' };
}

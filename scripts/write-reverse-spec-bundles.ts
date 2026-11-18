// Writes data/<package>/reverse-spec.json for every Graveyard package: prompt (from
// data/<package>/classes.json) -> Groq -> bundle assembly. Needs GROQ_API_KEY (loaded from
// .env.local by the npm script). The key is never printed.
//
// At most ONE Groq call is made per package (the in-script wrapper blocks the client's
// bad-JSON retry), calls are spaced out for the 8,000 tokens/minute free tier, and an HTTP 429
// stops the run with a report instead of retrying. Nothing is fabricated: a package whose call
// fails keeps whatever bundle file it had and is listed in the failure report.
//
// Run: npm run reverse-spec:bundles
// Node-run code: relative imports only, with .js extensions.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listGraveyard } from '../lib/graveyard/loader.js';
import type { BehaviorClass } from '../lib/ghost-memory/evidence-id.js';
import { assembleBundle, writeBundle } from '../lib/reverse-spec/bundle.js';
import { generateRequirements, type ChatLike } from '../lib/reverse-spec/groq-client.js';
import { buildPrompt } from '../lib/reverse-spec/prompt.js';

/** Wait between packages so one minute of the 8,000 tokens/minute budget is not shared. */
const PAUSE_MS = 65_000;

type Params = Parameters<ChatLike['chat']['completions']['create']>[0];

interface CallState {
  calls: number;
  status: number | null;
  retryBlocked: boolean;
}

/** Real SDK client, limited to one call; records only the HTTP status of a failure. */
async function oneCallClient(state: CallState): Promise<ChatLike> {
  const { default: Groq } = await import('groq-sdk');
  const sdk = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 }) as unknown as ChatLike;
  return {
    chat: {
      completions: {
        async create(params: Params) {
          if (state.calls >= 1) {
            state.retryBlocked = true;
            throw new Error('retry blocked');
          }
          state.calls++;
          try {
            return await sdk.chat.completions.create(params);
          } catch (err) {
            const status = (err as { status?: unknown }).status;
            state.status = typeof status === 'number' ? status : null;
            throw new Error('request failed');
          }
        },
      },
    },
  };
}

function readClasses(root: string, pkg: string): { version: string; classes: BehaviorClass[] } | null {
  try {
    const raw = JSON.parse(readFileSync(path.join(root, 'data', pkg, 'classes.json'), 'utf8')) as {
      version?: string;
      classes?: BehaviorClass[];
    };
    return Array.isArray(raw.classes) ? { version: String(raw.version ?? ''), classes: raw.classes } : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set. Nothing was generated and no bundle was written.');
    console.error('Put GROQ_API_KEY=<your key> in .env.local, then run: npm run reverse-spec:bundles');
    return 4;
  }
  const root = process.cwd();
  const manifests = listGraveyard({ root });
  const failures: string[] = [];
  const lines: string[] = [];
  let stopped = false;

  for (const [i, m] of manifests.entries()) {
    if (stopped) {
      failures.push(`${m.name}: not attempted (stopped after rate limit)`);
      continue;
    }
    const data = readClasses(root, m.name);
    if (!data) {
      failures.push(`${m.name}: data/${m.name}/classes.json is missing or unreadable`);
      continue;
    }
    if (i > 0) await sleep(PAUSE_MS);

    const state: CallState = { calls: 0, status: null, retryBlocked: false };
    let prompt: string;
    try {
      prompt = buildPrompt({ package: m.name, version: data.version, classes: data.classes }).prompt;
    } catch {
      failures.push(`${m.name}: prompt could not be built within the size budget`);
      continue;
    }
    const result = await generateRequirements(prompt, await oneCallClient(state));
    if (!result.ok) {
      if (state.status === 429) {
        failures.push(`${m.name}: Groq returned HTTP 429 (rate limit). Wait a few minutes and run again.`);
        stopped = true;
      } else if (state.retryBlocked) {
        failures.push(`${m.name}: Groq reply was not valid JSON; the retry was skipped to keep one call per package`);
      } else {
        failures.push(
          `${m.name}: Groq request failed${state.status === null ? '' : ` (HTTP ${state.status})`} [${result.reason}]`,
        );
      }
      continue;
    }
    const bundle = assembleBundle({
      package: m.name,
      model: result.model,
      requirements: result.requirements,
      classes: data.classes,
    });
    const file = writeBundle(bundle, root);
    lines.push(`${path.relative(root, file)}: ${bundle.traceability.text}`);
  }

  for (const l of lines) console.log(l);
  if (failures.length > 0) {
    console.error('Not generated:');
    for (const f of failures) console.error(`  ${f}`);
    console.error('Fix the cause, then run: npm run reverse-spec:bundles');
    return 1;
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    console.error('unexpected failure');
    process.exitCode = 3;
  },
);

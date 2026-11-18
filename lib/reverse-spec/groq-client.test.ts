import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateRequirements, parseRequirements, type ChatLike } from './groq-client';

const good = JSON.stringify({ requirements: [{ id: 'R1', statement: 's', classIds: ['a'] }] });
const fake = (replies: (string | Error)[]) => {
  const create = vi.fn(async () => {
    const r = replies.shift()!;
    if (r instanceof Error) throw r;
    return { choices: [{ message: { content: r } }] };
  });
  return { client: { chat: { completions: { create } } } as unknown as ChatLike, create };
};

afterEach(() => vi.unstubAllEnvs());

describe('parseRequirements', () => {
  it('accepts the required shape', () => {
    expect(parseRequirements(good)).toEqual([{ id: 'R1', statement: 's', classIds: ['a'] }]);
  });
  it.each(['', 'nope', '{}', '{"requirements":[]}', '{"requirements":[{"id":"R1","statement":"s"}]}'])(
    'rejects %j',
    (t) => expect(parseRequirements(t)).toBeNull(),
  );
});

describe('generateRequirements', () => {
  it('returns on the first valid reply', async () => {
    const { client, create } = fake([good]);
    const r = await generateRequirements('p', client);
    expect(r).toMatchObject({ ok: true, attempts: 1 });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('retries once with a stricter prompt on bad JSON', async () => {
    const { client, create } = fake(['not json', good]);
    const r = await generateRequirements('p', client);
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    const second = (create.mock.calls[1] as unknown as [{ messages: { content: string }[] }])[0];
    expect(second.messages[1].content).toContain('no markdown');
  });
  it('fails with bad-json after the retry', async () => {
    const { client, create } = fake(['x', 'y']);
    expect(await generateRequirements('p', client)).toEqual({ ok: false, reason: 'bad-json' });
    expect(create).toHaveBeenCalledTimes(2);
  });
  it('does not leak the key or upstream message on request failure', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_secret_value');
    const { client } = fake([new Error('401 bad key gsk_secret_value')]);
    const r = await generateRequirements('p', client);
    expect(r).toEqual({ ok: false, reason: 'request-failed' });
    expect(JSON.stringify(r)).not.toContain('gsk_secret_value');
  });
  it('reports no-api-key without calling anything when the key is unset', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    expect(await generateRequirements('p')).toEqual({ ok: false, reason: 'no-api-key' });
  });
});

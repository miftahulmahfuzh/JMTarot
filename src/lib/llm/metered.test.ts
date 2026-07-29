import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _reset } from '@/lib/ratelimit';
import { ModelCeilingError } from './meter';

vi.mock('@/lib/analytics/track', () => ({ track: () => {} }));

/**
 * A provider that records what reached it, so "did not reach the model" is an
 * assertion rather than an inference.
 */
const reached: string[] = [];
const seenOpts: unknown[] = [];

vi.mock('./anthropic', () => ({
  createAnthropicProvider: () => ({
    streamReading: () => {
      reached.push('stream');
      const stream = (async function* () {
        yield 'x';
      })() as unknown as AsyncIterable<string> & { usage: Promise<unknown> };
      stream.usage = Promise.resolve({ inputTokens: null, outputTokens: null });
      return stream;
    },
    complete: async (_p: unknown, opts: unknown) => {
      reached.push('complete');
      seenOpts.push(opts);
      return { text: 'ok', usage: { inputTokens: null, outputTokens: null } };
    },
  }),
}));

const PROMPT = { system: 's', user: 'u', maxTokens: 10 };
/**
 * `op` IS REQUIRED ON `complete()` SINCE A2, so every call here declares one. The
 * value is arbitrary in the tests that are about the ceiling and load-bearing in the
 * ones that are about the ledger row.
 */
const OP = { op: 'gist' } as const;

beforeEach(() => {
  _reset();
  reached.length = 0;
  seenOpts.length = 0;
  vi.stubEnv('LLM_PROVIDER', 'zai');
  vi.stubEnv('LLM_API_KEY', 'k');
  vi.stubEnv('LLM_MODEL', 'm');
});

afterEach(() => vi.unstubAllEnvs());

describe('complete() passes the ceiling on the way out', () => {
  it('reaches the provider while there is headroom', async () => {
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    const { getProvider } = await import('./index');
    await getProvider().complete(PROMPT, OP);
    expect(reached).toEqual(['complete']);
  });

  it('THROWS ModelCeilingError at the ceiling and NEVER REACHES THE PROVIDER', async () => {
    /*
     * The second half is the point. A decorator that reserved and then called
     * anyway would pass a test asserting only that it threw -- and would spend the
     * quota it was protecting.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '2');
    vi.stubEnv('LLM_WINDOW_CALL_SOFT', '2');
    const { getProvider } = await import('./index');
    const provider = getProvider();

    await provider.complete(PROMPT, OP);
    await provider.complete(PROMPT, OP);
    reached.length = 0;

    await expect(provider.complete(PROMPT, OP)).rejects.toBeInstanceOf(ModelCeilingError);
    expect(reached).toEqual([]);
  });

  it('sheds a DEFERRED call at the soft line while an interactive one still runs', async () => {
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    vi.stubEnv('LLM_WINDOW_CALL_SOFT', '1');
    const { getProvider } = await import('./index');
    const provider = getProvider();

    await provider.complete(PROMPT, { ...OP, callClass: 'interactive' });
    reached.length = 0;

    await expect(provider.complete(PROMPT, { ...OP, callClass: 'deferred' })).rejects.toBeInstanceOf(
      ModelCeilingError,
    );
    expect(reached).toEqual([]);

    await provider.complete(PROMPT, { ...OP, callClass: 'interactive' });
    expect(reached).toEqual(['complete']);
  });

  it('treats an UNDECLARED call as interactive -- the safe default', async () => {
    /*
     * A new call site that forgets to say is treated as something a person is
     * waiting for, so the failure of omission is "shed too late" and never "shed a
     * reading early". Asserted by putting the window between soft and hard, where
     * the two classes differ.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    vi.stubEnv('LLM_WINDOW_CALL_SOFT', '1');
    const { getProvider } = await import('./index');
    const provider = getProvider();

    await provider.complete(PROMPT, { ...OP, callClass: 'interactive' });
    reached.length = 0;

    await provider.complete(PROMPT, OP); // no callClass at all
    expect(reached).toEqual(['complete']);
  });

  it('passes opts through untouched, so model and temperature still work', async () => {
    /*
     * The decorator must be transparent to everything it is not about. W7's
     * classifier depends on both of these: `model` is MODERATION_MODEL, which is a
     * production requirement and not a cost optimisation, and `temperature: 0` is
     * what makes its JSON parseable.
     *
     * Recorded through the same mock rather than a per-test `vi.doMock`, because
     * `vi.resetModules()` forks the module registry -- the freshly imported
     * `./index` then holds a DIFFERENT `@/lib/ratelimit` instance from the one this
     * file's `_reset()` clears, and the window leaks into the next test. That cost
     * one red run to find.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    const { getProvider } = await import('./index');
    await getProvider().complete(PROMPT, { ...OP, model: 'glm-4.5-flash', temperature: 0 });
    expect(seenOpts[0]).toMatchObject({ model: 'glm-4.5-flash', temperature: 0 });
  });
});

describe('streamReading is NOT metered here, and that is deliberate', () => {
  it('reaches the provider even with the ceiling exhausted', async () => {
    /*
     * **THE READING RESERVES IN `/api/reading` INSTEAD**, because wrapping a stream
     * means rebuilding `usage`'s "must always settle, must never reject" contract
     * inside a decorator, and because only the route can turn a refusal into a 429
     * with the right retry-after.
     *
     * This test exists so that "finishing the job" by wrapping the stream fails
     * loudly here rather than silently double-reserving every reading and halving
     * the ceiling. If you deliberately move the reservation into the decorator, the
     * route's own reservation has to come out in the same commit.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '1');
    vi.stubEnv('LLM_WINDOW_CALL_SOFT', '1');
    const { getProvider } = await import('./index');
    const provider = getProvider();

    await provider.complete(PROMPT, OP); // spends the only slot
    reached.length = 0;

    const stream = provider.streamReading({ ...PROMPT, promptVersion: 'id-v1.deadbeef' });
    for await (const chunk of stream) expect(chunk).toBe('x');
    expect(reached).toEqual(['stream']);
  });
});

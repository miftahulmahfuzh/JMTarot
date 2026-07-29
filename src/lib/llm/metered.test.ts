import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _reset, peek } from '@/lib/ratelimit';
import { ModelCeilingError } from './meter';
import type { LlmCallRecord } from './ledger';

/**
 * `bufferCall` is what `recordCall` reaches, so mocking it is mocking the sink
 * without mocking the thing under test. `track` is mocked for `meter.ts`'s
 * `llm.ceiling_reached`.
 */
const recorded: LlmCallRecord[] = [];
vi.mock('@/lib/analytics/track', () => ({
  track: () => {},
  bufferCall: async (row: LlmCallRecord) => {
    recorded.push(row);
  },
}));

/**
 * A provider that records what reached it, so "did not reach the model" is an
 * assertion rather than an inference.
 */
const reached: string[] = [];
const seenOpts: unknown[] = [];
/** What the fake provider does. Reset per test; overridden where the ledger is the subject. */
let scriptedComplete: () => Promise<{ text: string; usage: unknown }>;

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
      return scriptedComplete();
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
  recorded.length = 0;
  scriptedComplete = async () => ({ text: 'ok', usage: { inputTokens: null, outputTokens: null } });
  vi.stubEnv('LLM_PROVIDER', 'zai');
  vi.stubEnv('LLM_API_KEY', 'k');
  vi.stubEnv('LLM_MODEL', 'm');
  /*
   * THE UNIT PROJECT RUNS WITH `ANALYTICS_ENABLED=0` (reconciliation R20), which
   * makes `recordCall` a no-op -- so every test that asserts a ledger row has to flip
   * it, exactly as `track.test.ts` does.
   */
  vi.stubEnv('ANALYTICS_ENABLED', '1');
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

  it('writes NO ledger row for a stream, because only the site knows the outcome', async () => {
    /*
     * The three streaming sites each write their own row where the work is over and
     * the response has flushed -- `/api/reading`'s `defer()`, the day summary's
     * `after()`, and `translate.ts`'s `inScope`. A row from here would have to guess
     * the status before the first token had arrived.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    const { getProvider } = await import('./index');
    const stream = getProvider().streamReading({ ...PROMPT, promptVersion: 'id-v1.deadbeef' });
    for await (const chunk of stream) expect(chunk).toBe('x');
    expect(recorded).toEqual([]);
  });
});

/**
 * A2. The ledger's buffered chokepoint: all six `complete()` sites, one place.
 *
 * `bufferCall` is mocked rather than `recordCall`, so what runs is the real
 * `recordCall` and the real decorator -- the sink is the only thing standing in.
 */
describe('metered() records the buffered call', () => {
  it('records one row on success, with the op, the resolved model and the provider tokens', async () => {
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    scriptedComplete = async () => ({
      text: 'ok',
      usage: { inputTokens: 1200, outputTokens: 340 },
    });

    const { getProvider } = await import('./index');
    await getProvider().complete(PROMPT, { op: 'moderation', model: 'glm-4.5-flash' });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      op: 'moderation',
      // THE RESOLVED MODEL, never the env var name: `MODERATION_MODEL` lands here as
      // whatever it resolved to, because pricing is keyed on the model that ran.
      model: 'glm-4.5-flash',
      // Undeclared, so `interactive` -- the same safe default the ceiling uses.
      callClass: 'interactive',
      streamed: false,
      status: 'ok',
      errorKind: null,
      inputTokens: 1200,
      outputTokens: 340,
    });
    expect(typeof recorded[0].totalMs).toBe('number');
    // No `reading_id` from here: the classifier runs before the `readings` row exists
    // (R51), and the two sites that can set one do it by hand.
    expect(recorded[0].readingId).toBeUndefined();
  });

  it('falls back to LLM_MODEL when the call names none', async () => {
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    const { getProvider } = await import('./index');
    await getProvider().complete(PROMPT, { op: 'gist', callClass: 'deferred' });
    expect(recorded[0]).toMatchObject({ model: 'm', callClass: 'deferred' });
  });

  it('records status failed with a CLASSIFIED error_kind -- and RETHROWS', async () => {
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    scriptedComplete = async () => {
      throw Object.assign(new Error('upstream exploded'), { status: 503 });
    };

    const { getProvider } = await import('./index');
    /*
     * The rethrow is half the assertion. All six callers have their own `catch` that
     * falls back to a template, a 204 or the untranslated source; a decorator that
     * swallowed this to "record and continue" would hand every one of them an
     * undefined `text`.
     */
    await expect(getProvider().complete(PROMPT, { op: 'persona' })).rejects.toThrow(
      'upstream exploded',
    );

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      op: 'persona',
      status: 'failed',
      // `classifyStreamError`'s vocabulary, reused rather than reinvented: an
      // `error_kind` with unbounded cardinality makes every `group by` useless, and a
      // message can carry a URL, a prompt fragment or a key.
      errorKind: 'upstream_5xx',
      inputTokens: null,
      outputTokens: null,
    });
    // NOT the error's message, at any length.
    expect(JSON.stringify(recorded[0])).not.toContain('exploded');
  });

  it("is 'failed' and never 'partial' on the buffered path", async () => {
    // A buffered call has ONE arrival: either the text came back or it did not, and
    // there is no half of it to have received. `'partial'` belongs to the streams.
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    scriptedComplete = async () => {
      throw new Error('nope');
    };
    const { getProvider } = await import('./index');
    await expect(getProvider().complete(PROMPT, OP)).rejects.toThrow();
    expect(recorded[0].status).toBe('failed');
  });

  it('A CEILING REFUSAL RECORDS NOTHING (A2-D6, R4)', async () => {
    /*
     * A refusal reached no provider, so there is no call to record. A row for it would
     * destroy `count(*)` as "calls made" -- the quantity the 280 ceiling is expressed
     * in and the one A3's meter reconstructs -- and would duplicate
     * `llm.ceiling_reached`, which A-D18 forbids on the fold-don't-add principle.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '1');
    vi.stubEnv('LLM_WINDOW_CALL_SOFT', '1');
    const { getProvider } = await import('./index');
    const provider = getProvider();

    await provider.complete(PROMPT, OP); // spends the only slot, records one row
    expect(recorded).toHaveLength(1);

    await expect(provider.complete(PROMPT, OP)).rejects.toBeInstanceOf(ModelCeilingError);
    expect(recorded).toHaveLength(1); // still one. Not two.
  });

  it('THE RESERVATION COUNT PER CALL IS UNCHANGED: one complete() leaves nine of ten', async () => {
    /*
     * **A2-D1 / INVARIANT 12, and this is the test rather than the argument.** The
     * expensive mistake available in this workstream is "finishing the job" by
     * wrapping `streamReading` too, which would give every reading two reservations
     * and a ceiling that is half what it says. Recording a row must not reserve either.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    const { getProvider } = await import('./index');
    await getProvider().complete(PROMPT, OP);
    expect(recorded).toHaveLength(1);

    // `peek` and not `consume`: reading the window must not spend it, or the
    // assertion changes the thing it measures.
    const { MODEL_WINDOW_KEY, MODEL_WINDOW_MS } = await import('./meter');
    const seen = await peek(MODEL_WINDOW_KEY, 10, MODEL_WINDOW_MS);
    expect(seen.ok && seen.remaining).toBe(9);
  });

  it('writes nothing with ANALYTICS_ENABLED=0, and the call still succeeds', async () => {
    vi.stubEnv('ANALYTICS_ENABLED', '0');
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    const { getProvider } = await import('./index');
    const out = await getProvider().complete(PROMPT, OP);
    expect(out.text).toBe('ok');
    expect(recorded).toEqual([]);
  });

  it('THE STREAM IS STILL A BARE PASSTHROUGH, AND THERE IS STILL ONE RESERVATION', () => {
    /*
     * A source grep, in the `callClass.test.ts` idiom, because the two things it
     * protects are absences: a decorator that grew a second `reserveModelCall` would
     * halve the ceiling silently, and one that wrapped the stream would do it while
     * looking like the ledger being finished properly.
     *
     * The comment above the line is asserted too. It is the only thing standing between
     * the next reader and "finishing the job", and a wrapper written after deleting it
     * would be a reasonable-looking change.
     */
    const src = readFileSync('src/lib/llm/index.ts', 'utf8');
    expect(src).toContain('streamReading: provider.streamReading');
    expect(src).toContain(
      '// Unwrapped, deliberately. Read the comment above before changing this line.',
    );
    expect(src).toContain('If you "finish the job" by wrapping the stream');
    // Once in the call, once in the import, and nowhere else.
    expect(src.match(/reserveModelCall/g)).toHaveLength(2);
  });

  it('a sink that throws does NOT fail the call', async () => {
    /*
     * The acceptance test in miniature: **a ledger that can fail a reading is worse
     * than no ledger.** `recordCall` swallows, and `void` means nothing awaits it --
     * both halves are needed, because a rejected floating promise is an unhandled
     * rejection even when nobody reads the value.
     */
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
    const track = await import('@/lib/analytics/track');
    const spy = vi
      .spyOn(track, 'bufferCall')
      .mockRejectedValue(new Error('the ledger is on fire'));
    try {
      const { getProvider } = await import('./index');
      const out = await getProvider().complete(PROMPT, OP);
      expect(out.text).toBe('ok');
    } finally {
      spy.mockRestore();
    }
  });
});

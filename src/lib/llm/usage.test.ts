/**
 * The `usage` promise, against a fake `messages.stream`.
 *
 * The three properties under test are the ones that are invisible until they
 * cost something in production: it always settles, it never rejects, and z.ai's
 * `input_tokens: 0` becomes null rather than zero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMStream } from './types';

type RawEvent = Record<string, unknown>;

/** Whatever the SDK is told to return from `client.messages.stream`. */
let scripted: () => AsyncIterable<RawEvent>;
/** And from `client.messages.create` -- the BUFFERED path, which has its own rule. */
let scriptedCreate: () => Promise<RawEvent>;

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: () => scripted(),
      create: () => scriptedCreate(),
    };
  },
}));

const { createAnthropicProvider } = await import('./anthropic');

function events(list: RawEvent[], throwAfter?: number): () => AsyncIterable<RawEvent> {
  return async function* () {
    for (let i = 0; i < list.length; i++) {
      if (throwAfter !== undefined && i >= throwAfter) throw new Error('upstream died');
      yield list[i];
    }
  };
}

const textDelta = (text: string): RawEvent => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});

async function drain(stream: LLMStream): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

beforeEach(() => {
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'test-model';
  scriptedCreate = async () => ({ content: [], usage: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const PROMPT = { system: 's', user: 'u', maxTokens: 100, promptVersion: 'id-v1.00000000' };

describe('streamReading usage', () => {
  it('yields the text and resolves usage with the reported counts', async () => {
    // An UNCACHED send: the whole prompt is fresh, so `cache_read_input_tokens`
    // is a reported 0 -- a measurement, not an absence.
    scripted = events([
      { type: 'message_start', message: { usage: { input_tokens: 0, output_tokens: 0 } } },
      textDelta('Hai '),
      textDelta('kamu.'),
      {
        type: 'message_delta',
        usage: { input_tokens: 1234, output_tokens: 88, cache_read_input_tokens: 0 },
        delta: { stop_reason: 'end_turn' },
      },
      { type: 'message_stop' },
    ]);

    const stream = createAnthropicProvider().streamReading(PROMPT);
    expect(await drain(stream)).toBe('Hai kamu.');
    await expect(stream.usage).resolves.toEqual({
      inputTokens: 1234,
      outputTokens: 88,
      cachedInputTokens: 0,
    });
  });

  it('a genuinely absent input count is null, never 0', async () => {
    // A provider that reports an output count and nothing about the input side.
    // A literal 0 in the column would be indistinguishable from a real zero and
    // would make every average silently wrong.
    scripted = events([
      { type: 'message_start', message: { usage: { input_tokens: 0 } } },
      textDelta('halo'),
      { type: 'message_delta', usage: { output_tokens: 12 } },
    ]);

    const stream = createAnthropicProvider().streamReading(PROMPT);
    await drain(stream);
    await expect(stream.usage).resolves.toEqual({
      inputTokens: null,
      outputTokens: 12,
      cachedInputTokens: null,
    });
  });

  it('THE REAL z.ai SHAPE: the input count arrives in message_delta, not message_start', async () => {
    /*
     * THE BUG THIS FILE EXISTED ALONGSIDE FOR A WHOLE RELEASE. `message_start`
     * carries `input_tokens: 0` on every z.ai stream and the real number arrives
     * later, in `message_delta` -- the same event the adapter already opens to read
     * `output_tokens` from. Measured 2026-07-30 against the live endpoint.
     *
     * Asserting 1364 and not 20 is the whole point: reading `input_tokens` alone
     * from the delta looks correct and undercounts by the cached majority.
     */
    scripted = events([
      { type: 'message_start', message: { usage: { input_tokens: 0, output_tokens: 0 } } },
      textDelta('halo'),
      {
        type: 'message_delta',
        usage: { input_tokens: 20, output_tokens: 24, cache_read_input_tokens: 1344 },
      },
    ]);

    const stream = createAnthropicProvider().streamReading(PROMPT);
    await drain(stream);
    await expect(stream.usage).resolves.toEqual({
      inputTokens: 1364,
      outputTokens: 24,
      cachedInputTokens: 1344,
    });
  });

  it('settles usage when the consumer breaks out of the for-await early', async () => {
    // A client disconnect. The generator is abandoned mid-iteration, and its
    // finally runs when the iterator is closed -- which is what makes the
    // guarantee safe rather than hopeful.
    scripted = events([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      textDelta('one'),
      textDelta('two'),
      textDelta('three'),
    ]);

    const stream = createAnthropicProvider().streamReading(PROMPT);
    for await (const chunk of stream) {
      expect(chunk).toBe('one');
      break;
    }

    /*
     * ALL THREE NULL, and that is the honest answer rather than a regression: the
     * counts ride on `message_delta`, which an abandoned stream never reaches. The
     * settling is what matters here -- a promise that never resolves parks the
     * after() callback on its timeout for every reading a client walked away from.
     */
    await expect(
      Promise.race([
        stream.usage,
        new Promise((_, reject) => setTimeout(() => reject(new Error('never settled')), 500)),
      ]),
    ).resolves.toEqual({ inputTokens: null, outputTokens: null, cachedInputTokens: null });
  });

  it('settles usage on a thrown stream and does NOT reject it', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      scripted = events(
        [{ type: 'message_start', message: { usage: { input_tokens: 7 } } }, textDelta('a')],
        1,
      );

      const stream = createAnthropicProvider().streamReading(PROMPT);
      await expect(drain(stream)).rejects.toThrow('upstream died');
      // A stream that died before `message_delta` reported no counts at all. The
      // property under test is that it RESOLVES rather than rejects.
      await expect(stream.usage).resolves.toMatchObject({ inputTokens: null });

      // Give the loop a turn: an unhandled rejection is reported asynchronously.
      await new Promise((r) => setImmediate(r));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('starts nothing until something pulls from it', async () => {
    /*
     * The trap reconciliation R3 asked to be carried into the interface's doc
     * comment, tested so it stays true: `streamReading` returns a generator, so
     * merely calling it runs no code. W7's D8 classifier depends on this being
     * understood -- a caller that wants concurrency must pull `.next()` first.
     */
    let started = false;
    scripted = () =>
      (async function* () {
        started = true;
        yield { type: 'message_stop' } as RawEvent;
      })();

    const stream = createAnthropicProvider().streamReading(PROMPT);
    expect(started).toBe(false);
    await drain(stream);
    expect(started).toBe(true);
  });
});

/**
 * The BUFFERED path's usage, which for one release recorded the same provider fact
 * differently from the streamed one (A2-D5, reconciliation R16).
 *
 * The first case here FAILS against the code as it shipped before A2: `0 ?? null` is
 * `0`, so a buffered z.ai call stored a literal zero while a streamed one stored
 * NULL. Six ledger consumers now read this column, and a zero understates every
 * average without ever looking wrong.
 */
describe('complete() usage', () => {
  const COMPLETION = { system: 's', user: 'u', maxTokens: 100 };
  const OP = { op: 'gist' } as const;

  it('THE z.ai CASE ON THE BUFFERED PATH: input_tokens 0 is null, and a real output count survives', async () => {
    scriptedCreate = async () => ({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 0, output_tokens: 40 },
    });

    const out = await createAnthropicProvider().complete(COMPLETION, OP);
    expect(out.usage).toEqual({ inputTokens: null, outputTokens: 40, cachedInputTokens: null });
  });

  it('reports both counts when the provider reports both', async () => {
    scriptedCreate = async () => ({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1200, output_tokens: 64 },
    });

    const out = await createAnthropicProvider().complete(COMPLETION, OP);
    expect(out.usage).toEqual({ inputTokens: 1200, outputTokens: 64, cachedInputTokens: null });
  });

  it('sums the cached half on the buffered path too', async () => {
    /*
     * The buffered path is the one that was NEVER broken, which is why the stream
     * bug survived a release: half the ledger looked plausible. It still has to
     * sum, because a cached buffered call reports the same split shape.
     */
    scriptedCreate = async () => ({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 20, output_tokens: 64, cache_read_input_tokens: 256 },
    });

    const out = await createAnthropicProvider().complete(COMPLETION, OP);
    expect(out.usage).toEqual({ inputTokens: 276, outputTokens: 64, cachedInputTokens: 256 });
  });

  it('an absent usage object is all nulls, not zeroes', async () => {
    scriptedCreate = async () => ({ content: [{ type: 'text', text: 'ok' }] });

    const out = await createAnthropicProvider().complete(COMPLETION, OP);
    expect(out.usage).toEqual({ inputTokens: null, outputTokens: null, cachedInputTokens: null });
  });
});

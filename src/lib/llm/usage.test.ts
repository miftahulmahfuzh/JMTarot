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
    scripted = events([
      { type: 'message_start', message: { usage: { input_tokens: 1234 } } },
      textDelta('Hai '),
      textDelta('kamu.'),
      { type: 'message_delta', usage: { output_tokens: 88 }, delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ]);

    const stream = createAnthropicProvider().streamReading(PROMPT);
    expect(await drain(stream)).toBe('Hai kamu.');
    await expect(stream.usage).resolves.toEqual({ inputTokens: 1234, outputTokens: 88 });
  });

  it('THE z.ai CASE: input_tokens 0 resolves to null, never 0', async () => {
    // This is the one that will actually happen. A literal 0 in the column
    // would make every average silently wrong and would be indistinguishable
    // from a real zero.
    scripted = events([
      { type: 'message_start', message: { usage: { input_tokens: 0 } } },
      textDelta('halo'),
      { type: 'message_delta', usage: { output_tokens: 12 } },
    ]);

    const stream = createAnthropicProvider().streamReading(PROMPT);
    await drain(stream);
    await expect(stream.usage).resolves.toEqual({ inputTokens: null, outputTokens: 12 });
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

    await expect(
      Promise.race([
        stream.usage,
        new Promise((_, reject) => setTimeout(() => reject(new Error('never settled')), 500)),
      ]),
    ).resolves.toEqual({ inputTokens: 5, outputTokens: null });
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
      await expect(stream.usage).resolves.toMatchObject({ inputTokens: 7 });

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
    expect(out.usage).toEqual({ inputTokens: null, outputTokens: 40 });
  });

  it('reports both counts when the provider reports both', async () => {
    scriptedCreate = async () => ({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1200, output_tokens: 64 },
    });

    const out = await createAnthropicProvider().complete(COMPLETION, OP);
    expect(out.usage).toEqual({ inputTokens: 1200, outputTokens: 64 });
  });

  it('an absent usage object is two nulls, not two zeroes', async () => {
    scriptedCreate = async () => ({ content: [{ type: 'text', text: 'ok' }] });

    const out = await createAnthropicProvider().complete(COMPLETION, OP);
    expect(out.usage).toEqual({ inputTokens: null, outputTokens: null });
  });
});

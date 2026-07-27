import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIProvider } from './openai';

/**
 * The SSE parser, driven with hand-built chunk boundaries.
 *
 * **THE ONLY REASON THIS FILE EXISTS IS THAT WE PARSE SSE OURSELVES.**
 * `anthropic.ts` gets that from its SDK; this adapter takes plain `fetch` to
 * avoid a second vendor dependency, and the price of that choice is exactly one
 * class of bug: a `data:` frame split across two network reads. It is invisible
 * in any test that feeds whole frames, and in production it looks like a model
 * that occasionally drops a syllable.
 */
const PROMPT = { system: 'sys', user: 'usr', maxTokens: 64, promptVersion: 'id-v1.deadbeef' };

/** A fake `fetch` that yields exactly the byte chunks it is given. */
function streamingFetch(chunks: string[], status = 200) {
  return vi.fn(async () => {
    const encoder = new TextEncoder();
    let i = 0;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => '',
      body: {
        getReader: () => ({
          read: async () =>
            i < chunks.length
              ? { done: false, value: encoder.encode(chunks[i++]) }
              : { done: true, value: undefined },
          cancel: async () => {},
        }),
      },
    } as unknown as Response;
  });
}

const frame = (delta: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;

const usageFrame = (input: number, output: number) =>
  `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: input, completion_tokens: output } })}\n\n`;

async function drain(stream: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

beforeEach(() => {
  vi.stubEnv('LLM_API_KEY', 'sk-test');
  vi.stubEnv('LLM_MODEL', 'gpt-4.1-mini');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('streamReading', () => {
  it('yields the deltas in order', async () => {
    vi.stubGlobal('fetch', streamingFetch([frame('Hel'), frame('lo'), 'data: [DONE]\n\n']));
    expect(await drain(createOpenAIProvider().streamReading(PROMPT))).toBe('Hello');
  });

  it('SURVIVES A FRAME SPLIT MID-LINE, which is the bug this parser always has', async () => {
    /*
     * One `data:` line delivered as three network reads, splitting inside the
     * JSON and again inside a word. A `chunk.split('\n')` parser drops the whole
     * frame here and the reading silently loses a token.
     */
    const whole = frame('Menikmati');
    const a = whole.slice(0, 12);
    const b = whole.slice(12, 30);
    const c = whole.slice(30);
    vi.stubGlobal('fetch', streamingFetch([a, b, c, 'data: [DONE]\n\n']));
    expect(await drain(createOpenAIProvider().streamReading(PROMPT))).toBe('Menikmati');
  });

  it('handles several frames arriving in ONE read', async () => {
    // The other direction, and just as real: the network coalesces.
    vi.stubGlobal('fetch', streamingFetch([frame('a') + frame('b') + frame('c')]));
    expect(await drain(createOpenAIProvider().streamReading(PROMPT))).toBe('abc');
  });

  it('takes a final frame with no trailing newline', async () => {
    vi.stubGlobal('fetch', streamingFetch([`data: ${JSON.stringify({ choices: [{ delta: { content: 'x' } }] })}`]));
    expect(await drain(createOpenAIProvider().streamReading(PROMPT))).toBe('x');
  });

  it('skips an unparseable frame rather than failing the reading', async () => {
    // One lost token beats a dead stream: the querent is watching prose arrive.
    vi.stubGlobal('fetch', streamingFetch([frame('a'), 'data: {not json\n\n', frame('b')]));
    expect(await drain(createOpenAIProvider().streamReading(PROMPT))).toBe('ab');
  });

  it('reads usage from the final chunk, which only exists because we asked', async () => {
    /*
     * `stream_options: { include_usage: true }`. Without it there is no usage
     * frame at all and `readings.token_output` is null forever -- the same
     * half-blindness z.ai imposes, except self-inflicted.
     */
    vi.stubGlobal('fetch', streamingFetch([frame('hi'), usageFrame(1163, 128), 'data: [DONE]\n\n']));
    const stream = createOpenAIProvider().streamReading(PROMPT);
    await drain(stream);
    expect(await stream.usage).toEqual({ inputTokens: 1163, outputTokens: 128 });
  });

  it('SETTLES usage even when the request fails', async () => {
    /*
     * `types.ts` in caps: usage must always settle and must never reject. Nothing
     * awaits it on the hot path, so a rejection is an unhandled rejection, and a
     * promise that never settles parks the after() callback on
     * ANALYTICS_STREAM_TIMEOUT_MS for every failed reading.
     */
    vi.stubGlobal('fetch', streamingFetch([], 500));
    const stream = createOpenAIProvider().streamReading(PROMPT);
    await expect(drain(stream)).rejects.toThrow();
    expect(await stream.usage).toEqual({ inputTokens: null, outputTokens: null });
  });

  it('SETTLES usage when the consumer breaks out early', async () => {
    // The abandoned-reading path: `for await` + `break` closes the iterator and
    // runs the `finally`.
    vi.stubGlobal('fetch', streamingFetch([frame('a'), frame('b'), frame('c')]));
    const stream = createOpenAIProvider().streamReading(PROMPT);
    for await (const _ of stream) break;
    expect(await stream.usage).toEqual({ inputTokens: null, outputTokens: null });
  });

  it('CALLING IT STARTS NOTHING -- no request until something pulls', async () => {
    /*
     * The contract W7's concurrent moderation gate depends on: `gateReading`
     * primes the reading with `iterator.next()` BEFORE awaiting the verdict, and
     * that only works if building the stream is free.
     */
    const f = streamingFetch([frame('a')]);
    vi.stubGlobal('fetch', f);
    createOpenAIProvider().streamReading(PROMPT);
    expect(f).not.toHaveBeenCalled();
  });

  it('NEVER puts the response body in the error, because it echoes the question', async () => {
    /*
     * An OpenAI error body quotes part of the request, and on the reading path
     * that contains the querent's typed question inside `<pertanyaan>`. Same rule
     * as flush.ts and the moderation path: the status, and nothing else.
     */
    const secret = 'apakah dia masih memikirkan aku';
    const failing = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => `{"error":{"message":"bad request: ${secret}"}}`,
      body: null,
    }) as unknown as Response);
    vi.stubGlobal('fetch', failing);

    await expect(drain(createOpenAIProvider().streamReading(PROMPT))).rejects.toThrow(
      /openai: HTTP 400/,
    );
    await expect(drain(createOpenAIProvider().streamReading(PROMPT))).rejects.not.toThrow(
      new RegExp(secret),
    );
  });
});

describe('the request body', () => {
  const sent = () => JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);

  it('uses max_completion_tokens, which the newer models require', async () => {
    // `max_tokens` is REJECTED rather than ignored by the current models.
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    await drain(createOpenAIProvider().streamReading(PROMPT));
    expect(sent().max_completion_tokens).toBe(64);
    expect(sent().max_tokens).toBeUndefined();
  });

  it('asks for usage, or there would be none', async () => {
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    await drain(createOpenAIProvider().streamReading(PROMPT));
    expect(sent().stream_options).toEqual({ include_usage: true });
  });

  it('sends system as a message, not a top-level field', async () => {
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    await drain(createOpenAIProvider().streamReading(PROMPT));
    expect(sent().messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('OMITS temperature when unset, and sends a literal 0 when set', async () => {
    /*
     * Unset must mean the provider's default -- pinning a number would quietly
     * change all nine shipped prompts. And 0 is falsy, so a `??` or a truthiness
     * test would drop W7's classifier setting, which is what makes its JSON
     * parseable.
     */
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    await drain(createOpenAIProvider().streamReading(PROMPT));
    expect('temperature' in sent()).toBe(false);

    vi.mocked(fetch).mockClear();
    await drain(createOpenAIProvider().streamReading(PROMPT, { temperature: 0 }));
    expect(sent().temperature).toBe(0);
  });

  it('lets opts.model override LLM_MODEL, which MODERATION_MODEL depends on', async () => {
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    await drain(createOpenAIProvider().streamReading(PROMPT, { model: 'gpt-4.1-nano' }));
    expect(sent().model).toBe('gpt-4.1-nano');
  });
});

describe('complete', () => {
  it('returns the text and real token counts', async () => {
    /*
     * `input_tokens` is REAL here, unlike z.ai's `0` -- which is why `nonZero()`
     * is deliberately not copied from `anthropic.ts`. Half the cost model stops
     * being blind the moment this provider is selected.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'OK' } }],
          usage: { prompt_tokens: 36, completion_tokens: 16 },
        }),
      }) as unknown as Response),
    );
    const out = await createOpenAIProvider().complete({ system: 's', user: 'u', maxTokens: 48 });
    expect(out).toEqual({ text: 'OK', usage: { inputTokens: 36, outputTokens: 16 } });
  });

  it('returns empty text rather than throwing on a shape it did not expect', async () => {
    // A refusal or a tool call has no `content`. The gist and Lotus paths both
    // treat empty as "unusable" and fall back; a throw would be a failed reading.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response),
    );
    const out = await createOpenAIProvider().complete({ system: 's', user: 'u', maxTokens: 48 });
    expect(out.text).toBe('');
  });
});

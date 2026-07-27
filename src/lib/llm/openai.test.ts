import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIProvider, resolveBaseUrl } from './openai';

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

/** The JSON body of the first fetch this test made. */
const sentBody = () =>
  JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);

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

describe('resolveBaseUrl -- one function, three callers, no second copy', () => {
  /*
   * The scripts each had their own copy reading the ANTHROPIC variable, so a whole
   * Gemini evaluation printed `baseURL=api.anthropic.com` while talking to Google.
   * That is why this is exported and tested rather than inlined three times.
   */
  it('sends gemini to Google without anyone setting a base URL', () => {
    vi.stubEnv('OPENAI_BASE_URL', '');
    expect(resolveBaseUrl('gemini')).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
  });

  it('sends openai to OpenAI', () => {
    vi.stubEnv('OPENAI_BASE_URL', '');
    expect(resolveBaseUrl('openai')).toBe('https://api.openai.com/v1');
  });

  it('leaves zai and anthropic on LLM_BASE_URL, which is theirs alone', () => {
    vi.stubEnv('OPENAI_BASE_URL', '');
    vi.stubEnv('LLM_BASE_URL', 'https://api.z.ai/api/anthropic');
    expect(resolveBaseUrl('zai')).toBe('https://api.z.ai/api/anthropic');
  });

  it('an explicit OPENAI_BASE_URL wins over the provider default', () => {
    // For Azure, a gateway, or a Gemini host that moves.
    vi.stubEnv('OPENAI_BASE_URL', 'https://gateway.internal/v1');
    expect(resolveBaseUrl('gemini')).toBe('https://gateway.internal/v1');
  });
});

describe('the OPENAI_REASONING_EFFORT guard', () => {
  /*
   * `gpt-5.6-luna` is the designated emergency fallback, and the day it is used
   * is a bad day by definition. Forgetting one env var then produces an app that
   * looks healthy and serves blank readings -- so this is enforced, not documented.
   */
  it('REFUSES to build a reasoning-family provider with the effort unset', () => {
    vi.stubEnv('LLM_MODEL', 'gpt-5.6-luna');
    vi.stubEnv('OPENAI_REASONING_EFFORT', '');
    expect(() => createOpenAIProvider()).toThrow(/OPENAI_REASONING_EFFORT is unset/);
  });

  it('names the consequence, not just the variable', () => {
    // An error that says "unset" teaches nothing. The person reading it at 3am
    // needs to know that the alternative is silent blank readings.
    vi.stubEnv('LLM_MODEL', 'gpt-5.6-luna');
    vi.stubEnv('OPENAI_REASONING_EFFORT', '');
    expect(() => createOpenAIProvider()).toThrow(/BLANK readings/);
  });

  it('is satisfied by ANY explicit value, including one that keeps reasoning on', () => {
    // The rule is "you must have decided", not "you must disable reasoning".
    vi.stubEnv('LLM_MODEL', 'gpt-5.6-luna');
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'low');
    expect(() => createOpenAIProvider()).not.toThrow();
  });

  it('matches the FAMILY by prefix, so a future gpt-5.7 is covered too', () => {
    /*
     * A hardcoded list would silently stop protecting the moment OpenAI ships the
     * next one, and the failure it guards is invisible. A false positive costs one
     * env var; a false negative costs blank readings nobody notices.
     */
    for (const m of ['gpt-5.6-luna', 'gpt-5.7-whatever', 'gpt-5.4-mini', 'o4-mini']) {
      vi.stubEnv('LLM_MODEL', m);
      vi.stubEnv('OPENAI_REASONING_EFFORT', '');
      expect(() => createOpenAIProvider(), m).toThrow(/reasoning-family/);
    }
  });

  it('leaves the non-reasoning families alone -- they REJECT the parameter', () => {
    // gpt-4.1 and gpt-4o 400 on `reasoning_effort`, so requiring it there would
    // break the configuration that currently works.
    for (const m of ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o-mini']) {
      vi.stubEnv('LLM_MODEL', m);
      vi.stubEnv('OPENAI_REASONING_EFFORT', '');
      expect(() => createOpenAIProvider(), m).not.toThrow();
    }
  });
});

describe('reasoning effort, and the blank-reading guard', () => {
  const finishFrame = (reason: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\n`;

  it('sends nothing when neither the option nor the env is set', () => {
    /*
     * Unconditional defaulting would break the working config: the gpt-4.1 and
     * gpt-4o families REJECT `reasoning_effort` outright. No value is right for
     * both families, so the choice sits next to LLM_MODEL in the environment.
     */
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    return drain(createOpenAIProvider().streamReading(PROMPT)).then(() => {
      expect('reasoning_effort' in sentBody()).toBe(false);
    });
  });

  it('sends OPENAI_REASONING_EFFORT when set', async () => {
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'none');
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    await drain(createOpenAIProvider().streamReading(PROMPT));
    expect(sentBody().reasoning_effort).toBe('none');
  });

  it('lets the per-call option override the environment', async () => {
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'low');
    vi.stubGlobal('fetch', streamingFetch([frame('a')]));
    await drain(createOpenAIProvider().streamReading(PROMPT, { reasoningEffort: 'none' }));
    expect(sentBody().reasoning_effort).toBe('none');
  });

  it('THROWS rather than returning a blank reading when reasoning ate the budget', async () => {
    /*
     * **THE FAILURE THIS GUARD EXISTS FOR IS SILENT.** A GPT-5-family model that
     * reasons past `max_completion_tokens` closes the stream NORMALLY with
     * `finish_reason: 'length'` and zero content deltas -- so the route records a
     * completed reading, analytics records a success, no `[Bacaan terputus...]`
     * notice fires, and the querent gets a blank page. Measured on the real API:
     * two of the app's own nine Indonesian prompts came back at zero characters.
     */
    vi.stubGlobal('fetch', streamingFetch([finishFrame('length'), 'data: [DONE]\n\n']));
    await expect(drain(createOpenAIProvider().streamReading(PROMPT))).rejects.toThrow(
      /returned no content and stopped on length/,
    );
  });

  it('does NOT throw when the model legitimately produced short prose', async () => {
    // A yesno reading is one short paragraph. Hitting the ceiling with content
    // delivered is ordinary truncation, not this failure.
    vi.stubGlobal('fetch', streamingFetch([frame('Ya.'), finishFrame('length')]));
    expect(await drain(createOpenAIProvider().streamReading(PROMPT))).toBe('Ya.');
  });

  it('does NOT throw when a consumer abandons the stream', async () => {
    /*
     * An abandoned reading delivered nothing either, and that is a different
     * thing -- the querent navigated away. The check sits AFTER the loop so an
     * early `break` skips it entirely.
     */
    vi.stubGlobal('fetch', streamingFetch([frame('a'), finishFrame('length')]));
    const stream = createOpenAIProvider().streamReading(PROMPT);
    for await (const _ of stream) break;
    expect(await stream.usage).toBeDefined();
  });

  it('does NOT throw on an empty stream that stopped normally', async () => {
    // `finish_reason: 'stop'` with no content is a refusal or an empty answer --
    // the gist and Lotus paths already treat empty as unusable and fall back.
    vi.stubGlobal('fetch', streamingFetch([finishFrame('stop'), 'data: [DONE]\n\n']));
    expect(await drain(createOpenAIProvider().streamReading(PROMPT))).toBe('');
  });
});

describe('the request body', () => {
  const sent = sentBody;

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

/**
 * What a request to the model looks like once the prompt layer is done with it.
 *
 * Deliberately flat strings rather than provider message objects. Everything
 * provider-shaped stops at this boundary, which is what makes adding Gemini or
 * OpenAI later a one-file change with no caller edits.
 */
export interface ReadingPrompt {
  system: string;
  user: string;
  maxTokens: number;
  /**
   * `<locale>-v1.<sha8>`, e.g. `id-v1.3f9a2c71` (reconciliation R5), computed
   * by `buildPrompt` over the STATIC layers only.
   *
   * `readings.prompt_version` is `not null` and is otherwise unfillable. A
   * hand-bumped constant would require discipline nobody has at 11pm; a hash
   * requires none and is exact. See `build.ts` for what is and is not hashed --
   * the Lotus block, the memory block and the question are all excluded, or a
   * version would be a per-row nonce.
   */
  promptVersion: string;
}

/**
 * A non-streaming call. Nearly the same shape as a reading, different name at
 * the call site, because the two are not interchangeable in the way that
 * matters: one produces prose a person watches arrive, the other produces a
 * value the server consumes. Naming them apart is what stops someone streaming
 * a JSON parse.
 *
 * NO `promptVersion`, and that is the one real difference. It identifies a
 * READING prompt for `readings.prompt_version`; a distillation, a gist or a
 * moderation verdict is not a reading and has no such column. Requiring it here
 * would mean every completion call site inventing a value nothing reads.
 */
export type CompletionPrompt = Omit<ReadingPrompt, 'promptVersion'>;

/**
 * Token counts, when the provider reports them.
 *
 * NULLABLE ON PURPOSE. z.ai accepts Anthropic's `cache_control` marker and
 * honours no caching -- the probe came back with `input_tokens: 0` -- so a
 * number here cannot be assumed present or meaningful while pointed at it.
 */
export type ReadingUsage = { inputTokens: number | null; outputTokens: number | null };

export type LLMCallOpts = {
  signal?: AbortSignal;
  /** Overrides `LLM_MODEL` for one call: `LOTUS_MODEL` (W3), `MODERATION_MODEL` (W7). */
  model?: string;
};

/**
 * A stream of text chunks that also knows what it cost.
 *
 * AN INTERSECTION AND NOT `{ chunks, usage }` (plan D-E, settled centrally by
 * reconciliation R3). Every existing `for await` consumer -- the reading route,
 * `scripts/smoke-llm.ts`, W7's moderation gate -- keeps compiling and behaving
 * unchanged, because the usage promise is an added property rather than a new
 * shape. Four workstreams edit around this file and a breaking change here is
 * four merge conflicts.
 *
 * `usage` MUST ALWAYS SETTLE AND MUST NEVER REJECT. Nothing awaits it on the
 * hot path, so a rejection is an unhandled promise rejection -- a process
 * warning in Node today and a crash under some configurations. A stream that
 * failed resolves it with nulls; the failure is already recorded as
 * `readings.status`. A promise that never settles is worse still: it parks the
 * `after()` callback on its timeout for every failed reading.
 */
export type LLMStream = AsyncIterable<string> & { usage: Promise<ReadingUsage> };

export interface LLMProvider {
  /**
   * Plain text chunks in order, as they arrive.
   *
   * An async iterable rather than a callback or a Response: the route wraps it
   * in a ReadableStream, and tests can drain it without a server.
   *
   * **CALLING IT STARTS NOTHING.** It is an `async *` generator, so the body does
   * not run until something pulls the first value. A caller that wants it running
   * CONCURRENTLY with something else must pull `.next()` before awaiting the
   * other thing. Without that, W7's "concurrent" moderation classifier (D8) runs
   * *after* the reading instead of beside it, the user pays the full classifier
   * round trip on every reading, and nothing looks broken.
   *
   * The `usage` property is how `readings.token_input` and `token_output` get
   * filled: the counts exist only in the provider's own stream events, and an
   * `AsyncIterable<string>` throws them away by construction. **EXPECT THEM TO
   * BE NULL for as long as `LLM_PROVIDER=zai`** -- that provider reports
   * `input_tokens: 0`, which is stored as NULL rather than 0 so that no average
   * is silently wrong. That is a provider fact, not a bug, and any cost
   * dashboard has to handle it.
   */
  streamReading(prompt: ReadingPrompt, opts?: LLMCallOpts): LLMStream;

  /**
   * One shot, no streaming.
   *
   * For output the server consumes rather than shows: W3's Lotus distillation,
   * W5's gist and summary, W7's moderation classifier. Streaming into a string
   * and then parsing it is ceremony -- nobody is watching it arrive.
   *
   * `usage` must always settle and must never reject.
   */
  complete(
    prompt: CompletionPrompt,
    opts?: LLMCallOpts,
  ): Promise<{ text: string; usage: ReadingUsage }>;
}

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
}

/**
 * A non-streaming call. Same shape as a reading, different name at the call
 * site, because the two are not interchangeable in the way that matters: one
 * produces prose a person watches arrive, the other produces a value the server
 * consumes. Naming them apart is what stops someone streaming a JSON parse.
 */
export type CompletionPrompt = ReadingPrompt;

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
   * W4 WILL WIDEN THIS RETURN TYPE to `AsyncIterable<string> & { usage:
   * Promise<ReadingUsage> }` per reconciliation R3, so that `readings.token_input`
   * and `token_output` can be recorded. W3 has deliberately NOT done it: R3 makes
   * W4 the owner of this file so the interface changes once rather than three
   * times, and W3 needs only `complete()`. The types R3 specifies are declared
   * above so W4's remaining change is additive and the names cannot drift.
   */
  streamReading(prompt: ReadingPrompt, opts?: LLMCallOpts): AsyncIterable<string>;

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

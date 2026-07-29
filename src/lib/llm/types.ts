/**
 * Which half of the model-call ceiling a call draws on.
 *
 * **DEFINED HERE RATHER THAN IN `meter.ts`, WHICH IS WHERE IT BELONGS
 * CONCEPTUALLY**, because this file has no imports and must keep none: `meter.ts`
 * reaches `@/lib/ratelimit` and `@/lib/analytics/track`, and therefore
 * `next/server`, so importing the type from there would drag a request-scoped
 * runtime into every module that merely names an `LLMCallOpts` -- including
 * `scripts/`, which has no Next runtime at all. `meter.ts` re-exports it, so
 * `import type { CallClass } from '@/lib/llm/meter'` still reads correctly.
 */
export type CallClass = 'interactive' | 'deferred';

/**
 * How much a reasoning-family model may think before it answers.
 *
 * **`'none'` IS NOT AN OPTIMISATION FOR THIS APP, IT IS A REQUIREMENT**, and the
 * reason is that reasoning tokens are spent out of the SAME budget as the prose.
 * `MAX_TOKENS` here runs 350-650, which is deliberate -- the length control is the
 * product -- and a GPT-5-family model at default effort will spend all 650 on
 * reasoning and return an EMPTY string. Measured 2026-07-27 against the app's own
 * nine Indonesian prompts: two of nine came back at zero characters, and four of
 * eighteen streamed readings were cut off mid-word.
 *
 * The accepted values are the provider's, verified against the live API rather
 * than assumed: `'minimal'` is REJECTED, and `'low'` still reasons enough to
 * truncate at these ceilings.
 */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

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

/**
 * WHICH CALL THIS IS. Nine values for nine call sites, and the set is CLOSED.
 *
 * `llm_calls.op` (A2, v0.5.0) is what makes "what does a user cost" answerable by
 * purpose rather than in aggregate, and A3 groups by it. **A tenth value is a
 * reconciliation question, not an authoring convenience** -- the roadmap's seam 3:
 * A3 must not invent one and must not alias one, and `callClass.test.ts` asserts
 * that the values used across `src/**` are exactly these nine.
 *
 * DEFINED HERE, in the file with no imports, for the same reason `CallClass` is:
 * `queries/admin/calls.ts` names it and may not acquire `server-only` even
 * transitively (`contract.test.ts` walks the graph), and `scripts/` names it with no
 * Next runtime at all.
 *
 * **`translation_repair` IS SEPARATE FROM `translation` ON PURPOSE.** A repair pass
 * is a second call the querent never waited for, and folding the two hides the cost
 * of V2's repair architecture -- which is the one thing V2's own header asks to be
 * able to measure.
 */
export type LLMOp =
  | 'reading'
  | 'moderation'
  | 'gist'
  | 'day_summary'
  | 'frequency'
  | 'lotus'
  | 'persona'
  | 'translation'
  | 'translation_repair';

export type LLMCallOpts = {
  signal?: AbortSignal;
  /**
   * Which call site this is, for the ledger. **OPTIONAL HERE AND REQUIRED ON
   * `CompleteOpts`, and the split is deliberate** (A2-D8).
   *
   * This bag is shared with `streamReading`, which the decorator does NOT wrap and
   * which therefore writes no row -- so requiring `op` here would break
   * `streamReading(prompt, { signal })` at three call sites for a field nothing on
   * that path reads. The three streaming sites pass their `op` to `recordCall`
   * directly instead.
   */
  op?: LLMOp;
  /** Overrides `LLM_MODEL` for one call: `LOTUS_MODEL` (W3), `MODERATION_MODEL` (W7). */
  model?: string;
  /**
   * Sampling temperature. UNSET MEANS THE PROVIDER'S DEFAULT, which is what
   * every reading wants -- three readers who always answered identically would
   * be a worse product, and pinning a number here would quietly change the nine
   * shipped prompts.
   *
   * W7's classifier sets `0` (its D4). It is the one call in this app whose
   * output is parsed rather than read, and a JSON object that varies run to run
   * is a parser failure waiting for a Tuesday. It lives on the OPTS rather than
   * on `CompletionPrompt` for the same reason `model` does: it is a property of
   * how this one call is made, not of the prompt that was built.
   */
  temperature?: number;
  /**
   * Which half of the model-call ceiling this call draws on (`meter.ts`).
   *
   * DEFAULT IS `interactive` AND THAT IS THE SAFE DEFAULT: a new call site that
   * forgets to say is treated as something a person is waiting for, so the
   * failure of omission is "shed too late", never "shed a reading early".
   *
   * THE RULE: if a user is watching a spinner for these bytes, it is
   * interactive. Everything that happens in `after()`, or whose absence is a
   * cache miss nobody can name, is deferred -- and deferred is shed FIRST, so
   * that a quota running low costs a slightly less specific reading rather than
   * a 429.
   *
   * `meter.test.ts` and `callClass.test.ts` hold the two halves of this: what the
   * tiers do, and which call site declares what.
   */
  callClass?: CallClass;
  /**
   * Reasoning budget, for the providers that have one. Ignored by `anthropic.ts`.
   *
   * **UNSET DOES NOT MEAN "no reasoning" -- IT MEANS THE PROVIDER'S DEFAULT**,
   * which for the GPT-5 family is enough to consume this app's entire token
   * ceiling and return nothing. `OPENAI_REASONING_EFFORT` sets it per deployment;
   * this field overrides that for one call. See `ReasoningEffort`.
   */
  reasoningEffort?: ReasoningEffort;
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

/**
 * `complete()`'s opts, with `op` REQUIRED.
 *
 * **THIS IS THE METHOD THE DECORATOR WRITES A LEDGER ROW FOR**, so a buffered call
 * site that does not declare itself would produce a row with no purpose -- a cost
 * the dashboard can see and cannot attribute. Requiring it at the interface turns
 * that omission into a compile error rather than into a `group by` with a blank in
 * it.
 *
 * Adapters keep `opts?: LLMCallOpts` and need no edit: a parameter of a wider type
 * accepts a narrower argument (bivariance), and neither adapter reads `op`.
 */
export type CompleteOpts = LLMCallOpts & { op: LLMOp };

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
   *
   * **`opts` IS REQUIRED AND SO IS ITS `op`** (A2). Every call through here is
   * metered and recorded; see `CompleteOpts`.
   */
  complete(
    prompt: CompletionPrompt,
    opts: CompleteOpts,
  ): Promise<{ text: string; usage: ReadingUsage }>;
}

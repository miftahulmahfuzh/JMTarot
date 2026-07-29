import 'server-only';

import { classifyStreamError } from '@/lib/analytics/tee';
import { createAnthropicProvider } from './anthropic';
import { createOpenAIProvider } from './openai';
import { recordCall, resolvedModel } from './ledger';
import { ModelCeilingError, reserveModelCall } from './meter';
import type { CompleteOpts, CompletionPrompt, LLMProvider } from './types';

export type { LLMProvider, ReadingPrompt } from './types';

/**
 * Pick the adapter from LLM_PROVIDER.
 *
 * `zai` and `anthropic` share one adapter because they share a wire format.
 * They are still listed separately so the env var says which service is
 * actually being billed, and so a future divergence has somewhere to go.
 *
 * **`openai` IS THE SECOND FUNDED PROVIDER, AND IT IS INSURANCE RATHER THAN A
 * PREFERENCE.** z.ai's FAQ says the Coding Plan is "strictly limited to use
 * within officially supported tools and products" and JMTarot is not one of
 * them, so the single-provider risk is a terms decision nothing in this repo can
 * bound. Switching is `LLM_PROVIDER` plus `LLM_MODEL` and nothing else --
 * which is exactly what the sentence below promised, now demonstrated rather
 * than asserted.
 *
 * **AND SINCE V9 EVERY `complete()` CALL PASSES THE MODEL-CALL CEILING ON THE WAY
 * OUT.** That is what makes the ceiling a property of reaching a model rather
 * than of remembering to ask: `getProvider()` is the only way to reach one.
 */
export function getProvider(): LLMProvider {
  const name = process.env.LLM_PROVIDER ?? 'zai';
  switch (name) {
    case 'zai':
    case 'anthropic':
      return metered(createAnthropicProvider());
    case 'openai':
      return metered(createOpenAIProvider());
    /*
     * **GEMINI IS THE OPENAI ADAPTER WITH A DIFFERENT HOST**, because Google ships
     * an OpenAI-compatible endpoint that accepts this app's exact request shape.
     * Verified end to end rather than assumed: streaming with usage frames,
     * `temperature: 0` for the classifier, and no thinking overhead at the app's
     * token ceilings.
     *
     * It is a NAMED PROVIDER rather than `openai` plus an `OPENAI_BASE_URL` the
     * operator has to remember, because this is the emergency-failover path and
     * the day it is used is a bad day. Forgetting the base URL there would send a
     * Google key to OpenAI and 401 in a way that reads like a bad key.
     */
    case 'gemini':
      return metered(createOpenAIProvider());
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${name}`);
  }
}

/**
 * The ceiling, wrapped around `complete()` ONLY.
 *
 * ── WHY `streamReading` IS NOT WRAPPED HERE, AND MUST NOT BE ────────────────
 *
 * `LLMStream` is an intersection of `AsyncIterable<string>` and `{ usage }`, and
 * `types.ts` states in caps that **`usage` must always settle and must never
 * reject** -- nothing awaits it on the hot path, so a rejection is an unhandled
 * promise rejection, which is a process warning today and a crash under some
 * configurations. Wrapping a stream means rebuilding that contract by hand inside
 * a decorator: deciding what `usage` resolves to when the reservation was refused
 * before any request existed, and keeping "calling it starts nothing" true through
 * the wrapper. Getting either subtly wrong produces a warning under load and
 * nothing at all in a test.
 *
 * **SO THE READING RESERVES EXPLICITLY IN `/api/reading`**, next to the three
 * budgets already there -- which is also the only place that can turn a refusal
 * into the 429 it has to become, with the right `retry-after`. One call site,
 * visible, beside its siblings. **If you "finish the job" by wrapping the stream
 * as well, there will be two reservations per reading and a ceiling that is half
 * what it says.**
 *
 * What this decorator DOES cover is everything else: the moderation classifier,
 * the gist, the day summary, the frequency verdict, the Lotus distillation, and
 * V2's translations and V8's persona when they land. None of them needs to know
 * the ceiling exists.
 *
 * ── AND SINCE A2 IT IS ALSO THE LEDGER'S CHOKEPOINT ──────────────────────────
 *
 * **ALL SIX BUFFERED CALL SITES ARE COVERED HERE WITH NO CALLER EDIT BEYOND
 * PASSING `op`** (A-D5's mechanism 1). `getProvider()` is the only way to reach a
 * provider, so a `complete()` that writes no row is not reachable -- and `op` being
 * required on `CompleteOpts` makes a new site that forgets to declare itself a
 * compile error rather than a cost the dashboard cannot attribute.
 *
 * The stream stays unwrapped for the ledger too, and that is not an omission: the
 * three streaming sites each write their own row at the point where the work is over
 * and the response has flushed, because only they know the outcome. `tee.ts` gets
 * zero lines (reconciliation R2) -- `ReadingOutcome` already carries status,
 * `errorKind`, `totalMs` and `usage`, and `teeReading` is a pure function over an
 * async iterable with no request scope and no handle.
 */
function metered(provider: LLMProvider): LLMProvider {
  return {
    // Unwrapped, deliberately. Read the comment above before changing this line.
    streamReading: provider.streamReading,

    async complete(prompt: CompletionPrompt, opts: CompleteOpts) {
      /*
       * `interactive` IS THE DEFAULT AND IT IS THE SAFE ONE: a call site that
       * forgets to declare is treated as something a person is waiting for, so the
       * failure of omission is "shed too late", never "shed a reading early".
       */
      const callClass = opts.callClass ?? 'interactive';
      const reservation = await reserveModelCall(callClass);
      /*
       * **A CEILING REFUSAL WRITES NO ROW** (A2-D6, reconciliation R4). It never
       * reached a provider, so there is no call to record -- and a row for it would
       * destroy `count(*)` as "calls made", which is the quantity
       * `LLM_WINDOW_CALL_CEILING=280` is expressed in and the one A3's meter
       * reconstructs. Every A3 query would then need `where status <> 'refused'` and
       * the first to forget it under-reports headroom. The refusal is already
       * recorded, with a user id and a tier, by `llm.ceiling_reached`.
       */
      if (!reservation.ok) throw new ModelCeilingError(reservation.tier);

      /*
       * MEASURED FROM HERE, AFTER THE RESERVATION. The ledger's `total_ms` times the
       * CALL and not the request (A2-D4), and a Redis round trip is not the model
       * thinking. `performance.now()` rather than `Date.now()` for the same reason
       * `tee.ts` uses it: it is monotonic, so a clock adjustment cannot produce a
       * negative duration.
       */
      const startedAt = performance.now();
      try {
        const result = await provider.complete(prompt, opts);
        /*
         * `void`, LIKE `track()`. There is nothing useful to do with the promise and
         * it is already resolved on both scheduled branches -- awaiting it here would
         * put a database round trip on the moderation classifier's path, which is the
         * one call whose p95 budget is the reason `MODERATION_MODEL` exists at all.
         * A-D6 forbids it in words.
         */
        void recordCall({
          op: opts.op,
          model: resolvedModel(opts),
          callClass,
          streamed: false,
          status: 'ok',
          errorKind: null,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalMs: Math.round(performance.now() - startedAt),
        });
        return result;
      } catch (err) {
        void recordCall({
          op: opts.op,
          model: resolvedModel(opts),
          callClass,
          streamed: false,
          /*
           * `'failed'` AND NOT `'partial'`. A buffered call has one arrival: either
           * the text came back or it did not, and there is no half of it to have
           * received. `'partial'` belongs to the three streaming sites, which can lose
           * a stream after the querent has already read some of it.
           */
          status: 'failed',
          errorKind: classifyStreamError(err),
          // NULL rather than 0: nothing was reported, and the tokens the provider may
          // have charged for are not knowable from here.
          inputTokens: null,
          outputTokens: null,
          totalMs: Math.round(performance.now() - startedAt),
        });
        /*
         * **RETHROW, ALWAYS.** Every one of the six callers depends on `complete()`
         * throwing -- each has its own `catch` that falls back to a template, a 204 or
         * the untranslated source. A decorator that swallowed this to "record and
         * continue" would hand every one of them an undefined `text`.
         */
        throw err;
      }
    },
  };
}

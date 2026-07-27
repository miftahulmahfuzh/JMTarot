import 'server-only';

import { createAnthropicProvider } from './anthropic';
import { createOpenAIProvider } from './openai';
import { ModelCeilingError, reserveModelCall } from './meter';
import type { CompletionPrompt, LLMCallOpts, LLMProvider } from './types';

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
 */
function metered(provider: LLMProvider): LLMProvider {
  return {
    // Unwrapped, deliberately. Read the comment above before changing this line.
    streamReading: provider.streamReading,

    async complete(prompt: CompletionPrompt, opts?: LLMCallOpts) {
      /*
       * `interactive` IS THE DEFAULT AND IT IS THE SAFE ONE: a call site that
       * forgets to declare is treated as something a person is waiting for, so the
       * failure of omission is "shed too late", never "shed a reading early".
       */
      const reservation = await reserveModelCall(opts?.callClass ?? 'interactive');
      if (!reservation.ok) throw new ModelCeilingError(reservation.tier);

      return provider.complete(prompt, opts);
    },
  };
}

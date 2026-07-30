import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '@/lib/env';
import type {
  CompletionPrompt,
  LLMCallOpts,
  LLMProvider,
  LLMStream,
  ReadingPrompt,
  ReadingUsage,
} from './types';

/**
 * A reported zero is absence, not a measurement.
 *
 * A literal `0` in `readings.token_input` would make every average silently
 * wrong and would be indistinguishable from a real zero, so the columns are
 * nullable and absence is stored as absence.
 *
 * **APPLY THIS TO THE TOTAL, NEVER TO A PART.** `input_tokens: 20` beside
 * `cache_read_input_tokens: 1344` is a real and common shape; nulling either half
 * on its own would throw away 98% of the count.
 */
function nonZero(n: number | null | undefined): number | null {
  return typeof n === 'number' && n > 0 ? n : null;
}

/** What this wire format reports about one call's input side. */
type AnthropicUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
} | null | undefined;

/**
 * Total input tokens for an Anthropic-shaped usage object, and the cached subset.
 *
 * **ON THIS WIRE `input_tokens` EXCLUDES WHAT CAME FROM CACHE**, so the total is a
 * SUM. The OpenAI adapter must not copy this -- there `prompt_tokens` already
 * includes the cached tokens and summing double-counts them. See `ReadingUsage`.
 *
 * Measured against z.ai 2026-07-30: a fresh prompt reported
 * `{input_tokens: 1364, cache_read_input_tokens: 0}` and the same prompt re-sent
 * reported `{input_tokens: 20, cache_read_input_tokens: 1344}`. Both total 1364.
 *
 * `cache_creation_input_tokens` is summed into the total but not returned
 * separately: z.ai reports none, and Anthropic proper would deserve its own column
 * and its own price row rather than being folded in silently here.
 */
function inputSides(usage: AnthropicUsage): {
  inputTokens: number | null;
  cachedInputTokens: number | null;
} {
  if (!usage) return { inputTokens: null, cachedInputTokens: null };
  const fresh = usage.input_tokens ?? 0;
  const cached = usage.cache_read_input_tokens ?? 0;
  const created = usage.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: nonZero(fresh + cached + created),
    // NOT `nonZero`: a reported 0 here means "nothing came from cache", which is a
    // measurement. Absence is only absent when the whole usage object was.
    cachedInputTokens: typeof usage.cache_read_input_tokens === 'number' ? cached : null,
  };
}

/**
 * Serves both Anthropic proper and z.ai's Anthropic-compatible proxy.
 *
 * The wire format is identical -- verified against the live z.ai endpoint:
 * textbook Anthropic SSE, `message_start` / `content_block_delta` with
 * `text_delta` / `message_stop`. So only baseURL, key and model differ, and
 * one adapter covers both.
 *
 * z.ai authenticates on the `x-api-key` header, which is what the SDK's
 * `apiKey` option sets. Do not switch to `authToken` -- that sends
 * `Authorization: Bearer` instead and z.ai rejects it.
 */
export function createAnthropicProvider(): LLMProvider {
  const client = new Anthropic({
    apiKey: requireEnv('LLM_API_KEY'),
    // undefined => api.anthropic.com, which is what a real Anthropic key wants.
    baseURL: process.env.LLM_BASE_URL,
  });
  const model = requireEnv('LLM_MODEL');

  return {
    streamReading({ system, user, maxTokens }: ReadingPrompt, opts?: LLMCallOpts): LLMStream {
      let resolveUsage!: (u: ReadingUsage) => void;
      const usage = new Promise<ReadingUsage>((resolve) => {
        resolveUsage = resolve;
      });

      async function* iterate() {
        /*
         * THE REQUEST IS OPENED HERE, INSIDE THE GENERATOR, not in the enclosing
         * function -- which is what keeps the interface's "calling it starts
         * nothing" contract literally true rather than nearly true. Hoisting it
         * out would also mean a caller that builds a stream and then returns
         * early has silently opened and abandoned a connection.
         */
        const upstream = client.messages.stream(
          {
            model: opts?.model ?? model,
            max_tokens: maxTokens,
            /*
             * `cache_control` IS HONOURED BY z.ai, AND THIS COMMENT SAID THE
             * OPPOSITE FOR TWO RELEASES. Re-measured 2026-07-30: the same system
             * prompt re-sent came back with `cache_read_input_tokens: 1344` of a
             * 1364-token prompt. The marker is doing real work -- for latency, for
             * the 5-hour prompt quota, and for what a fallback provider would bill.
             *
             * Recorded rather than quietly corrected, because the old claim was
             * derived from `message_start`, where every count is 0 on this wire.
             */
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: user }],
          },
          opts?.signal ? { signal: opts.signal } : undefined,
        );

        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        let cachedInputTokens: number | null = null;
        try {
          for await (const event of upstream) {
            /*
             * **THE INPUT COUNT IS READ FROM `message_delta`, NOT `message_start`,
             * AND READING IT FROM THE WRONG EVENT IS THE BUG THIS CODE SHIPPED
             * WITH.** On this wire `message_start.usage` is `{input_tokens: 0,
             * output_tokens: 0}` on every stream -- a placeholder sent before the
             * prompt has been counted -- and the real figures arrive in the final
             * `message_delta`. So every streamed reading recorded NULL input
             * tokens for a whole release while the number was on the wire, and the
             * dashboard's own footnote grew up around the absence.
             *
             * Do not "restore" the `message_start` read as a fallback: it would
             * never fire, and it is the sentence that made this look correct.
             */
            if (event.type === 'message_delta') {
              const sides = inputSides(event.usage);
              inputTokens = sides.inputTokens;
              cachedInputTokens = sides.cachedInputTokens;
              outputTokens = nonZero(event.usage?.output_tokens);
            }
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              yield event.delta.text;
            }
          }
        } finally {
          /*
           * RESOLVE ON EVERY EXIT PATH -- normal end, thrown error, and the
           * early return a consumer causes by breaking out of its `for await`,
           * which runs this `finally` when the iterator is closed.
           *
           * A `usage` promise that never settles parks the after() callback on
           * ANALYTICS_STREAM_TIMEOUT_MS for every failed or abandoned reading,
           * which is 45 seconds of a paid invocation for a number nobody got.
           * Resolving, never rejecting: nothing awaits this on the hot path, so
           * a rejection would be unhandled.
           */
          resolveUsage({ inputTokens, outputTokens, cachedInputTokens });
        }
      }

      // Object.assign rather than a class, so the return value IS the generator
      // and the "calling it starts nothing" contract in types.ts still holds.
      return Object.assign(iterate(), { usage });
    },

    /**
     * One shot. `messages.create`, not `messages.stream`.
     *
     * The SDK returns content as an array of blocks; only `text` blocks carry
     * prose, and a model that emitted a tool-use block would otherwise stringify
     * as `[object Object]` into whatever tries to JSON.parse it. Joining the text
     * blocks and ignoring the rest is the honest reading of the shape.
     */
    async complete({ system, user, maxTokens }: CompletionPrompt, opts?: LLMCallOpts) {
      const message = await client.messages.create(
        {
          model: opts?.model ?? model,
          max_tokens: maxTokens,
          // Spread rather than `temperature: opts?.temperature`: an explicit
          // `undefined` is serialized by the SDK as a present null-ish field on
          // some paths, and 0 is falsy, so neither `??` nor a truthiness test
          // would express "unset means the provider's default" correctly.
          ...(opts?.temperature === undefined ? {} : { temperature: opts.temperature }),
          system: [{ type: 'text', text: system }],
          messages: [{ role: 'user', content: user }],
        },
        opts?.signal ? { signal: opts.signal } : undefined,
      );

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      /*
       * Never throws and always settles, per the interface.
       *
       * **THIS PATH WAS NEVER BROKEN, WHICH IS WHY THE STREAM BUG SURVIVED.** The
       * non-streaming response carries `usage.input_tokens` fully populated on
       * z.ai -- measured at 276 on 2026-07-30 -- so moderation, gist, lotus and
       * persona rows carried real input counts all along while every streamed
       * reading recorded NULL. Half the ledger looked plausible, so nobody read
       * the other half as a bug.
       *
       * **`nonZero()` HERE TOO, AND FOR ONE RELEASE IT WAS ONLY ON THE STREAM**
       * (A2-D5, reconciliation R16). One adapter recorded one provider fact two
       * ways: a streamed call stored NULL for z.ai's absent input count and a
       * buffered call stored `0`, from the same provider, for the same absence.
       * Nothing read the buffered value, which is exactly why this was the moment
       * to fix it rather than the reason to leave it -- A2's ledger gives it six
       * consumers, and `0` is indistinguishable from a real zero in a dump and
       * makes every average silently wrong. **Absence is NULL, never 0.**
       *
       * `openai.ts` deliberately does NOT copy this and its comment says why: a
       * zero from OpenAI would be a fact worth seeing. Preserve that asymmetry.
       */
      const usage: ReadingUsage = {
        ...inputSides(message.usage),
        outputTokens: nonZero(message.usage?.output_tokens),
      };

      return { text, usage };
    },
  };
}

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
 * z.ai reports `input_tokens: 0` -- verified against the live endpoint and
 * recorded in the rewrite plan §4.
 *
 * A literal `0` in `readings.token_input` would make every average silently
 * wrong and would be indistinguishable from a real zero, so the columns are
 * nullable and absence is stored as absence.
 */
function nonZero(n: number | null | undefined): number | null {
  return typeof n === 'number' && n > 0 ? n : null;
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
             * `cache_control` is correct for Anthropic and inert on z.ai, which
             * accepts the marker but honours no caching -- the probe came back
             * with no `cache_read_input_tokens` and `input_tokens: 0`. Left in
             * because it is free and right for the other provider, but do not
             * build anything that depends on caching or on usage numbers while
             * pointed at z.ai.
             */
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: user }],
          },
          opts?.signal ? { signal: opts.signal } : undefined,
        );

        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        try {
          for await (const event of upstream) {
            if (event.type === 'message_start') {
              inputTokens = nonZero(event.message.usage?.input_tokens);
            }
            if (event.type === 'message_delta') {
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
          resolveUsage({ inputTokens, outputTokens });
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
       * Never throws and always settles, per the interface. z.ai reports
       * `input_tokens: 0` and honours no caching, so these are recorded as
       * nullable rather than trusted -- do not build a cost model on them while
       * pointed at that provider.
       */
      const usage: ReadingUsage = {
        inputTokens: message.usage?.input_tokens ?? null,
        outputTokens: message.usage?.output_tokens ?? null,
      };

      return { text, usage };
    },
  };
}

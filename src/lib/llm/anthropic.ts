import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '@/lib/env';
import type {
  CompletionPrompt,
  LLMCallOpts,
  LLMProvider,
  ReadingPrompt,
  ReadingUsage,
} from './types';

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
    async *streamReading({ system, user, maxTokens }: ReadingPrompt, opts?: LLMCallOpts) {
      const stream = client.messages.stream({
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
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
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

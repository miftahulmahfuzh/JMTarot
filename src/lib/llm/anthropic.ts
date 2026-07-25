import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '@/lib/env';
import type { LLMProvider, ReadingPrompt } from './types';

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
    async *streamReading({ system, user, maxTokens }: ReadingPrompt) {
      const stream = client.messages.stream({
        model,
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
  };
}

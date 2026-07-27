import 'server-only';

import { createAnthropicProvider } from './anthropic';
import type { LLMProvider } from './types';

export type { LLMProvider, ReadingPrompt } from './types';

/**
 * Pick the adapter from LLM_PROVIDER.
 *
 * `zai` and `anthropic` share one adapter because they share a wire format.
 * They are still listed separately so the env var says which service is
 * actually being billed, and so a future divergence has somewhere to go.
 *
 * Adding Gemini or OpenAI means one new file implementing LLMProvider and one
 * new case here. No caller changes -- that is the point of the interface.
 */
export function getProvider(): LLMProvider {
  const name = process.env.LLM_PROVIDER ?? 'zai';
  switch (name) {
    case 'zai':
    case 'anthropic':
      return createAnthropicProvider();
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${name}`);
  }
}

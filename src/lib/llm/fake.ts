import 'server-only';

/**
 * A fake `LLMStream`, for tests that need a stream and not a provider.
 *
 * IN `src/lib/llm/` AND NOT INSIDE A TEST FILE, on purpose: W5, W6 and W7 all
 * need one, and three private copies would drift from the real interface the
 * moment it changes. It is the same shape the real adapter returns -- an async
 * generator with a `usage` promise attached -- so anything that works against
 * this works against z.ai.
 *
 * NOT bundled into the app: nothing under `src/app/**` imports it.
 */
import type { LLMStream, ReadingUsage } from './types';

export type FakeStreamOpts = {
  /** Throw after N chunks have been yielded. 0 fails before any text arrives. */
  failAfter?: number;
  usage?: Partial<ReadingUsage>;
  /** Await between chunks, so a cancellation has somewhere to land. */
  delayMs?: number;
  /** What to throw. Defaults to a plain Error. */
  error?: unknown;
};

export function fakeStream(chunks: string[], opts: FakeStreamOpts = {}): LLMStream {
  const { failAfter, delayMs = 0, error } = opts;

  let resolveUsage!: (u: ReadingUsage) => void;
  const usage = new Promise<ReadingUsage>((resolve) => {
    resolveUsage = resolve;
  });

  async function* iterate() {
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (failAfter !== undefined && i >= failAfter) {
          throw error ?? new Error('upstream died');
        }
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        yield chunks[i];
      }
      // failAfter beyond the chunk list still fails, so "fails at the very end"
      // is expressible.
      if (failAfter !== undefined && failAfter >= chunks.length) {
        throw error ?? new Error('upstream died');
      }
    } finally {
      // The same guarantee the real provider makes, for the same reason: always
      // settles, never rejects.
      resolveUsage({
        inputTokens: opts.usage?.inputTokens ?? null,
        outputTokens: opts.usage?.outputTokens ?? null,
      });
    }
  }

  return Object.assign(iterate(), { usage });
}

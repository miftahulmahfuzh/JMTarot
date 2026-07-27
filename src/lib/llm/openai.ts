import 'server-only';

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
 * OpenAI's Chat Completions API, over plain `fetch`.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * **INSURANCE AGAINST A KEY THAT CAN BE REVOKED.** z.ai's own FAQ says the GLM
 * Coding Plan is *"strictly limited to use within officially supported tools and
 * products"*, and JMTarot is not one of them. V9 can bound the quota; nothing in
 * this repository can bound a terms decision, and the consequence of one is the
 * whole app at once, because there is a single provider behind readings,
 * moderation, gists, summaries, verdicts, the Lotus and (soon) translations.
 * `LLM_PROVIDER=openai` is the switch that makes that survivable.
 *
 * ── WHY NO SDK ──────────────────────────────────────────────────────────────
 *
 * `@anthropic-ai/sdk` is already a dependency and serves two providers, so it
 * pays for itself. A second SDK would be a second dependency for one adapter,
 * in a project with eleven runtime dependencies and a CLAUDE.md largely composed
 * of things that broke. What we need from it is one POST and an SSE reader; the
 * wire format is stable and public, and `fetch` is built in.
 *
 * **The cost is that the SSE parsing below is ours to get right**, which is why
 * it is written out rather than compressed, and why `openai.test.ts` drives it
 * with hand-built chunk boundaries -- including a frame split mid-line, which is
 * the bug this kind of code always has.
 *
 * ── THE FOUR PLACES THIS DIFFERS FROM `anthropic.ts` ────────────────────────
 *
 * 1. **`max_completion_tokens`, not `max_tokens`.** The newer models reject the
 *    old name outright rather than ignoring it.
 * 2. **`system` is a message, not a top-level field.**
 * 3. **Usage arrives in a FINAL CHUNK that only appears if you ask**, via
 *    `stream_options: { include_usage: true }`. Without it a streamed reading
 *    reports null tokens forever and `readings.token_output` is empty -- the same
 *    half-blindness z.ai already imposes, except self-inflicted.
 * 4. **`input_tokens` is REAL here**, unlike z.ai's `0`. So `nonZero()` is
 *    deliberately NOT copied over: a genuine zero-token prompt is impossible and
 *    a zero from OpenAI would be a fact worth seeing, not noise worth hiding.
 */

/** `https://api.openai.com/v1` unless overridden -- an Azure or gateway host. */
function baseUrl(): string {
  return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

type ChatMessage = { role: 'system' | 'user'; content: string };

function body(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  opts: LLMCallOpts | undefined,
  stream: boolean,
) {
  return JSON.stringify({
    model,
    messages,
    max_completion_tokens: maxTokens,
    /*
     * Spread rather than a plain property, for the reason `anthropic.ts` gives:
     * `temperature: 0` is falsy, so neither `??` nor a truthiness test expresses
     * "unset means the provider's default". W7's classifier is the only caller
     * that sets it, and it needs the 0 to survive.
     */
    ...(opts?.temperature === undefined ? {} : { temperature: opts.temperature }),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  });
}

async function post(path: string, payload: string, opts?: LLMCallOpts): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${requireEnv('LLM_API_KEY')}`,
    },
    body: payload,
    signal: opts?.signal,
  });

  if (!res.ok) {
    /*
     * **THE BODY IS READ AND THROWN AWAY, AND ONLY THE STATUS IS RAISED.** An
     * OpenAI error body echoes back part of the request -- which, on the reading
     * path, contains the querent's typed question inside `<pertanyaan>`. Putting
     * that in an Error message puts it in whatever logs the error, which is the
     * rule `flush.ts` and the moderation path already state in caps.
     *
     * Reading it at all is not optional: an unread body on a failed response
     * leaks the socket.
     */
    await res.text().catch(() => '');
    throw new Error(`openai: HTTP ${res.status}`);
  }
  return res;
}

/**
 * One SSE frame at a time, across chunk boundaries.
 *
 * **THE BUFFER IS THE WHOLE POINT.** A network chunk is not a message: a single
 * `data:` line is routinely split across two reads, and a naive
 * `chunk.split('\n')` drops or corrupts the token that straddles them. The
 * symptom is a reading with occasional missing syllables, which reads as a bad
 * model rather than a bad parser.
 */
async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield line;
      }
    }
    // Whatever is left with no trailing newline is still a frame.
    const tail = buffer.trim();
    if (tail) yield tail;
  } finally {
    // Cancel on early return too -- a consumer that breaks out of its `for await`
    // must not leave the socket open for the rest of the invocation.
    await reader.cancel().catch(() => {});
  }
}

type Delta = {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null;
};

export function createOpenAIProvider(): LLMProvider {
  const model = requireEnv('LLM_MODEL');

  return {
    streamReading({ system, user, maxTokens }: ReadingPrompt, opts?: LLMCallOpts): LLMStream {
      let resolveUsage!: (u: ReadingUsage) => void;
      const usage = new Promise<ReadingUsage>((resolve) => {
        resolveUsage = resolve;
      });

      async function* iterate() {
        // Opened INSIDE the generator, so "calling it starts nothing" stays
        // literally true. See the same comment in `anthropic.ts`.
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;

        try {
          const res = await post(
            '/chat/completions',
            body(
              opts?.model ?? model,
              [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              maxTokens,
              opts,
              true,
            ),
            opts,
          );

          for await (const line of sseLines(res)) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') break;

            let event: Delta;
            try {
              event = JSON.parse(payload) as Delta;
            } catch {
              // A frame we cannot parse is one token lost, not a failed reading.
              continue;
            }

            if (event.usage) {
              inputTokens = event.usage.prompt_tokens ?? null;
              outputTokens = event.usage.completion_tokens ?? null;
            }

            const text = event.choices?.[0]?.delta?.content;
            if (text) yield text;
          }
        } finally {
          /*
           * RESOLVE ON EVERY EXIT PATH -- normal end, thrown error, and the early
           * return a consumer causes by breaking out of its `for await`. A `usage`
           * promise that never settles parks the after() callback on
           * ANALYTICS_STREAM_TIMEOUT_MS for every failed or abandoned reading.
           * Resolving, never rejecting: nothing awaits this on the hot path.
           */
          resolveUsage({ inputTokens, outputTokens });
        }
      }

      return Object.assign(iterate(), { usage });
    },

    async complete({ system, user, maxTokens }: CompletionPrompt, opts?: LLMCallOpts) {
      const res = await post(
        '/chat/completions',
        body(
          opts?.model ?? model,
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          maxTokens,
          opts,
          false,
        ),
        opts,
      );

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number | null; completion_tokens?: number | null };
      };

      return {
        text: json.choices?.[0]?.message?.content ?? '',
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? null,
          outputTokens: json.usage?.completion_tokens ?? null,
        },
      };
    },
  };
}

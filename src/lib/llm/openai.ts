import 'server-only';

import { requireEnv } from '@/lib/env';
import type {
  CompletionPrompt,
  LLMCallOpts,
  LLMProvider,
  LLMStream,
  ReadingPrompt,
  ReadingUsage,
  ReasoningEffort,
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

/**
 * Google's OpenAI-compatible endpoint.
 *
 * **GEMINI NEEDS NO ADAPTER OF ITS OWN**, verified end to end: it accepts this
 * file's exact request shape -- `max_completion_tokens`, `system` as a message,
 * `stream: true` with `stream_options: {include_usage: true}` -- returns real
 * `prompt_tokens`, and accepts `temperature: 0`, which the moderation classifier
 * needs. So `LLM_PROVIDER=gemini` is this adapter with one constant swapped.
 */
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

/**
 * Where the adapter will actually send traffic.
 *
 * **EXPORTED BECAUSE THE SCRIPTS HAD THEIR OWN COPY AND IT WAS WRONG.**
 * `smoke-llm.ts` and `probe-moderation.ts` printed
 * `LLM_BASE_URL ?? 'api.anthropic.com'` -- the ANTHROPIC variable -- so a whole
 * Gemini evaluation reported `baseURL=api.anthropic.com` while talking to Google.
 * One function, three callers, no second copy to drift.
 *
 * `OPENAI_BASE_URL` still overrides, for Azure, a gateway, or a Gemini host that
 * moves. It is deliberately checked FIRST so an explicit setting always wins.
 */
export function resolveBaseUrl(provider = process.env.LLM_PROVIDER ?? 'zai'): string {
  /*
   * **THE PROVIDER IS CHECKED BEFORE THE OVERRIDE, AND THE FIRST DRAFT OF THIS
   * FUNCTION HAD IT THE OTHER WAY ROUND.** `OPENAI_BASE_URL` belongs to the
   * OpenAI-shaped providers only; consulting it first meant that `zai` with a
   * leftover `OPENAI_BASE_URL` in `.env.local` -- which is exactly what this
   * repository looks like after an afternoon of provider evaluation -- reported
   * the OpenAI host while talking to z.ai.
   *
   * That is the same class of bug this function was written to FIX: a banner
   * that lies about where the traffic is going. Display-only today, because
   * `baseUrl()` is reached only from the OpenAI adapter, and not worth leaving
   * for the day someone makes it load-bearing.
   */
  if (provider === 'openai' || provider === 'gemini') {
    if (process.env.OPENAI_BASE_URL) return process.env.OPENAI_BASE_URL.replace(/\/+$/, '');
    return provider === 'gemini' ? GEMINI_BASE_URL : 'https://api.openai.com/v1';
  }
  return process.env.LLM_BASE_URL ?? 'api.anthropic.com';
}

function baseUrl(): string {
  return resolveBaseUrl().replace(/\/+$/, '');
}

type ChatMessage = { role: 'system' | 'user'; content: string };

/**
 * The reasoning budget for this call: the per-call option, else the deployment's
 * `OPENAI_REASONING_EFFORT`, else nothing at all.
 *
 * **SENDING NOTHING IS THE RIGHT DEFAULT AND IT IS ALSO THE DANGEROUS ONE.** The
 * `gpt-4.1` and `gpt-4o` families REJECT `reasoning_effort` outright, so an
 * unconditional default would break the configuration that currently works. The
 * GPT-5 family accepts it and needs `'none'` to fit this app's ceilings at all.
 * There is no value that is correct for both, so the choice belongs with the
 * model choice -- in the environment, next to `LLM_MODEL`.
 *
 * The trap that leaves is handled downstream rather than here: `streamReading`
 * refuses to return an empty reading silently. See `EmptyReasoningError`.
 */
function effortFor(opts: LLMCallOpts | undefined): ReasoningEffort | undefined {
  if (opts?.reasoningEffort) return opts.reasoningEffort;
  const env = process.env.OPENAI_REASONING_EFFORT;
  return env ? (env as ReasoningEffort) : undefined;
}

/**
 * The model spent its whole token budget thinking and produced no prose.
 *
 * **THIS EXISTS BECAUSE THE ALTERNATIVE IS A BLANK PAGE THAT REPORTS SUCCESS.**
 * When a GPT-5-family model reasons past `max_completion_tokens`, the stream
 * closes normally with `finish_reason: 'length'` and zero content deltas. Nothing
 * upstream can tell that from a legitimately short reading: the route records a
 * completed reading, analytics records a success, and the querent gets nothing.
 * There is no `[Bacaan terputus...]` notice, because the stream did not break.
 *
 * Throwing converts that into an ordinary failed reading -- visible in
 * `readings.status`, in `reading.failed`, and on screen -- which is what it is.
 */
export class EmptyReasoningError extends Error {
  constructor(readonly maxTokens: number) {
    super(
      `openai: the model returned no content and stopped on length at ` +
        `max_completion_tokens=${maxTokens}. This is a reasoning-family model ` +
        `spending the whole budget on reasoning; set OPENAI_REASONING_EFFORT=none.`,
    );
    this.name = 'EmptyReasoningError';
  }
}

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
    ...(effortFor(opts) === undefined ? {} : { reasoning_effort: effortFor(opts) }),
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
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null;
};

/**
 * Models that reason by default, and therefore return NOTHING at this app's
 * ceilings unless told not to.
 *
 * Matched by PREFIX rather than by an exact list, deliberately: the failure this
 * guards is silent, and a new `gpt-5.7-*` that nobody added to a list would
 * reintroduce it in full. A false positive costs one explicit env var; a false
 * negative costs blank readings nobody notices.
 */
const REASONS_BY_DEFAULT = /^(gpt-5|gpt-6|o[0-9])/i;

/**
 * **THE GUARD THAT MAKES THE `OPENAI_REASONING_EFFORT` REQUIREMENT UNFORGETTABLE.**
 *
 * The GPT-5 family sits on the fallback ladder (`gpt-5.6-luna` is the rung below
 * `gemini-3.5-flash-lite` — see `docs/provider-comparison.md`), and it has one
 * hard prerequisite that is trivially easy to lose in a dashboard:
 * **`OPENAI_REASONING_EFFORT=none`.**
 *
 * **THIS GUARD IS DELIBERATELY NOT EXTENDED TO GEMINI.** Gemini 3.x flash-lite was
 * measured with no thinking overhead at a 650-token ceiling — `finish_reason:
 * stop`, 164 completion tokens — so requiring the variable there would be a false
 * positive on the very model now recommended. The Gemini *pro* variants were not
 * measured and may behave differently; check before pointing `LLM_MODEL` at one.
 *
 * WITHOUT IT, MEASURED AGAINST THE APP'S OWN NINE INDONESIAN PROMPTS:
 *   - roughly **two readings in nine come back completely blank** -- reasoning
 *     tokens are spent from the same budget as the prose, and `MAX_TOKENS` here
 *     is 350-650 because the length control IS the product;
 *   - the stream closes NORMALLY, so nothing reports it: the route records a
 *     completed reading, analytics records a success, no `[Bacaan terputus...]`
 *     fires, and the querent gets an empty page;
 *   - and **the moderation classifier 400s outright**, because `temperature: 0`
 *     is rejected while reasoning is on. That is a reasoning-MODE restriction,
 *     not a model one -- verified: effort absent -> 400, `low` -> 400,
 *     `none` -> 200.
 *
 * So the day somebody fails over to OpenAI in a hurry -- which is the ONLY day
 * this adapter is used -- forgetting one variable produces an app that looks
 * healthy and serves blank readings. **A comment cannot prevent that. This can.**
 *
 * It throws at PROVIDER CONSTRUCTION rather than at the first blank reading:
 * `getProvider()` runs on the first model call of the process, so this surfaces
 * immediately and identically on every path, instead of once per unlucky reading.
 *
 * SETTING IT TO ANYTHING EXPLICIT SATISFIES THE GUARD, including `low`. The rule
 * is not "you must disable reasoning", it is "you must have decided". Someone who
 * genuinely wants reasoning on, with the truncation that implies, says so.
 */
function assertReasoningDecided(model: string): void {
  if (!REASONS_BY_DEFAULT.test(model)) return;
  if (process.env.OPENAI_REASONING_EFFORT) return;

  throw new Error(
    `openai: LLM_MODEL="${model}" is a reasoning-family model and ` +
      `OPENAI_REASONING_EFFORT is unset. At this app's token ceilings that returns ` +
      `BLANK readings (~2 in 9, silently) and 400s the moderation classifier. ` +
      `Set OPENAI_REASONING_EFFORT=none -- or set it explicitly to something else ` +
      `if you have read docs/provider-comparison.md and mean it.`,
  );
}

export function createOpenAIProvider(): LLMProvider {
  const model = requireEnv('LLM_MODEL');
  assertReasoningDecided(model);

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
        let delivered = 0;
        let finish: string | null = null;

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

            finish = event.choices?.[0]?.finish_reason ?? finish;

            const text = event.choices?.[0]?.delta?.content;
            if (text) {
              delivered += text.length;
              yield text;
            }
          }

          /*
           * AFTER the loop, so it cannot fire on a consumer that broke out early
           * -- an abandoned reading delivered nothing either, and that is not this
           * failure. Only a stream we drained to the end, that ran out of tokens,
           * and that produced not one character.
           */
          if (delivered === 0 && finish === 'length') {
            throw new EmptyReasoningError(maxTokens);
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

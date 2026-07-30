/**
 * Capture the reading's prose on its way to the querent, without ever being in
 * its way.
 *
 * `readings.body` needs the generated text. The text leaves the server as a
 * stream a person is watching arrive. The three naive options are all wrong:
 *
 *   - Buffer the whole reading, write it, then send it. Turns a 2.5-second
 *     time-to-first-token into a fifteen-second blank screen. This is the exact
 *     thing Miftah asked not to happen.
 *   - `ReadableStream.tee()`. Two branches with independent queues; if one is
 *     drained more slowly its queue grows and the two branches' backpressure
 *     eventually couples. Correct in principle, capable of being wrong in
 *     practice, and strictly more machinery than a consumer that is an array
 *     append needs.
 *   - Write the body from the client after the stream finishes. Then the
 *     server's record of what it generated is whatever the client says it
 *     generated, which is precisely the class of trust the reading route was
 *     carefully built to avoid.
 *
 * So: a manual fan-out. The client is enqueued FIRST, always, and the
 * accumulate that follows is a synchronous array append -- structurally
 * incapable of delaying a byte.
 *
 * A PURE FUNCTION OVER AN ASYNC ITERABLE, deliberately. The reading route is
 * the most sensitive file in the app and should gain as little inline logic as
 * possible, and this way all six outcome paths are testable with a fake stream
 * and no server.
 */
import type { LLMStream, ReadingUsage } from '@/lib/llm/types';

/**
 * The model cannot exceed `maxTokens` (650 for spread3), so in normal operation
 * this never fires. It exists because an unbounded array fed by a remote server
 * is a memory risk in a serverless function, and because a provider bug that
 * streams forever should cost a truncated row rather than an OOM. The client
 * still receives every byte; only the stored copy is capped.
 */
export const MAX_BODY_CHARS = 20_000;

/**
 * How long `done` will wait for `source.usage` before giving up on the token
 * counts.
 *
 * The interface guarantees `usage` always settles, and both implementations
 * honour it. This is the belt: `done` is what the `after()` callback parks on,
 * and a provider that hangs should cost two null columns rather than 45 seconds
 * of a paid invocation.
 */
const USAGE_TIMEOUT_MS = 2000;

export type ReadingOutcome = {
  /** '' if nothing arrived. The caller stores that as NULL, never ''. */
  body: string;
  status: 'ok' | 'partial' | 'failed' | 'aborted';
  /** Hit MAX_BODY_CHARS. The client still got everything. */
  truncated: boolean;
  /** -> `readings.latency_ms`. Time to FIRST TOKEN (plan A12), not total. */
  firstTokenMs: number | null;
  totalMs: number;
  /** Pre-truncation length, so `chars > body.length` is meaningful. */
  chars: number;
  usage: ReadingUsage;
  /** A short classifier, never `err.message` -- rule 2 of the taxonomy. */
  errorKind: string | null;
};

export type TeeOpts = {
  /** `performance.now()` at the top of the route handler. */
  startedAt: number;
  /** The visible `[Bacaan terputus...]` notice. NEVER enters the body. */
  failureNotice: string;
  maxBodyChars?: number;
};

/**
 * Short, bounded, and never the error's message.
 *
 * An `error_kind` with unbounded cardinality makes every `group by` useless,
 * and a message can carry a URL, a prompt fragment or a key.
 */
export function classifyStreamError(err: unknown): string {
  const e = err as { name?: unknown; status?: unknown; code?: unknown } | null;
  const name = typeof e?.name === 'string' ? e.name : '';
  const code = typeof e?.code === 'string' ? e.code : '';
  const status = typeof e?.status === 'number' ? e.status : 0;

  if (name === 'AbortError' || code === 'ABORT_ERR') return 'aborted';
  if (name === 'TimeoutError' || code === 'ETIMEDOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
    return 'timeout';
  }
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return 'connect';
  }
  if (code === 'ECONNRESET' || code === 'EPIPE') return 'disconnected';
  if (status >= 500) return 'upstream_5xx';
  if (status === 429) return 'upstream_429';
  if (status >= 400) return 'upstream_4xx';
  return 'unknown';
}

export function teeReading(
  source: LLMStream,
  opts: TeeOpts,
): { stream: ReadableStream<Uint8Array>; done: Promise<ReadingOutcome> } {
  const encoder = new TextEncoder();
  const limit = opts.maxBodyChars ?? MAX_BODY_CHARS;

  const parts: string[] = [];
  /** A RUNNING counter. `parts.join('').length` per chunk is quadratic, and at
   *  650 tokens of small deltas that is a real cost. */
  let stored = 0;
  let chars = 0;
  let truncated = false;
  let firstTokenMs: number | null = null;
  let status: ReadingOutcome['status'] = 'ok';
  let errorKind: string | null = null;

  let settle!: (o: ReadingOutcome) => void;
  let settled = false;
  const done = new Promise<ReadingOutcome>((resolve) => {
    settle = resolve;
  });

  /**
   * Reachable from three call sites; runs exactly once.
   *
   * THE SNAPSHOT IS TAKEN BEFORE THE AWAIT, and that is not tidiness. Reading
   * these variables inside the `settle({...})` call would read them AFTER
   * `usage` resolves, and by then the other call site has run: a client cancel
   * makes the next `controller.enqueue` throw ERR_INVALID_STATE, so the catch
   * block overwrites `errorKind` with `'unknown'` some milliseconds later. The
   * row then says a reading failed for an unknown reason when the truth is that
   * the querent navigated away. Caught by the cancel test, which is the whole
   * reason it asserts on `errorKind` and not only on `status`.
   */
  const finish = async (): Promise<void> => {
    if (settled) return;
    settled = true;

    const snapshot = {
      body: parts.join(''),
      status,
      truncated,
      chars,
      firstTokenMs,
      totalMs: Math.round(performance.now() - opts.startedAt),
      errorKind,
    };

    settle({ ...snapshot, usage: await usageOrNulls(source) });
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of source) {
          /*
           * THE CLIENT GOES FIRST. Always. What follows is a synchronous array
           * append costing nanoseconds, but writing it in this order makes the
           * guarantee visible rather than incidental -- and makes a future edit
           * that puts work in front of it look wrong.
           */
          controller.enqueue(encoder.encode(chunk));

          if (firstTokenMs === null) {
            firstTokenMs = Math.round(performance.now() - opts.startedAt);
          }
          chars += chunk.length;

          if (!truncated) {
            const room = limit - stored;
            if (chunk.length <= room) {
              parts.push(chunk);
              stored += chunk.length;
            } else {
              if (room > 0) {
                parts.push(chunk.slice(0, room));
                stored += room;
              }
              truncated = true;
            }
          }
        }
      } catch (err) {
        /*
         * UNCHANGED IN EFFECT FROM THE ORIGINAL ROUTE: the status code went out
         * with the first byte, so a mid-stream failure CANNOT become a 500.
         *
         * The notice goes to the reader's screen and NOT into `parts`. It is a
         * system message, not the reader's prose, and storing it would put a
         * bracketed Indonesian apology inside readings.body -- where W5's
         * chained reading would happily quote it back at the user next time.
         */
        console.error('reading stream failed', err);
        status = parts.length > 0 ? 'partial' : 'failed';
        errorKind = classifyStreamError(err);
        try {
          controller.enqueue(encoder.encode(opts.failureNotice));
        } catch {
          /* the consumer is already gone; there is nobody left to tell */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed by a cancel */
        }
        void finish();
      }
    },

    /*
     * THE CLIENT WENT AWAY. Draw.tsx aborts on reset, on unmount and on a fresh
     * request, so this is a normal path and not an error.
     *
     * The querent saw whatever had arrived, so it is still worth storing,
     * marked as such. Without this handler `start()` can sit suspended on an
     * enqueue to a dead controller and `done` never settles -- which is exactly
     * what ANALYTICS_STREAM_TIMEOUT_MS exists to catch, except that catching it
     * here is two seconds instead of forty-five and says `aborted` instead of
     * guessing.
     */
    cancel() {
      status = parts.length > 0 ? 'aborted' : 'failed';
      errorKind ??= 'client_disconnected';
      void finish();
    },
  });

  return { stream, done };
}

async function usageOrNulls(source: LLMStream): Promise<ReadingUsage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      source.usage,
      new Promise<ReadingUsage>((resolve) => {
        timer = setTimeout(() => resolve({ inputTokens: null, outputTokens: null, cachedInputTokens: null }), USAGE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // The interface says `usage` never rejects. If a provider breaks that,
    // null tokens are the right answer and an unhandled rejection is not.
    return { inputTokens: null, outputTokens: null, cachedInputTokens: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

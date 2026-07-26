import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/server';
import { getProvider } from '@/lib/llm';
import { buildPrompt } from '@/lib/prompt/build';
import { getLotusBlock, scheduleLotusRefresh } from '@/lib/prompt/lotus.generate';
import { MAX_QUESTION_LENGTH, sanitizeQuestion } from '@/lib/prompt/sanitize';
import { hit } from '@/lib/ratelimit';
import { persistReading, touchLastSeen } from '@/lib/analytics/flush';
import { LOCAL_DATE_HEADER, SESSION_HEADER, parseLocalDate, validSessionId } from '@/lib/analytics/localdate';
import { teeReading, type ReadingOutcome } from '@/lib/analytics/tee';
import { defer, track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { CARDS, effectiveYesNo } from '@/data/deck';
import { isReaderId } from '@/data/readers';
import { isServiceId, serviceById } from '@/data/services';

export const runtime = 'nodejs';

/**
 * Headroom for `after()` past the end of the stream (reconciliation §6).
 *
 * Two things now run out there. The Lotus repair, which is a model call. And
 * W4's write of the reading, its cards and the request's whole event batch,
 * which parks on the stream settling and then spends up to
 * ANALYTICS_RETRY_BUDGET_MS. A `spread3` stream is well under 30 seconds and
 * the retry budget is 5, so 60 is headroom -- it is not a guarantee, and what
 * is lost when the platform ends an invocation anyway is written up in the
 * analytics plan §10 along with the query that detects it.
 */
export const maxDuration = 60;

/** How long the after() callback waits for the stream before storing what arrived. */
const STREAM_TIMEOUT_MS = Number(process.env.ANALYTICS_STREAM_TIMEOUT_MS ?? 45_000);

/**
 * The visible notice a broken stream leaves on screen.
 *
 * W6 will translate it. It is passed INTO `teeReading`, which guarantees it
 * never enters `readings.body` -- it is a system message, not the reader's
 * prose, and a stored copy would be quoted back at the querent by W5's chained
 * reading next time.
 */
const FAILURE_NOTICE = '\n\n[Bacaan terputus. Coba lagi sebentar.]';

/*
 * The client sends card IDS AND ORIENTATION, NOTHING ELSE. Every word of card
 * text -- names, keywords, stage, polarity -- is looked up server-side from
 * cards.json inside buildPrompt. A tampered client cannot inject invented card
 * content into the prompt, which is the whole reason the schema looks this
 * thin.
 */
const Body = z.object({
  reader: z.string().refine(isReaderId, 'unknown reader'),
  service: z.string().refine(isServiceId, 'unknown service'),
  picks: z
    .array(
      z.object({
        id: z.number().int().min(0).max(21),
        reversed: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
  question: z.string().max(MAX_QUESTION_LENGTH).optional(),
});

/**
 * THE FOUR INVARIANTS OF THIS FILE, restated because four workstreams edit it:
 *
 *   - the client sends card ids and orientation and nothing else;
 *   - every word of card text is looked up server-side from cards.json;
 *   - the yes/no verdict is derived by effectiveYesNo(), never by the model;
 *   - a mid-stream failure cannot become a 500.
 *
 * W4's additions touch none of them: two headers read, one uuid generated, one
 * withAnalytics wrapper, teeReading in place of the inline ReadableStream, and
 * one defer(). If a diff here appears to change any of the four, it is wrong.
 */
export async function POST(request: Request) {
  const startedAt = performance.now();

  /*
   * Middleware already rejected anonymous and un-onboarded callers, so these two
   * guards are belt and braces -- but this is also where the identity comes from,
   * and the rate limiter needs one rather than an IP: a household behind one NAT
   * is one address and three people, and a phone hopping cell towers is one
   * person and three addresses.
   *
   * The two `{ ok }` shapes are deliberately identical so the guards read the
   * same way. THE KEY IS `users.id`, not the Google sub and no longer a username:
   * everything else in this system joins on `users.id`, and a second identity for
   * one purpose is a bug waiting to be written.
   */
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const sessionId = validSessionId(request.headers.get(SESSION_HEADER));
  const localDate = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER));
  const ctx: AnalyticsContext = {
    userId: user.id,
    sessionId,
    locale: user.locale,
    localDate: localDate.date,
  };

  /*
   * The reading's id, known BEFORE anything else, so that every failure event
   * on every early return names the attempt it belongs to -- and so the client
   * can read it off a header and report the same id back through a different
   * transport (plan §10, the loss detector).
   */
  const readingId = crypto.randomUUID();

  return withAnalytics(ctx, async () => {
    if (localDate.source === 'fallback') {
      /*
       * A bad local date NEVER fails a reading (plan A15). It falls back to the
       * server's UTC date, which is wrong for a third of a day in Jakarta --
       * hence this event, so the breakage is countable instead of silent.
       */
      track('analytics.local_date_fallback', {
        reason: localDate.reason,
        received: localDate.received,
        surface: 'reading',
      });
    }

    const gate = hit(user.id);
    if (!gate.ok) {
      track('reading.rate_limited', {
        reader_id: '?',
        service_id: '?',
        retry_after_s: gate.retryAfterSeconds,
      });
      return NextResponse.json(
        { error: 'Terlalu banyak bacaan. Coba lagi nanti.' },
        { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
      );
    }

    /*
     * Every early return below buffers ONE event and nothing else. The response
     * is still constructed and returned synchronously -- a buffered event costs
     * no database round trip, which is what makes instrumenting the failure
     * paths free.
     */
    const invalid = (message: string, kind: string) => {
      track('reading.failed', {
        reading_id: readingId,
        reader_id: '?',
        service_id: '?',
        stage: 'validation',
        chars_before_failure: 0,
        error_kind: kind,
        source: 'server',
      });
      return NextResponse.json({ error: message }, { status: 400 });
    };

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return invalid('Permintaan tidak valid.', 'body_not_json');
    }

    const parsed = Body.safeParse(raw);
    if (!parsed.success) return invalid('Permintaan tidak valid.', 'schema');

    const { reader, service, picks, question } = parsed.data;

    // The pick count has to match the service, or a "three-card spread" arrives
    // with one card and the prompt quietly describes a reading nobody drew.
    const svc = serviceById(service);
    if (!svc || picks.length !== svc.cardCount) {
      return invalid(`Layanan ini butuh ${svc?.cardCount ?? '?'} kartu.`, 'card_count');
    }

    // No duplicate cards: one physical deck, one draw.
    if (new Set(picks.map((p) => p.id)).size !== picks.length) {
      return invalid('Kartu tidak boleh berulang.', 'duplicate_cards');
    }

    /*
     * THE LOTUS BLOCK. One cached read, and its failure is NON-FATAL.
     *
     * Roadmap §6 permits this read on the request path -- it is per-user, it
     * changes rarely, and it is behind a short-lived in-process cache with one
     * indexed lookup as the miss path. `getLotusBlock` swallows a database error
     * and returns null rather than throwing, because a reading without the block
     * is a valid reading and a DB hiccup must not cost the user their reading.
     *
     * NULL IS NORMAL, not an error: not yet distilled (they beat the `after()` from
     * onboarding by a few seconds), distillation failed, or they skipped every
     * question. All three produce exactly the reading an un-personalised user gets.
     */
    const lotus = await getLotusBlock(user.id, user.locale);

    let prompt;
    try {
      // buildPrompt re-derives every card from cards.json and, for yes/no,
      // derives the verdict from effectiveYesNo. The model explains it; it does
      // not choose it.
      prompt = buildPrompt({
        reader,
        service,
        picks,
        question,
        locale: user.locale,
        // An empty summary means "there is a profile but nothing distilled yet".
        // Passing it through would render an empty `<penanya>` block, which is
        // noise in the prompt and a rule the reader would apply to nothing.
        context: { lotus: lotus && lotus.summary ? lotus : null },
      });
    } catch (err) {
      console.error('prompt build failed', err);
      track('reading.failed', {
        reading_id: readingId,
        reader_id: reader,
        service_id: service,
        stage: 'prompt',
        chars_before_failure: 0,
        error_kind: 'build_failed',
        source: 'server',
      });
      return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 });
    }

    track('reading.requested', {
      reading_id: readingId,
      reader_id: reader,
      service_id: service,
      card_count: picks.length,
      has_question: Boolean(question),
      question_length: question?.length ?? 0,
      lotus_present: Boolean(lotus && lotus.summary),
      memory_block_present: false, // W5
      prompt_version: prompt.promptVersion,
    });

    /*
     * THE LAZY REPAIR (W3's L15), and it keeps its OWN after() rather than
     * joining W4's defer() queue.
     *
     * Deferred jobs run in registration order inside one callback, so putting a
     * model call ahead of the reading write would mean a slow distillation
     * delaying -- and, if the invocation is cut short, LOSING -- the row every
     * memory feature depends on. Registered after the first track() above, so
     * the analytics callback is the one Next sees first either way.
     */
    if (!lotus || lotus.stale) {
      after(() => scheduleLotusRefresh(user.id));
    }

    const { stream, done } = teeReading(getProvider().streamReading(prompt), {
      startedAt,
      failureNotice: FAILURE_NOTICE,
    });

    /*
     * Everything below runs after the response has flushed. It does not delay a
     * byte and it cannot fail the request.
     */
    defer(async () => {
      const outcome = await Promise.race([done, streamTimeout()]);

      if (outcome.firstTokenMs !== null) {
        track('reading.first_token', { reading_id: readingId, latency_ms: outcome.firstTokenMs });
      }

      if (outcome.status === 'ok' || outcome.status === 'partial') {
        track('reading.completed', {
          reading_id: readingId,
          reader_id: reader,
          service_id: service,
          latency_ms: outcome.firstTokenMs ?? -1,
          total_ms: outcome.totalMs,
          chars: outcome.chars,
          token_input: outcome.usage.inputTokens,
          token_output: outcome.usage.outputTokens,
          truncated: outcome.truncated,
          status: outcome.status,
          source: 'server',
        });
      } else if (outcome.status === 'aborted') {
        track('reading.aborted', {
          reading_id: readingId,
          chars_before_abort: outcome.chars,
          reason: 'user',
          source: 'server',
        });
      } else {
        track('reading.failed', {
          reading_id: readingId,
          reader_id: reader,
          service_id: service,
          stage: 'stream',
          chars_before_failure: outcome.chars,
          error_kind: outcome.errorKind ?? 'unknown',
          source: 'server',
        });
      }

      await persistReading(
        {
          id: readingId,
          userId: user.id,
          readerId: reader,
          serviceId: service,
          locale: user.locale,
          // Stored as the prompt saw it. sanitizeQuestion is idempotent, so
          // calling it here as well as inside buildPrompt cannot change the
          // string -- there is a property test for that.
          question: sanitizeQuestion(question),
          status: outcome.status,
          verdict: service === 'yesno' ? effectiveYesNo(draw(picks[0])) : null,
          // '' becomes NULL: §3 says body is "NULL if the stream died", and an
          // empty string that is not null is how W5 ends up chaining off a
          // reading that said nothing.
          body: outcome.body || null,
          model: process.env.LLM_MODEL ?? 'unknown',
          promptVersion: prompt.promptVersion,
          latencyMs: outcome.firstTokenMs,
          tokenInput: outcome.usage.inputTokens,
          tokenOutput: outcome.usage.outputTokens,
          sessionId,
          localDate: localDate.date,
        },
        picks.map((p, i) => ({ cardId: p.id, reversed: p.reversed, position: i })),
      );

      // Fire and log, never retried: the next request writes it again anyway.
      await touchLastSeen(user.id);
    });

    return new Response(stream, {
      headers: {
        // Plain chunked text, not SSE: there is one stream of one thing, so SSE
        // framing would be ceremony the client has to undo.
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        // Tells any proxy in the way not to buffer the stream into one lump.
        'x-accel-buffering': 'no',
        // The loss detector (plan §10). The client reports its own
        // reading.completed against this id through /api/events, a different
        // request with a different after(), so a client event with no matching
        // readings row is exactly the signal that a write was lost.
        'x-reading-id': readingId,
      },
    });
  });
}

/** `{ card, reversed }`, the shape effectiveYesNo takes. Ids are already validated. */
function draw(pick: { id: number; reversed: boolean }) {
  return { card: CARDS[pick.id], reversed: pick.reversed };
}

/**
 * The backstop for a stream that never settles.
 *
 * `teeReading`'s own `cancel()` handler catches the ordinary client-disconnect
 * case in milliseconds, so this should never fire. It exists because the
 * alternative to a timeout here is an `after()` callback that holds a paid
 * invocation open until the platform kills it, taking the reading row with it.
 */
function streamTimeout(): Promise<ReadingOutcome> {
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          body: '',
          status: 'failed',
          truncated: false,
          firstTokenMs: null,
          totalMs: STREAM_TIMEOUT_MS,
          chars: 0,
          usage: { inputTokens: null, outputTokens: null },
          errorKind: 'stream_timeout',
        }),
      STREAM_TIMEOUT_MS,
    ).unref?.();
  });
}

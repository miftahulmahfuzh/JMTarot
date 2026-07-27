/**
 * The per-day reader summary (W5 §5.1).
 *
 * `204` IS THE COMMON RESPONSE AND THE CHEAPEST PATH, and it is the first-time
 * visitor's path: no readings today, nothing to summarize, nothing rendered
 * (M14). Roadmap §5 is explicit that an empty state saying "you haven't read
 * today" destroys the effect, so there is no body and no copy.
 *
 *   zero readings today          -> 204
 *   cached row, still fresh      -> 200, the cached body, NO model call
 *   cached row, stale            -> 200, regenerate and stream
 *   no row                       -> 200, generate and stream
 *
 * THIS STREAMS, WHERE `/api/memory/frequency` DOES NOT, and the two were decided
 * separately rather than by consistency. The verdict is one clause of at most 25
 * words that exists to be read whole; this is up to 45 words in a reader's own
 * voice, arriving as the reader "speaking" to the querent, and progressive text
 * is worth something there. It is the same treatment the reading result already
 * gets, which is what §5.4 asks for.
 *
 * THE FIRST CHUNK IS PULLED BEFORE THE HEADERS GO OUT, which is what lets this
 * both stream AND keep the 204 fallback. `streamReading` is an `async *`
 * generator, so calling it starts nothing until something pulls -- pulling
 * `.next()` here means a model call that fails before its first token becomes a
 * clean 204 and renders nothing, rather than a 200 with an empty body that the
 * component would have to special-case.
 */
import { NextResponse, after } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { getLocale } from '@/lib/i18n/t';
import { parseLocalDate, SESSION_HEADER, validSessionId } from '@/lib/analytics/localdate';
import { track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import { getDailySummary, putDailySummary, readingsOnDay } from '@/lib/db/queries/summary';
import { getProvider } from '@/lib/llm';
import { reserveModelCall } from '@/lib/llm/meter';
import { isStale } from '@/lib/memory/summary';
import { buildDaySummaryPrompt, MEMORY_PROMPT_VERSION } from '@/lib/prompt/summary';
import { isReaderId } from '@/data/readers';
import type { Locale, ReaderId } from '@/data/types';

export const runtime = 'nodejs';

/** One short greeting plus the write behind it. */
export const maxDuration = 30;

const NO_CONTENT = new NextResponse(null, { status: 204 });

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  /*
   * THE RESOLVED UI LOCALE, NOT `locale`. Same reasoning as `/api/reading`, and
   * this route is where the bug was actually VISIBLE: a screenshot of the English
   * reader picker showed an Indonesian frequency verdict sitting under an English hint.
   *
   * `locale` is the `loc` claim, which is D6's "profile" and first in the chain, so
   * for a real user the two agree. The dev-only `?lang=` override skips the claim on
   * purpose -- and these two endpoints are the ones a screenshot harness reaches, so
   * reading the claim here made the whole English-screenshot loop lie.
   *
   * `frequency_verdicts` and `daily_summaries` are BOTH keyed on locale already (W5 got
   * that right), so the cache was never the problem: the wrong key was being looked up.
   */
  const locale = await getLocale();

  const url = new URL(request.url);

  const reader = url.searchParams.get('reader');
  if (!reader || !isReaderId(reader)) {
    return NextResponse.json({ error: 'unknown reader' }, { status: 400 });
  }

  /*
   * REJECTED, NOT REPAIRED, for the same reason as the frequency route: a
   * summary of the wrong day is a false statement about what the querent did,
   * and silence is strictly better. The +/-1 bound inside `parseLocalDate`
   * covers UTC-12..+14 and nothing else.
   */
  const parsed = parseLocalDate(url.searchParams.get('date'));
  if (parsed.source === 'fallback') {
    return NextResponse.json({ error: 'bad date' }, { status: 400 });
  }
  const localDate = parsed.date;

  const ctx: AnalyticsContext = {
    userId: user.id,
    sessionId: validSessionId(request.headers.get(SESSION_HEADER)),
    locale: locale,
    localDate,
  };

  return withAnalytics(ctx, async () => {
    const readings = await readingsOnDay(db, user.id, localDate);

    // The M14 path, and the common one. Cheapest branch in the file.
    if (readings.length === 0) return NO_CONTENT;

    const cached = await getDailySummary(db, user.id, reader, localDate, locale);
    const ids = readings.map((r) => r.id);

    if (cached && !isStale(cached, ids, new Date())) {
      track('memory.summary_shown', {
        reader_id: reader,
        source_count: readings.length,
        cached: true,
        chars: cached.body.length,
      });
      return text(cached.body);
    }

    return generate({
      userId: user.id,
      reader,
      locale: locale,
      localDate,
      readings,
      ids,
      regeneration: cached !== null,
      generationCount: cached?.generationCount ?? 0,
    });
  });
}

async function generate(args: {
  userId: string;
  reader: ReaderId;
  locale: Locale;
  localDate: string;
  readings: Awaited<ReturnType<typeof readingsOnDay>>;
  ids: string[];
  regeneration: boolean;
  generationCount: number;
}): Promise<NextResponse | Response> {
  const startedAt = performance.now();

  const prompt = {
    ...buildDaySummaryPrompt({
      readerId: args.reader,
      locale: args.locale,
      localDate: args.localDate,
      readings: args.readings,
    }),
    /*
     * `streamReading` takes a `ReadingPrompt`, which carries a
     * `promptVersion`. This is not a reading and nothing writes it to
     * `readings.prompt_version` -- but `daily_summaries.prompt_version` is real
     * and `isStale` compares against it, so the value is the same constant
     * either way and there is nothing invented here.
     */
    promptVersion: MEMORY_PROMPT_VERSION,
  };

  /*
   * **THE DAY SUMMARY RESERVES EXPLICITLY, BECAUSE IT STREAMS.** V9's decorator
   * wraps `complete()` only -- see `src/lib/llm/index.ts` for why a stream is not
   * wrapped -- so a `streamReading` call site that does not reserve is a model
   * call that bypasses the ceiling entirely. There are exactly two of those in the
   * app: the reading, which reserves in `/api/reading`, and this one.
   *
   * `deferred`, and shed at the SOFT tier: the fallback below is already a 204,
   * `DaySummary` renders nothing until there is something, and there is no error
   * copy for this component by design (M14). So shedding it is indistinguishable
   * from a day with no summary yet -- which is the definition of a cache miss
   * nobody can name.
   */
  const quota = await reserveModelCall('deferred');
  if (!quota.ok) return NO_CONTENT;

  let iterator: AsyncIterator<string>;
  let first: IteratorResult<string>;
  try {
    iterator = getProvider().streamReading(prompt)[Symbol.asyncIterator]();
    // Pulled BEFORE the headers. See the file header: this is what keeps the
    // 204 fallback available for a call that dies before its first token.
    first = await iterator.next();
  } catch (err) {
    logFailure(err);
    return NO_CONTENT;
  }

  if (first.done || !first.value) return NO_CONTENT;

  let body = first.value;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    // The chunk already pulled above, handed straight out. Doing this in
    // `start` rather than behind a flag in `pull` keeps `pull` to one job.
    start(controller) {
      controller.enqueue(encoder.encode(first.value));
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        body += next.value;
        controller.enqueue(encoder.encode(next.value));
      } catch (err) {
        /*
         * A mid-stream failure CLOSES the stream rather than erroring it. The
         * querent has already seen a partial greeting; tearing the response
         * down would replace it with nothing at all, and there is no error copy
         * for this component by design (M14).
         */
        logFailure(err);
        controller.close();
      }
    },
    cancel() {
      // The querent navigated away. Stop pulling; the after() below still runs
      // and stores what arrived, which is a legitimate summary of the day.
      void iterator.return?.();
    },
  });

  /*
   * THE WRITE IS IN after(), so it cannot delay a byte. It runs once the
   * response has flushed, by which point `body` holds everything that was
   * streamed -- the closure is the accumulator, which is why `body` is a `let`
   * in this scope rather than inside the stream.
   */
  after(async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await putDailySummary(db, {
        userId: args.userId,
        readerId: args.reader,
        localDate: args.localDate,
        locale: args.locale,
        body: trimmed,
        sourceReadingIds: args.ids,
        promptVersion: MEMORY_PROMPT_VERSION,
      });
      track('memory.summary_generated', {
        reader_id: args.reader,
        source_count: args.readings.length,
        regeneration: args.regeneration,
        generation_count: args.generationCount + 1,
        total_ms: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      logFailure(err);
    }
  });

  track('memory.summary_shown', {
    reader_id: args.reader,
    source_count: args.readings.length,
    cached: false,
    // Not known until the stream ends; the generated event carries the real
    // length via `total_ms`'s sibling fields. 0 here means "streamed".
    chars: 0,
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-accel-buffering': 'no',
    },
  });
}

function text(body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}

/**
 * NEVER LOG THE DRIVER ERROR IN PRODUCTION (CLAUDE.md).
 *
 * A postgres error quotes its bound parameters, and one of them here is the
 * generated summary -- which names the querent's cards and paraphrases their
 * day. An LLM client error can carry the whole prompt, which contains every
 * gist from every reading they took today.
 */
function logFailure(err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[memory] day summary failed', err);
  } else {
    console.error('[memory] day summary failed', {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}

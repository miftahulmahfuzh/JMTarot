/**
 * RETRY ONE UNFINISHED READING. The same draw, the same question, new prose,
 * written back into the row that already exists.
 *
 *   POST /api/reading/retry/<uuid>
 *     -> 200 chunked text/plain, the prose, exactly as `/api/reading` streams it
 *     -> 400 the prompt could not be assembled
 *     -> 401 no session
 *     -> 403 onboarding not finished, or the question was refused
 *     -> 404 absent / not yours / blocked / soft-deleted / not a uuid -- ONE answer
 *     -> 409 it exists and is yours, but it is not retryable
 *     -> 429 a budget said no
 *     -> 500 the reading call died before the verdict
 *     -> 503 the database was unreachable while loading the source row
 *
 * **THERE IS NO 204.** Every outcome is either a stream or a JSON error, so a
 * client spinner always has something to stop on.
 *
 * **THE REQUEST CARRIES NO BODY AT ALL, AND THAT IS A SECURITY PROPERTY.** This
 * handler never calls `request.json()`. The picks come from `reading_cards`, so a
 * tampered client cannot re-draw a hand it likes better and call it a retry; the
 * question comes from `readings.question`, so it cannot be swapped for one that
 * was never gated.
 *
 * ── THIS IS `/api/reading` WITH THREE DIFFERENCES AND NOTHING ELSE ───────────
 *
 * Same order, same budgets, same events, same `defer()` shape. **Read
 * `../../route.ts` before changing anything here**; where a comment there
 * explains a line, it is not repeated. The three:
 *
 *   1. THE PICKS COME FROM THE STORED DRAW, not from the request.
 *   2. THE QUESTION COMES FROM THE ROW AND IS RE-GATED. Skipping the gate would
 *      regenerate a stored question with no classifier in front of it -- and,
 *      far more likely to be discovered the hard way, `gateReading` IS ALSO WHAT
 *      PRIMES THE READING STREAM. Deleting it looks like a tidy-up, breaks
 *      nothing, logs nothing, and doubles every retry's latency for ever.
 *   3. THE WRITE IS `refillReadingRow`, NOT `persistReading` -- see that
 *      function's header for what `persistReading`'s 23505 catch would do here.
 *
 * ── THE TWO LOCALES ARE NOT INTERCHANGEABLE ──────────────────────────────────
 *
 * Getting this backwards puts an English sentence inside Indonesian prose, or
 * sends an Indonesian refusal to somebody using the English app.
 *
 *   `readLocale` / `tRead`   Everything touching THE PROSE: the prompt, the Lotus
 *                            block, the recall chain, the mid-stream notice, the
 *                            gist. It is `readings.locale`, which IS IMMUTABLE
 *                            (VD7) -- a retry of an Indonesian reading is
 *                            Indonesian, whatever the querent's interface says
 *                            now. A row whose `locale` disagreed with its `body`
 *                            would break V2's translation of it permanently:
 *                            `ReadingView`'s rule 4 keys off exactly that column
 *                            and `translations` has no `source_hash` to notice
 *                            with.
 *   `viewLocale` / `tView`   Everything read as CHROME right now: the 429, the
 *                            500, and the moderation refusal payload. The GATE
 *                            takes this one too, because `locale` there is the UI
 *                            preference and not a claim about what language the
 *                            question is in (W7-D3 runs both blocklists anyway).
 *
 * ── ONE CONSEQUENCE, RECORDED RATHER THAN FIXED ──────────────────────────────
 *
 * A retried reading carries TWO `op: 'reading'` rows in `llm_calls` for one
 * `reading_id`, and `readingCostsFor` folds every `reading_id`-bearing row with
 * no `op` predicate -- so `/admin`'s cost for that reading becomes the SUM of
 * both attempts. **Both attempts were paid for, so the sum is arguably the right
 * number**; it is written down here so nobody "fixes" that query later and
 * quietly starts under-reporting spend. A `reading.requested` and a
 * `reading.completed` are likewise emitted a second time for the same id; the
 * instrument for subtracting them is `reading.retried`.
 */
import { NextResponse, after } from 'next/server';

import { requireUser } from '@/lib/auth/server';
import { getProvider } from '@/lib/llm';
import { buildPrompt } from '@/lib/prompt/build';
import { getLotusBlock, scheduleLotusRefresh } from '@/lib/prompt/lotus.generate';
import { sanitizeQuestion } from '@/lib/prompt/sanitize';
import { tFor } from '@/lib/i18n/catalog';
import { getLocale } from '@/lib/i18n/t';
import { hit, hitGlobal, hitRefusal, refusalsExhausted } from '@/lib/ratelimit';
import { recordCall } from '@/lib/llm/ledger';
import { reserveModelCall } from '@/lib/llm/meter';
import { gateReading } from '@/lib/moderation/gate';
import { recordModerationFlag } from '@/lib/moderation/log';
import { refillReadingRow, touchLastSeen } from '@/lib/analytics/flush';
import { extractGist } from '@/lib/memory/gist.generate';
import { mintOnReadingCompleted } from '@/lib/chat/proactive/onReading';
import { recallChain } from '@/lib/memory/chain';
import { detectCallback } from '@/lib/prompt/memory';
import { retryable } from '@/lib/reading/retryable';
import { splitChoiceMarker, validateChoice } from '@/lib/reading/choice';
import {
  LOCAL_DATE_HEADER,
  SESSION_HEADER,
  parseLocalDate,
  validSessionId,
} from '@/lib/analytics/localdate';
import { teeReading, type ReadingOutcome } from '@/lib/analytics/tee';
import { defer, track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import { readingWithCards } from '@/lib/db/queries/history';
import { CARDS, effectiveYesNo } from '@/data/deck';
import { serviceById } from '@/data/services';
import { logHistoryFailure } from '../../../history/log';

export const runtime = 'nodejs';
/** `/api/reading`'s, for `/api/reading`'s reasons. See its header. */
export const maxDuration = 60;

/** How long the after() callback waits for the stream before storing what arrived. */
const STREAM_TIMEOUT_MS = Number(process.env.ANALYTICS_STREAM_TIMEOUT_MS ?? 45_000);

export async function POST(request: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id: readingId } = await ctxParams.params;

  const sessionId = validSessionId(request.headers.get(SESSION_HEADER));
  const localDate = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER));

  const viewLocale = await getLocale();
  const tView = tFor(viewLocale);

  /*
   * THE SOURCE ROW, BEFORE THE ANALYTICS SCOPE AND BEFORE THE FOUR BUDGETS.
   *
   * **A DELIBERATE DEPARTURE FROM `/api/reading`**, which validates AFTER them.
   * Two reasons, and invariant 8 is untouched by either -- it constrains the four
   * budgets relative to EACH OTHER, and says a retry that REACHES THE MODEL
   * spends all four, which it does:
   *
   *   1. `ctx.locale` has to be the READING's locale, and that is not knowable
   *      until this read has happened. The analytics store is captured once, at
   *      the top of `withAnalytics`, and cannot be corrected afterwards.
   *   2. H12's rule: `/api/history` charges no budget for browsing your own past.
   *      Pressing a button on a reading that turns out to be finished is the same
   *      kind of act, and it costs one indexed read against the querent's own row.
   */
  let source;
  try {
    source = await readingWithCards(db, user.id, readingId);
  } catch (err) {
    /*
     * NEVER `console.error(err)` HERE. `readingWithCards` selects `question` AND
     * `body`, and a postgres error quotes the failing statement with its bound
     * parameters -- so a raw log on this path puts the querent's typed question
     * and the whole reading into the platform log. `log.ts`'s header names this
     * route as the sharpest of its five surfaces.
     */
    logHistoryFailure('retry', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  /*
   * FIVE CAUSES, ONE ANSWER: absent, not yours, blocked, soft-deleted, or not a
   * uuid. `readingWithCards` collapses all five into `null` and every caller must
   * keep them collapsed -- a distinguishable "you deleted this" turns a uuid
   * guess into an existence oracle, and a reading id is a value that reaches the
   * browser.
   */
  if (!source) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }

  /*
   * `deletedAt` IS NOT PASSED, AND THE OMISSION IS THE POINT. `readingWithCards`
   * has already filtered it and `ReadingDetail` does not carry the column, so the
   * absent field means "the caller cannot see it" rather than "it is null";
   * `refillReading`'s WHERE covers the window between here and the write.
   *
   * `blocked` NEVER REACHES THIS BRANCH either -- the same query filters it -- so
   * in practice this answers `has_body` or `no_cards`. **Both are 409 and not
   * 404**: the client can already see `hasBody` on the row it is looking at, so
   * saying so leaks nothing, and a 404 for a reading it has open on screen would
   * read as a bug rather than as a refusal.
   */
  const verdictOnRow = retryable({
    status: source.status,
    hasBody: source.body !== null,
    cardCount: source.cards.length,
  });
  if (!verdictOnRow.ok) {
    return NextResponse.json(
      { error: 'not_retryable' },
      { status: 409, headers: { 'cache-control': 'no-store' } },
    );
  }

  /*
   * THE STORED HAND. `readingWithCards` already orders by position; sorting again
   * makes the invariant local to the code that depends on it rather than a fact
   * about a query three hundred lines away.
   */
  const picks = source.cards
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.cardId, reversed: c.reversed }));

  const reader = source.readerId;
  const service = source.serviceId;
  const svc = serviceById(service);

  /*
   * THE SAME 409, AND DELIBERATELY NOT A 400: none of this can be caused by the
   * client. It is a property of a row written months ago, possibly by a service
   * definition that has since changed its card count. Without it `buildPrompt`
   * throws on `picks[0]` inside a route that has already spent every budget --
   * or, worse, quietly describes a three-card spread that has one card in it.
   */
  if (
    !svc ||
    picks.length !== svc.cardCount ||
    new Set(picks.map((p) => p.id)).size !== picks.length ||
    picks.some((p) => !CARDS[p.id])
  ) {
    return NextResponse.json(
      { error: 'not_retryable' },
      { status: 409, headers: { 'cache-control': 'no-store' } },
    );
  }

  /** THE READING'S OWN LANGUAGE. Immutable (VD7). Never `viewLocale`. */
  const readLocale = source.locale;
  const tRead = tFor(readLocale);

  /*
   * **THE ASYMMETRY IN HERE IS DELIBERATE.** `ctx.locale` becomes
   * `llm_calls.locale` and `events.locale`, and every event this handler fires is
   * ABOUT the reading -- so the honest value is the language the tokens were
   * spent in, not the language of the app that asked. `localDate` is TODAY's,
   * because it answers "when did this cost land", which is what puts the retry in
   * today's `/admin` panels. `readings.local_date` is untouched and still says
   * when the draw happened; two columns, two questions.
   */
  const ctx: AnalyticsContext = {
    userId: user.id,
    sessionId,
    locale: readLocale,
    localDate: localDate.date,
  };

  return withAnalytics(ctx, async () => {
    if (localDate.source === 'fallback') {
      track('analytics.local_date_fallback', {
        reason: localDate.reason,
        received: localDate.received,
        // A retry IS a reading. A new surface value would be an `events.ts` edit,
        // which this phase does not own.
        surface: 'reading',
      });
    }

    const tooManyRequests = (
      retryAfterSeconds: number,
      limit: 'user' | 'refusal' | 'global' | 'daily',
    ) => {
      track('reading.rate_limited', {
        reader_id: reader,
        service_id: service,
        retry_after_s: retryAfterSeconds,
        limit,
      });
      return NextResponse.json(
        { error: tView('reading.error.rateLimit') },
        { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
      );
    };

    /*
     * THE FOUR BUDGETS, IN `/api/reading`'S ORDER AND WITH ITS COPY (invariant 8).
     * All four answer identically ON PURPOSE: telling the querent WHICH ceiling
     * they hit tells a prober which one to work around. The EVENT distinguishes
     * them, because that is server-side.
     */
    const [perUser, probing] = await Promise.all([hit(user.id), refusalsExhausted(user.id)]);
    if (!perUser.ok) return tooManyRequests(perUser.retryAfterSeconds, 'user');
    if (probing) return tooManyRequests(probing.retryAfterSeconds, 'refusal');

    const perFleet = await hitGlobal();
    if (!perFleet.ok) return tooManyRequests(perFleet.retryAfterSeconds, 'global');

    // `interactive`, because somebody pressed a button and is watching a spinner.
    const quota = await reserveModelCall('interactive');
    if (!quota.ok && quota.tier === 'hard') {
      return tooManyRequests(quota.retryAfterSeconds, 'daily');
    }

    /*
     * FETCHED FRESH RATHER THAN RECONSTRUCTED FROM THE FIRST ATTEMPT. The querent
     * may have edited or cleared an onboarding answer since it failed, and
     * `/privacy` clause 3 promises a cleared answer stops reaching a prompt.
     * Non-fatal; null is normal.
     */
    const lotus = await getLotusBlock(user.id, readLocale);

    /*
     * TWO DEPARTURES FROM `/api/reading`, both deliberate:
     *
     *   `excludeReadingId`  Belt. `recallableReadings` already excludes this row
     *                       through its `body is not null` filter, but the belt is
     *                       free and the brace is a filter somebody could
     *                       reasonably change.
     *   `localDate`         THE READING'S OWN DAY, not today's. The block is
     *                       prompt input for prose dated to that day, and a
     *                       reading dated 3 August referring to something from 28
     *                       August reads as impossible.
     *
     * KNOWN AND ACCEPTED: `recallableReadings` bounds `local_date >=` with no
     * UPPER bound, so a retry of an old reading can still recall a NEWER one.
     * Closing it means an upper bound inside that query, which is Phase 1's file
     * and would change `/api/reading` for no benefit. Recorded, not fixed.
     */
    const memory = await recallChain({
      userId: user.id,
      currentCardIds: picks.map((p) => p.id),
      currentHasQuestion: Boolean(sanitizeQuestion(source.question)),
      localDate: source.localDate,
      excludeReadingId: readingId,
      locale: readLocale,
    });

    let prompt;
    try {
      prompt = buildPrompt({
        reader,
        service,
        picks,
        question: source.question,
        locale: readLocale,
        context: { lotus: lotus && lotus.summary ? lotus : null, memory },
      });
    } catch (err) {
      // Safe: this came from prompt assembly over card data, not from a database
      // driver and not from the classifier path.
      console.error('retry prompt build failed', err);
      track('reading.failed', {
        reading_id: readingId,
        reader_id: reader,
        service_id: service,
        stage: 'prompt',
        chars_before_failure: 0,
        error_kind: 'build_failed',
        source: 'server',
      });
      return NextResponse.json({ error: tView('reading.error.badRequest') }, { status: 400 });
    }

    /*
     * **THIS ROUTE FIRES NO NEW EVENT NAME.** `reading.retried` already exists
     * (`events.ts:79`, props at `:392`) and is fired by the client; widening its
     * props or moving it server-side is Phase 4's call, not this file's. If that
     * happens, THE LINE IMMEDIATELY AFTER THIS `track` IS THE INSERTION POINT.
     */
    track('reading.requested', {
      reading_id: readingId,
      reader_id: reader,
      service_id: service,
      card_count: picks.length,
      has_question: source.question !== null,
      question_length: source.question?.length ?? 0,
      lotus_present: Boolean(lotus && lotus.summary),
      memory_block_present: memory !== null,
      prompt_version: prompt.promptVersion,
    });

    if (memory) {
      track('memory.chain_offered', {
        reading_id: readingId,
        recalled_count: memory.recalled.length,
        reason: memory.reason,
        repeat_card_id: memory.repeatCardIds[0] ?? null,
        repeat_count: memory.repeatCardIds.length,
      });
    }

    if (!lotus || lotus.stale) {
      after(() => scheduleLotusRefresh(user.id));
    }

    /*
     * THE READING'S LANGUAGE, NOT THE VIEWER'S -- this string is enqueued into the
     * PROSE stream by `teeReading`. Resolved here because `start(controller)` has
     * no request context; `tRead` is a closure over a locale captured above.
     */
    const interrupted = tRead('reading.error.midStream');

    /*
     * THE STORED QUESTION, RE-SANITIZED. `sanitizeQuestion` is idempotent (there
     * is a property test), so this cannot differ from what `readings.question`
     * holds -- which is what keeps `validateChoice`'s substring guarantee
     * checkable against the stored row. It is what the gate sees, and
     * `buildPrompt` sanitizes internally from the same source, so the classifier
     * and the model read BYTE-IDENTICAL text. That equality is the classic bypass
     * when it breaks.
     */
    const cleanQuestion = sanitizeQuestion(source.question);

    const modelStartedAt = performance.now();

    let gated;
    try {
      /*
       * **AND THIS CALL PRIMES THE STREAM.** `gateReading` issues the provider
       * request with `iterator.next()` and races the classifier against it.
       * NOTHING HERE MAY BE REORDERED into "check first, then start".
       */
      gated = await gateReading({
        question: cleanQuestion,
        // The VIEWER's -- W7-D3, and it selects the refusal copy they will read.
        locale: viewLocale,
        start: (signal) => getProvider().streamReading(prompt, { signal }),
      });
    } catch (err) {
      // Safe: the READING call's error, whose request body is the system prompt
      // and the card list -- not the classifier's, whose body is the question.
      console.error('retry failed before the moderation verdict', err);
      track('reading.failed', {
        reading_id: readingId,
        reader_id: reader,
        service_id: service,
        stage: 'connect',
        chars_before_failure: 0,
        error_kind: 'start_failed',
        source: 'server',
      });
      return NextResponse.json({ error: tView('reading.error.start') }, { status: 500 });
    }

    const verdict = gated.verdict;

    if (verdict.source === 'timeout') {
      track('moderation.timeout', {
        failed_open: !verdict.blocked,
        reason: 'timeout',
        surface: 'reading',
        reader_id: reader,
        service_id: service,
      });
    }
    if (!verdict.blocked && verdict.category !== null) {
      track('moderation.allowed_flagged', {
        category: verdict.category,
        confidence_bucket: bucket(verdict.confidence),
        surface: 'reading',
        reader_id: reader,
        service_id: service,
      });
    }

    if (verdict.category !== null) {
      const flagQuestion = cleanQuestion;
      // `after()` and NOT `defer()`, for `/api/reading`'s reason: `defer()`'s
      // queue parks on the stream settling, and a refusal has no stream.
      after(() =>
        recordModerationFlag({
          userId: user.id,
          question: flagQuestion,
          verdict,
          locale: viewLocale,
          action: verdict.blocked ? 'blocked' : 'allowed_flagged',
        }),
      );
    }

    if (gated.blocked) {
      /*
       * **A REFUSAL ON RETRY IS A CORRECT OUTCOME AND CHANGES NOTHING ON THE
       * ROW.** No write at all: the reading keeps `body IS NULL` and so stays
       * retryable, and its `status` is NOT moved to `blocked` -- that value means
       * "W7 refused the question at draw time and there is no draw", which is not
       * what happened here. The record that matters is the `moderation_flags` row
       * registered above.
       *
       * `after()` and not a bare `void`: a floating promise in a serverless
       * function may be frozen before it resolves, and W7-D13's anti-oracle
       * control would then silently stop recording. NOT `defer()`, because an
       * analytics kill switch must not be able to disable a security control.
       */
      after(() => hitRefusal(user.id));

      track('moderation.refused', {
        source: gated.verdict.source,
        category: gated.verdict.category,
        confidence_bucket: bucket(gated.verdict.confidence),
        surface: 'reading',
        reader_id: reader,
        service_id: service,
      });

      return NextResponse.json(gated.payload, {
        status: 403,
        headers: { 'cache-control': 'no-store', 'x-reading-id': readingId },
      });
    }

    const { stream, done } = teeReading(gated.stream, {
      startedAt,
      failureNotice: interrupted,
    });

    defer(async () => {
      const outcome = await Promise.race([done, streamTimeout()]);

      /*
       * THE MARKER COMES OFF ONCE, BEFORE ANYTHING READS THE BODY, and `prose` is
       * what every line below uses. A marker left in `readings.body` would be
       * quoted back at the querent by W5's chained reading as if the reader had
       * said it, and both `extractGist` and `detectCallback` would scan it.
       * `done: true`, because the stream is over and nothing may be held back.
       */
      const split = splitChoiceMarker(outcome.body, true, cleanQuestion);
      const prose = split.body;
      const choice = validateChoice(split.choice, cleanQuestion);
      const choiceOutcome = split.choice === null ? 'none' : choice === null ? 'invalid' : 'valid';

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
          choice: choiceOutcome,
          choice_length: split.choice?.length ?? 0,
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

      /*
       * `verdict` IS RE-DERIVED FROM THE STORED DRAW, never carried over from the
       * first attempt. It is byte-identical by construction, because
       * `reading_cards` did not move -- deriving it anyway keeps the yes/no rule
       * in one place and leaves no code path by which a retry inherits a verdict
       * nobody recomputed.
       *
       * `body: prose || null` -- '' becomes NULL, so a retry that produced nothing
       * leaves the row exactly as retryable as it was.
       */
      const written = await refillReadingRow(user.id, readingId, {
        status: outcome.status,
        body: prose || null,
        choice,
        verdict:
          service === 'yesno'
            ? effectiveYesNo({ card: CARDS[picks[0].id], reversed: picks[0].reversed })
            : null,
        model: process.env.LLM_MODEL ?? 'unknown',
        promptVersion: prompt.promptVersion,
        latencyMs: outcome.firstTokenMs,
        tokenInput: outcome.usage.inputTokens,
        tokenOutput: outcome.usage.outputTokens,
      });

      /*
       * THE LEDGER ROW GOES AFTER THE WRITE AND NEVER BEFORE IT. Deferred jobs run
       * in registration order inside one callback, so anything ahead of the row
       * delays it and loses it outright if the platform cuts the invocation short.
       * **A dashboard row may never be in front of the querent's own history.**
       * Every field comes off `outcome`, which `tee.ts`'s `finish()` snapshotted
       * BEFORE its await on `usage`.
       */
      void recordCall({
        op: 'reading',
        readingId,
        model: process.env.LLM_MODEL ?? 'unknown',
        callClass: 'interactive',
        streamed: true,
        status: outcome.status,
        errorKind: outcome.errorKind,
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        cacheReadTokens: outcome.usage.cachedInputTokens,
        totalMs: Math.round(performance.now() - modelStartedAt),
      });

      /*
       * **`if (written)` IS THE ONE LINE THIS FILE HAS THAT `/api/reading` DOES
       * NOT, AND IT IS NOT OPTIONAL.** `setReadingGist` updates on `id` alone --
       * no `body is null` guard, because on the insert path there is nothing to
       * race. Here there is: if the refill lost to a concurrent retry, the row
       * holds the OTHER attempt's prose, and writing this attempt's gist over it
       * would leave `readings.gist` describing text that is not in
       * `readings.body` -- after which W5 quotes a clause the reader never wrote.
       * (`extractGist` returns early on a null body anyway, so this guard is only
       * about `written === false`.)
       */
      if (written) {
        await extractGist({ readingId, body: prose || null, locale: readLocale });
      }

      if (memory && prose) {
        const hitCallback = detectCallback({
          body: prose,
          currentCardIds: picks.map((p) => p.id),
          recalledCardIds: memory.recalled.flatMap((r) => r.cards.map((c) => c.cardId)),
          locale: readLocale,
        });
        if (hitCallback.fired && hitCallback.signal) {
          track('memory.chain_used', { reading_id: readingId, signal: hitCallback.signal });
        }
      }

      await touchLastSeen(user.id);

      /*
       * GUARDED FOR A DIFFERENT REASON THAN THE GIST: this one is about MATERIAL,
       * not constraints -- `chat_runs.trigger_reading_id`'s FK target already
       * exists either way. Minting a proactive run about a reading whose prose
       * came from somebody else's concurrent attempt would be a chat message about
       * text this invocation never saw.
       *
       * **THIS IS THE ONE PLACE ON THIS ROUTE WHERE THE CHAT'S CLOCK AND LANGUAGE
       * WIN OVER THE READING'S**: the run happens now, in the room the querent
       * will open, in the language their app is in.
       */
      if (written) {
        await mintOnReadingCompleted({
          userId: user.id,
          readingId,
          status: outcome.status,
          localDate: localDate.date,
          locale: viewLocale,
        });
      }
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
        // The id the client already knew -- it is in the path. Sent anyway so the
        // loss detector works identically to the draw screen's.
        'x-reading-id': readingId,
        /*
         * `readings.locale`, UNCHANGED, NEVER `viewLocale`. **THIS IS A CHECK, NOT
         * DECORATION**: the client decides from it whether to paint the streamed
         * prose or hold it behind the `otherLanguage` notice. If somebody later
         * "simplifies" this route towards `/api/reading`'s `await getLocale()`,
         * the prose changes language and this header changes with it -- so the
         * client keeps telling the truth either way. A client MUST still default
         * to `reading.locale` on an absent or malformed value.
         */
        'x-reading-locale': readLocale,
      },
    });
  });
}

/** `/api/reading`'s. Buckets, not the number: self-reported confidence is uncalibrated. */
function bucket(confidence: number | null): 'low' | 'medium' | 'high' | null {
  if (confidence === null) return null;
  if (confidence < 0.5) return 'low';
  return confidence < 0.8 ? 'medium' : 'high';
}

/**
 * `/api/reading`'s, verbatim. The alternative to a timeout here is an `after()`
 * callback holding a paid invocation open until the platform kills it, taking the
 * refill with it.
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
          usage: { inputTokens: null, outputTokens: null, cachedInputTokens: null },
          errorKind: 'stream_timeout',
        }),
      STREAM_TIMEOUT_MS,
    ).unref?.();
  });
}

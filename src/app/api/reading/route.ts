import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/server';
import { getProvider } from '@/lib/llm';
import { buildPrompt } from '@/lib/prompt/build';
import { getLotusBlock, scheduleLotusRefresh } from '@/lib/prompt/lotus.generate';
import { MAX_QUESTION_LENGTH, sanitizeQuestion } from '@/lib/prompt/sanitize';
import { tFor } from '@/lib/i18n/catalog';
import { getLocale } from '@/lib/i18n/t';
import { hit, hitGlobal, hitRefusal, refusalsExhausted } from '@/lib/ratelimit';
import { reserveModelCall } from '@/lib/llm/meter';
import { gateReading } from '@/lib/moderation/gate';
import { recordModerationFlag } from '@/lib/moderation/log';
import { persistReading, touchLastSeen } from '@/lib/analytics/flush';
import { extractGist } from '@/lib/memory/gist.generate';
import { recallChain } from '@/lib/memory/chain';
import { detectCallback } from '@/lib/prompt/memory';
import { splitChoiceMarker, validateChoice } from '@/lib/reading/choice';
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

/*
 * `FAILURE_NOTICE` WAS A MODULE CONSTANT AND IS NOW `t('reading.error.midStream')`,
 * resolved per request inside the handler. It is still passed INTO `teeReading`,
 * which is what guarantees it never enters `readings.body` -- it is a system
 * message, not the reader's prose, and a stored copy would be quoted back at the
 * querent by W5's chained reading next time.
 *
 * IT MUST BE RESOLVED BEFORE THE `ReadableStream` OPENS. Inside `start(controller)`
 * there is no request context, so `await headers()` throws or answers about the
 * wrong request; `tFor(locale)` closes over a value captured in the handler body
 * instead. The leading `\n\n` and the square brackets live in the catalog value,
 * not here, because they are what make it read as a system message rather than as
 * the reader suddenly saying something strange -- there is a test asserting the
 * framing survives in both locales.
 */

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

  /*
   * THE RESOLVED UI LOCALE, NOT `user.locale`, AND THE DIFFERENCE IS I24.
   *
   * `readings.locale` records the language the PROSE CAME OUT IN, because that is
   * what history and the daily summary have to match on. `user.locale` is the
   * `loc` claim off the JWT, which is D6's "profile" and the FIRST link in the
   * resolution chain -- so for a real user the two agree, and that is exactly why
   * the chain is ordered that way.
   *
   * They diverge in one case that matters: the dev-only `?lang=` override (I12)
   * skips the claim deliberately, because `tools/shot.sh` cannot plant a cookie.
   * Reading `user.locale` here would make `?lang=en` produce an English interface
   * narrating an Indonesian reading -- which would quietly break the only way
   * Tasks 10 and 12 have to check English end to end.
   *
   * One value, captured once, used for the prompt, the Lotus block, the gist, the
   * error copy and the row. Two reads could disagree.
   */
  const locale = await getLocale();
  const t = tFor(locale);

  const ctx: AnalyticsContext = {
    userId: user.id,
    sessionId,
    locale,
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

    /*
     * FOUR BUDGETS NOW (V9), and they still answer with the same copy on
     * purpose: telling the querent WHICH ceiling they hit tells a prober which
     * one to work around. The EVENT distinguishes them -- see `limit` below --
     * because that is server-side and a prober cannot read it.
     *
     *   hit()               one person holding the button down.
     *   refusalsExhausted() somebody mapping the blocklist (W7-D13). A READ, not
     *                       a record -- `hitRefusal()` is called later, only when
     *                       a refusal actually happens.
     *   hitGlobal()         a crowd -- fifty throwaway Google accounts each
     *                       bringing their own budget, which the per-user limiter
     *                       cannot see. Now fleet-wide rather than per-instance.
     *   reserveModelCall()  THE WINDOW'S QUOTA. **This is the one that replaces
     *                       the z.ai spend cap, which does not exist on a
     *                       subscription plan.** Last, and it RECORDS.
     *
     * **THE READING RESERVES HERE AND NOT IN THE `complete()` DECORATOR**, and
     * `src/lib/llm/index.ts` has the argument: wrapping a stream means rebuilding
     * `usage`'s "must always settle, must never reject" contract by hand, and this
     * is the only place that can turn a refusal into a 429 with a `retry-after`.
     */
    const tooManyRequests = (
      retryAfterSeconds: number,
      limit: 'user' | 'refusal' | 'global' | 'daily',
    ) => {
      track('reading.rate_limited', {
        reader_id: '?',
        service_id: '?',
        retry_after_s: retryAfterSeconds,
        limit,
      });
      return NextResponse.json(
        { error: t('reading.error.rateLimit') },
        { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
      );
    };

    /*
     * Concurrent, and that is EXACTLY equivalent to the sequential form it
     * replaces: `hit()` records unconditionally today too -- it is checked first
     * and `refusalsExhausted()` is a read -- so neither's outcome can change the
     * other's effect. `hitGlobal()` still runs LAST and still runs alone, because
     * it RECORDS, and letting one user's rejected requests eat the fleet's budget
     * is a self-inflicted denial of service for everyone else.
     *
     * They are `await`ed at all because V9 made every budget a network call. One
     * round trip instead of two is the whole reason to pay the `Promise.all`.
     */
    const [perUser, probing] = await Promise.all([hit(user.id), refusalsExhausted(user.id)]);
    if (!perUser.ok) return tooManyRequests(perUser.retryAfterSeconds, 'user');
    if (probing) return tooManyRequests(probing.retryAfterSeconds, 'refusal');

    /*
     * THE CROWD, before the day's quota. Both record, so the order between them
     * is a judgement: this one is cheap to be wrong about -- a burst guard at
     * 1200/h -- and the quota is the scarce thing, so the scarce one is spent
     * last and only for a request that has passed everything else.
     */
    const perFleet = await hitGlobal();
    if (!perFleet.ok) return tooManyRequests(perFleet.retryAfterSeconds, 'global');

    /*
     * **THE WINDOW'S QUOTA, AND IT IS THE REPLACEMENT FOR A SPEND CAP THAT DOES
     * NOT EXIST.**
     *
     * `retry-after` COMES FROM THE LIMITER AND IS NOT ALWAYS THE FULL WINDOW.
     * Measured live: a tripped ceiling returned 291 seconds, not five hours.
     * `@upstash/ratelimit`'s sliding window reports `reset` as the START OF THE
     * NEXT SUB-WINDOW rather than an exact expiry, so the value is anywhere in
     * (0, window]; the memory backend, which knows the oldest timestamp, gives the
     * true figure instead. Both are honest and neither is zero, which is the
     * property that matters -- a zero would send the client straight into another
     * 429. Do not "fix" it to a hardcoded window length: that would be a guess
     * printed where a measurement belongs.
     *
     * `interactive`, because somebody is watching a spinner. That is what puts it
     * on the far side of the soft tier: deferred work -- gists, day summaries,
     * frequency verdicts -- is already being shed by the time a reading is
     * refused, so a querent seeing this 429 means the shedding was not enough.
     */
    const quota = await reserveModelCall('interactive');
    if (!quota.ok && quota.tier === 'hard') {
      return tooManyRequests(quota.retryAfterSeconds, 'daily');
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
      return invalid(t('reading.error.badRequest'), 'body_not_json');
    }

    const parsed = Body.safeParse(raw);
    if (!parsed.success) return invalid(t('reading.error.badRequest'), 'schema');

    const { reader, service, picks, question } = parsed.data;

    // The pick count has to match the service, or a "three-card spread" arrives
    // with one card and the prompt quietly describes a reading nobody drew.
    const svc = serviceById(service);
    if (!svc || picks.length !== svc.cardCount) {
      return invalid(t.plural('reading.error.cardCount', svc?.cardCount ?? 0), 'card_count');
    }

    // No duplicate cards: one physical deck, one draw.
    if (new Set(picks.map((p) => p.id)).size !== picks.length) {
      return invalid(t('reading.error.duplicateCard'), 'duplicate_cards');
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
    const lotus = await getLotusBlock(user.id, locale);

    /*
     * THE CHAIN BLOCK. One indexed read plus one card fetch, and its failure is
     * NON-FATAL for exactly the reasons the Lotus read above is.
     *
     * It is `await`ed on the request path, which roadmap §6 permits on the same
     * terms: per-user, indexed, and small. It is bounded by MEMORY_CHAIN_COUNT
     * (2), and `recallChain` swallows a database error and returns null rather
     * than throwing -- a reading without the block is a valid reading, and a
     * database hiccup must not cost the user their reading.
     */
    const memory = await recallChain({
      userId: user.id,
      currentCardIds: picks.map((p) => p.id),
      currentHasQuestion: Boolean(sanitizeQuestion(question)),
      localDate: localDate.date,
      /*
       * V2 / T12. A recalled gist may be in the other language, and the block quotes
       * it verbatim. `recallChain` prefers a cached translation and NEVER waits on a
       * model call -- see `withTranslatedGists`.
       */
      locale,
    });

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
        locale,
        // An empty summary means "there is a profile but nothing distilled yet".
        // Passing it through would render an empty `<penanya>` block, which is
        // noise in the prompt and a rule the reader would apply to nothing.
        context: { lotus: lotus && lotus.summary ? lotus : null, memory },
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
      return NextResponse.json({ error: t('reading.error.badRequest') }, { status: 400 });
    }

    track('reading.requested', {
      reading_id: readingId,
      reader_id: reader,
      service_id: service,
      card_count: picks.length,
      has_question: Boolean(question),
      question_length: question?.length ?? 0,
      lotus_present: Boolean(lotus && lotus.summary),
      memory_block_present: memory !== null,
      prompt_version: prompt.promptVersion,
    });

    if (memory) {
      track('memory.chain_offered', {
        reading_id: readingId,
        recalled_count: memory.recalled.length,
        reason: memory.reason,
        // Flattened: sanitizeProps drops arrays silently. The ids themselves are
        // recoverable by joining `readings` on reading_id and created_at.
        repeat_card_id: memory.repeatCardIds[0] ?? null,
        repeat_count: memory.repeatCardIds.length,
      });
    }

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

    /*
     * RESOLVED HERE, ON THE LAST LINE BEFORE THE STREAM EXISTS.
     *
     * `teeReading` hands this string to a `ReadableStream`'s `start(controller)`,
     * where there is no request context: `await headers()` inside it throws or
     * answers about the wrong request. `t` was built from a locale captured at the
     * top of the handler, so this is a plain closure read and cannot fail.
     *
     * It must be the READING's locale, which is the request's locale -- the same
     * one `buildPrompt` was given. If the two ever disagree, the querent gets an
     * English sentence in the middle of Indonesian prose.
     */
    const interrupted = t('reading.error.midStream');

    /*
     * THE MODERATION GATE (W7 D8/W7-D6). It sits here, on the last line before
     * the stream exists, and it is the reason this route no longer always
     * returns 200.
     *
     * `gateReading` runs the blocklist, PRIMES the reading, and races the
     * classifier against it -- so in the common case the verdict lands while the
     * provider is still thinking and the added latency is near zero. Measured:
     * classifier p95 903ms against a reading p50 TTFT of 4591ms. The priming is
     * invisible and load-bearing; `gate.ts`'s header explains what deleting it
     * would silently cost.
     *
     * IT IS HANDED THE SANITIZED STRING, NOT `question`. Moderating one string
     * and prompting another is the classic bypass, and it is easy to build by
     * accident here because `buildPrompt` sanitizes internally while this
     * handler holds the raw text. `sanitizeQuestion` is idempotent -- there is a
     * property test -- so calling it again cannot change what the model saw.
     */
    const cleanQuestion = sanitizeQuestion(question);

    let gated;
    try {
      gated = await gateReading({
        question: cleanQuestion,
        locale,
        start: (signal) => getProvider().streamReading(prompt, { signal }),
      });
    } catch (err) {
      /*
       * The reading call died BEFORE the verdict landed, so nothing has been
       * written to the wire and this is a real 500 -- which is better than a 200
       * whose body is an apology. `ReadingStartError` is the only thing
       * `gateReading` throws; anything else is a bug and gets the same treatment
       * rather than a bare crash.
       *
       * `console.error(err)` is SAFE here and nowhere near the classifier: this
       * error came from the READING call, whose request body is the system
       * prompt and the card list, not the moderation path whose body is the
       * querent's question.
       */
      console.error('reading failed before the moderation verdict', err);
      track('reading.failed', {
        reading_id: readingId,
        reader_id: reader,
        service_id: service,
        stage: 'connect',
        chars_before_failure: 0,
        error_kind: 'start_failed',
        source: 'server',
      });
      return NextResponse.json({ error: t('reading.error.start') }, { status: 500 });
    }

    const verdict = gated.verdict;

    /*
     * Two events for the two things worth counting, and neither is the refusal
     * itself: `moderation.timeout` says the classifier did not answer and which
     * way we failed, and `moderation.allowed_flagged` is the near-miss that
     * makes the FALSE-NEGATIVE side of tuning visible. Both fire whether or not
     * the reading was refused.
     */
    if (verdict.source === 'timeout') {
      track('moderation.timeout', {
        failed_open: !verdict.blocked,
        reason: 'timeout',
        reader_id: reader,
        service_id: service,
      });
    }
    if (!verdict.blocked && verdict.category !== null) {
      track('moderation.allowed_flagged', {
        category: verdict.category,
        confidence_bucket: bucket(verdict.confidence),
        reader_id: reader,
        service_id: service,
      });
    }

    /*
     * THE FLAG ROW, off the response path.
     *
     * `after()` and not `defer()`: `defer()`'s queue is drained by W4's single
     * analytics callback, which on the CLEAN path parks on the stream settling
     * for up to ANALYTICS_STREAM_TIMEOUT_MS. A refusal has no stream, and a
     * near-miss should not wait on one either. Its own `after()` keeps the two
     * independent.
     *
     * Registered for BOTH a refusal and a near-miss. `recordModerationFlag`
     * returns early when there is no category, so a genuinely clean question
     * writes nothing.
     */
    if (verdict.category !== null) {
      const flagQuestion = cleanQuestion;
      after(() =>
        recordModerationFlag({
          userId: user.id,
          question: flagQuestion,
          verdict,
          locale,
          action: verdict.blocked ? 'blocked' : 'allowed_flagged',
        }),
      );
    }

    if (gated.blocked) {
      /*
       * **THE REFUSAL CONSUMES ITS OWN BUDGET** (W7-D13), recorded here rather
       * than at the top of the handler because only now is it known that a
       * refusal happened. Five in a window and `refusalsExhausted()` starts
       * turning the next request away before it reaches the gate -- which is
       * what stops the endpoint being a free oracle for the pattern list.
       *
       * **INSIDE `after()`, AND NOT `await`ed.** V9 made this a network call, and
       * awaiting it would add a Redis round trip to the latency of a 403 that a
       * person is waiting for -- in order to record something nothing reads until
       * their next request. `after()` is the same mechanism the moderation-flag
       * write four lines above uses, on this same path.
       *
       * **NOT A BARE `void hitRefusal(...)`:** a floating promise in a serverless
       * function may be frozen before it resolves, and the refusal budget would
       * then silently not record -- turning off W7-D13's anti-oracle control,
       * invisibly.
       *
       * **AND NOT `defer()`, WHICH IS WHAT THE PLAN SAID.** `defer()` opens with
       * `if (!enabled()) return`, so with `ANALYTICS_ENABLED=0` -- which is the
       * whole unit-test project, and is one env var away in production -- the
       * refusal would never be recorded at all. An analytics kill switch must not
       * be able to disable a security control.
       */
      after(() => hitRefusal(user.id));

      track('moderation.refused', {
        // `gated.verdict`, not the `verdict` alias: narrowing follows the
        // discriminant on `gated`, and the alias is still the wide union whose
        // `source` includes 'none'.
        source: gated.verdict.source,
        category: gated.verdict.category,
        confidence_bucket: bucket(gated.verdict.confidence),
        reader_id: reader,
        service_id: service,
      });

      /*
       * `403 application/json`, not an appended notice on a 200 stream (W7-D6).
       * In both designs the querent sees no text before the verdict, so the
       * perceived latency is identical -- but a status code the client can
       * branch on is what lets the refusal render "Syarat & Ketentuan" as a real
       * LINK, and a link is the stated requirement. A `text/plain` stream cannot
       * carry one, and the message would render as reading prose.
       *
       * NO `readings` ROW AND NO `reading_cards`. `status = 'blocked'` exists in
       * the schema for a refused reading, but nothing was generated and nothing
       * was drawn against it; the record that matters is the `moderation_flags`
       * row, which W7 Task 7 writes from `after()`.
       */
      return NextResponse.json(gated.payload, {
        status: 403,
        headers: { 'cache-control': 'no-store', 'x-reading-id': readingId },
      });
    }

    const { stream, done } = teeReading(gated.stream, {
      startedAt,
      failureNotice: interrupted,
    });

    /*
     * Everything below runs after the response has flushed. It does not delay a
     * byte and it cannot fail the request.
     */
    defer(async () => {
      const outcome = await Promise.race([done, streamTimeout()]);

      /*
       * THE CHOICE MARKER COMES OFF HERE, ONCE, BEFORE ANYTHING READS THE BODY.
       *
       * **AND THERE IS DELIBERATELY NO STREAM TRANSFORM.** The obvious design puts
       * one between `gated.stream` and `teeReading` so the marker never crosses
       * the wire -- and it cannot work, because the choice arrives long after the
       * response headers and the client would then have no way to learn it. The
       * draw screen is where the querent actually reads their reading, so
       * `Draw.tsx` runs `splitChoiceMarker` incrementally on its own copy. One
       * pure function, two callers; `tee.ts` is untouched, which matters because
       * its two branches have independent queues that were expensive to get right
       * once already.
       *
       * **`prose` AND NOT `outcome.body` IS WHAT EVERY LINE BELOW MUST USE.** Three
       * consumers, and the marker is wrong in all three:
       *
       *   - `readings.body` would carry it, and W5's chained reading quotes that
       *     column back at the querent in a later prompt as if the reader had said
       *     it. That is the exact reason `[Bacaan terputus...]` is kept out.
       *   - `extractGist` would distil it.
       *   - `detectCallback` would scan it.
       *
       * `done: true`, because the stream is over: nothing may be held back, so a
       * generation that died mid-marker flushes verbatim rather than vanishing.
       *
       * `outcome.chars` is left alone. It is `tee.ts`'s measurement of what it saw
       * on the wire, and re-deriving it here would make one column mean two things
       * depending on whether a reading had a marker.
       */
      const split = splitChoiceMarker(outcome.body, true);
      const prose = split.body;
      /*
       * **VALIDATED AGAINST THE SANITIZED QUESTION, WHICH IS THE ONE THE MODEL
       * SAW.** `cleanQuestion` is also what `readings.question` stores, so the
       * column this slice comes from is byte-identical to the column it will be
       * rendered beside -- and `validateChoice`'s guarantee ("the box is a
       * substring of the question") is checkable against the stored row rather
       * than against a string that existed only in this handler.
       */
      const choice = validateChoice(split.choice, cleanQuestion);

      /*
       * TWO PROPS ON `reading.completed`, NOT AN EVENT OF ITS OWN -- see that
       * declaration in `events.ts` for why the 67th name was written and then
       * folded in.
       *
       * `invalid` is the measurement that matters: the rate at which the reader
       * names an option the querent never typed. What it CANNOT see is a marker the
       * model spelled differently enough to miss the matcher -- that renders as
       * prose and reports `none`, because there is nothing to report. The instrument
       * for the FORMAT is `npm run smoke -- --all` with choice questions; these
       * props are the instrument for the CONTENT.
       */
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

      await persistReading(
        {
          id: readingId,
          userId: user.id,
          readerId: reader,
          serviceId: service,
          locale,
          // THE SAME VALUE THE GATE MODERATED, captured once above. It was
          // previously re-derived here; one string, one sanitization, so the
          // row cannot disagree with what the classifier read.
          question: cleanQuestion,
          status: outcome.status,
          verdict: service === 'yesno' ? effectiveYesNo(draw(picks[0])) : null,
          /*
           * ALREADY NULL WHEN THERE WAS NO CHOICE, and null again when the model
           * named something the querent had not typed. The two are one column on
           * purpose: from the row's point of view both mean "this reading has no
           * choice to show", and `reading.choice_offered.valid` is where the
           * difference is recorded.
           */
          choice,
          // '' becomes NULL: §3 says body is "NULL if the stream died", and an
          // empty string that is not null is how W5 ends up chaining off a
          // reading that said nothing.
          body: prose || null,
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

      /*
       * W5's gist, AFTER the row and never before it.
       *
       * The ordering is the same argument the Lotus repair above makes, applied
       * one level down: deferred work runs in registration order inside one
       * callback, so a model call ahead of `persistReading` would delay the row
       * every memory feature depends on and would lose it outright if the
       * platform cut the invocation short. `extractGist` never throws, so it
       * cannot take `touchLastSeen` down with it.
       */
      await extractGist({ readingId, body: prose || null, locale });

      /*
       * DID THE CALLBACK ACTUALLY FIRE (§4.5)? Pure code over the finished
       * body, no second model call -- paying a classifier to answer "did it say
       * kemarin" would cost more than the feature it measures.
       *
       * `chain_used / chain_offered` is the number that decides whether this
       * feature is cut, kept or tightened, so it is only fired when a block was
       * actually offered: counting readings that never saw one would put the
       * ratio's denominator in the wrong place and make it look far healthier
       * than it is.
       */
      if (memory && prose) {
        const hit = detectCallback({
          body: prose,
          currentCardIds: picks.map((p) => p.id),
          recalledCardIds: memory.recalled.flatMap((r) => r.cards.map((c) => c.cardId)),
          locale,
        });
        if (hit.fired && hit.signal) {
          track('memory.chain_used', { reading_id: readingId, signal: hit.signal });
        }
      }

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

/**
 * Coarsen a classifier confidence for the event taxonomy.
 *
 * BUCKETS, NOT THE NUMBER, because self-reported LLM confidence is not
 * calibrated and a float in an analytics prop invites someone to average it.
 * `moderation_flags.confidence` keeps the real value for tuning; the event
 * carries only enough to spot a distribution shift.
 */
function bucket(confidence: number | null): 'low' | 'medium' | 'high' | null {
  if (confidence === null) return null;
  if (confidence < 0.5) return 'low';
  return confidence < 0.8 ? 'medium' : 'high';
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

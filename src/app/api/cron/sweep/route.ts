import { NextResponse } from 'next/server';
import { activeBackend } from '@/lib/ratelimit';
import { sql } from 'drizzle-orm';
import { ERASURE_GRACE_DAYS } from '@/lib/db/queries/profile';

/**
 * **ONE CRON JOB, FIVE DELETES** (reconciliation §7.8 and §7.9b; V2 §8 added the
 * fourth; A3, v0.5.0, added the fifth).
 *
 * Not four jobs. Vercel's free plan allows a small number of cron
 * invocations, they all want the same daily cadence, and four routes doing one
 * `DELETE` each is four things to notice have stopped working.
 *
 *   1. **Expired soft-deleted accounts.** §7.8 promises "gone at 30 days", not
 *      "gone at 30 days if you come back". `upsertUserOnSignIn`'s lazy purge is
 *      the SAFETY NET and only fires for a user who returns; this is the
 *      mechanism. The hard delete cascades per W1's schema and frees the
 *      `google_sub`, so that Google account can sign up again as a stranger.
 *   2. **Moderation question redaction.** `log.ts`'s lazy sweep runs inside the
 *      `after()` that writes a flag, which is self-healing but only while
 *      moderation keeps firing. This is the belt to that braces -- and it is the
 *      one that makes the privacy policy's "deleted after 30 days" true even in
 *      a quiet month.
 *   3. **The `events` TTL.** 180 days (§7.9b), stated in the privacy policy.
 *      `readings` is deliberately NOT on this clock -- every memory feature
 *      reads it, and the policy says so in those words.
 *   4. **Orphaned translations** (V2). `translations.entity_id` has NO FOREIGN
 *      KEY -- Postgres cannot declare a polymorphic one, and that is the
 *      deliberate cost of one generic table instead of a migration per artifact.
 *      So deleting a reading leaves its translations behind, and this is the
 *      answer. The statement lives in `queries/translations.ts` rather than
 *      inline here, because unlike the three above it is an ordinary query
 *      function with its own integration test.
 *   5. **The `llm_calls` ledger TTL** (A3, v0.5.0, reconciliation R19).
 *      `LLM_CALLS_RETENTION_DAYS`, default **400**.
 *
 *      **NOT `events`' 180, and the difference between the two tables IS the
 *      argument.** `events` is a behavioural firehose whose value decays in weeks
 *      and which the privacy policy commits to deleting. `llm_calls` is a **cost
 *      ledger**, it holds no querent text at all, and the one question it exists
 *      to answer -- *"what did this cost, and is that growing"* -- needs a
 *      year-over-year comparison to be answerable. 400 is `HISTORY_DAY_LIMIT`'s
 *      number and `series.ts`'s `MAX_RANGE_DAYS`: **the retention window and the
 *      maximum queryable range are the same number on purpose**, so the dashboard
 *      can never offer a range whose data has already been swept -- which would
 *      look like a bug in the chart rather than like a retention policy.
 *
 *      **The binding input is Neon free's 0.5 GB, not a row rate that does not
 *      exist yet.** At ~450 B/row all-in (five indexes roughly double a ~200 B
 *      heap tuple), 400 days at 1,000 calls/day is ~400k rows ≈ 180 MB, 36% of
 *      the plan; at a realistic early 50/day it is ~9 MB. **Revisit at 100 MB or
 *      25% of the plan's storage, whichever comes first** -- and the options, in
 *      order, are a shorter window, then dropping `llm_calls_op_created_idx`
 *      (whose query is monthly, not per-request), then a daily rollup table for
 *      rows older than 90 days, which is a v0.6.0 schema and is named here only
 *      so nobody invents it in an emergency.
 *
 * **`admin_access_log` IS NEVER SWEPT, AND ITS ABSENCE IS A TESTED PROPERTY.**
 * §9.14: an audit trail with a delete path is the audit trail's absence, and a
 * retention policy is a delete path with a timer on it. `/privacy` clause 6's row
 * for it therefore reads *kept indefinitely*, which is the honest one.
 * `sweep.retention.integration.test.ts` reads this file and asserts the string
 * does not appear in it -- the `callClass.test.ts` grep precedent, a negative
 * control named for the outcome rather than for the mechanism.
 *
 * **THE ORDER MATTERS AND IS NOT ALPHABETICAL.** Erasure runs FIRST so that a
 * purged user's rows are gone before the other sweeps walk the same tables;
 * running it last would mean redacting flags that are about to be orphaned
 * anyway, and doing the work twice.
 *
 * **AND THE FOURTH RUNS LAST, BY THE SAME ARGUMENT EXTENDED.** The user purge
 * CASCADEs `readings`, `daily_summaries` and `frequency_verdicts` away -- but NOT
 * their translations, which have no foreign key to be reached by. Those rows
 * become orphans DURING this invocation. Reaping last catches them the same
 * night; reaping first leaves them a day.
 *
 * ---
 *
 * **WHY THIS IS NOT `after()`.** Everything else W7 writes is off the response
 * path by construction. A sweep has no request to hang off: the whole point is
 * that it runs on a day when nobody trips moderation and nobody signs in.
 */

export const runtime = 'nodejs';

/**
 * A sweep can walk three tables. Sixty seconds is far more than it needs at this
 * scale and is the ceiling before the platform kills the invocation -- if this
 * ever times out, the fix is batching, not a bigger number.
 */
export const maxDuration = 60;

/** How long an `events` row lives. Reconciliation §7.9b. */
function eventsRetentionDays(): number {
  const raw = Number(process.env.EVENTS_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 180;
}

function moderationRetentionDays(): number {
  const raw = Number(process.env.MODERATION_QUESTION_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

/**
 * How long an `llm_calls` row lives. A3, v0.5.0, reconciliation R19.
 *
 * **THE `> 0` IS NOT HYGIENE HERE, IT IS THE WHOLE GUARD.** `Number('abc')` is
 * `NaN` and `Number('')` is `0`; without both halves of the test a typo in the
 * Vercel dashboard becomes `make_interval(days => 0)` and **the fifth delete
 * empties the table on its first run**, silently, at 03:17. `auth/ttl.ts`'s
 * defensiveness, with a sharper consequence.
 */
function llmCallsRetentionDays(): number {
  const raw = Number(process.env.LLM_CALLS_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 400;
}

/**
 * **WITHOUT `CRON_SECRET` THE ROUTE 503s RATHER THAN RUNNING UNAUTHENTICATED.**
 *
 * An open endpoint that deletes rows is worse than a sweep that never runs, and
 * a sweep that never runs is visible in the data within a month. Vercel Cron
 * sends the value as `Authorization: Bearer <secret>`.
 *
 * Compared with `timingSafeEqual` on equal-length buffers. A `!==` on a secret
 * leaks its prefix through timing, and while that is a slow attack against a
 * 32-byte random value, the correct comparison is three lines.
 */
async function authorize(request: Request): Promise<Response | null> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron] CRON_SECRET is not set; refusing to run the sweep');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  const { timingSafeEqual } = await import('node:crypto');
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // Length is not secret and timingSafeEqual throws on a mismatch, so it is
  // checked first rather than padded around.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return null;
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  /*
   * Dynamic, like `flush.ts`'s. A static import would pull `server-only` into
   * anything that imports this module for a type, and the route is the only
   * caller that needs the singleton.
   */
  const { db } = await import('@/lib/db/client');

  const startedAt = Date.now();
  const result = {
    purgedUsers: 0,
    redactedFlags: 0,
    deletedEvents: 0,
    orphanedTranslations: 0,
    deletedLlmCalls: 0,
  };
  const failures: string[] = [];

  /*
   * **EACH DELETE IS INDEPENDENTLY WRAPPED.** One failing sweep must not stop
   * the other two: the three promises are unrelated, and a `moderation_flags`
   * lock should not mean an account's erasure silently slips another day.
   */
  try {
    const rows = await db.execute(sql`
      delete from users
       where deleted_at is not null
         and deleted_at < now() - make_interval(days => ${ERASURE_GRACE_DAYS}::int)
    `);
    result.purgedUsers = (rows as unknown as { count?: number }).count ?? 0;
  } catch (err) {
    failures.push('users');
    console.error('[cron] user purge failed', err instanceof Error ? err.name : 'unknown');
  }

  try {
    const rows = await db.execute(sql`
      update moderation_flags
         set question = null, redacted_at = now()
       where question is not null
         and created_at < now() - make_interval(days => ${moderationRetentionDays()}::int)
    `);
    result.redactedFlags = (rows as unknown as { count?: number }).count ?? 0;
  } catch (err) {
    /*
     * The error's CLASS only. A postgres error quotes the failing statement and
     * its bound parameters, and this statement's table holds the text of the
     * most sensitive questions in the product -- logging the error object would
     * put them in the platform log, outside the retention policy this very
     * statement exists to enforce.
     */
    failures.push('moderation');
    console.error('[cron] moderation redaction failed', err instanceof Error ? err.name : 'unknown');
  }

  try {
    const rows = await db.execute(sql`
      delete from events
       where created_at < now() - make_interval(days => ${eventsRetentionDays()}::int)
    `);
    result.deletedEvents = (rows as unknown as { count?: number }).count ?? 0;
  } catch (err) {
    failures.push('events');
    console.error('[cron] events TTL failed', err instanceof Error ? err.name : 'unknown');
  }

  /*
   * **THE FOURTH DELETE, AND IT RUNS LAST** (V2 §8). See the header for the ordering
   * argument: the user purge above CASCADEs `readings` away and does NOT reach their
   * translations, because `translations.entity_id` has no foreign key. Those rows
   * became orphans a few statements ago, and this catches them tonight rather than
   * tomorrow night.
   *
   * The statement is a query function rather than inline SQL, unlike the three
   * above, because it is several statements with a `to_regclass` guard between them
   * and it has its own integration test. `sweep.contract.test.ts` asserts it is
   * still called and still called after the purge.
   */
  try {
    const { deleteOrphanTranslations } = await import('@/lib/db/queries/translations');
    result.orphanedTranslations = await deleteOrphanTranslations(db);
  } catch (err) {
    /*
     * The error's CLASS only, same rule as the three above and with the sharpest
     * reason yet: a postgres error quotes its bound parameters, and this table's
     * `body` column holds a rendering of a reading that answered the querent's typed
     * question.
     */
    failures.push('translations');
    console.error(
      '[cron] orphaned-translation sweep failed',
      err instanceof Error ? err.name : 'unknown',
    );
  }

  /*
   * **THE FIFTH DELETE, AND IT RUNS LAST FOR THE FOURTH'S REASON EXTENDED ONE HOP.**
   * The user purge above CASCADEs `readings` away, and both `llm_calls.user_id` and
   * `llm_calls.reading_id` are `on delete set null` -- so rows *become* partially
   * unattributed DURING this invocation. Sweeping last means the same night's
   * arithmetic is done against the state the night leaves behind. (Those rows survive
   * as unattributed cost, which is correct and which M12 already states on the page:
   * the tokens were spent.)
   */
  try {
    const rows = await db.execute(sql`
      delete from llm_calls
       where created_at < now() - make_interval(days => ${llmCallsRetentionDays()}::int)
    `);
    result.deletedLlmCalls = (rows as unknown as { count?: number }).count ?? 0;
  } catch (err) {
    /*
     * The error's CLASS only. This table holds no querent text -- nine scalars, a
     * model name and two ids -- but the rule is *never log a driver error from any
     * path that runs a query*, and **a `catch` that is an exception to the rule is a
     * `catch` somebody copies** into one that is not.
     */
    failures.push('llm_calls');
    console.error('[cron] llm_calls TTL failed', err instanceof Error ? err.name : 'unknown');
  }

  /*
   * **THE SIZE PROBE, WHICH IS THE ACTUAL DELIVERABLE OF R19 AND IS LOGGED EVERY
   * NIGHT WHETHER OR NOT ANYTHING HAPPENED.**
   *
   * The retention number above is a calculation, not a measurement: nobody has a real
   * row rate for this table and nobody will before it ships. This is what makes the
   * missing input start existing tonight -- **a size series is only useful as a
   * series**, so unlike the ceiling warning below it fires unconditionally. One line a
   * night in a Vercel log is the cheapest time series this project can have.
   *
   * `pg_total_relation_size` and not `pg_relation_size`: it includes the indexes,
   * which is the number that matters here -- five of them roughly double the heap, so
   * a heap-only figure understates this table by half.
   *
   * NOT a `failures` entry: a diagnostic that could not run must not turn a successful
   * sweep red. Same rule as the ceiling report.
   */
  try {
    const rows = await db.execute(sql`
      select count(*)                            as rows,
             pg_total_relation_size('llm_calls') as bytes,
             min(created_at)::text               as oldest
        from llm_calls
    `);
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];
    const bytes = Number(row?.bytes ?? 0);
    console.log(
      `[llm_calls] rows=${Number(row?.rows ?? 0)} bytes=${bytes} ` +
        `mb=${(bytes / 1_048_576).toFixed(1)} oldest=${row?.oldest ?? 'none'} ` +
        `retention_days=${llmCallsRetentionDays()}`,
    );
  } catch (err) {
    console.error('[cron] llm_calls size probe failed', err instanceof Error ? err.name : 'unknown');
  }

  /*
   * **V9 ADDS ONE SELECT AND NO SECOND JOB.** This file's header is emphatic that
   * there is ONE cron job -- five deletes now, three when V9 wrote this -- because
   * Vercel's free plan allows a small number of invocations, so the ceiling's early
   * warning rides along on the job that is already running rather than asking for
   * one of its own. A3's size probe above joined it on the same terms.
   *
   * It is the ONLY thing in V9's design that fires on a day when nobody visits,
   * and it is still only a log line. **Nothing here pages anybody**, and pretending
   * otherwise would need a service this project does not have. Query 9 is the
   * thing somebody has to actually run.
   */
  try {
    const rows = await db.execute(sql`
      select
        count(*) filter (where name = 'llm.ceiling_reached'
                           and props->>'tier' = 'soft')             as soft,
        count(*) filter (where name = 'llm.ceiling_reached'
                           and props->>'tier' = 'hard')             as hard,
        count(*) filter (where name = 'ratelimit.backend_degraded') as degraded
        from events
       where created_at >= now() - interval '1 day'
         and name in ('llm.ceiling_reached', 'ratelimit.backend_degraded')
    `);
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];
    const soft = Number(row?.soft ?? 0);
    const hard = Number(row?.hard ?? 0);
    const degraded = Number(row?.degraded ?? 0);

    if (soft > 0 || hard > 0 || degraded > 0) {
      /*
       * Only when there is something to say. A line printed every single day is a
       * line nobody reads, which is the failure mode this whole mechanism has.
       *
       * `degraded` counts MINUTES, not requests -- the event is throttled to one
       * per instance per minute -- so a steady non-zero value means the fleet-wide
       * limiter is not fleet-wide and every stated limit is silently multiplied by
       * the number of warm instances.
       */
      console.warn(
        `[llm] yesterday: ceiling soft=${soft} hard=${hard}, limiter degraded_minutes=${degraded}. See query 9.`,
      );
    }
  } catch (err) {
    // Never the error object: same rule as the two blocks above. And NOT a
    // `failures` entry -- a diagnostic that could not run must not turn a
    // successful sweep red.
    console.error('[cron] ceiling report failed', err instanceof Error ? err.name : 'unknown');
  }

  /*
   * **WHICH LIMITER BACKEND PRODUCTION IS ACTUALLY ON**, reported once a day
   * because nothing else reports it. `ratelimit.backend_degraded` fires when
   * Redis FAILS; it does not fire when Redis was never configured, and an
   * unconfigured limiter is the likelier of the two -- a variable missing from
   * the Vercel dashboard, with the app looking perfectly healthy while every
   * stated limit is silently multiplied by the number of warm instances.
   *
   * `limiter: "memory"` in a production log line is the alarm.
   */
  const body = { ...result, failures, limiter: activeBackend(), ms: Date.now() - startedAt };

  /*
   * Counts, never rows. The response goes into a Vercel cron log, which is a
   * place the querent's data must not be -- and the counts are what tells you
   * the job is alive: three zeroes forever is a job that has silently stopped
   * matching anything.
   */
  console.log('[cron] sweep', JSON.stringify(body));

  // 500 on any failure, so the cron dashboard shows red rather than a green run
  // that quietly did two thirds of its job.
  return NextResponse.json(body, { status: failures.length > 0 ? 500 : 200 });
}

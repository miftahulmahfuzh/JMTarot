import { NextResponse } from 'next/server';
import { activeBackend } from '@/lib/ratelimit';
import { sql } from 'drizzle-orm';
import { ERASURE_GRACE_DAYS } from '@/lib/db/queries/profile';

/**
 * **ONE CRON JOB, THREE DELETES** (reconciliation §7.8 and §7.9b).
 *
 * Not three jobs. Vercel's free plan allows a small number of cron
 * invocations, they all want the same daily cadence, and three routes doing one
 * `DELETE` each is three things to notice have stopped working.
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
 *
 * **THE ORDER MATTERS AND IS NOT ALPHABETICAL.** Erasure runs FIRST so that a
 * purged user's rows are gone before the other two sweeps walk the same tables;
 * running it last would mean redacting flags that are about to be orphaned
 * anyway, and doing the work twice.
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
  const result = { purgedUsers: 0, redactedFlags: 0, deletedEvents: 0 };
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
   * **V9 ADDS ONE SELECT AND NO FOURTH JOB.** This file's header is emphatic that
   * there is ONE cron job with THREE deletes, because Vercel's free plan allows a
   * small number of invocations -- so the ceiling's early warning rides along on
   * the job that is already running rather than asking for one of its own.
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

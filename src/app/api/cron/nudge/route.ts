/**
 * SOURCE 3. **THE DAILY NUDGE.** One sweep, three phases, at an hour a person would
 * message you.
 *
 * ── IT GETS ITS OWN CRON JOB, AND THE ROADMAP'S REASON FOR DOUBTING THAT IS GONE ──
 *
 * `C-N2a` and `Q5` both rested on a scarcity that no longer exists. **Verified 2026-08-07
 * against `vercel.com/docs/cron-jobs/usage-and-pricing` and the changelog entry *"Cron
 * jobs now support 100 per project on every plan"* (2026-01-20): 100 jobs on Hobby,
 * minimum interval once per day, per-hour precision (±59 min).** The fold into
 * `/api/cron/sweep` does not happen and is not designed (`[R3]`).
 *
 * **AND `0 12 * * *` IS 19:00–19:59 WIB, NOT NOON.** Vercel cron schedules are **always
 * UTC** (`[R4]`) — the same fact that makes `sweep`'s `17 3 * * *` 10:17 WIB rather than
 * the 3am the roadmap built an argument on. Evening, after work, the hour a person
 * actually messages you. **Written down because the next session to read `0 12` will
 * otherwise "fix" it to noon.**
 *
 * It is deliberately far from the sweep's slot so the two never share a warm lambda or a
 * Neon wake-up, and **it is the one line that changes if the quiet-hours ruling is ever
 * revisited** — `[R17]` took Option A, and §5's whole argument is that source 3's quiet
 * hours *are* its schedule.
 *
 * ── THE THREE PHASES, AND THE ORDER IS THE ARGUMENT (§3) ──────────────────
 *
 *  1. **Abandon expired runs** (`[F5-5]`). First, because a room with a stale open run is
 *     ineligible for a fresh one, and reaping after minting would leave those querents
 *     skipped for another day. `sweep`'s header makes the same argument for running
 *     erasure first.
 *  2. **Mint** for eligible candidates.
 *  3. **Advance one beat** of each run it just minted, and of any run left `pending`
 *     earlier. **THIS IS WHY THE CRON IS WORTH HAVING.** Sources 1 and 2 mint while the
 *     querent is in the app, so their runs are warmed by the next tick; a cron run has
 *     nobody to warm it, an unwarmed run produces no bubble, and **no bubble means no
 *     dot** (`[F5-6]`). A cron that only mints does nothing a querent can see.
 *
 * ── THE FAN-OUT IS BOUNDED, AND THE SUCCESSOR IS NAMED RATHER THAN INVENTED ──
 *
 * A `chat_plan` is a large prompt and a tiny reply; a `chat_turn` is a large prompt and a
 * two-sentence reply. Budget ~6s each against a 45s wall clock inside the 60s ceiling, so
 * `NUDGE_MAX_USERS = 8` is **derived rather than guessed**. At a scale where 8 is too few
 * the fix is **not a bigger number** — it is that the cron mints only and a queue drains
 * it, which is a v0.8.0 mechanism named here so nobody invents it in an emergency
 * (`[F5-Q5]`). The current scale is a consent screen in Testing mode with two accounts.
 */
import { NextResponse } from 'next/server';

import { utcDateString } from '@/lib/analytics/localdate';
import { logChatFailure } from '@/lib/chat/log';
import { abandonExpiredRuns, nudgeCandidates } from '@/lib/chat/proactive/detect';
import { mintProactiveRun } from '@/lib/chat/proactive/mint';
import { advance } from '@/lib/chat/run';
import { chatEnabled, chatProactiveEnabled } from '@/lib/llm/flags';

export const runtime = 'nodejs';

/**
 * **NOT `default`.** `[R5]`: §4.1's table said `default` for three routes and its own next
 * paragraph contradicted it. `default` is Vercel's ten-second Hobby value — the one that
 * killed `POST /api/locale` on a cold lambda plus a suspended Neon compute. This route
 * makes model calls on purpose.
 */
export const maxDuration = 60;

/** Phase 3 stops here, leaving 15s of the ceiling for the response and the log. */
const WALL_CLOCK_BUDGET_MS = 45_000;

/**
 * **THE BACKLOG BOUND** (`[F5-5]`). Under quota pressure the app accumulates pending runs
 * rather than losing them (`C-D6` consequence 3) — the single best argument for the run
 * engine — but a week of pressure would otherwise deliver seven-day-old greetings the
 * moment the ceiling clears, which is worse than never having spoken.
 *
 * Falls back rather than becoming zero, per `auth/ttl.ts`: a TTL of `0` would abandon
 * every run the instant it was minted, and the symptom is a chat that silently never
 * answers anybody.
 */
function runTtlHours(): number {
  const raw = Number(process.env.PROACTIVE_RUN_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
}

/** How many querents one invocation will mint AND warm. Derived in the header. */
function maxUsers(): number {
  const raw = Number(process.env.NUDGE_MAX_USERS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8;
}

/**
 * **`CRON_SECRET` IS SHARED WITH THE SWEEP, AND THE ROUTE 503s WITHOUT IT** (`[F5-16]`).
 *
 * `sweep/route.ts`'s header argues that an open endpoint which deletes rows is worse than
 * a sweep that never runs. This one does not delete — it **writes rows into other
 * people's chat rooms, and it fans out over every user**, so an open version of it is a
 * way to make the app message everybody.
 *
 * One secret and not two: a second is a second thing to rotate, a second thing to have
 * unset, and a second 503 nobody recognises. `timingSafeEqual` on equal-length buffers,
 * because a `!==` on a secret leaks its prefix through timing.
 *
 * **`x-vercel-cron-schedule` IS NOT AN AUTHORISATION SIGNAL** — it is a header any caller
 * can set. `CRON_SECRET` is the only gate.
 */
async function authorize(request: Request): Promise<Response | null> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron] CRON_SECRET is not set; refusing to run the nudge');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { timingSafeEqual } = await import('node:crypto');
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const startedAt = Date.now();
  const { db } = await import('@/lib/db/client');
  const now = new Date();

  /*
   * **THE QUERENT'S CALENDAR DAY IS THE ONE THING THE CRON CANNOT KNOW** (§4.8). Sources
   * 1 and 2 have a client and therefore a `LOCAL_DATE_HEADER`; this has neither.
   *
   * **THE CONSEQUENCE, STATED SO NOBODY "FIXES" IT INTO THE OTHER ONE:** for a querent in
   * UTC+7, between 00:00 and 07:00 WIB the cron's UTC date is still *yesterday*, so if
   * `proactive_count_date` already reads today-in-WIB the counter resets and grants **one
   * extra** run. **The failure is a bounded overcount of one, never an undercount that
   * silences the feature** — which is the safe direction, and one the schedule makes
   * almost unreachable: `0 12 * * *` UTC is 19:00 WIB, the same calendar day in both
   * zones.
   *
   * The alternative — reading each candidate's last-known `local_date` off their most
   * recent `readings` row — is one query per candidate inside a fan-out, to buy a
   * correction to a case the schedule already avoids. Declined, and recorded.
   */
  const localDate = utcDateString(now);

  const result = {
    candidates: 0,
    minted: 0,
    advanced: 0,
    abandoned: 0,
    skipped: 0,
  };
  const failures: string[] = [];

  /*
   * **BOTH FLAGS, AT CALL TIME** (`C-D15`). `CHAT_PROACTIVE_ENABLED=0` is the flag an
   * operator reaches for first, because proactive runs are the ones with no human waiting
   * and therefore the cheapest to lose. The sweep still happens: **abandoning a stale run
   * is bookkeeping, not generation**, and leaving a backlog to rot behind a kill switch is
   * how the switch becomes something you cannot turn back on.
   */
  const generating = chatEnabled() && chatProactiveEnabled();

  // ---- 1. Reap ------------------------------------------------------------
  try {
    result.abandoned = await abandonExpiredRuns(db, {
      olderThan: new Date(now.getTime() - runTtlHours() * 3_600_000),
      now,
    });
  } catch (err) {
    failures.push('reap');
    /* `[F5-17]`: the error's CLASS only. This statement binds no querent text, but **a
     * `catch` that is an exception to the rule is a `catch` somebody copies** into one
     * that is not — `sweep`'s own words about `llm_calls`. */
    logChatFailure('nudge.reap', err);
  }

  // ---- 2. Mint, and 3. warm ----------------------------------------------
  if (generating) {
    let candidates: Array<{ userId: string; locale: 'id' | 'en' }> = [];
    try {
      candidates = await nudgeCandidates(db, { localDate, limit: maxUsers() });
      result.candidates = candidates.length;
    } catch (err) {
      failures.push('candidates');
      logChatFailure('nudge.candidates', err);
    }

    for (const candidate of candidates) {
      /*
       * **EACH CANDIDATE IS WRAPPED INDEPENDENTLY**, `sweep`'s pattern: *"one failing
       * sweep must not stop the other two."* One malformed thread row must not take the
       * nudge down for everybody.
       */
      try {
        const minted = await mintProactiveRun({
          userId: candidate.userId,
          source: 'cron',
          localDate,
          locale: candidate.locale,
          now,
        });

        if (!minted.minted) {
          result.skipped += 1;
          continue;
        }
        result.minted += 1;

        /*
         * **PHASE 3, AND THE BUDGET STOPS THE ADVANCING WITHOUT STOPPING THE MINTING.**
         * A run that was minted and not warmed is not lost — it is `pending`, the
         * querent's next tick warms it, and tomorrow's invocation would too. A run that
         * was never minted is gone until the material is found again.
         *
         * **ONE STEP, WHICH IS THE PLAN AND NOT THE FIRST BUBBLE.** `C-R2`: one advance
         * call does exactly one thing. The dot therefore usually appears on the querent's
         * next visit rather than overnight, and `C-N2c` is why that is the honest
         * version: *minting a run and back-dating it so it looks like it arrived
         * overnight is a lie the querent can catch the first time they watch the
         * timestamp appear.*
         */
        if (Date.now() - startedAt < WALL_CLOCK_BUDGET_MS) {
          await advance({ userId: candidate.userId, locale: candidate.locale });
          result.advanced += 1;
        }
      } catch (err) {
        failures.push(`user:${candidate.userId.slice(0, 8)}`);
        logChatFailure('nudge.candidate', err, { user: candidate.userId });
      }
    }
  }

  const body = { ...result, generating, localDate, failures, ms: Date.now() - startedAt };

  /*
   * **COUNTS, NEVER ROWS.** The response goes into a Vercel cron log, which is a place the
   * querent's data must not be — and the counts are what tells you the job is alive:
   * zeroes forever is a job that has silently stopped matching anything.
   *
   * **A LOG LINE AND NOT AN EVENT.** F1 dropped `chat.nudge_ran` on the ground that
   * *"`/api/cron/sweep` logs rather than emitting, and the nudge follows it"* — the
   * subject here is an invocation rather than a querent, and `events` rows are keyed to a
   * person.
   */
  console.log('[cron] nudge', JSON.stringify(body));

  /* 500 on any failure, so the cron dashboard shows red rather than a green run that
   * quietly did two thirds of its job. `sweep`'s rule. */
  return NextResponse.json(body, { status: failures.length > 0 ? 500 : 200 });
}

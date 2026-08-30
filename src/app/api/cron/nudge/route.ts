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
 * ── TWO SLOTS, BOTH UTC, AND `0 12` IS STILL NOT NOON ─────────────────────
 *
 * Vercel cron schedules are **always UTC** (`[R4]`) — the same fact that makes `sweep`'s
 * `17 3 * * *` 10:17 WIB rather than the 3am the roadmap built an argument on.
 *
 *   `0 12 * * *`  ->  19:00–19:59 WIB, evening, after work.  `?slot=malam`
 *   `0  1 * * *`  ->  08:00–08:59 WIB, morning, on the way in.  `?slot=pagi`
 *
 * **THE MORNING SLOT IS R3's, AND IT IS THE ONLY WAY A MONDAY-MORNING GREETING CAN REACH
 * SOMEBODY WHO IS NOT ALREADY IN THE APP.** The brief's own worked example is *"njir,
 * udah senin aja. mager ga lu ngantor?"*, which is a thing you say before noon; with one
 * evening slot the cron could never say it to a dormant querent, and the tick only fires
 * for somebody who has already opened the app.
 *
 * **AND IT IS ONLY PAYABLE BECAUSE QUIET HOURS ARE LIVE** (`[R17]` reversed, 2026-08-30).
 * 01:00 UTC is 08:00 in Jakarta and 02:00 in Berlin, so a second fixed hour would have
 * been a message in the middle of the night for anyone outside the zone the schedule was
 * chosen for. `eligibility.ts`'s gate 5 is what makes the hour safe for every querent
 * whose browser has reported an offset — **and it is exactly the reason a schedule stops
 * being the quiet-hours mechanism the moment there is more than one of them.**
 *
 * **THE `slot` QUERY PARAMETER IS A LOG LABEL AND NOTHING ELSE.** No branch reads it, so
 * the two invocations are byte-identical in behaviour; it exists so `[cron] nudge` can be
 * told apart in the log, and it makes the two entries distinct paths. If the platform
 * ever strips or refuses it, both entries fall back to a `null` slot and the only thing
 * lost is the label.
 *
 * A run minted here has nobody present to warm it, which is what phase 3 below is for.
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
 * two-sentence reply, ~6s each against the 45s wall clock inside the 60s ceiling — which
 * bounds **phase 3, the warm**, and enforces itself in the loop below.
 *
 * **`NUDGE_MAX_USERS` IS 20 SINCE 2026-08-30 AND IT BOUNDS THE MINT, NOT THE WARM.** The
 * old 8 conflated the two; a mint is ~100ms, so twenty cost ~2s and the same ~7 warms
 * still happen. See `maxUsers()` for the whole re-derivation. At a scale where twenty is
 * too few the fix is **still not a bigger number** — it is that the cron mints only and a
 * queue drains it, which is a v0.8.0 mechanism named here so nobody invents it in an
 * emergency (`[F5-Q5]`). The current scale is a consent screen in Testing mode with two
 * accounts.
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
 * engine — but a backlog delivered late is worse than never having spoken.
 *
 * **TWENTY-FOUR HOURS SINCE 2026-08-30. IT WAS FORTY-EIGHT**, and the reason it came down
 * is that the material got day-shaped. A `reading` follow-up is still roughly true two
 * days later; *"udah senin aja"* delivered on Wednesday is not, and a time-anchored
 * greeting arriving a day late is the exact failure R1 exists to prevent, arriving
 * through the back door. One day is also the interval over which the cron itself is
 * guaranteed to have run — twice, now — so nothing is aged out that was never offered a
 * second chance to be warmed.
 *
 * The cost is real and is recorded: a quota outage longer than a day now loses the runs
 * it sheds instead of holding them. **That is the right trade for a run nobody was
 * waiting for and the wrong one for a reading**, which is why it applies here and to
 * nothing else.
 *
 * Falls back rather than becoming zero, per `auth/ttl.ts`: a TTL of `0` would abandon
 * every run the instant it was minted, and the symptom is a chat that silently never
 * answers anybody.
 */
function runTtlHours(): number {
  const raw = Number(process.env.PROACTIVE_RUN_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

/**
 * How many querents one invocation will **mint** for. Twenty since 2026-08-30; it was
 * eight.
 *
 * **THE OLD NUMBER CONFLATED TWO DIFFERENT LIMITS AND THE RE-DERIVATION IS THE POINT.**
 * Eight came from *"~6s per model call against a 45s wall clock"* — but that budget bounds
 * **phase 3, the warm**, and it already enforces itself: the loop checks
 * `WALL_CLOCK_BUDGET_MS` before every `advance` and stops advancing while it keeps
 * minting. A mint is three indexed reads and one transaction, ~100ms, so twenty of them
 * is ~2s of the invocation and leaves the rest of the budget for warms exactly as before.
 *
 * **THE CONSEQUENCE, STATED:** roughly seven of the twenty get a bubble tonight and the
 * rest stay `pending` — which the route's phase-3 comment already calls the correct
 * outcome, because *"a run that was minted and not warmed is not lost"* and the querent's
 * next tick warms it. Minting for more people than can be warmed is strictly better than
 * minting for fewer, since an unminted run is gone until the material is found again.
 *
 * At a scale where twenty is too few the fix is **still not a bigger number** — it is
 * that the cron mints only and a queue drains it, a v0.8.0 mechanism named here so nobody
 * invents it in an emergency (`[F5-Q5]`).
 */
function maxUsers(): number {
  const raw = Number(process.env.NUDGE_MAX_USERS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

/** The two scheduled slots. A LOG LABEL, closed, and no branch reads it. */
type NudgeSlot = 'pagi' | 'malam';

/**
 * **A CLOSED SET, NEVER THE RAW STRING.** This value goes into `console.log`, and the
 * route is reachable by anybody holding `CRON_SECRET`; free text from a query parameter
 * in a log line is the same class of thing `sanitizeProps` refuses in `events.props`.
 */
function slotOf(request: Request): NudgeSlot | null {
  const raw = new URL(request.url).searchParams.get('slot');
  return raw === 'pagi' || raw === 'malam' ? raw : null;
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

  /* A label for the log, resolved once. No branch below reads it. */
  const slot = slotOf(request);

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
   * silences the feature** — which is the safe direction, and one both schedules avoid:
   * `0 12` UTC is 19:00 WIB and `0 1` UTC is 08:00 WIB, the same calendar day in both
   * zones.
   *
   * **RE-EXAMINED 2026-08-30, WHEN `chat_threads.utc_offset_minutes` STOPPED BEING NULL,
   * AND THE ANSWER IS STILL NO.** The offset would let this route compute each
   * candidate's true day — but `localDate` is also `nudgeCandidates`' own selection
   * predicate (`proactive_count_date is distinct from :localDate or
   * proactive_count_today = 0`), so deriving a different day inside `mintProactiveRun`
   * would let the mint stamp a day the selector did not select on. **That trades a
   * bounded overcount of one for an undercount that silences the feature**, which is the
   * wrong direction, and the whole correction is to a case the schedules already avoid.
   * The honest version is to derive the day in `nudgeCandidates` and the mint together,
   * in one change, once offset coverage is high enough to be worth it. Declined again,
   * and recorded again.
   *
   * **QUIET HOURS DO NOT HAVE THIS PROBLEM AND ARE NOT AFFECTED BY IT.** They ask what
   * *hour* it is, not what day, and `mintProactiveRun` reads the offset off the thread
   * row it is already loading.
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

  const body = { ...result, slot, generating, localDate, failures, ms: Date.now() - startedAt };

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

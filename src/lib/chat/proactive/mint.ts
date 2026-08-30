/**
 * THE MINT. Read the room, run the gates, find the material, write one `chat_runs` row.
 *
 * ── `[F5-4]` NO MODEL CALL, AND THEREFORE NO RESERVATION ──────────────────
 *
 * Not `reserveModelCall`, not `peek`, not `consume`. The mint is a handful of indexed
 * reads and one insert.
 *
 * *Reason.* `meter.ts`'s own argument for why `deferred` peeks before it consumes —
 * *"consuming and then deciding to refuse would charge the window for a call that was
 * never made."* A mint is worse than that: it may never produce a call at all, because
 * the director may be shed, or the run may be superseded by `[F5-14]`, or the querent
 * may never come back.
 *
 * *Failure mode.* Every reading completion silently spends a slot in a five-hour window
 * shared with the product. **`C-D6`'s whole promise is that a chat run never causes a
 * reading to fail**, and charging the ceiling at mint time breaks it at the cheapest
 * possible point.
 *
 * ── `[F5-18]` IT NEVER THROWS ─────────────────────────────────────────────
 *
 * `chain.ts`'s rule — *"it NEVER THROWS, it returns null. It is on the request path."*
 * Three entry points call this: a reading's `defer()`, `/api/chat/state`'s `after()` and
 * the cron. A throw in the first takes `touchLastSeen` with it; in the second it is an
 * unhandled rejection after the response; in the third it stops the nudge for everybody.
 *
 * ── `[F5-17]` AND NO DRIVER ERROR IS EVER LOGGED FROM HERE ────────────────
 *
 * A postgres error quotes the failing statement **and its bound parameters**, and this
 * module's queries bind `chat_messages.body` (through `detect.ts`) and
 * `readings.question` — `logChatFailure` is the one exit.
 */
import 'server-only';

import { sql } from 'drizzle-orm';

import type { Locale } from '@/data/types';
import { flushEvents } from '@/lib/analytics/flush';
import { db as singleton } from '@/lib/db/client';
import type { DbOrTx } from '@/lib/db/types';
import { chatEnabled, chatProactiveEnabled } from '@/lib/llm/flags';
import { activeRunFor, getThread } from '@/lib/db/queries/chat';
import { resolveChatClock } from '../clock';
import { logChatFailure } from '../log';
import { mintRun } from '../run';
import {
  nudgeCandidates,
  readQuerent,
  selectMaterial,
  selectReadingMaterial,
} from './detect';
import {
  checkEligibility,
  resolveQuietWindow,
  type EligibilityRefusal,
  type ProactiveSource,
  type ProactiveTrigger,
  type QuietHours,
} from './eligibility';
import { materialKey, materialReplyTo, type Material, type MaterialKind } from './material';

export { nudgeCandidates };

/**
 * **ONE HOUR, SINCE 2026-08-30. IT WAS THREE.** How quiet the room must be before a
 * reader speaks unprompted.
 *
 * **THE CHANGE IS A RULING, NOT A MEASUREMENT**, and the old argument is kept rather
 * than deleted because three of its four legs still hold:
 *
 *   - **The lower bound is still what reads as a machine.** *"There is no version of
 *     'Adrian thought of you' that is true twenty minutes after Adrian last spoke."*
 *     True at twenty minutes; not true at an hour, which is an ordinary interval between
 *     two messages from a friend who was doing something else.
 *   - **The upper bound is still the cron.** Unchanged.
 *   - **It is still not the reading path's gate** (`[F5-12]`), which is what stops this
 *     number having to be short.
 *   - **What changed is the third leg.** *"Three hours is the shortest interval over
 *     which 'it has gone quiet' is a true statement about a group chat"* was written
 *     when a proactive run could land at any hour of the night. Quiet hours are live
 *     now, so the interval no longer has to carry the whole burden of not being
 *     obnoxious — and Miftah's ruling is explicit: *much more proactive.*
 *
 * **AND IT IS STILL A GUESS, STILL LABELLED ONE.** `PERSONA_MIN_AGE_SECONDS=3600`'s
 * precedent. The only instrument that can move it is `C-N2f`'s proactive reply rate on
 * `/admin/chat` over weeks. **Measure before moving it.**
 */
export function minGapSeconds(): number {
  const raw = Number(process.env.CHAT_PROACTIVE_MIN_GAP_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 3_600;
}

/**
 * **FIVE PER QUERENT PER THEIR CALENDAR DAY, SINCE 2026-08-30. IT WAS TWO.**
 *
 * The v0.7.0 argument — *"1 is a newsletter, 3 or more is a notification machine"* — was
 * written **before Miftah ruled**, and it is kept here rather than deleted because its
 * arithmetic is still the thing to watch. **THE ARITHMETIC HAS BEEN REDONE FOR THIS
 * RELEASE AND THE ANSWER IS THE SAME NUMBER:** `CHAT_MAX_BEATS` is 8 now, but that
 * ceiling is for a run the querent triggered — a PROACTIVE run is two to four beats by
 * `system.{id,en}.ts` rule 11, so five runs is a theoretical **twenty** unprompted
 * bubbles in a day, which is exactly the bound v0.7.0 defended.
 *
 * **THAT MAKES RULE 11's BEAT RANGE LOAD-BEARING FOR VOLUME AND NOT ONLY FOR TONE.** If a
 * later session lets a proactive run reach the full eight-beat cap, the worst case here
 * doubles to forty and this number must come down in the same commit.
 *
 * **THREE THINGS MAKE FIVE PAYABLE WHERE THREE WAS NOT:**
 *
 *   - **THE CAP IS ALMOST NEVER THE BINDING GATE — `no_material` IS.** `C-N2e`: a
 *     trigger with no material does not fire, one material per run, and a spent
 *     `material_key` is spent for that querent for ever. Raising the cap does not
 *     produce five runs; it produces *up to* five **on a day the ladder has five
 *     distinct things to say**, which is rare and is exactly the day worth speaking on.
 *     **THIS IS TRUE ONLY BECAUSE `time_of_day` IS CAPPED AT ONE RUN PER LOCAL DAY** in
 *     `detectTimeOfDay` (F7). That kind's key is fresh in every part of every day, so
 *     without the brake it alone would supply every one of the five and `no_material`
 *     would never fire again. **Do not raise this number without checking that brake, and
 *     do not remove that brake without lowering this number.**
 *   - **QUIET HOURS ARE LIVE.** The twenty-bubble worst case is now compressed into the
 *     waking window rather than smeared across the night, which is the difference
 *     between a busy friend and an alarm clock.
 *   - **THE RULING.** *"i want the readers to be much more PROACTIVE ... keep coming
 *     back to the chat group as often as possible."*
 *
 * A number variable **falls back rather than becoming zero** (`auth/ttl.ts`, `meter.ts`):
 * a cap of `0` would silence the feature completely, which is a typo taking half the
 * release down.
 */
export function maxPerDay(): number {
  const raw = Number(process.env.CHAT_PROACTIVE_MAX_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

/**
 * The querent's quiet window, resolved AT CALL TIME from the environment and the offset
 * their browser last reported.
 *
 * **READ AT CALL TIME, NEVER AT MODULE SCOPE**, for the reason the flags are: a
 * module-scope `const` is inlined by the bundler and freezes the build-time value, and
 * the whole point of these two keys is that an operator can narrow the window from the
 * Vercel dashboard when a querent says the readers woke them up.
 *
 * The parsing, the fallbacks and the disable-by-equal-hours escape hatch are
 * `resolveQuietWindow`'s, in the pure module, where the tests are.
 */
export function quietHoursFor(offsetMinutes: number | null): QuietHours {
  return resolveQuietWindow(
    process.env.CHAT_QUIET_FROM_HOUR,
    process.env.CHAT_QUIET_TO_HOUR,
    offsetMinutes,
  );
}

/** Why a mint did not happen. The eight refusals plus the four this module can add. */
export type MintRefusal = EligibilityRefusal | 'duplicate' | 'no_user' | 'failed';

export type MintResult =
  | { minted: true; runId: string; trigger: ProactiveTrigger; kind: MaterialKind }
  | { minted: false; reason: MintRefusal };

export type MintInput = {
  userId: string;
  source: ProactiveSource;
  /** The querent's calendar day. A STRING (`[F5-3]`); `utcDateString()` for the cron. */
  localDate: string;
  /**
   * Source 1 only. **When set, the selector is not consulted and this reading is the
   * material** — and if THIS reading is ineligible the answer is `no_material`, never
   * "some other reading will do". §9.6's counter assertion is what that protects: a
   * reading the querent attached themselves must not cause a run *about a different
   * reading* and must not spend the day's budget.
   */
  readingId?: string;
  /** The run's language. Falls back to `users.locale`, per `C-D9`. */
  locale?: Locale;
  /** Injected (`[F5-2]`). */
  now?: Date;
  /** The integration suite's rolled-back transaction. */
  handle?: DbOrTx;
};

/**
 * Mint one proactive run, or say why not.
 *
 * ── THE PROBE, AND WHY THE PREDICATE IS CALLED TWICE (§4.6) ───────────────
 *
 * `checkEligibility` is called first with `hasMaterial: true`. That answers *"would
 * anything OTHER than the material refuse this?"* — and because `no_material` is the
 * last branch, a pass means every cheap gate cleared. Only then is detection paid for:
 * 1–3 indexed queries that would otherwise sit on every page view in the app, since the
 * cheap gates refuse the overwhelming majority of ticks.
 */
export async function mintProactiveRun(input: MintInput): Promise<MintResult> {
  const db = input.handle ?? singleton;
  const now = input.now ?? new Date();

  try {
    /*
     * Read AT CALL TIME, never at module scope: a module-scope `const` is inlined by
     * the bundler and freezes the build-time value into production, which is exactly
     * the property a kill switch exists to provide.
     */
    const enabled = chatEnabled() && chatProactiveEnabled();

    const querent = await readQuerent(db, input.userId);
    if (!querent) return skip(db, input, 'no_user');

    const [thread, openRun] = await Promise.all([
      getThread(db, input.userId),
      activeRunFor(db, input.userId),
    ]);

    /*
     * **READ ONCE, HERE, BECAUSE TWO CONSUMERS WANT IT AND MUST NOT DISAGREE.** `[F5]`'s own
     * rule for `ThreadState` — *read ONCE, by the caller, so that three entry points cannot
     * each decide differently what a missing thread means* — extended to the offset. M8
     * needs it to know the querent's weekday and hour at all, and **phase 8's quiet-hours
     * gate needs the same number for `QuietHours.offsetMinutes` and must not re-read the
     * thread.** One row, one offset, one clock, for every gate and every detector in this
     * mint.
     *
     * `null` when no browser has ever reported one, and `null` is an ordinary answer on both
     * sides: no time material, and never a mint-blocking unknown.
     */
    const utcOffsetMinutes = thread?.utcOffsetMinutes ?? null;
    const clock = resolveChatClock({ offsetMinutes: utcOffsetMinutes, now });

    const state = {
      lastReadAt: thread?.lastReadAt ?? null,
      lastUserMessageAt: thread?.lastUserMessageAt ?? null,
      lastReaderMessageAt: thread?.lastReaderMessageAt ?? null,
      lastProactiveAt: thread?.lastProactiveAt ?? null,
      proactiveCountToday: thread?.proactiveCountToday ?? 0,
      proactiveCountDate: thread?.proactiveCountDate ?? null,
      openRun: openRun !== null,
      erased: querent.erased,
    };

    const common = {
      source: input.source,
      thread: state,
      localDate: input.localDate,
      enabled,
      minGapSeconds: minGapSeconds(),
      maxPerDay: maxPerDay(),
      /*
       * §5, and **`[R17]`'s Option A is reversed** (2026-08-30). The offset is read off
       * the thread row rather than off a header, which is what makes this work for the
       * cron — the one source with no client and therefore no `x-jm-local-date` — and it
       * is the reason `[R17]` folded `utc_offset_minutes` into `0014` in the first place.
       *
       * **NULL IS NORMAL AND MEANS NOT QUIET.** A querent whose browser has not reported
       * an offset yet behaves exactly as they did before this line existed.
       *
       * **THE WINDOW IS SUPPLIED FOR EVERY SOURCE, INCLUDING `reading`.** The exemption
       * lives in the predicate (gate 5), not here, so that `npm test` can see it —
       * `[F5-2]`'s rule that a heuristic's every branch is enumerated with a fake clock.
       *
       * **PHASE 7's LOCAL, REUSED.** One thread row, one offset, one clock per mint.
       */
      quietHours: quietHoursFor(utcOffsetMinutes),
      now,
    };

    const probe = checkEligibility({ ...common, hasMaterial: true, materialKind: null });
    if (!probe.ok) return skip(db, input, probe.reason);

    const locale = input.locale ?? querent.locale;
    const detectArgs = {
      userId: input.userId,
      locale,
      localDate: input.localDate,
      lastProactiveAt: state.lastProactiveAt,
      lastUserMessageAt: state.lastUserMessageAt,
      now,
      birthDate: querent.birthDate,
      lastSeenAt: querent.lastSeenAt,
      clock,
    };

    const material: Material | null = input.readingId
      ? await selectReadingMaterial(db, detectArgs, input.readingId)
      : await selectMaterial(db, detectArgs);

    const verdict = checkEligibility({
      ...common,
      hasMaterial: material !== null,
      materialKind: material?.kind ?? null,
    });
    if (!verdict.ok || !material) {
      return skip(db, input, verdict.ok ? 'no_material' : verdict.reason);
    }

    /*
     * ── THE COUNTER AND THE INSERT ARE ONE TRANSACTION, AND THE ROLLBACK IS THE
     *    REFUND `[F5-13]` REFUSES TO WRITE BY HAND ──────────────────────────
     *
     * *"A limiter that refunds is a limiter with a race"* — so there is no refund path.
     * There is a transaction: the conditional `UPDATE` claims the day's slot, the insert
     * either succeeds or loses to `chat_runs_user_material_uq`, and a loss rolls the
     * whole thing back. The counter is never spent on a run that does not exist, and
     * nothing anywhere decrements.
     *
     * The alternative — insert first, then bump — leaves a run minted over the cap under
     * the same race, and the cap is the thing standing between the querent and twelve
     * unprompted bubbles.
     */
    const minted = await db.transaction(async (tx) => {
      const claimed = await bumpProactiveCount(tx, {
        userId: input.userId,
        localDate: input.localDate,
        maxPerDay: common.maxPerDay,
        now,
      });
      /* Zero rows: another lambda won the race and the cap is spent. `[F5-13]`. */
      if (claimed === null) return { runId: null as string | null, reason: 'daily_cap' as const };

      const key = materialKey(material);
      const run = await mintRun(
        {
          userId: input.userId,
          trigger: verdict.trigger,
          locale,
          /*
           * §10 delta 4. `trigger_message_id` is annotated *"the posted message, for
           * `user_message`"* and F5 widens its MEANING without changing the column: for
           * `unanswered` it is the asking reader's bubble, and for an M3-flavoured
           * `idle_nudge` it is the orphaned one. Both are the message the director may
           * point a beat at, which is the same fact the annotation already describes
           * from the other side.
           */
          triggerMessageId: materialReplyTo(material),
          triggerReadingId: material.kind === 'reading' ? material.readingId : null,
          materialKey: key,
        },
        tx,
      );

      /*
       * `mintRun` answers `null` on four ordinary outcomes; two of them (the flag and a
       * live run) were already refused above, so what is left here is the constraint.
       * **Throwing is how the counter is put back** — see the transaction comment.
       */
      if (!run) throw new MintCollision();
      return { runId: run.runId, reason: null };
    }).catch((err: unknown) => {
      if (err instanceof MintCollision) return { runId: null, reason: 'duplicate' as const };
      throw err;
    });

    if (!minted.runId) return skip(db, input, minted.reason ?? 'duplicate');

    /*
     * **NO `chat.proactive_minted` EVENT** — F1 folded it: *a proactive run is a
     * `chat.run_planned` whose `trigger` is not `user_message`*, and a mint with no plan
     * is not yet a fact worth a row. The run either plans (and F1's engine says so) or
     * expires into the cron's TTL sweep, which logs.
     */
    return { minted: true, runId: minted.runId, trigger: verdict.trigger, kind: material.kind };
  } catch (err) {
    logChatFailure('proactive.mint', err, { user: input.userId, source: input.source });
    return { minted: false, reason: 'failed' };
  }
}

/** The transaction's rollback signal. Never leaves this module. */
class MintCollision extends Error {
  constructor() {
    super('material key already used');
    this.name = 'MintCollision';
  }
}

/**
 * **THE DAY'S SLOT, CLAIMED AND COUNTED IN ONE STATEMENT** (§6.4).
 *
 * `[F5-13]`'s race, written out: two `after()` callbacks on two lambdas both read
 * `count = 1`, both mint, and the cap is 3. The check and the increment are therefore
 * the same statement and the row count is the answer — **this is the lease's shape
 * applied to a counter**, which is why the predicate's `daily_cap` branch is an
 * optimisation rather than the enforcement.
 *
 * **AN UPSERT AND NOT AN UPDATE**, because a thread row may not exist yet: the first
 * proactive run of a querent's life is usually the one minted by their first reading,
 * before they have ever opened the room. A bare `UPDATE` would match zero rows there and
 * be indistinguishable from a spent cap — the feature would never start.
 *
 * **`updated_at` IS SET BY HAND.** `$onUpdate()` applies to `db.update()` only and does
 * not fire inside `ON CONFLICT DO UPDATE`; drop the line and the column freezes at the
 * first insert while every other assertion about the row still passes.
 *
 * **THE TIMESTAMP IS BOUND AS AN ISO STRING WITH AN EXPLICIT CAST.** Inside a raw `sql`
 * template there is no column for drizzle to hang an encoder on, so a JS `Date` reaches
 * postgres.js's serializer untouched and throws `ERR_INVALID_ARG_TYPE` at runtime, on a
 * green typecheck — `markRead`'s note, and `answersUpdatedAt`'s rule that *`sql<T>` is
 * an assertion the driver is not obliged to honour.*
 */
export async function bumpProactiveCount(
  db: DbOrTx,
  args: { userId: string; localDate: string; maxPerDay: number; now: Date },
): Promise<number | null> {
  const at = args.now.toISOString();
  const rows = await db.execute<{ proactive_count_today: number }>(sql`
    insert into chat_threads
      (user_id, proactive_count_today, proactive_count_date, last_proactive_at,
       created_at, updated_at)
    values
      (${args.userId}::uuid, 1, ${args.localDate}::date, ${at}::timestamptz,
       ${at}::timestamptz, ${at}::timestamptz)
    on conflict (user_id) do update
       set proactive_count_today = case
             when chat_threads.proactive_count_date = ${args.localDate}::date
             then chat_threads.proactive_count_today + 1
             else 1 end,
           proactive_count_date  = ${args.localDate}::date,
           last_proactive_at     = ${at}::timestamptz,
           updated_at            = ${at}::timestamptz
     where chat_threads.proactive_count_date is distinct from ${args.localDate}::date
        or chat_threads.proactive_count_today < ${args.maxPerDay}
    returning proactive_count_today`);

  return rows[0]?.proactive_count_today ?? null;
}

/**
 * ── WHICH REFUSALS ARE RECORDED, AND WHY THE REST ARE NOT (§18) ───────────
 *
 * **`chat.proactive_skipped` DOES NOT FIRE ON EVERY EVALUATION, AND THAT IS
 * DELIBERATE.** `open_run` and `gap` refuse the overwhelming majority of ticks — every
 * page view of every querent with a run in flight — and both are derivable from the
 * `chat_threads` row at any time. Firing on them would put a row in `events` for every
 * page view in the app, against a 180-day TTL on Neon free's 0.5 GB. Same fold-by-
 * dropping argument that removed `revealed` in v0.4.0.
 *
 * **THE CRON IS THE EXCEPTION AND RECORDS EVERYTHING IT CAN.** It runs once a day over
 * at most `NUDGE_MAX_USERS` candidates, so the volume argument does not apply — and it
 * is the one source with nobody present, so a log line is the only other place its
 * refusals could be seen. That is what keeps `too_soon` and `run_in_flight` reachable
 * rather than shipping two literals of F1's closed union dead.
 *
 * `erased`, `never_opened`, `no_user` and `failed` have no member in that union and are
 * not emitted at all: the first two are states rather than events, and the last two are
 * `logChatFailure`'s business.
 */
type SkipReason = 'no_material' | 'throttled' | 'too_soon' | 'quiet_hours' | 'disabled' | 'run_in_flight';

const EVENT_REASON: Record<MintRefusal, SkipReason | null> = {
  flag_off: 'disabled',
  erased: null,
  open_run: 'run_in_flight',
  never_opened: null,
  quiet_hours: 'quiet_hours',
  gap: 'too_soon',
  daily_cap: 'throttled',
  no_material: 'no_material',
  duplicate: 'no_material',
  no_user: null,
  failed: null,
};

/**
 * Refusals worth a row from a per-page-view source. The cron records all of them.
 *
 * **`quiet_hours` STAYS IN THIS SET NOW THAT IT CAN ACTUALLY FIRE, AND THAT IS A
 * DELIBERATE EXCEPTION TO THE ARGUMENT THAT KEEPS `open_run` AND `gap` OUT** (§18).
 * Those two refuse the *overwhelming majority of all ticks, all day*, which is an
 * `events` row per page view of the app against a 180-day TTL on Neon free's 0.5 GB.
 * `quiet_hours` refuses only ticks fired **between 22:00 and 07:00 in the querent's own
 * zone**, and `ChatButton` has no polling loop — one fetch on mount, one on
 * `visibilitychange` — so the volume is bounded by night-time app opens rather than by
 * page views.
 *
 * **AND IT IS THE ONLY INSTRUMENT THE WINDOW HAS.** If the rate is high the window is
 * too wide and `CHAT_QUIET_TO_HOUR` should come down; drop the row and there is nothing
 * to read but a silence that looks identical to `no_material`.
 */
const ALWAYS_RECORDED: ReadonlySet<MintRefusal> = new Set<MintRefusal>([
  'flag_off',
  'quiet_hours',
  'daily_cap',
  'no_material',
  'duplicate',
]);

/** The trigger a skip is filed under, since there is no run to read one off. */
const SKIP_SOURCE: Record<ProactiveSource, 'reading_completed' | 'idle_nudge' | 'cron'> = {
  reading: 'reading_completed',
  tick: 'idle_nudge',
  cron: 'cron',
};

async function skip(db: DbOrTx, input: MintInput, reason: MintRefusal): Promise<MintResult> {
  const mapped = EVENT_REASON[reason];
  if (mapped !== null && (input.source === 'cron' || ALWAYS_RECORDED.has(reason))) {
    /*
     * **`flushEvents` DIRECTLY, NOT `track()`, AND THE REASON IS V2's BUG.** Two of the
     * three entry points have no request scope at all — the cron has no request, and an
     * `after()` callback is outside the ALS store that `withAnalytics` created — so
     * `track()` would take its fallback path and call `after()` from inside an `after()`.
     * That is exactly how *every streamed translation lost its event, silently, for as
     * long as V2 had shipped.* One writer, one path, no scope to be inside of.
     */
    try {
      await flushEvents(
        {
          userId: input.userId,
          sessionId: null,
          locale: input.locale ?? 'id',
          localDate: input.localDate,
        },
        [
          {
            name: 'chat.proactive_skipped',
            props: { source: SKIP_SOURCE[input.source], reason: mapped },
          },
        ],
        db,
      );
    } catch (err) {
      /* Analytics never fails the thing it measures. W4's rule, and `[F5-18]`. */
      logChatFailure('proactive.skip_event', err, { user: input.userId, reason });
    }
  }
  return { minted: false, reason };
}

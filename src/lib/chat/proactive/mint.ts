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
  type EligibilityRefusal,
  type ProactiveSource,
  type ProactiveTrigger,
} from './eligibility';
import { materialKey, materialReplyTo, type Material, type MaterialKind } from './material';

export { nudgeCandidates };

/**
 * **THREE HOURS.** How quiet the room must be before a reader speaks unprompted.
 *
 * The argument, not the number (§6.3):
 *
 *   - **The lower bound is what reads as a machine.** A room that pings you twenty
 *     minutes after the last message, unprompted, is a notification engine. There is no
 *     version of *"Adrian thought of you"* that is true twenty minutes after Adrian last
 *     spoke.
 *   - **The upper bound is the cron.** A gap of 24 hours would make the daily job the
 *     only source that ever fires, which is the design the roadmap calls wrong.
 *   - **Three hours is the shortest interval over which *"it has gone quiet"* is a true
 *     statement about a group chat.**
 *   - **It is not the reading path's gate** (`[F5-12]`), which is what stops this number
 *     having to be short.
 *
 * **AND IT IS A GUESS, LABELLED ONE.** `PERSONA_MIN_AGE_SECONDS=3600`'s precedent,
 * recorded rather than hidden: the only instrument that can move it is `C-N2f`'s reply
 * rate over weeks on a real phone. **Measure before moving it.**
 */
export function minGapSeconds(): number {
  const raw = Number(process.env.CHAT_PROACTIVE_MIN_GAP_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_800;
}

/**
 * **TWO PER QUERENT PER THEIR CALENDAR DAY** (§6.4).
 *
 *   - **1 is a newsletter.** One message a day, at roughly the same time, from the same
 *     cron, is a scheduled broadcast and reads as one.
 *   - **3 or more is a notification machine.** A run is 1–4 messages from 1–3 readers,
 *     so three runs is up to twelve unprompted bubbles in a day. Twelve is how you get
 *     muted, and there is no mute in this app short of not opening it — which is the
 *     metric the release is judged by.
 *   - **2 gives the day a shape** without being able to become a stream.
 *
 * A number variable **falls back rather than becoming zero** (`auth/ttl.ts`,
 * `meter.ts`): a cap of `0` would silence the feature completely, which is a typo taking
 * half the release down.
 */
export function maxPerDay(): number {
  const raw = Number(process.env.CHAT_PROACTIVE_MAX_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 2;
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
      /* §5, Option A (`[R17]`). The predicate takes the input and ships it dead. */
      quietHours: null,
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

/** Refusals worth a row from a per-page-view source. The cron records all of them. */
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

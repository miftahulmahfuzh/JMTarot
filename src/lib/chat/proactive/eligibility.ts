/**
 * MAY A READER SPEAK WITHOUT BEING SPOKEN TO? **The whole of F5's judgement, as one
 * pure function.**
 *
 * ── `[F5-2]` PURE, A LEAF, AND THE CLOCK IS INJECTED ───────────────────────
 *
 * No `server-only`, no `next/*`, no `@/lib/db/**`, no `process.env`, no `new Date()`.
 * Its only imports are types.
 *
 * *Reason.* `tally.ts`'s ruling, quoted: **a heuristic is allowed to fail a build; it
 * is not allowed to fail a person.** Every gate below is a heuristic, and a false
 * positive here is a reader messaging somebody at a moment that reads as tone-deaf, or
 * asking about a thing they already answered — and there is no undo in a group chat.
 * The only way that risk is payable is if every branch is enumerated in `npm test` with
 * a fake clock.
 *
 * *Failure mode.* A predicate that reads the environment or the clock at call time is
 * untestable **at the boundaries**, and the boundaries are the whole feature: the run at
 * exactly `minGap`, the run on the day the counter rolls over, the run for an account
 * inside its erasure grace.
 *
 * ── THE ORDER OF THE GATES IS LOAD-BEARING, NOT COSMETIC (§4.6) ────────────
 *
 * `no_material` is **last**, and the caller depends on it being last: material detection
 * costs 1–3 indexed queries and the cheap gates refuse the overwhelming majority of
 * ticks, so `mint.ts` runs this once with `hasMaterial: true` as a probe, pays for
 * detection only if nothing else refused, and then runs it for real.
 * `eligibility.test.ts` asserts the ordering **by name**, because reordering the
 * branches would make the probe pass a run the real call would refuse.
 */
import type { RunTrigger } from '../types';
import type { MaterialKind } from './material';

/**
 * WHICH ENTRY POINT ASKED. Not the same thing as the trigger that gets stored — three
 * entry points produce four triggers, because the tick's answer depends on the material
 * it found.
 */
export type ProactiveSource = 'reading' | 'tick' | 'cron';

/**
 * The trigger a mint writes. **A strict subset of `RunTrigger`**: `'user_message'` is
 * the one value no proactive path may ever produce, and typing it out here rather than
 * reusing `RunTrigger` is what makes that a compile error instead of a review comment.
 */
export type ProactiveTrigger = Exclude<RunTrigger, 'user_message'>;

/**
 * Everything the predicate needs to know about the room. **Read ONCE, by the caller**,
 * so that three entry points cannot each decide differently what a missing thread means.
 */
export type ThreadState = {
  /** NULL means the room has never been opened. §4.7. */
  lastReadAt: Date | null;
  lastUserMessageAt: Date | null;
  lastReaderMessageAt: Date | null;
  lastProactiveAt: Date | null;
  proactiveCountToday: number;
  /**
   * **THE QUERENT'S CALENDAR DAY, AS A `'YYYY-MM-DD'` STRING. NEVER A `Date`**
   * (`[F5-3]`).
   *
   * `local_date`'s trap verbatim: a `Date` renders in the server's zone and is a day out
   * for anyone in Jakarta between midnight and 07:00, and the querent's calendar day is
   * the only honest denominator for *"how many times have the readers spoken to me
   * today"* — because it is the day **they** are having.
   *
   * The comparison below is `!==` on the string and nothing here ever parses it.
   * `answersUpdatedAt`'s bug is what happens otherwise: a comparison that coerces and
   * answers *something*, with a green typecheck and a green unit suite.
   */
  proactiveCountDate: string | null;
  /** A run in `pending | planning | running`. `C-R5` makes beats serial. */
  openRun: boolean;
  /** `users.deleted_at IS NOT NULL`. `[F5-15]`. */
  erased: boolean;
};

/**
 * §5, Option B's shape. **`[R17]` ruled Option A — no local quiet hours — so this is
 * `null` on every call today** and `inQuietHours` ships dead.
 *
 * It is written, exported and unit-tested anyway because that is what makes the other
 * ruling a one-line change rather than a design: `chat_threads.utc_offset_minutes` is
 * already in `0014` (§2.3) for the same reason, and `'quiet_hours'` is already a
 * `chat.proactive_skipped` reason.
 */
export type QuietHours = {
  /** Inclusive local hour the quiet window opens, 0–23. */
  fromHour: number;
  /** Exclusive local hour it closes, 0–23. May be LESS than `fromHour` (it wraps). */
  toHour: number;
  /** The querent's offset from UTC in minutes, or null when nobody has told us. */
  offsetMinutes: number | null;
};

export type EligibilityRefusal =
  | 'flag_off'
  | 'erased'
  | 'open_run'
  | 'never_opened'
  | 'quiet_hours'
  | 'gap'
  | 'daily_cap'
  | 'no_material';

export type Eligibility =
  | {
      ok: true;
      trigger: ProactiveTrigger;
      /** The day the counter must be stamped with. Always `input.localDate`. */
      countedDay: string;
      /** True when the stored counter is for another day and starts again at one. */
      resetCounter: boolean;
    }
  | { ok: false; reason: EligibilityRefusal };

export type EligibilityInput = {
  source: ProactiveSource;
  thread: ThreadState;
  /** The querent's calendar day, a STRING. `utcDateString()` for the cron (§4.8). */
  localDate: string;
  /** `chatEnabled() && chatProactiveEnabled()`, resolved by the caller AT CALL TIME. */
  enabled: boolean;
  hasMaterial: boolean;
  /**
   * Which material was found, or null. **The tick is the one source whose trigger
   * depends on it**, and it is passed rather than inferred because
   * `chat_runs.trigger` is the column `/admin/chat` groups by: it must say what
   * happened, not which entry point ran.
   */
  materialKind: MaterialKind | null;
  minGapSeconds: number;
  maxPerDay: number;
  /** §5. `null` under Option A, which is every call today. */
  quietHours: QuietHours | null;
  /** Injected. `[F5-2]`. */
  now: Date;
};

/**
 * Is `now` inside the querent's quiet window? **Dead under `[R17]` and tested anyway.**
 *
 * A null offset means nobody has told us the querent's zone, and the answer is **false**
 * — never mint-blocking on an unknown. The alternative (*"do not mint"*) silences the
 * feature for everybody until F4 ships a header and every querent returns, which is a
 * bigger outage than the thing it prevents.
 */
export function inQuietHours(now: Date, quiet: QuietHours): boolean {
  if (quiet.offsetMinutes === null) return false;
  const localHour = Math.floor(
    (((now.getTime() + quiet.offsetMinutes * 60_000) / 3_600_000) % 24 + 24) % 24,
  );
  // A window that wraps midnight (22 -> 7) is the normal case, so it is the branch that
  // gets written out rather than the one that gets forgotten.
  return quiet.fromHour <= quiet.toHour
    ? localHour >= quiet.fromHour && localHour < quiet.toHour
    : localHour >= quiet.fromHour || localHour < quiet.toHour;
}

/** The most recent thing that happened in the room, whoever caused it. */
function lastActivity(t: ThreadState): number {
  return Math.max(
    t.lastUserMessageAt?.getTime() ?? 0,
    t.lastReaderMessageAt?.getTime() ?? 0,
    t.lastProactiveAt?.getTime() ?? 0,
  );
}

/**
 * THE PREDICATE. Eight gates, in the order below, first refusal wins.
 */
export function checkEligibility(input: EligibilityInput): Eligibility {
  const t = input.thread;

  /*
   * 1. `C-D15`. `CHAT_PROACTIVE_ENABLED=0` stops unprompted runs only and a posted
   *    message still gets answered; `CHAT_ENABLED=0` stops all generation. Both on
   *    `ANALYTICS_ENABLED`'s rule — **only the exact string `'0'`** — and both read by
   *    the CALLER at call time, because a module-scope `const` is inlined by the
   *    bundler and freezes the build-time value, which is the exact property the flag
   *    exists to provide.
   */
  if (!input.enabled) return { ok: false, reason: 'flag_off' };

  /*
   * 2. `[F5-15]`. The thirty-day grace exists so somebody can change their mind, and
   *    messaging them during it is the app arguing with a decision they made. There is
   *    no version of a friendly nudge from Thessaly to a person who pressed delete that
   *    reads well.
   */
  if (t.erased) return { ok: false, reason: 'erased' };

  /*
   * 3. One room, one conversation at a time. `C-R5` makes beats serial precisely so
   *    every beat sees every earlier beat of its own run; two live runs would interleave
   *    two beat sheets and make that *"every beat sees half of two conversations"*.
   */
  if (t.openRun) return { ok: false, reason: 'open_run' };

  /*
   * 4. §4.7. **The cron is the one source with nobody present**, and a message arriving
   *    overnight into a room the querent has never seen is the app cold-calling them.
   *    The other two sources may seed a new room: a dot after their first reading is the
   *    feature working, and it is the introduction to the room.
   */
  if (t.lastReadAt === null && input.source === 'cron') {
    return { ok: false, reason: 'never_opened' };
  }

  /* 5. §5. Dead under `[R17]`; `quietHours` is null on every call today. */
  if (input.quietHours && inQuietHours(input.now, input.quietHours)) {
    return { ok: false, reason: 'quiet_hours' };
  }

  /*
   * 6. `[F5-12]`. **THE GAP IS SKIPPED ENTIRELY FOR A FINISHED READING.** The gate
   *    exists to stop a reader filling dead air, and a finished reading is not dead air
   *    — it is a discrete thing the querent just did, at a moment they are demonstrably
   *    present and looking at the app. Making Adrian wait three hours to react to a
   *    reading taken three minutes ago is the feature not working.
   *
   *    All three timestamps, not just the last proactive one: a room that was busy ten
   *    minutes ago does not need somebody to break the silence.
   */
  if (input.source !== 'reading') {
    const quietFor = input.now.getTime() - lastActivity(t);
    if (quietFor < input.minGapSeconds * 1000) return { ok: false, reason: 'gap' };
  }

  /*
   * 7. `[F5-13]`, `C-N2d`. **A STRING COMPARISON AND NEVER A PARSE.** A stored day that
   *    is not today means the counter is stale and starts again at one — which is also
   *    the branch that fires for a thread that has never had a proactive run.
   *
   *    **THIS IS AN OPTIMISATION, NOT THE ENFORCEMENT.** The enforcement is the
   *    conditional `UPDATE … WHERE proactive_count_today < :cap` in `mint.ts` (§6.4):
   *    two `after()` callbacks on two lambdas can both read `count = 1`, and only one
   *    statement that checks and increments together can settle it. This branch is what
   *    stops the common case ever reaching the database.
   */
  const resetCounter = t.proactiveCountDate !== input.localDate;
  if (!resetCounter && t.proactiveCountToday >= input.maxPerDay) {
    return { ok: false, reason: 'daily_cap' };
  }

  /*
   * 8. `C-N2e`, verbatim: **a trigger with no material does not fire.** A proactive run
   *    with nothing to be about produces *"hai, apa kabar?"*, which is the emptiest
   *    thing this feature could ship — and it is the exact string the smoke script fails
   *    on (§11.2).
   *
   *    **LAST, AND §4.6 DEPENDS ON IT BEING LAST.**
   */
  if (!input.hasMaterial) return { ok: false, reason: 'no_material' };

  return {
    ok: true,
    trigger: triggerFor(input.source, input.materialKind),
    countedDay: input.localDate,
    resetCounter,
  };
}

/**
 * **THE TICK IS THE ONE SOURCE WHOSE TRIGGER DEPENDS ON THE MATERIAL** (§6.2).
 *
 * `chat_runs.trigger` is a closed set F5 owns and is the column F7 groups `/admin/chat`
 * by, so it must say **what happened**, not which entry point ran. A tick that found an
 * unanswered reader question is an `unanswered` run; a tick that found anything else is
 * an `idle_nudge`.
 */
function triggerFor(source: ProactiveSource, kind: MaterialKind | null): ProactiveTrigger {
  if (source === 'reading') return 'reading_completed';
  if (source === 'cron') return 'cron';
  return kind === 'unanswered' ? 'unanswered' : 'idle_nudge';
}

/**
 * The refusals, in the order `checkEligibility` tests them.
 *
 * **EXPORTED SO THE TEST CAN ASSERT THE ORDER BY NAME** (§4.6). The probe in `mint.ts`
 * calls the predicate with `hasMaterial: true` to find out whether anything *else*
 * refuses, and that is only sound while `no_material` is the last branch — so the
 * ordering is a contract rather than an implementation detail, and a contract needs
 * somewhere to be written down as data.
 */
export const REFUSAL_ORDER = [
  'flag_off',
  'erased',
  'open_run',
  'never_opened',
  'quiet_hours',
  'gap',
  'daily_cap',
  'no_material',
] as const satisfies readonly EligibilityRefusal[];

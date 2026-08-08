import 'server-only';

import { db } from '@/lib/db/client';
import type { Locale, ReaderId } from '@/data/types';
import type { CompletionPrompt } from '@/lib/llm/types';
import { assembleChatContext } from '../context';
import type { Beat, DirectorInput } from '../types';
import { buildPlanPromptFrom, type PlanInput } from './assemble';
import { affinityFor } from './affinity';
import { planCaps } from './caps';
import { fallbackSheet } from './fallback';
import { checkPlan, type PlanRefusal, type PlanRepair } from './validate';
import {
  awaitingReader,
  buildWindow,
  recentlySpoke,
  type WindowEntry,
} from './window';

/**
 * THE DIRECTOR SEAM. F1 calls these three from `./plan.ts` and F2 owns their bodies
 * (`[R13]`, and **the filenames are binding** because `callClass.test.ts` and
 * `flagCoverage.test.ts` name `direct/plan.ts` by string).
 *
 * ── WHY THERE IS A MEMO IN HERE, AND WHY IT IS NOT A SHORTCUT ───────────────
 *
 * `plan()` in `./plan.ts` calls `buildPlanPrompt(input)`, then `validatePlan(raw, input)`,
 * then `planFallback(input)` — three calls, and only the first is allowed to touch the
 * database. But **`checkPlan` resolves `#n` into a `chat_messages.id` and cannot do it
 * without the window the prompt was built from** (`[F2-15]`), and the fallback's decision
 * table needs the affinity lead, the awaiting reader and the reader of the last reading.
 * `DirectorInput` carries none of that: it has the run, the trigger and a locale, and F2 may
 * not edit `plan.ts` to widen it.
 *
 * So the builder leaves its inputs behind for the other two, keyed by `runId`. **THE LEASE
 * IS WHAT MAKES THAT SAFE** (`C-R3`): a run is claimed by exactly one executor at a time, so
 * there is at most one writer per key, and planning happens once per run. `voices/prompt.ts`
 * hit this seam first and solved it the same way one file over; this is the same pattern with
 * one deliberate difference, below.
 *
 * ── A MISS IS A DEGRADATION HERE, WHERE IT IS A REFUSAL FOR A VOICE ────────
 *
 * `validateTurn` refuses when its memo is absent, because two of its checks keep a published
 * promise and their false-acceptance cost is a promise broken. **Nothing here has that
 * shape.** A missing window costs the quote stubs and nothing else, so the beats survive with
 * `replyTo: null` — `P3`'s bias, applied to the process rather than to the model. Refusing
 * instead would turn a warm-lambda accident into a one-beat fallback, which is strictly
 * quieter and strictly less honest.
 */

/** Everything the three calls share for one run. */
type PlanMemo = {
  input: PlanInput;
  recentlySpoke: readonly ReaderId[];
  lastReadingReader: ReaderId | null;
  triggerMessageId: string | null;
};

/**
 * Bounded, because a lambda lives longer than a run. One entry per run being planned, and a
 * handful is all a warm instance can be mid-flight on.
 */
const MAX_MEMO = 16;
const MEMOS = new Map<string, PlanMemo>();

function remember(runId: string, memo: PlanMemo): void {
  MEMOS.delete(runId);
  MEMOS.set(runId, memo);
  // Oldest first, which is insertion order in a Map.
  while (MEMOS.size > MAX_MEMO) {
    const oldest = MEMOS.keys().next().value;
    if (oldest === undefined) break;
    MEMOS.delete(oldest);
  }
}

/** F2's answer, in the shape `plan.ts` reads. */
export type PlanCheck =
  | { ok: true; beats: Beat[]; locale: Locale; repairs: PlanRepair[]; dropped: number }
  /** A CLOSED set. Never a message — this reaches `events.props` as `reject_reason`. */
  | { ok: false; reason: PlanRefusal };

/**
 * ONE `chat_plan` PROMPT.
 *
 * **IT CALLS F3's ASSEMBLER WITH THE `director` PROFILE AND BUILDS NO SECOND ONE** (seam
 * S2). That profile carries no `<jawaban>`, no numerology and no address forms — §4.2 of
 * F3's plan is the contract and `[F2-1]` is why F2 wants it that way too.
 *
 * `async` because the context is six database reads. **The assembler never throws** — a
 * failed read degrades the context and the room still answers — so this does not either.
 */
export async function buildPlanPrompt(input: DirectorInput): Promise<CompletionPrompt> {
  const caps = planCaps();

  const ctx = await assembleChatContext(db, {
    userId: input.userId,
    locale: input.fallbackLocale,
    profile: 'director',
    /*
     * **NULL, NOT `input.runId`.** A run being planned has written no bubbles yet, and
     * naming it here would only ask the assembler to union in rows that do not exist.
     */
    runId: null,
    replyToMessageId: null,
    /*
     * **THE QUERENT'S CALENDAR DAY IS NOT ON THIS PATH, AND ITS ONE USE TOLERATES THAT.**
     * `DirectorInput` carries no `localDate` — `advance` is driven by a client that sends
     * none — and the only thing the assembler does with it is compute the floor of a
     * thirty-day reading lookback. A day of error at the edge of that window costs at most
     * one reading the director only reads a reader id off. **Anything that RENDERS a date to
     * a person must not do this** (`local_date`'s trap); nothing here does.
     */
    localDate: new Date().toISOString().slice(0, 10),
  });

  const window = buildWindow({
    messages: ctx.messages,
    locale: input.fallbackLocale,
    caps,
    triggerMessageId: input.triggerMessageId,
    now: Date.now(),
  });

  /*
   * **THE AFFINITY IS SCORED ON THE TRIGGER MESSAGE ALONE, AND NEVER ON THE WHOLE WINDOW.**
   * Affinity answers *"who is this message for"*; scoring the transcript would answer *"who
   * has this room been about"*, which is the question the fairness demotion exists to
   * counteract rather than to amplify. A proactive run has no trigger message, scores `''`,
   * and gets no hint line at all (`[F2-5]`).
   */
  const trigger = window.find((entry) => entry.id === input.triggerMessageId);
  const cast = recentlySpoke(window);
  const affinity = affinityFor(trigger?.body ?? '', input.fallbackLocale, {
    recentlySpoke: cast,
  });

  const planInput: PlanInput = {
    trigger: input.trigger,
    fallbackLocale: input.fallbackLocale,
    window,
    affinity,
    awaiting: awaitingReader(window),
    /* F5's token. Null until F5 lands — see `hasMaterial` below. */
    material: null,
    caps,
  };

  remember(input.runId, {
    input: planInput,
    recentlySpoke: cast,
    /* Newest first — `recallableReadings` is `created_at desc`. */
    lastReadingReader: ctx.readings[0]?.readerId ?? null,
    triggerMessageId: input.triggerMessageId,
  });

  return buildPlanPromptFrom(planInput, cast);
}

/**
 * The check. **SHAPE, NOT TRUTH** (`[F2-6]`), and `beats: []` is an accepted answer rather
 * than a refusal — `C-R6`, and it is the single most important acceptance in the function.
 *
 * The memo is kept on a refusal, because `planFallback` runs next and needs it.
 */
export function validatePlan(raw: string, input: DirectorInput): PlanCheck {
  const memo = MEMOS.get(input.runId);
  const window: readonly WindowEntry[] = memo?.input.window ?? [];

  const checked = checkPlan(raw, {
    window,
    fallbackLocale: input.fallbackLocale,
    caps: memo?.input.caps ?? planCaps(),
  });

  if (!checked.ok) return { ok: false, reason: checked.reason };

  MEMOS.delete(input.runId);
  return {
    ok: true,
    beats: checked.beats,
    locale: checked.locale,
    repairs: checked.repairs,
    dropped: checked.dropped,
  };
}

/**
 * The deterministic fallback. **ONE BEAT, NEVER TWO** (`[F2-13]`).
 *
 * ── `hasMaterial` UNTIL F5 LANDS ───────────────────────────────────────────
 *
 * `C-N2e`: **a trigger with no material does not fire**, and F5's eligibility predicate is
 * what guarantees it. F5 does not exist yet, so the proactive arms derive material presence
 * from what F2 can actually see — a reading behind the trigger, or a reader question still
 * hanging. `idle_nudge` and `cron` therefore fall to zero beats **on the fallback path
 * only**: the model path still plans normally, and a nudge whose planner failed and which
 * has nothing to be about would produce *"hai, apa kabar?"*, which the roadmap names as the
 * emptiest thing this feature could ship. **When F5 lands, `PlanInput.material` is the
 * input and this derivation goes.**
 */
export function planFallback(input: DirectorInput): Beat[] {
  const memo = MEMOS.get(input.runId);
  MEMOS.delete(input.runId);

  const awaiting = memo?.input.awaiting ?? null;
  const hasMaterial =
    memo?.input.material !== null && memo?.input.material !== undefined
      ? true
      : input.trigger === 'reading_completed'
        ? input.triggerReadingId !== null
        : input.trigger === 'unanswered'
          ? awaiting !== null
          : false;

  return fallbackSheet({
    trigger: input.trigger,
    triggerMessageId: memo?.triggerMessageId ?? input.triggerMessageId,
    lead: memo?.input.affinity.lead ?? null,
    awaiting,
    lastReadingReader: memo?.lastReadingReader ?? null,
    hasMaterial,
  });
}

/**
 * Test-only reset. The memo is process state, and a test that could not clear it would pass
 * or fail depending on what ran before it.
 */
export function __resetPlanMemos(): void {
  MEMOS.clear();
}

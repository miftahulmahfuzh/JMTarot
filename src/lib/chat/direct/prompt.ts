import 'server-only';

import { db } from '@/lib/db/client';
import type { Locale, ReaderId } from '@/data/types';
import type { CompletionPrompt } from '@/lib/llm/types';
import { assembleChatContext } from '../context';
import { materialLineForRun } from '../proactive/brief';
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
     * **THE QUERENT'S REAL CLOCK, AND THIS LINE USED TO BE A FABRICATION** (R1).
     * It read `new Date().toISOString().slice(0, 10)` — the SERVER's UTC day —
     * under a permission that said *"anything that RENDERS a date to a person
     * must not do this; nothing here does."* Phase 2 makes the director's header
     * line state the querent's weekday and time, so something does, and the
     * permission is spent. `advance()` resolves this once per request from
     * `chat_threads.utc_offset_minutes`; when no browser has ever reported one it
     * is `known: false` and carries the same UTC day this line used to invent,
     * which is why the change cannot regress the lookback it used to feed.
     */
    clock: input.clock,
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
    /*
     * **F5's TOKEN, AND THIS IS THE SEAM THIS FILE SAID WOULD CLOSE.** `materialLineForRun`
     * reads `chat_runs.material_key` and rebuilds the one line `assemble.ts` renders after
     * `BAHAN:` / `MATERIAL:` — a closed kind token, a neutral per-locale note and scalars,
     * never free text (§6.3, seam with F5).
     *
     * `null` on every `user_message` run, which is one indexed read and the common path,
     * and `null` again when the subject could not be rebuilt. **A null costs the header
     * line and nothing else**, which is this file's own rule for a missing memo: *a miss
     * is a degradation here, where it is a refusal for a voice.*
     */
    material: await materialLineForRun(db, {
      runId: input.runId,
      userId: input.userId,
      locale: input.fallbackLocale,
    }),
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
    /*
     * **`[F5-7]`, seam S-new-3.** On a proactive trigger an explicit `beats: []` is refused
     * rather than filed under `C-R6`'s silence: nobody spoke, so there is nothing to decline
     * to answer, and `[F5-13]`'s daily counter was already spent at the mint. `planFallback`
     * runs next and produces the one plausible beat.
     */
    trigger: input.trigger,
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
 * ── `hasMaterial`, AND WHY THE DERIVATION STAYED ───────────────────────────
 *
 * `C-N2e`: **a trigger with no material does not fire**, and F5's eligibility predicate is
 * what guarantees it. This header used to end *"when F5 lands, `PlanInput.material` is the
 * input and this derivation goes."* **F5 landed; the input arrived; the derivation stayed**,
 * and the correction is worth more than the prediction was.
 *
 * `PlanInput.material` is now the first arm and answers for every real proactive run. The
 * arms below it are reached only when the material line could **not be rebuilt** — a cold
 * Neon compute, a reading deleted between the mint and the plan — and in that case they
 * derive material presence from what F2 can actually see: a reading behind the trigger, or
 * a reader question still hanging. `idle_nudge` and `cron` still fall to zero beats there,
 * because a nudge whose planner failed AND which has nothing to be about would produce
 * *"hai, apa kabar?"*, the emptiest thing this feature could ship.
 *
 * **Deleting them would turn a failed read into a silent room**, which is the opposite of
 * what `[F5-7]` asks for on this path.
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

import 'server-only';

import { db } from '@/lib/db/client';
import type { CompletionPrompt } from '@/lib/llm/types';
import { chatBudgetFor } from '@/lib/prompt/budget';
import { addressForms } from '../address';
import { assembleChatContext } from '../context';
import { buildChatPrompt } from '../prompt/build';
import type { VoiceInput } from '../types';
import { addressFormUsed, checkTurnBodies, type TurnContext, type TurnRejectReason } from '../validate';

/**
 * THE VOICE SEAM. F1 calls these two from `./turn.ts` and F3 owns their bodies
 * (`[R13]`, and **the filenames are binding** because `callClass.test.ts` and
 * `flagCoverage.test.ts` name them by string).
 *
 * ── WHY THERE IS A MEMO IN HERE, AND WHY IT IS NOT A SHORTCUT ───────────────
 *
 * `speak()` in `./turn.ts` calls `buildTurnPrompt(input)` and then
 * `validateTurn(raw, input)` — two calls, and only the first is allowed to touch the
 * database. But `validateTurn` has to refuse **a name lifted from a stored answer** and
 * **a six-word run quoted out of one** (`[F3-8]`), and those two checks need the very
 * strings the prompt was built from. `VoiceInput` carries none of them: it has the beat,
 * the run and the transcript-so-far, and F3 may not edit `turn.ts` to widen that.
 *
 * So the builder leaves its guards behind for the validator, keyed by
 * `${runId}:${beatIndex}`. **THE LEASE IS WHAT MAKES THAT SAFE** (`C-R3`): a run is
 * claimed by exactly one executor at a time, so there is at most one writer per key, and
 * beats within a run execute serially. Two concurrent advances on two different runs
 * cannot collide because the run id is in the key.
 *
 * **A MISS IS A REFUSAL, NOT A RELAXATION.** If the guards are absent — somebody called
 * the validator without building, or a lambda recycled between the two calls — the turn
 * is refused rather than checked with three of its eighteen rules missing. That costs a
 * bubble, which is the cheap failure; the expensive one is a name reaching the room. The
 * pure core lives in `../validate.ts` and takes its guards as a parameter, which is what
 * `npm test` and the smoke script drive.
 *
 * **R2 MADE THAT PARAGRAPH LOAD-BEARING TWICE OVER.** `memory_verbatim_ngram` is the third
 * check that cannot run without the memo, and its false-acceptance cost is the same class as
 * the other two, so the refusal branch needed no change at all — which is the property a
 * seam is supposed to have.
 */

/**
 * Every guard `checkTurnBodies` needs that `VoiceInput` does not carry.
 *
 * **`memoryNotes` JOINS `rawAnswers` HERE RATHER THAN GOING ON `VoiceInput`**, and the reason
 * is this file's own: `turn.ts` calls the builder and the validator as two calls, only the
 * first may touch the database, and F3 may not widen `VoiceInput`. The alternative — a second
 * read inside `validateTurn` — would put a query on a path that is supposed to be pure and
 * would read a row that may have changed between the two calls, so the bubble would be judged
 * against a memory the prompt never saw.
 */
type TurnGuards = Pick<
  TurnContext,
  'addressForms' | 'rawAnswers' | 'conversation' | 'budget' | 'memoryNotes'
>;

/**
 * Bounded, because a lambda lives longer than a run. **32 SINCE 2026-08-30**, and the
 * comment it replaces was already stale twice over: it read *"Four beats is
 * `CHAT_MAX_BEATS`"* while the cap was six, and the cap is now EIGHT.
 *
 * The key is `runId:beatIndex`, so one run occupies as many entries as it has beats. A
 * miss is a **refusal** by design — see the header — so an evicted entry is a silently
 * lost bubble, and losing bubbles out of the longest runs is precisely the failure the
 * 2026-08-30 cap change exists to prevent. 32 is four full runs' worth of guards on one
 * warm instance.
 */
const MAX_MEMO = 32;
const GUARDS = new Map<string, { guards: TurnGuards; lastReason: TurnRejectReason | null }>();

function keyOf(input: VoiceInput): string {
  return `${input.runId}:${input.beatIndex}`;
}

function remember(key: string, guards: TurnGuards): void {
  const previous = GUARDS.get(key);
  GUARDS.delete(key);
  GUARDS.set(key, { guards, lastReason: previous?.lastReason ?? null });
  // Oldest first, which is insertion order in a Map.
  while (GUARDS.size > MAX_MEMO) {
    const oldest = GUARDS.keys().next().value;
    if (oldest === undefined) break;
    GUARDS.delete(oldest);
  }
}

/**
 * The prompt for one beat. **`async` because the context is a fistful of database reads**
 * (the count is `context.ts`'s header's to keep — it moved twice in one release), and
 * F1 declared the signature that way so F3 changes a body rather than a caller.
 */
export async function buildTurnPrompt(
  input: VoiceInput & { attempt: 1 | 2 },
): Promise<CompletionPrompt> {
  const budget = chatBudgetFor(input.locale, input.beat.reader);

  const ctx = await assembleChatContext(db, {
    userId: input.userId,
    locale: input.locale,
    profile: 'voice',
    runId: input.runId,
    replyToMessageId: input.beat.replyTo,
    /*
     * **THE QUERENT'S REAL CLOCK, AND THIS LINE USED TO BE A FABRICATION** (R1).
     * The deleted comment permitted the server's UTC day *"because nothing here
     * RENDERS a date to a person"*. This is the file whose output said *"jam 5
     * nanti"* at 08:39 — the reader had a transcript in which the newest message
     * is "just now" and a number `5`, and no position for either. Phase 2 gives
     * the voice a `<waktu>` block; this gives it something true to put in it.
     */
    clock: input.clock,
  });

  remember(keyOf(input), {
    budget,
    addressForms: ctx.addressForms,
    rawAnswers: ctx.answers.map((a) => a.text),
    conversation: ctx.messages.map((m) => m.body),
    /* The same strings `<ingatan>` rendered, so the check judges what the model was shown. */
    memoryNotes: ctx.memory,
  });

  const previous = GUARDS.get(keyOf(input))?.lastReason ?? null;

  return buildChatPrompt({
    ctx,
    self: input.beat.reader,
    beat: input.beat,
    budget,
    /* `C-R7`'s one retry, told which rule it broke. Never on the first attempt. */
    repairReason: input.attempt === 2 ? previous : null,
  });
}

export type TurnCheck =
  | { ok: true; bodies: string[]; addressForm: 'nickname' | 'clipped' | 'none' }
  /** A CLOSED set. Never a message — this reaches `events.props`. */
  | { ok: false; reason: TurnRejectReason | 'no_context' };

/**
 * The check. **SHAPE, NOT TRUTH, AND BIASED TOWARDS ACCEPTING** — `../validate.ts`'s
 * header carries the argument, which is the opposite of `validateChoice`'s and is
 * deliberately so: **a false rejection costs a bubble and makes the room quieter, which
 * is the failure this release cannot afford.**
 *
 * `bodies` may hold TWO (`[R19]`, granted by Miftah as *"the largest naturalness gain
 * left"*): a person who has more to say sends a second message rather than a longer one.
 * **Never empty** — an empty array would arrive in the room as `C-R7`'s *"a reader never
 * stores an empty bubble"* being false.
 */
export function validateTurn(raw: string, input: VoiceInput): TurnCheck {
  const key = keyOf(input);
  const memo = GUARDS.get(key);

  if (!memo) {
    /*
     * The builder did not run in this process. Refusing is the honest answer: three of the
     * eighteen refusals — the three that keep a published promise — are unavailable, and
     * `[F3-8]`'s overrides exist precisely because their false-acceptance cost is a
     * promise broken rather than an awkward bubble.
     */
    return { ok: false, reason: 'no_context' };
  }

  const checked = checkTurnBodies(raw, {
    locale: input.locale,
    reader: input.beat.reader,
    ...memo.guards,
  });

  if (!checked.ok) {
    /* Kept so attempt 2's prompt can name the rule that was broken. */
    GUARDS.set(key, { ...memo, lastReason: checked.reason });
    return { ok: false, reason: checked.reason };
  }

  GUARDS.delete(key);
  return {
    ok: true,
    bodies: checked.bodies,
    addressForm: addressFormUsed(checked.bodies, memo.guards.addressForms),
  };
}

/**
 * Test-only reset. The memo is process state, and a test that could not clear it would
 * pass or fail depending on what ran before it.
 */
export function __resetTurnGuards(): void {
  GUARDS.clear();
}

/** Re-exported so nothing else has to know where the derivation lives. */
export { addressForms };

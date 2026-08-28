/**
 * THE DIRECTOR'S NUMBERS. **ENV AT CALL TIME, AND ONE IMPORT.**
 *
 * ── WHY `planCaps()` IS A FUNCTION AND NOT SIX `const`s ────────────────────
 *
 * Roadmap §8: *read every one of these at call time, never at module scope, or the
 * bundler freezes the build-time value into production and the switch stops
 * switching.* A module-scope `const CHAT_MAX_BEATS = Number(process.env...)` is
 * inlined, so lowering the cap in Vercel would change nothing until the next deploy —
 * and the operator would conclude the variable does not work.
 *
 * ── THE ONE IMPORT, AND WHY IT IS NOT A COPY OF `90` ──────────────────────
 *
 * F2's plan §9 says *"a LEAF: env only, ZERO imports"*. It has one: `MAX_ANGLE_CHARS`
 * from `../types`, which is **F1's file and the reconciliation's pinned contract**
 * (`[R9]`). A second literal `90` here is exactly the drift §6 rule 4 of that plan
 * warns about in its own words — *"`Batas 40 kata` stood for a release while three
 * other copies moved. Grep for the number, not for the phrase."* `../types` is itself
 * a leaf whose only import is `import type`, so nothing is acquired by taking it.
 *
 * ── A NUMBER VARIABLE FALLS BACK RATHER THAN BECOMING ZERO ────────────────
 *
 * `auth/ttl.ts`'s and `meter.ts`'s rule. **A cap of `0` silences the entire feature**,
 * so `CHAT_MAX_BEATS=0` and `CHAT_MAX_BEATS=four` both resolve to the default: a typo
 * must not take the product down, and a director that may schedule no beats is a room
 * that never speaks with nothing anywhere saying why.
 */
import { MAX_ANGLE_CHARS } from '../types';

export type PlanCaps = {
  /** Beats in one run. The only one an operator may set. */
  maxBeats: number;
  maxBeatsPerReader: number;
  maxAngleChars: number;
  /** Messages the director is shown. Deliberately narrower than a voice's window. */
  windowMessages: number;
  windowBodyChars: number;
  oldReplyMinAgeMinutes: number;
};

/**
 * **SIX SINCE 2026-08-28, AND THIS REVERSES `[R19]`.** Miftah's ruling, task #4: the room
 * is too quiet, and he asked for four to six exchanges with readers answering each other,
 * answering the querent, and opening subjects of their own.
 *
 * **THE PRIOR RULING IS KEPT HERE RATHER THAN DELETED**, because it is still right about
 * the mechanism and a future session will otherwise re-derive it and quietly lower this
 * back. It read: *"FOUR, RULED BY MIFTAH (`[R19]`) … LOWER IT TO MAKE THE ROOM QUIETER,
 * NEVER RAISE IT TO MAKE THE ROOM LIVELIER. Liveliness comes from the MIX of one-beat and
 * two-beat runs and from the silence rate (§11's four levers); six bubbles at once is a
 * bot dumping, and a director that *can* schedule six *will*."*
 *
 * **THAT LAST SENTENCE IS EXACTLY WHY THIS CONSTANT WAS NEVER THE THING LIMITING THE
 * ROOM, AND THE CARD ALMOST WALKED INTO IT.** The cap has been 4 all along; what produced
 * two-bubble runs is rule 1 of the director's own prompt, which said *"ONE or TWO is the
 * ordinary answer … 4 almost never"*. Raising this number alone would have changed
 * NOTHING. It is raised here so the prompt has somewhere to go, and `system.{en,id}.ts`
 * rule 1 is rewritten in the same commit — **neither edit works without the other.**
 *
 * What did NOT change with it: `C-R6`/`C-R7` still hold. A zero-beat plan stays valid and
 * desirable, and a silence rate of zero still means the director always answers, which is
 * not what a group chat does. "Livelier" is a longer exchange when there IS one, never an
 * answer to everything.
 */
export const CHAT_MAX_BEATS_DEFAULT = 6;

/**
 * **THREE SINCE 2026-08-28, RAISED WITH THE CAP ABOVE AND ONLY BECAUSE OF IT.**
 *
 * It was two, on this argument: *"with no adjacent repeats this is what makes `A B A B`
 * and `A B C A` the only four-beat shapes available. A reader holding three of four beats
 * is a monologue with an audience in it."*
 *
 * **THE ARGUMENT WAS WRITTEN AGAINST A FOUR-BEAT CAP AND DOES NOT SURVIVE THE MOVE TO
 * SIX.** Three of four is 75% of a run; three of six is half, and the no-adjacent-repeat
 * rule still stands either way. Left at two, `A B C A B C` becomes the *only* legal
 * six-beat shape — every run identical, which is its own kind of unnatural.
 *
 * Still not an environment variable: it is a fact about the shape of a conversation rather
 * than a volume knob, and `CHAT_MAX_BEATS` is already the knob.
 */
export const MAX_BEATS_PER_READER = 3;

/**
 * **24 MESSAGES — TWELVE EXCHANGES — AND IT IS NARROWER THAN F3's 40 ON PURPOSE.**
 *
 * Long enough that *"the bubble from an hour ago"* is reachable in an active room and
 * *"the thing you said yesterday"* is reachable in a quiet one; short enough that at
 * `WINDOW_BODY_CHARS` a line the block is ~4KB, which is a routing decision's worth of
 * prompt. **The director needs to SEE candidates; a voice needs to READ them**, and
 * those are different budgets — seam S2's whole argument, applied to a count.
 */
export const CHAT_DIRECTOR_WINDOW = 24;

/**
 * How much of each body the director sees. **The trigger message is never truncated**
 * (`assemble.ts`); everything else is cut here with a trailing ellipsis.
 *
 * The director decides *who speaks and about what*; the full bodies are F3's problem,
 * and 24 of them would roughly double this prompt for a decision that does not need
 * them.
 */
export const WINDOW_BODY_CHARS = 160;

/**
 * When a hanging message becomes an *old* one, and therefore quotable out of nowhere
 * (`C-D11`).
 *
 * **A GUESS, AND NAMED AS ONE** — `PERSONA_MIN_AGE_SECONDS`'s precedent. Too low and
 * every run quotes five minutes ago; too high and `C-D11` never fires at all. Only a
 * real week of use answers it, and F2's `F2-Q5` records that.
 */
export const OLD_REPLY_MIN_AGE_MINUTES = 30;

/** A positive integer from the environment, or the fallback. Never zero, never NaN. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function planCaps(): PlanCaps {
  return {
    maxBeats: envInt('CHAT_MAX_BEATS', CHAT_MAX_BEATS_DEFAULT),
    maxBeatsPerReader: MAX_BEATS_PER_READER,
    maxAngleChars: MAX_ANGLE_CHARS,
    windowMessages: CHAT_DIRECTOR_WINDOW,
    windowBodyChars: WINDOW_BODY_CHARS,
    oldReplyMinAgeMinutes: OLD_REPLY_MIN_AGE_MINUTES,
  };
}

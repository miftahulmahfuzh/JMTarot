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
 * **EIGHT SINCE 2026-08-30, AND IT IS THE THIRD VALUE THIS CONSTANT HAS HELD.** Miftah's
 * ruling on the group-chat naturalness card: *"increase readers interaction … whatever
 * means necessary for the best user experience for our chat group"*, with
 * *"i don't care about glm 5.3 token consumption. burn it all to hell."*
 *
 * **THE TWO PRIOR RULINGS ARE KEPT HERE RATHER THAN DELETED**, because each is still right
 * about its own mechanism and a future session will otherwise re-derive one and quietly
 * lower this back.
 *
 *  - `[R19]` set it to FOUR: *"LOWER IT TO MAKE THE ROOM QUIETER, NEVER RAISE IT TO MAKE
 *    THE ROOM LIVELIER. Liveliness comes from the MIX of one-beat and two-beat runs and
 *    from the silence rate; six bubbles at once is a bot dumping, and a director that
 *    *can* schedule six *will*."*
 *  - 2026-08-28 set it to SIX, and its note is the one that matters: *"Raising this number
 *    alone would have changed NOTHING … `system.{en,id}.ts` rule 1 is rewritten in the same
 *    commit — neither edit works without the other."*
 *
 * **THAT NOTE WAS RIGHT AND STILL INCOMPLETE, AND FINDING OUT COST A WHOLE RELEASE OF
 * QUIET ROOM.** Rule 1 was rewritten to ask for three or four beats. The two WORKED
 * EXAMPLES sitting directly above it were not, and both of them answer with two beats and
 * then say so in prose — *"Dua beat, bukan tiga"*. `system.id.ts`'s own header ranks the
 * examples ABOVE the rules (*"the example does more work than the description"*), so the
 * model was shown two and told four. **A cap change needs FOUR edits, not two: the number,
 * rule 1, rule 11, and every worked example that answers with a beat count.**
 *
 * What did NOT change with it, and must not: `C-R6`/`C-R7` still hold. A zero-beat plan
 * stays valid and desirable for a POSTED message, and **a silence rate of zero still means
 * the director always answers, which is not what a group chat does.** "Livelier" is a
 * longer exchange when there IS one, never an answer to everything — which is why rule 1
 * still names ONE and TWO as ordinary answers and why the third worked example is a
 * one-beat run.
 *
 * **EIGHT AND NOT NINE.** Nine is the structural maximum (three readers x
 * `MAX_BEATS_PER_READER`, with no adjacent repeats), so eight leaves the PROMPT as the
 * control and this constant as the guard, which is the relationship `[R19]`'s note asks
 * for and the one a cap at its own structural ceiling would destroy.
 */
export const CHAT_MAX_BEATS_DEFAULT = 8;

/**
 * **STILL THREE, AND THE ARGUMENT FOR IT HAS NOW CHANGED TWICE.**
 *
 * It was two, against a four-beat cap: *"with no adjacent repeats this is what makes
 * `A B A B` and `A B C A` the only four-beat shapes available. A reader holding three of
 * four beats is a monologue with an audience in it."*
 *
 * It became three at the six-beat cap, because three of four is 75% of a run and three of
 * six is half, and because at two the only legal six-beat shape is `A B C A B C` — every
 * run identical, which is its own kind of unnatural.
 *
 * **AT EIGHT IT STOPS BEING A LIMIT ON MONOLOGUE AND BECOMES THE THING THAT FORBIDS A
 * LONG RUN BEING A DUET.** Ceil(8 / 3) is 3, so an eight-beat sheet CANNOT be built out of
 * two readers: the third has to be in the room. That is `R3`'s *"reader↔reader"* enforced
 * by arithmetic rather than by prose, and it is the reason this number must not be raised
 * to four alongside the cap — at four per reader, `A B A B A B A B` becomes legal and the
 * longest, liveliest-looking runs would be the ones with somebody missing from them.
 *
 * Still not an environment variable: it is a fact about the shape of a conversation rather
 * than a volume knob, and `CHAT_MAX_BEATS` is already the knob.
 */
export const MAX_BEATS_PER_READER = 3;

/**
 * **32 MESSAGES SINCE 2026-08-30, AND THE REASON IS THE CAP RATHER THAN THE ROOM.**
 *
 * It was 24 — *"twelve exchanges … long enough that 'the bubble from an hour ago' is
 * reachable in an active room and 'the thing you said yesterday' is reachable in a quiet
 * one"*. That arithmetic was done against four-beat runs, where twelve exchanges is
 * roughly three runs of history.
 *
 * **AN EIGHT-BEAT RUN CAN ITSELF BE NINE TO SEVENTEEN MESSAGES** (`[R19]` gives a beat two
 * bubbles), so at 24 the director would frequently be looking at **one run plus the
 * querent's message** and would have no way to see what the room had already covered.
 * A director that cannot see the last run repeats it, and a repeated beat is the one thing
 * rule 1 names as worse than no beat at all.
 *
 * **The narrower-than-F3's-40 principle is intact and is not what moved**: the director
 * still needs to SEE candidates where a voice needs to READ them. What moved is how many
 * messages one exchange now costs.
 */
export const CHAT_DIRECTOR_WINDOW = 32;

/**
 * How much of each body the director sees. **The trigger message is never truncated**
 * (`assemble.ts`); everything else is cut here with a trailing ellipsis.
 *
 * **240 SINCE 2026-08-30, UP FROM 160, AND THE COST RULING IS WHAT PAYS FOR IT.** 160 cut
 * Margaret's resolved `id` ceiling (338 characters) in half, and a long sentence that
 * carries its point in a subordinate clause loses the point rather than the tail. At 240
 * every Thessaly and Adrian bubble arrives whole and only Margaret is trimmed; the block
 * goes from roughly 4KB to roughly 7.7KB, which is a routing decision's worth of prompt
 * under a ruling that says to spend.
 *
 * **It is still not the voice's budget.** Raising it to Margaret's full ceiling would make
 * this window a second `<obrolan>`, and seam S2's argument — *the director decides who
 * speaks and about what; the full bodies are F3's problem* — is what stops it.
 */
export const WINDOW_BODY_CHARS = 240;

/**
 * When a hanging message becomes an *old* one, and therefore quotable out of nowhere
 * (`C-D11`).
 *
 * **A GUESS, AND NAMED AS ONE** — `PERSONA_MIN_AGE_SECONDS`'s precedent. Too low and
 * every run quotes five minutes ago; too high and `C-D11` never fires at all. Only a
 * real week of use answers it, and F2's `F2-Q5` records that. **Unmoved by the 2026-08-30
 * cap change**: `checkPlan`'s P8 still allows exactly ONE old quote per run, and that is
 * correct at eight beats for the same reason it was correct at four — the rule is against
 * a room that is stuck, and being stuck is not a function of run length.
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

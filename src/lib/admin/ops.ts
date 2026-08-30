/**
 * Which `LLMOp` values have a querent behind them, and which do not. **F7, v0.7.0,
 * seam S10.**
 *
 * ── PURE, A LEAF: ONE TYPE IMPORT AND ONE VALUE IMPORT ─────────────────────
 *
 * No `server-only` (a unit test must reach it), no `process.env`, no React. Same
 * shape as `model.ts` and `flags.ts` next door, for the same reason: the part that
 * decides something must be reachable by `npm test`.
 *
 * ── WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT BESIDE `OP_ORDER` ───────
 *
 * `C-D5` gives F7 *"fixing the cost-per-reading denominator everywhere it already
 * exists"*. A full sweep of `src/app/admin/**`, `src/lib/db/queries/admin/**`,
 * `src/lib/analytics/**`, `src/lib/llm/**` and `docs/analytics-queries.md` for any
 * expression dividing a cost, a token count or a call count by a reading count
 * **returns nothing**. There is no such arithmetic in this repository.
 *
 * What exists is the **rule** about one, stated in prose in four places — and three
 * of the four were stale when v0.7.0 opened: `OP_ORDER`'s header said *"The ten"*
 * over an eleven-member array, `docs/analytics-queries.md` said ten and named only
 * `insight`, and `copy.ts` said *"Sepuluh op"*. **A rule restated in prose four times
 * is a rule that will be wrong in three of them again by v0.8.0.** So the honest
 * reading of S10 is *fix the rule, not an arithmetic that was never written* — and
 * fixing a rule means giving it one machine-checked home.
 *
 * It is not declared beside `OP_ORDER` because `src/lib/analytics/rollup.ts` is A3's
 * file and, this release, F1's: F1 must append `chat_plan` and `chat_turn` there or
 * the existing `AssertNever` fails to compile. Seam S10 says in as many words that
 * **F1 must not "helpfully" fix the denominator while adding the ops**, and the
 * cleanest way to honour that is for the classification to live in a file F7 owns.
 *
 * ── AND NOTHING DIVIDES BY A READING COUNT YET (`[F7-6]`) ──────────────────
 *
 * This is the constant a denominator would use, published before the denominator
 * exists. Inventing a cost-per-reading tile in order to have something to correct
 * would force `op` into `PriceableRow`, into `tokensByBucketAndModel`'s SQL and into
 * `userCostLeague`'s SQL — three edits to A3's files, breaking six test files — to
 * render a number nobody asked for.
 */
import type { LLMOp } from '@/lib/llm/types';
import { OP_ORDER } from '@/lib/analytics/rollup';

/**
 * **THE FIVE OPS WITH NO QUERENT BEHIND THEM. A COST-PER-READING DENOMINATOR
 * EXCLUDES THESE.**
 *
 * Two measure the DASHBOARD and the CMS — `insight` is the button on `/admin`'s own
 * subpanels, `blog_format` is Auto Format on `/admin/blog` — and two measure a
 * product feature that simply is not a reading: `chat_plan` is one director call per
 * run, `chat_turn` is one voice call per beat. All four are excluded for the same
 * arithmetic reason and for two different product ones.
 *
 * **THE CHAT PAIR IS NOT AN OUTAGE OF THE READING PATH AND MUST NOT BE READ AS
 * OVERHEAD.** `/admin/chat` exists precisely so that what the room costs is visible;
 * what this list forbids is dividing it by *Bacaan selesai* and calling the quotient
 * a cost per reading.
 *
 * **`profile_memory` IS THE FIFTH, 2026-08-30, AND IT IS THE CLEAREST CASE IN THE
 * LIST.** R2's extractor runs when a chat run has already ended, over a transcript,
 * and produces nothing anybody reads as prose. Its denominator is *conversations*, and
 * dividing it by *Bacaan selesai* would make every cost-per-reading figure move when a
 * querent chats and never draws a card. **The question this list asks is not "is a
 * human present" -- `chat_turn` is here and a querent is usually watching one arrive --
 * it is "would dividing this by a reading count mean anything".**
 */
export const NON_READING_OPS = [
  'insight',
  'blog_format',
  'chat_plan',
  'chat_turn',
  'profile_memory',
] as const satisfies readonly LLMOp[];

/**
 * The literal twin of `READING_OPS`, spelled out so the guard below has two
 * type-level members to subtract.
 *
 * **A HAND-WRITTEN LIST PLUS A MECHANICAL CHECK IS `OP_ORDER`'s OWN TRADE**, and it
 * is made for `OP_ORDER`'s own reason: `Array.prototype.filter` has no type-level
 * result, so a derived array is `readonly LLMOp[]` and tells the compiler nothing
 * about its members. `ops.test.ts` asserts this literal and the derived array are
 * equal, which is what keeps the transcription honest.
 */
const READING_OPS_LITERAL = [
  'moderation',
  'reading',
  'gist',
  'day_summary',
  'frequency',
  'lotus',
  'persona',
  'translation',
  'translation_repair',
] as const satisfies readonly LLMOp[];

/**
 * The other nine: every op incurred by somebody taking a reading, directly or in its
 * wake.
 *
 * **DERIVED FROM `OP_ORDER` RATHER THAN FROM THE LITERAL**, so the ORDER is
 * `OP_ORDER`'s — the one order this codebase renders ops in, *"not by rank, because
 * an order that changes with the data reads as the data changing"*.
 */
export const READING_OPS = OP_ORDER.filter(
  (op) => !(NON_READING_OPS as readonly string[]).includes(op),
) as readonly LLMOp[];

/**
 * **THE GUARD. A FIFTEENTH OP IS A COMPILE ERROR UNTIL SOMEBODY DECIDES WHICH SIDE
 * IT IS ON.**
 *
 * `OP_ORDER`'s own `AssertNever` shape, one layer up: that one asks *"is every op
 * named somewhere"*, this one asks *"is every op CLASSIFIED"*. The two questions are
 * different and only the second one has a denominator riding on it — a new op that
 * `OP_ORDER` names and nothing classifies would silently join the reading side,
 * which is the wrong default for every op added since 2026-07-31.
 *
 * Type-only: nothing is emitted.
 */
type AssertNever<T extends never> = T;
type _UnclassifiedOps = AssertNever<
  Exclude<LLMOp, (typeof NON_READING_OPS)[number] | (typeof READING_OPS_LITERAL)[number]>
>;

/** The literal, exported for the test that keeps it equal to the derived array. Not
 *  for rendering: `READING_OPS` is the one with `OP_ORDER`'s order. */
export const _READING_OPS_LITERAL = READING_OPS_LITERAL;

/** Is this op one a reading caused? A predicate rather than an `includes` at each
 *  call site, so the negation is spelled once. */
export function isReadingOp(op: LLMOp): boolean {
  return !(NON_READING_OPS as readonly string[]).includes(op);
}

/**
 * Digit reduction, and the one rule everything else in this directory sits on.
 *
 * PURE. No imports at all. This is the leaf of the leaf: `gematria.ts`,
 * `astrology.ts` and `arcana.ts` all reduce, and none of them may re-implement
 * it — two implementations of a rule with a halt condition agree right up until
 * they do not, and the disagreement surfaces as one number on `/account` and a
 * different one in a persona generated the same afternoon.
 *
 * THE RULE: repeatedly sum the decimal digits, HALTING AT 11, 22 OR 33.
 * `reduce(29) = 11`, `reduce(39) = 3` (39 -> 12 -> 3, and 12 is not a master),
 * `reduce(11) = 11`.
 *
 * THE MASTERS ARE FIXED POINTS, AND THAT WAS DECIDED THE HARD WAY.
 * `PUBLIC_RELEASE_ROADMAP_v0.3.0.md` §5 originally said masters are "preserved
 * only when they appear as a sum, never as an input", which makes `reduce(11)`
 * be 2. V1 implemented it literally and it produced a visible absurdity: a life
 * path takes `reduce(MM)`, so NOVEMBER WOULD CONTRIBUTE 2 while the 29th
 * contributes 11 — no November-born person could ever reach a master life path
 * through their month. Reconciliation §5.3 amended the roadmap: the idempotent
 * rule is simpler to state, removes a special case rather than adding one, and
 * is what standard Pythagorean practice does with an 11th month.
 *
 * If you think it should go back, that is a reconciliation question and not a
 * patch: V3's verdicts and V8's personas are computed against this rule and
 * STORED, so changing it silently rewrites the meaning of every row already
 * written.
 */

export const MASTER_NUMBERS = [11, 22, 33] as const;

export type MasterNumber = (typeof MASTER_NUMBERS)[number];

/**
 * Every value a gloss exists for.
 *
 * DELIBERATELY EXCLUDES 0. `reduce(0)` is 0 — zero is already a single digit and
 * there is nothing to sum — but zero is not a numerological quality, it is the
 * signature of a name with no letters. Keeping it out of this union is what
 * makes `reduceToGloss` return `null` instead of the module acquiring an
 * `as GlossNumber` cast, and a cast here would hand `undefined` to a prompt,
 * which does not throw and produces fluent prose grounded in nothing.
 */
export type GlossNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | MasterNumber;

const GLOSS_NUMBERS = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9, ...MASTER_NUMBERS]);

export function isMaster(n: number): n is MasterNumber {
  return (MASTER_NUMBERS as readonly number[]).includes(n);
}

export function isGlossNumber(n: number): n is GlossNumber {
  return GLOSS_NUMBERS.has(n);
}

/** Sum of the decimal digits. `n` must already be a non-negative integer. */
function digitSum(n: number): number {
  let total = 0;
  let rest = n;
  while (rest > 0) {
    total += rest % 10;
    rest = Math.floor(rest / 10);
  }
  return total;
}

/**
 * Fold `n` to a single digit, halting on 11, 22 or 33.
 *
 * Throws rather than returning null on bad input (plan N3): every argument this
 * function receives is a sum computed inside this module, so a negative or
 * fractional one is a programming error and a silently-wrong life path is
 * untraceable. `windowBounds` returns null because its inputs are user data;
 * these are not.
 */
export function reduce(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`reduce() needs a non-negative safe integer, got ${n}`);
  }
  let value = n;
  while (value >= 10 && !isMaster(value)) value = digitSum(value);
  return value;
}

/**
 * `reduce`, narrowed to the values a gloss exists for.
 *
 * Null exactly when the reduction is 0, which happens exactly when the input is
 * 0. THIS IS THE ONLY BRIDGE FROM ARITHMETIC TO THE GLOSS TABLES, and it exists
 * so that no file in this directory writes `as GlossNumber`.
 */
export function reduceToGloss(n: number): GlossNumber | null {
  const r = reduce(n);
  return isGlossNumber(r) ? r : null;
}

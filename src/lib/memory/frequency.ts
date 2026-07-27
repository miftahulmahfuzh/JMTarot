/**
 * The card-frequency verdict: ranking, the gate, the fingerprint, and the
 * ladder walk (W5 plan §3.2-§3.4).
 *
 * SPLIT FROM `queries/frequency.ts` DELIBERATELY. That directory's contract is
 * "handle first, one file per read concern, nothing stateful"; ranking rules and
 * a cache-validity hash are neither reads nor pure data access. Keeping them
 * here means the comparator and the gate are unit-testable with no database at
 * all -- which matters, because they encode product judgement and product
 * judgement is what changes.
 *
 * `cardFrequency` and `firstPassingWindow` DO take a handle, as their first
 * argument, matching the query modules' convention even though this file is not
 * one. Two conventions for "where does the handle go" in one feature would be
 * worse than one convention applied slightly beyond its home.
 */
import { createHash } from 'node:crypto';
import { cardCounts, readingsInWindow, type CardCount } from '@/lib/db/queries/frequency';
import type { DbOrTx } from '@/lib/db/types';
import { VERDICT_LADDER, WINDOWS, windowBounds, type WindowKey } from './windows';

export type { CardCount };

/**
 * The minimum evidence a verdict needs before it is allowed to exist (M4).
 *
 * NOT ENVIRONMENT VARIABLES, on purpose (M15). These are product judgement: a
 * change to them changes what the app claims about a person, and that belongs
 * in a diff and in the smoke output rather than in a dashboard nobody reviews.
 * The kill switches and throttles are the env vars; these are not those.
 */
export const FREQUENCY_GATE = {
  /** Readings, not cards. One three-card spread is not a pattern. */
  minReadings: 5,
  /** The top card must have actually recurred. Two is a coincidence. */
  minTopCount: 3,
  /** A "pair" needs a real runner-up, not a card seen once. */
  minSecondCount: 2,
} as const;

export type FrequencyResult = {
  window: WindowKey;
  from: string;
  to: string;
  /** Distinct readings in the window. The M4 gate's first test. */
  readings: number;
  /** Sorted by the M3 comparator. Length 0..22. */
  ranked: CardCount[];
  fingerprint: string;
};

/**
 * M3: count desc, then most recent occurrence desc, then card id asc.
 *
 * Recency is the tiebreak a human would use. The FINAL `cardId` TIEBREAK IS NOT
 * COSMETIC: it makes the order total, and the fingerprint below is computed over
 * the top two, so without it two cards tied on count and date could swap places
 * between two calls and invalidate a cache that describes an unchanged fact.
 */
export function rankCounts(counts: readonly CardCount[]): CardCount[] {
  return [...counts].sort(
    (a, b) =>
      b.count - a.count ||
      (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0) ||
      a.cardId - b.cardId,
  );
}

/**
 * The cache-validity key: SHA-256 over the ranked top two, the reading total
 * and the window key (§3.4).
 *
 * It changes exactly when the FACT changes, which is what lets the cache serve a
 * generated line without re-deriving whether the line is still true. The window
 * key is in the hash because the same pair of cards with the same counts means a
 * different sentence in "this week" than in "this year" -- and the row is keyed
 * by window, so without it a `week` fingerprint would validate a `year` row.
 *
 * The reading total is in because "Strength five times out of seven readings"
 * and "out of forty" are different claims about the same two cards.
 */
export function fingerprintOf(window: WindowKey, readings: number, ranked: readonly CardCount[]): string {
  const top = ranked
    .slice(0, 2)
    .map((c) => `${c.cardId}:${c.count}`)
    .join(',');
  return createHash('sha256').update(`${window}\0${readings}\0${top}`).digest('hex');
}

/**
 * Does this window have enough behind it to say anything (M4)?
 *
 * The two-distinct-cards check is implied by `minSecondCount`, and is asserted
 * separately anyway so that the failure mode has its own legible test name. A
 * verdict names a PAIR; one card is a different sentence this feature does not
 * write.
 */
export function passesGate(result: FrequencyResult): boolean {
  const { readings, ranked } = result;
  if (readings < FREQUENCY_GATE.minReadings) return false;
  if (ranked.length < 2) return false;
  if (ranked[0].count < FREQUENCY_GATE.minTopCount) return false;
  if (ranked[1].count < FREQUENCY_GATE.minSecondCount) return false;
  return true;
}

/**
 * How far the top card has pulled ahead of the second, as a WORD (V3-5).
 *
 * A bucket and never a number, and that is VD2's mechanical half rather than a
 * stylistic preference: the prompt is handed this word, so the model cannot
 * accidentally recite a margin it was never given. `DOMINANCE_GLOSS` in
 * `prompt/summary.ts` turns it into one Indonesian or English word, and every
 * one of those eight words was chosen to carry no numeral flavour.
 */
export type Dominance = 'tied' | 'narrow' | 'clear' | 'overwhelming';

/**
 * RANKED ON A RATIO, NOT ON `m - n` (V3-5, correcting roadmap §5).
 *
 * A difference is not scale-invariant: 4 over 2 and 10 over 8 have the same
 * difference and are not the same fact. "Twice as often" means the same thing at
 * 4:2 as at 20:10, which is what a ratio says and a difference does not.
 *
 * THE `m - n === 1` CLAUSE IS AN ABSOLUTE FLOOR AND IT DOES REAL WORK AT SMALL
 * COUNTS. `3` over `2` is a ratio of 1.5, which the ratio alone would call
 * `clear`; one extra appearance across five readings is not a clear anything.
 *
 * Over the pairs the gate actually admits:
 *
 *      3:2 narrow      4:2 overwhelming   5:2 overwhelming
 *      4:3 narrow      5:3 clear          7:5 clear
 *      6:4 clear      10:8 narrow        12:4 overwhelming
 *
 * `10:8` landing on `narrow`, where `10 - 8 = 2` would have said otherwise, is
 * the whole argument for the ratio in one row — and `dominance.test.ts` names
 * that case after the ratio so a later refactor back to a difference fails
 * there rather than passing everywhere else.
 *
 * IT LIVES HERE AND NOT IN `@/lib/numerology` (reconciliation §5.4). These
 * thresholds are frequency-specific product judgement tuned against real output,
 * which is this file's stated purpose; a constant one workstream owns while
 * another tunes it is the wrong seam.
 */
export function dominanceOf(m: number, n: number): Dominance {
  if (m === n) return 'tied';
  const ratio = m / n;
  if (m - n === 1 || ratio < 1.35) return 'narrow';
  if (ratio >= 2) return 'overwhelming';
  return 'clear';
}

export type FrequencyArgs = {
  userId: string;
  today: string;
  birthDate?: string | null;
};

/**
 * One window, fully resolved: bounds, counts, ranking and fingerprint.
 *
 * Null when the window itself cannot be computed -- the `birthday` spec with no
 * birth date, or an unparseable `today`. A window that computes but is empty is
 * NOT null: it is a real result with `readings: 0` that fails the gate, and the
 * difference matters to §3.4's "delete any existing row" branch, which must fire
 * for a window that slid past its own evidence and must not fire for one that
 * was never askable.
 *
 * Two round trips, deliberately, and they are issued together: the grouped scan
 * and the distinct-reading count cannot be one query without either a subselect
 * over the same rows or a sum that triples every three-card spread.
 */
export async function cardFrequency(
  db: DbOrTx,
  window: WindowKey,
  args: FrequencyArgs,
): Promise<FrequencyResult | null> {
  const bounds = windowBounds(WINDOWS[window], args.today, args.birthDate);
  if (!bounds) return null;

  const [counts, readings] = await Promise.all([
    cardCounts(db, args.userId, bounds.from, bounds.to),
    readingsInWindow(db, args.userId, bounds.from, bounds.to),
  ]);

  const ranked = rankCounts(counts);
  return {
    window,
    from: bounds.from,
    to: bounds.to,
    readings,
    ranked,
    fingerprint: fingerprintOf(window, readings, ranked),
  };
}

/**
 * Walk `VERDICT_LADDER` narrowest-first and return the first window that passes
 * the gate, or null (§3.3).
 *
 * SEQUENTIAL AND NOT `Promise.all`, because the overwhelming majority of users
 * pass on `week` and stop after one pair of index scans. Fanning all four out
 * would quadruple the database work for the common case in order to speed up the
 * uncommon one, on a query that is already sub-millisecond.
 */
export async function firstPassingWindow(
  db: DbOrTx,
  args: FrequencyArgs,
): Promise<FrequencyResult | null> {
  for (const key of VERDICT_LADDER) {
    const result = await cardFrequency(db, key, args);
    if (result && passesGate(result)) return result;
  }
  return null;
}

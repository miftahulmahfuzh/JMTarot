/**
 * V3's adapter over V1's correspondence engine, and the composed type the
 * frequency prompt is built from.
 *
 * THIS IS THE ONLY MODULE IN V3 THAT IMPORTS `@/lib/numerology` (plan Task 1).
 * V1's signatures were assumed while the two plans were written in parallel; if
 * any of them had differed, exactly one file would have changed. They did not,
 * and the seam is kept anyway — V8 is the next consumer of that engine and the
 * next chance for a signature to move.
 *
 * WHAT THE MECHANIC IS FOR. v0.3.0 exists because the memory feature said "The
 * Empress is shown three times whilst The Chariot is shown two times" — the app
 * doing arithmetic out loud. A count is an input, never an output (VD2). So the
 * counts come in here and what comes out is three card NAMES, a written line and
 * two closed-set words. The prompt is handed that object and nothing else, which
 * is why the model cannot recite a tally: IT WAS NEVER GIVEN ONE. An instruction
 * would be the second line of defence and this is the first, in that order
 * deliberately — an instruction is what fails under compression pressure.
 *
 * `pulseNumber` IS THE ONE NUMBER ON THE COMPOSED TYPE AND IT IS NOT A COUNT.
 * It is `reduce(m + n)` folded to 1–9/11/22/33, it exists for the
 * `memory.frequency_generated` event, and `buildFrequencyPrompt` interpolates
 * `pulseGloss` instead — there is a test asserting the assembled user turn holds
 * no digit at all. VD2 forbids counts in the output the querent reads, never in
 * analytics: `events` rows are how "is the gate set right?" gets answered.
 *
 * PURE, and `shadow.test.ts`'s exact-key-set assertion is inherited from V1
 * (reconciliation §5.4). Without it VD2 degrades from "impossible" back to
 * "merely forbidden", because the way a count gets back into the prompt is
 * somebody adding `topCount` to this type for a reason that looks good at the
 * time.
 */
import type { Card, Locale } from '@/data/types';
import {
  arcanaFor,
  numberGloss,
  reduceToGloss,
  type GlossNumber,
} from '@/lib/numerology';
import { dominanceOf, type Dominance } from './frequency';

/** Where the shadow landed when it landed on the pair itself. */
export type ShadowCollision = 'top' | 'second' | null;

export type ShadowFor = { card: Card; collision: ShadowCollision };

/**
 * The card standing behind the pair: `arcanaFor(a.id + b.id)`.
 *
 * This is the traditional quintessence / sum-card practice, and the mysticism
 * being BORROWED rather than invented is the point — the querent recognises the
 * card from their own deck, which is what the risk table's "reads as generated
 * filler" is mitigated by.
 *
 * THE COLLISION HAPPENS EXACTLY WHEN THE FOOL IS IN THE PAIR, because
 * `x + 0 ≡ x (mod 22)` and `0` is that congruence's only solution in `0..21`.
 * `shadow.test.ts` proves it exhaustively over all 462 ordered distinct pairs
 * rather than asserting it, because it is cheap to prove and it is the entire
 * argument for V3-2's separate prompt branch.
 */
export function shadowFor(topId: number, secondId: number): ShadowFor {
  const card = arcanaFor(topId + secondId);
  const collision: ShadowCollision =
    card.id === topId ? 'top' : card.id === secondId ? 'second' : null;
  return { card, collision };
}

export type Pulse = { number: GlossNumber; gloss: string };

/**
 * The combined number of the pair, as a written line.
 *
 * Null only when `reduce(m + n)` is 0, which needs `m + n === 0`. The gate
 * guarantees `m ≥ 3` and `n ≥ 2`, so the null branch is unreachable from the
 * route and exists so that this function is total for a caller that has not run
 * `passesGate` — the smoke script being one.
 */
export function pulseFor(m: number, n: number, locale: Locale): Pulse | null {
  const number = reduceToGloss(m + n);
  return number === null ? null : { number, gloss: numberGloss(number, locale) };
}

/**
 * The day's quintessence: `arcanaFor(sum of every card id drawn today)` (V3-3).
 *
 * OMITTED ENTIRELY ON A COLLISION, which is a stronger rule than the frequency
 * line's. There the collision is one pair in twenty-two and carries a real
 * meaning worth a sentence; here it is a *set* of unknown size, a one-card day
 * always collides, and a fifty-word greeting that names the same card twice
 * reads as a mistake rather than as a pattern hardening.
 *
 * The sum is unbounded above — a heavy day of three-card spreads runs past 200 —
 * which is why `arcanaFor` has to fold any non-negative integer and not just
 * `0..43`. `shadow.test.ts` covers a sum of 81 for exactly that reason.
 */
export function dayShadowFor(cardIds: readonly number[]): Card | null {
  if (cardIds.length === 0) return null;
  const sum = cardIds.reduce((total, id) => total + id, 0);
  const card = arcanaFor(sum);
  return cardIds.includes(card.id) ? null : card;
}

/**
 * Everything the frequency prompt is allowed to know. NOTE WHAT IS ABSENT.
 *
 * No `m`, no `n`, no `sample`, no `reversedCount`, no difference and no ratio —
 * only `dominance`, which is a bucket precisely because a bucket cannot be
 * accidentally recited as a figure. `shadow.test.ts` asserts this key set
 * exactly.
 */
export type FrequencyMechanic = {
  topName: string;
  secondName: string;
  shadowName: string;
  /**
   * The shadow's deck id, for `memory.frequency_generated`. A card id, not a
   * count -- and it is here rather than re-derived at the call site because the
   * alternative was the route doing `CARDS.findIndex(c => c.name === …)`, which
   * is a second place for the mechanic to be computed differently from the
   * prompt's.
   */
  shadowCardId: number;
  shadowCollision: ShadowCollision;
  pulseNumber: GlossNumber;
  pulseGloss: string;
  dominance: Dominance;
};

export type MechanicInput = { cardId: number; count: number };

/**
 * Compose the three derived values from the ranked top two.
 *
 * Null when the pulse cannot be computed or a card id is outside the deck — a
 * verdict V3 declines to render rather than a throw, for `arcanaFor`'s stated
 * reason: the ids come from a scan over `reading_cards`, so an out-of-range one
 * means the deck moved under the data and wrapping it silently would put a
 * confidently wrong card in front of the querent.
 */
export function frequencyMechanic(
  top: MechanicInput,
  second: MechanicInput,
  locale: Locale,
): FrequencyMechanic | null {
  const inDeck = (n: number) => Number.isInteger(n) && n >= 0 && n < 22;
  if (!inDeck(top.cardId) || !inDeck(second.cardId)) return null;

  const pulse = pulseFor(top.count, second.count, locale);
  if (pulse === null) return null;

  const shadow = shadowFor(top.cardId, second.cardId);
  return {
    topName: arcanaFor(top.cardId).name,
    secondName: arcanaFor(second.cardId).name,
    shadowName: shadow.card.name,
    shadowCardId: shadow.card.id,
    shadowCollision: shadow.collision,
    pulseNumber: pulse.number,
    pulseGloss: pulse.gloss,
    dominance: dominanceOf(top.count, second.count),
  };
}

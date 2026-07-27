/**
 * Numbers to Major Arcana, and the Shadow Arcana behind a pair (roadmap §5).
 *
 * THE SHADOW ARCANA IS THE MECHANIC THAT REPLACES THE TALLY. v0.3.0 exists
 * because the memory feature says "The Empress is shown three times whilst The
 * Chariot is shown two times" — the app doing arithmetic out loud. A count is an
 * input, never an output. So the pair goes in and a third card comes out:
 * `arcanaFor(a.id + b.id)`, which is the traditional quintessence / sum-card
 * practice. The mysticism is BORROWED, not invented, and that matters: the
 * querent recognises the card from their own deck.
 *
 * NOTHING HERE RETURNS A COUNT (VD2, plan N11). `shadowArcana` takes `m` and
 * `n` and gives back the pulse — `reduce(m + n)` — and nothing else derived from
 * them. The prompt is handed this object, so the model CANNOT recite a tally it
 * was never given. That is stronger than an instruction, and instructions are
 * what fail under compression pressure.
 *
 * DOMINANCE LIVES IN V3, NOT HERE (reconciliation §5.4). An earlier draft of
 * this file exported `Dominance` and `dominanceFor` with thresholds this
 * workstream admitted were unmeasured guesses. They are frequency-specific
 * product judgement, tuned against real output, and they belong beside
 * `passesGate` in `src/lib/memory/frequency.ts`. V8 imports this directory too
 * and has no use for a bucket.
 */
import type { Card } from '@/data/types';
import { CARDS } from '@/data/deck';
import { type GlossNumber, reduceToGloss } from './reduce';

/**
 * Any integer -> a Major Arcana, mod 22.
 *
 * The double modulo keeps a negative from indexing off the end even though
 * nothing in this release passes one. A master number maps through its own
 * value (roadmap §5): 11 is Justice, 22 is The Fool. That is the traditional
 * correspondence and it costs nothing.
 */
export function arcanaFor(n: number): Card {
  return CARDS[((Math.trunc(n) % CARDS.length) + CARDS.length) % CARDS.length];
}

export type CountedCard = { cardId: number; count: number };

export type ShadowResult = {
  top: Card;
  second: Card;
  /** The card standing behind the pair: `arcanaFor(a.id + b.id)`. */
  shadow: Card;
  /**
   * True exactly when the shadow IS one of the pair, which happens exactly when
   * The Fool (id 0) is in the pair, because `x + 0 ≡ x (mod 22)` and 0 is its
   * only solution in 0..21. V3 needs a different sentence for that case: "the
   * card standing behind The Fool and The Hermit is The Hermit" is not one.
   */
  shadowIsInPair: boolean;
  pulse: GlossNumber;
};

/**
 * The frequency mechanic, roadmap §5. Note what is NOT on the return type.
 *
 * Null rather than a throw on a bad card id: the ids come from a database scan
 * over `reading_cards`, so a value outside 0..21 means the deck changed under
 * the data, and wrapping it silently would put a confidently wrong card in
 * front of the querent. Null is a verdict V3 can decline to render.
 */
export function shadowArcana(top: CountedCard, second: CountedCard): ShadowResult | null {
  const inDeck = (n: number) => Number.isInteger(n) && n >= 0 && n < CARDS.length;
  if (!inDeck(top.cardId) || !inDeck(second.cardId)) return null;
  if (!Number.isSafeInteger(top.count) || top.count < 0) return null;
  if (!Number.isSafeInteger(second.count) || second.count < 0) return null;
  const pulse = reduceToGloss(top.count + second.count);
  if (pulse === null) return null;
  const shadow = arcanaFor(top.cardId + second.cardId);
  return {
    top: CARDS[top.cardId],
    second: CARDS[second.cardId],
    shadow,
    shadowIsInPair: shadow.id === top.cardId || shadow.id === second.cardId,
    pulse,
  };
}

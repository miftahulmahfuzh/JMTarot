import raw from './cards.json';
import type { Card, Draw, Polarity } from './types';

export const CARDS = raw as Card[];

/**
 * Full-size card art, 800x1200. For the result panel, where the card is large
 * enough that the artwork is the point.
 *
 * The iOS build needed a generated `cardArt.ts` registry here because Metro
 * cannot resolve a computed `require` path. On the web the URL is the lookup,
 * so the registry is gone and the slug is the only key we need.
 */
export function cardImage(slug: string): string {
  return `/cards/${slug}.webp`;
}

/**
 * 240x360 card art, ~22KB. For the fan and the slots, which draw at 88x132.
 * Serving the full size to 22 fanned cards would cost 4.1MB to paint
 * thumbnails -- see tools/normalize_cards.py.
 */
export function cardThumb(slug: string): string {
  return `/cards/thumb/${slug}.webp`;
}

/** The design reverses roughly three cards in ten. */
const REVERSAL_RATE = 0.3;

/**
 * Shuffle the full deck, then assign orientations.
 *
 * The shuffle happens before the user picks anything and every card is face
 * down, so which card sits at which arc position is genuinely arbitrary. That
 * matters: it means the pick is a real draw, not a reveal chosen after the fact.
 */
export function shuffleDeck(reversals = true): Draw[] {
  const order = [...CARDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((card) => ({
    card,
    reversed: reversals && Math.random() < REVERSAL_RATE,
  }));
}

/** Reversal inverts a card's charge. Neutral cards have none to invert. */
export function effectivePolarity({ card, reversed }: Draw): Polarity {
  if (!reversed || card.polarity === 'neutral') return card.polarity;
  return card.polarity === 'light' ? 'shadow' : 'light';
}

/** A reversal also flips a yes into a no. `maybe` stays undecided either way. */
export function effectiveYesNo({ card, reversed }: Draw) {
  if (!reversed || card.yesno === 'maybe') return card.yesno;
  return card.yesno === 'yes' ? 'no' : 'yes';
}

/**
 * The querent's birth card, by the usual reduction: sum every digit of the
 * birth date, then fold the total until it lands in 0-21.
 *
 * Deterministic and offline, and it maps cleanly onto our deck because our deck
 * *is* the 22 Majors.
 */
export function birthCard(isoDate: string): Card {
  const digits = isoDate.replace(/\D/g, '');
  let total = 0;
  for (const ch of digits) total += Number(ch);
  while (total > 21) {
    let folded = 0;
    for (const ch of String(total)) folded += Number(ch);
    if (folded === total) break;
    total = folded;
  }
  return CARDS[Math.min(total, 21)];
}

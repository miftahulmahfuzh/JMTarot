import { describe, expect, it } from 'vitest';
import { CARDS, cardById } from './deck';

/**
 * V6's lookup. The whole reason it is a lookup and not `CARDS[id]` is the last
 * test in this file.
 *
 * Every caller is a renderer reconstructing a past draw from `reading_cards`, so
 * a miss must be a `undefined` it can skip and never a throw on a page that has
 * already sent its headers.
 */
describe('cardById', () => {
  it('finds the ends of the deck', () => {
    expect(cardById(0)?.name).toBe('The Fool');
    expect(cardById(21)?.name).toBe('The World');
  });

  it('finds every card in the deck by its own id', () => {
    for (const card of CARDS) expect(cardById(card.id)).toBe(card);
  });

  it('returns undefined rather than throwing for anything that is not a card', () => {
    for (const bad of [22, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect({ bad, got: cardById(bad) }).toEqual({ bad, got: undefined });
    }
  });

  /**
   * THE REASON IT IS A LOOKUP. Indexing is correct only while `cards.json`
   * happens to be in id order, and nothing enforces that — `deck.test.ts`
   * asserts the order today, but a generator change would break that assertion
   * and this function at the same time, and only one of the two failures says
   * "the wrong card is on screen". Searching by `id` is right whatever the order.
   */
  it('does not depend on the array being in id order', () => {
    const scrambled = [...CARDS].reverse();
    const byId = (id: number) => scrambled.find((c) => c.id === id);
    for (const card of CARDS) expect(byId(card.id)).toBe(cardById(card.id));
  });
});

import { describe, expect, it } from 'vitest';
import { CARDS, CARD_URL_SLUGS, cardByUrlSlug, cardUrlSlug } from './deck';

/**
 * Roadmap §3.2's table, transcribed. **THE TRANSCRIPTION IS THE POINT** (S-D4): a
 * slug is a permanent public address, so a rename is a 301 nobody will remember to
 * write, and the only thing standing between a rename and silence is a
 * hand-written table that disagrees with the function.
 *
 * Ordered by card id, so the array index IS the id and a reordered `cards.json`
 * fails here rather than serving the wrong document at the right address.
 */
const TABLE: readonly string[] = [
  'the-fool', 'the-magician', 'the-high-priestess', 'the-empress', 'the-emperor',
  'the-hierophant', 'the-lovers', 'the-chariot', 'strength', 'the-hermit',
  'wheel-of-fortune', 'justice', 'the-hanged-man', 'death', 'temperance',
  'the-devil', 'the-tower', 'the-star', 'the-moon', 'the-sun',
  'judgement', 'the-world',
];

describe('the URL slug', () => {
  it('has one row per card, so the table is not short', () => {
    expect(TABLE).toHaveLength(22);
    expect(CARDS).toHaveLength(22);
  });

  it('matches roadmap §3.2 exactly, card by card', () => {
    for (const card of CARDS) {
      expect({ id: card.id, name: card.name, slug: cardUrlSlug(card) })
        .toEqual({ id: card.id, name: card.name, slug: TABLE[card.id] });
    }
  });

  it("exports the twenty-two in Fool's Journey order", () => {
    expect([...CARD_URL_SLUGS]).toEqual([...TABLE]);
  });

  it('is NOT the art slug, which is the whole of S-D4', () => {
    // `18_moon` addresses a file; `the-moon` addresses a document somebody found
    // by typing words. Underscores and a leading number are worth nothing in a URL
    // and cost a keyword.
    for (const card of CARDS) {
      expect(cardUrlSlug(card)).not.toBe(card.slug);
      expect(cardUrlSlug(card)).not.toMatch(/[_0-9]/);
    }
  });

  it('round-trips, and is undefined for anything else', () => {
    for (const card of CARDS) {
      expect(cardByUrlSlug(cardUrlSlug(card))).toBe(card);
    }
    // `undefined` and not a throw, for `cardById`'s recorded reason: every caller
    // is a renderer. The page turns the miss into notFound() itself.
    for (const miss of ['', 'the-mooon', '18_moon', 'The-Moon', 'the moon', 'moon']) {
      expect(cardByUrlSlug(miss)).toBeUndefined();
    }
  });

  it('needs no special case for the four articleless cards or for `of`', () => {
    // §3.2's closing note, asserted: `strength`, `justice`, `death`, `temperance`
    // carry no article and `wheel-of-fortune` keeps its `of`, and both follow from
    // lowercasing and hyphenating. If either ever needs a branch, the function is
    // wrong and not the table.
    expect(cardUrlSlug(CARDS[8])).toBe('strength');
    expect(cardUrlSlug(CARDS[10])).toBe('wheel-of-fortune');
    expect(cardUrlSlug(CARDS[20])).toBe('judgement');   // not `judgment`
  });
});

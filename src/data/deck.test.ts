import { describe, expect, it } from 'vitest';
import { CARDS, effectivePolarity, effectiveYesNo, shuffleDeck } from './deck';

/*
 * A regression net around code that carried over from the iOS build unchanged.
 * deck.ts already implements all of this; these tests exist so that a later
 * edit -- or a bad merge of cards.json -- cannot quietly break the semantics
 * the prompt builder depends on.
 */
describe('deck', () => {
  it("has all 22 Majors in Fool's Journey order", () => {
    expect(CARDS).toHaveLength(22);
    expect(CARDS.map((c) => c.id)).toEqual([...Array(22).keys()]);
  });

  it('shuffles without losing or duplicating a card', () => {
    const ids = shuffleDeck()
      .map((d) => d.card.id)
      .sort((a, b) => a - b);
    expect(ids).toEqual([...Array(22).keys()]);
  });

  it('flips polarity on reversal but leaves neutral alone', () => {
    const light = CARDS.find((c) => c.polarity === 'light')!;
    expect(effectivePolarity({ card: light, reversed: true })).toBe('shadow');
    const neutral = CARDS.find((c) => c.polarity === 'neutral');
    if (neutral) expect(effectivePolarity({ card: neutral, reversed: true })).toBe('neutral');
  });

  it('flips yes/no on reversal but leaves maybe undecided', () => {
    const yes = CARDS.find((c) => c.yesno === 'yes')!;
    expect(effectiveYesNo({ card: yes, reversed: true })).toBe('no');
    const maybe = CARDS.find((c) => c.yesno === 'maybe');
    if (maybe) expect(effectiveYesNo({ card: maybe, reversed: true })).toBe('maybe');
  });
});

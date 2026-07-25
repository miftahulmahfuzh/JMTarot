import { describe, expect, it } from 'vitest';
import { CARDS, cardMeaning, effectivePolarity, effectiveYesNo, shuffleDeck } from './deck';

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

  /*
   * The detail overlay is the only place a card describes itself in its own
   * words, so a card missing its pair -- or carrying the same line twice --
   * would read as if the orientation did not matter. Regenerating cards.json is
   * the only supported way to change these; tools/generate_cards.py asserts the
   * same things at build time, and this catches a bad merge of the output.
   */
  it('gives every card two distinct one-line meanings', () => {
    for (const card of CARDS) {
      expect(card.meaning.upright.trim()).not.toBe('');
      expect(card.meaning.reversed.trim()).not.toBe('');
      expect(card.meaning.reversed).not.toBe(card.meaning.upright);
    }
  });

  it('picks the meaning that matches the orientation', () => {
    const moon = CARDS[18];
    expect(cardMeaning({ card: moon, reversed: false })).toBe(moon.meaning.upright);
    expect(cardMeaning({ card: moon, reversed: true })).toBe(moon.meaning.reversed);
  });

  /*
   * Indonesian, not Malay. Same eleven Malay-only words the smoke script greps
   * generated readings for; these lines are hand-written rather than generated,
   * but they are reader-facing copy and the rule does not change.
   */
  it('writes the meanings in Indonesian', () => {
    const malay = [
      'kerjaya', 'hala tuju', 'sembang', 'awak',
      'tempoh', 'kerana', 'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin',
    ];
    for (const card of CARDS) {
      const text = `${card.meaning.upright} ${card.meaning.reversed}`;
      for (const word of malay) {
        expect(text).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
      }
    }
  });
});

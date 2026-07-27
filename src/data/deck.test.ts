import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/lib/i18n/locale';
import {
  CARDS,
  cardKeywords,
  cardMeaning,
  effectivePolarity,
  effectiveYesNo,
  shuffleDeck,
} from './deck';

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
  it('gives every card two distinct one-line meanings, in both locales', () => {
    for (const card of CARDS) {
      for (const locale of LOCALES) {
        const pair = card.meaning[locale];
        expect(pair, `${card.slug} [${locale}]`).toBeDefined();
        expect(pair.upright.trim(), `${card.slug} [${locale}] upright`).not.toBe('');
        expect(pair.reversed.trim(), `${card.slug} [${locale}] reversed`).not.toBe('');
        expect(pair.reversed, `${card.slug} [${locale}]`).not.toBe(pair.upright);
      }
    }
  });

  /**
   * The English is WRITTEN, not translated, so no card may still be carrying the
   * Indonesian in its English slot. `generate_cards.py` asserts this too; this
   * catches a bad merge of its output, which is the only other way it can happen.
   */
  it('never leaves an English meaning holding the Indonesian line', () => {
    for (const card of CARDS) {
      expect(card.meaning.en.upright, card.slug).not.toBe(card.meaning.id.upright);
      expect(card.meaning.en.reversed, card.slug).not.toBe(card.meaning.id.reversed);
    }
  });

  it('gives every card three keywords in both locales', () => {
    for (const card of CARDS) {
      for (const locale of LOCALES) {
        expect(cardKeywords(card, locale), `${card.slug} [${locale}]`).toHaveLength(3);
        for (const word of cardKeywords(card, locale)) expect(word.trim()).not.toBe('');
      }
      expect(card.keywords.en, card.slug).not.toEqual(card.keywords.id);
    }
  });

  it('picks the meaning that matches the orientation AND the locale', () => {
    const moon = CARDS[18];
    expect(cardMeaning({ card: moon, reversed: false }, 'id')).toBe(moon.meaning.id.upright);
    expect(cardMeaning({ card: moon, reversed: true }, 'id')).toBe(moon.meaning.id.reversed);
    expect(cardMeaning({ card: moon, reversed: false }, 'en')).toBe(moon.meaning.en.upright);
    expect(cardMeaning({ card: moon, reversed: true }, 'en')).toBe(moon.meaning.en.reversed);
    // The cross pairs, because the two mistakes this guards are independent: a
    // reversed card described as upright, and an English querent handed the
    // Indonesian line. Asserting only the diagonal would pass on a function that
    // ignored one argument.
    expect(cardMeaning({ card: moon, reversed: true }, 'en')).not.toBe(moon.meaning.id.reversed);
    expect(cardMeaning({ card: moon, reversed: false }, 'en')).not.toBe(moon.meaning.en.reversed);
  });

  /*
   * Indonesian, not Malay. Same eleven Malay-only words the smoke script greps
   * generated readings for; these lines are hand-written rather than generated,
   * but they are reader-facing copy and the rule does not change.
   *
   * THE `id` HALF ONLY, now that there are two. The English half gets its own
   * check below rather than this one -- `kerana` is not a risk in English and
   * running the grep there would be theatre.
   */
  it('writes the Indonesian meanings in Indonesian', () => {
    const malay = [
      'kerjaya', 'hala tuju', 'sembang', 'awak',
      'tempoh', 'kerana', 'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin',
    ];
    for (const card of CARDS) {
      const text = `${card.meaning.id.upright} ${card.meaning.id.reversed}`;
      for (const word of malay) {
        expect(text, `${card.slug}: ${word}`).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
      }
    }
  });

  /**
   * The English half's own tic list.
   *
   * These 44 lines are display copy in an entertainment app, and the two ways
   * English tarot writing goes wrong here are the therapy register and the
   * capitalised abstraction. Both are forbidden in the reading prompts
   * (`base.en.ts`), and copy that breaks a rule the generated text obeys would be
   * the app contradicting itself on the same screen.
   */
  it('keeps the English meanings out of the therapy and mystic registers', () => {
    const forbidden = [
      'trauma', 'healing', 'heal', 'therapy', 'inner child', 'shadow work',
      'nervous system', 'hold space', 'the Universe', 'divine', 'manifest',
      'abundance', 'dear one', 'beloved', "soul's journey",
    ];
    for (const card of CARDS) {
      const text = `${card.meaning.en.upright} ${card.meaning.en.reversed}`;
      for (const word of forbidden) {
        expect(text, `${card.slug}: ${word}`).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
      }
    }
  });
});

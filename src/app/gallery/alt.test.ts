import { describe, expect, it } from 'vitest';
import { CARDS, cardKeywords } from '@/data/deck';
import { tFor } from '@/lib/i18n/catalog';
import { LOCALES } from '@/lib/i18n/locale';
import { galleryAlt } from './alt';

describe('galleryAlt', () => {
  it('names the card, its numeral and all its keywords, in both locales', () => {
    for (const locale of LOCALES) {
      const t = tFor(locale);
      for (const card of CARDS) {
        const alt = galleryAlt(card, t);
        expect(alt).toContain(card.name);
        expect(alt).toContain(card.numeral);
        for (const k of cardKeywords(card, locale)) expect(alt).toContain(k);
      }
    }
  });

  it('is 22 DISTINCT strings per locale', () => {
    for (const locale of LOCALES) {
      const t = tFor(locale);
      expect(new Set(CARDS.map((c) => galleryAlt(c, t))).size).toBe(22);
    }
  });

  it('differs between locales for EVERY card, which is how a stub is caught', () => {
    // If `keywords.en` were ever copied from `keywords.id` -- or the template
    // key's English left as the Indonesian -- these would collide and nothing
    // else in the suite would notice.
    for (const card of CARDS) {
      expect(galleryAlt(card, tFor('id'))).not.toBe(galleryAlt(card, tFor('en')));
    }
  });

  it('never returns the KEY, which is what an unresolved lookup looks like', () => {
    // I3: an unknown key returns the key, on purpose. This asserts the failure
    // mode directly rather than relying on the two tests above to imply it.
    for (const locale of LOCALES) {
      expect(galleryAlt(CARDS[0], tFor(locale))).not.toBe('gallery.card.alt');
      expect(galleryAlt(CARDS[0], tFor(locale))).not.toContain('{');
    }
  });

  it('stays inside the length a screen reader and a crawler both tolerate', () => {
    for (const locale of LOCALES) {
      const t = tFor(locale);
      for (const card of CARDS) {
        expect(galleryAlt(card, t).length).toBeLessThanOrEqual(125);
      }
    }
  });

  it('opens with the phrase somebody actually types, per locale', () => {
    /*
     * The word ORDER is the whole reason the two templates are not translations
     * of each other (§8.2): `kartu tarot the moon` in Indonesian, `the moon tarot
     * card` in English. An English template rendered from the Indonesian word
     * order would pass every other assertion in this file.
     */
    const moon = CARDS.find((c) => c.name === 'The Moon')!;
    expect(galleryAlt(moon, tFor('id')).startsWith('Kartu tarot The Moon')).toBe(true);
    expect(galleryAlt(moon, tFor('en')).startsWith('The Moon tarot card')).toBe(true);
  });
});

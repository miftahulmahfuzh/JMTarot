import { describe, expect, it } from 'vitest';
import { CARDS, CARD_URL_SLUGS, cardById, cardUrlSlug } from '@/data/deck';
import { ARCANA_LORE, LORE_SLUGS, loreFor } from './index';

describe('the lore registry', () => {
  it('holds only real slugs', () => {
    for (const slug of LORE_SLUGS) {
      expect({ slug, card: cardUrlSlug(CARDS.find((c) => cardUrlSlug(c) === slug)!) })
        .toEqual({ slug, card: slug });
      expect(CARD_URL_SLUGS).toContain(slug);
    }
  });

  it('is written in card order, because the sitemap reads the insertion order', () => {
    const ids = LORE_SLUGS.map((s) => ARCANA_LORE[s].id.cardId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('agrees with itself about slug, locale and cardId in both halves', () => {
    for (const slug of LORE_SLUGS) {
      for (const locale of ['id', 'en'] as const) {
        const doc = loreFor(slug, locale)!;
        const card = cardById(doc.cardId)!;
        expect({ slug: doc.slug, locale: doc.locale, derived: cardUrlSlug(card) })
          .toEqual({ slug, locale, derived: slug });
      }
    }
  });

  it('returns undefined for a slug that is not a card, and for one not registered', () => {
    expect(loreFor('not-a-card', 'id')).toBeUndefined();
    // A registered slug in a locale that exists always resolves; the interesting
    // miss is the one the page turns into `notFound()`.
    expect(loreFor('', 'en')).toBeUndefined();
  });
});

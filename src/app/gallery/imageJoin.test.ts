import { describe, expect, it } from 'vitest';
import { arcanaGraph } from '@/app/arcana/[slug]/jsonld';
import { theMoonEn } from '@/content/arcana/the-moon.en';
import { theMoonId } from '@/content/arcana/the-moon.id';
import { CARDS, cardById, cardImagePath, cardUrlSlug } from '@/data/deck';
import { tFor } from '@/lib/i18n/catalog';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { localePath } from '@/lib/i18n/prefix';
import { imageObject, type JsonLdNode } from '@/lib/seo/jsonld';
import { galleryImages } from './images';

/**
 * **THE ONE ASSERTION IN THIS WORKSTREAM THAT SPANS TWO PAGES.**
 *
 * `/gallery` and `/arcana/<slug>` both emit an `ImageObject` for the same artwork
 * under the same `@id`, so a consumer merges them into one node -- which means every
 * field they BOTH carry has to agree. If they disagree, one of two values wins
 * arbitrarily, the markup stays valid, and nothing reports it.
 *
 * **THIS TEST EXISTS BECAUSE THAT WAS BROKEN THE FIRST TIME IT SHIPPED**, and it was
 * found by reading the JSON off the wire rather than by anything in the suite: the
 * gallery had `url` = the lore page and the lore page had `url` = the image file.
 * Both are defensible in isolation. Only one of them can be true of one node.
 *
 * It reads `arcanaGraph` -- S4's module -- deliberately. A fence that reads a file it
 * does not own goes red when somebody else edits their code, and that objection is
 * why the other tests here are directory-local; it does not apply to an assertion
 * whose entire subject IS the agreement between two owners. If S4 changes its image
 * node, this SHOULD go red.
 */
const ORIGIN = 'https://www.jmtarot.site';
const abs = (path: string) => `${ORIGIN}${path === '/' ? '/' : path}`;

/** The gallery's node for one card, in one locale. */
function galleryNode(card = cardById(18)!, locale: Locale = 'id'): Record<string, unknown> {
  const loreHrefs = { [card.id]: localePath(locale, `/arcana/${cardUrlSlug(card)}`) };
  const [args] = galleryImages({
    cards: [card],
    loreHrefs,
    locale,
    t: tFor(locale),
    abs,
    creator: `${ORIGIN}/#organization`,
  });
  return imageObject(args) as Record<string, unknown>;
}

/** The lore page's node for The Moon, in one locale. */
function loreNode(locale: Locale): Record<string, unknown> {
  const canonical = `${ORIGIN}${localePath(locale, '/arcana/the-moon')}`;
  const g = arcanaGraph({
    card: cardById(18)!,
    doc: locale === 'id' ? theMoonId : theMoonEn,
    canonical,
    origin: ORIGIN,
    locale,
    imageUrl: abs(cardImagePath('18_moon')),
    homeLabel: 'JMTarot',
    homeUrl: `${ORIGIN}/`,
    galleryLabel: 'Galeri',
    galleryUrl: `${ORIGIN}/gallery`,
  })['@graph'] as JsonLdNode[];
  const article = g.find((n) => n['@type'] === 'Article')!;
  return article.image as Record<string, unknown>;
}

describe('the ImageObject join between /gallery and /arcana/<slug>', () => {
  it('agrees on @id in BOTH locales, which is what makes them one node', () => {
    for (const locale of LOCALES) {
      expect(galleryNode(cardById(18)!, locale)['@id']).toBe(loreNode(locale)['@id']);
    }
  });

  it('agrees on every field they both carry', () => {
    /*
     * The gallery's node is a SUPERSET -- it adds `contentUrl`, `thumbnailUrl`,
     * `description`, `inLanguage` and `creator`, which the lore page has no reason
     * to repeat. What is forbidden is a field present in both with two values.
     */
    for (const locale of LOCALES) {
      const g = galleryNode(cardById(18)!, locale);
      const l = loreNode(locale);
      const shared = Object.keys(l).filter((k) => l[k] !== undefined && g[k] !== undefined);
      // Not vacuous: `@type`, `@id`, `url`, `width`, `height` at least.
      expect(shared.length).toBeGreaterThanOrEqual(5);
      for (const key of shared) {
        expect({ [key]: g[key] }).toEqual({ [key]: l[key] });
      }
    }
  });

  it('anchors the @id on the LOCALE-SPECIFIC lore page, not on the file', () => {
    // Two locales are two documents describing one picture, and the localised
    // `description` differs, so they are two nodes -- correctly. An `@id` built
    // from the image PATH would collapse them and make that field a coin flip.
    expect(galleryNode(cardById(18)!, 'id')['@id']).toBe(`${ORIGIN}/arcana/the-moon#image`);
    expect(galleryNode(cardById(18)!, 'en')['@id']).toBe(`${ORIGIN}/en/arcana/the-moon#image`);
  });

  it('gives all 22 cards a distinct @id per locale, and no URL carries ?v=', () => {
    for (const locale of LOCALES) {
      const loreHrefs = Object.fromEntries(
        CARDS.map((c) => [c.id, localePath(locale, `/arcana/${cardUrlSlug(c)}`)]),
      );
      const args = galleryImages({
        cards: CARDS,
        loreHrefs,
        locale,
        t: tFor(locale),
        abs,
        creator: `${ORIGIN}/#organization`,
      });
      expect(args).toHaveLength(22);
      expect(new Set(args.map((a) => a.id)).size).toBe(22);
      expect(JSON.stringify(args)).not.toContain('?');
      // The licence claim stays absent until S5 writes clause 9's grant.
      expect(args.every((a) => a.licenseUrl === undefined)).toBe(true);
    }
  });

  it('describes each card in the page\'s own language, and captions nothing', () => {
    const id = galleryNode(cardById(18)!, 'id');
    const en = galleryNode(cardById(18)!, 'en');
    // `caption` belongs to the lore page's node -- see the collision above. This
    // asserts the resolution rather than the symptom: if the gallery grows one
    // back, the "agrees on every field" case goes red and this says why.
    expect(id.caption).toBeUndefined();
    expect(en.caption).toBeUndefined();
    expect(id.description).not.toBe(en.description);
    expect(id.inLanguage).toBe('id');
    expect(en.inLanguage).toBe('en');
  });
});

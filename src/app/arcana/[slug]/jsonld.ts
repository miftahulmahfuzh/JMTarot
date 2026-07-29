import type { Card, Locale } from '@/data/types';
import type { LoreDoc } from '@/content/types';
import { article, breadcrumbList, graph, imageObject, type JsonLdNode } from '@/lib/seo/jsonld';

/**
 * The structured data for one lore page (S-D16). PURE -- it takes the origin and
 * the canonical rather than resolving either, so it is testable with a literal.
 *
 * **S1 OWNS THE BUILDERS; THIS FILE OWNS THE GRAPH** -- which builders, with what,
 * in what order. The `Article` / `CreativeWork` argument is in `article()`'s own
 * header, where the next person to reach for `CreativeWork` will actually meet it.
 *
 * **THE BREADCRUMB'S MIDDLE RUNG IS `/gallery`, NEVER `/arcana`.** `/arcana` is a
 * deliberate 404 (§3.1, R6), so naming it in a breadcrumb is a machine-readable
 * claim that a page exists where one does not -- which is worse than a two-item
 * trail, because the trail is the part a crawler believes. `/gallery` is the index
 * of this collection by §3.1's own reasoning, which makes it both valid and
 * honest. `breadcrumb.test.ts` asserts item 2's URL by string.
 *
 * **`datePublished` IS PER RELEASE AND `dateModified` IS A CONSTANT.** Not
 * `new Date()`: a page reporting itself as modified on every fetch is a lie that
 * costs crawl budget, and `sitemap.ts` carries the same rule with a byte-stability
 * test. Bump `LORE_UPDATED_AT` in the commit that edits the documents.
 */

/** The release these documents shipped in. */
const LORE_PUBLISHED_AT = '2026-07-29';

/** Bump when the lore prose changes. **Not a build timestamp.** */
const LORE_UPDATED_AT = '2026-07-29';

export function arcanaGraph(input: {
  card: Card;
  doc: LoreDoc;
  /** Absolute. From `contentAlternates().canonical`, so the graph and the
   *  `<link rel="canonical">` cannot disagree -- a canonical pointing at the
   *  wrong host de-indexes the correct page and nothing reports it (S-D11). */
  canonical: string;
  origin: string;
  locale: Locale;
  /**
   * Absolute URL of the 800x1200 art. Built by the page from `siteOrigin()`.
   *
   * **UNVERSIONED, AND THAT CHANGED IN S3.** The page renders `cardImage()` with
   * its `?v=${ART_VERSION}` cache-buster and passes `cardImagePath()` here:
   * Google Images treats a changed URL as a NEW image with no history, so a
   * version in structured data orphans twenty-two indexed images on every art
   * regeneration and reports nothing. `/gallery` follows the same rule, which is
   * also what lets the two pages share one `@id`.
   */
  imageUrl: string;
  /** The gallery's label, from the catalog. Never a second word for one page. */
  galleryLabel: string;
  homeLabel: string;
  galleryUrl: string;
  homeUrl: string;
}): JsonLdNode {
  const { card, doc, canonical, origin, locale } = input;

  /*
   * NOT `VisualArtwork`: that would describe OUR painting rather than the card,
   * and the page is about the card in general -- the painting is the `image`.
   * `name` is the card's ENGLISH name in both locales (`## Card data`), which is
   * the same string the reading uses and the same string `about` should carry.
   */
  const about: JsonLdNode = {
    '@type': 'CreativeWork',
    name: card.name,
    identifier: card.numeral,
    isPartOf: 'Major Arcana',
  };

  return graph([
    article({
      origin,
      url: canonical,
      headline: doc.h1,
      description: doc.description,
      // The BARE tag (R15). `intlTag('en')` is `en-GB`, which is a factual claim
      // about a regional variant that nothing here was written in.
      inLanguage: locale,
      image: imageObject({
        /*
         * **THE SAME `@id` `/gallery` EMITS FOR THIS ARTWORK, WHICH IS WHAT MAKES
         * THE TWO PAGES DESCRIBE ONE IMAGE** (S3, v0.4.0). Both are
         * `<absolute lore url>#image`, so Google merges them into a single node
         * with two mentions rather than ranking forty-four unrelated ones. It is
         * derived from `canonical` for the same reason the `Article`'s
         * `mainEntityOfPage` is: one string, so the locale twin gets the locale's
         * own id and the pair cannot cross.
         */
        id: `${canonical}#image`,
        url: input.imageUrl,
        width: 800,
        height: 1200,
        caption: doc.imageAlt,
      }),
      datePublished: LORE_PUBLISHED_AT,
      dateModified: LORE_UPDATED_AT,
      about,
    }),
    breadcrumbList([
      { name: input.homeLabel, url: input.homeUrl },
      { name: input.galleryLabel, url: input.galleryUrl },
      { name: card.name, url: canonical },
    ]),
  ]);
}

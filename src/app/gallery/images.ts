/**
 * The twenty-two `ImageObject` argument sets for `/gallery`'s `ImageGallery`.
 *
 * ── WHY THIS IS A MODULE AND NOT TWENTY LINES INSIDE `page.tsx` ─────────────
 *
 * **BECAUSE THE JOIN WITH `/arcana/<slug>` IS A CROSS-PAGE INVARIANT AND WAS
 * BROKEN THE FIRST TIME IT SHIPPED.** Both pages emit an `ImageObject` for the
 * same artwork under the same `@id`, so a consumer MERGES them -- which means every
 * field they both carry has to agree, or one of two values wins arbitrarily and
 * nothing reports which. The first version had `url` = the lore page here and
 * `url` = the image file there; it was found by reading the JSON off the wire, not
 * by a test.
 *
 * A module makes the invariant testable: `imageJoin.test.ts` builds BOTH graphs
 * from the same card and asserts the shared fields match. That test cannot exist if
 * this list is a closure inside a server component.
 *
 * PURE, and `abs` arrives as an argument rather than importing `@/lib/seo/origin`:
 * that keeps the test free of `process.env` and keeps the origin leaf's one
 * legitimate reader unchanged (`scripts/audit-secrets.ts` pairs the name with it).
 */
import { cardImagePath, cardMeaning, cardThumbPath } from '@/data/deck';
import type { Card, Locale } from '@/data/types';
import type { TFunction } from '@/lib/i18n/format';
import type { ImageObjectArgs } from '@/lib/seo/jsonld';

/** The art's true export size. Both files are 2:3; only the thumb is smaller. */
export const ART_SIZE = { width: 800, height: 1200 } as const;

export function galleryImages(input: {
  cards: readonly Card[];
  /** `card.id` -> the locale-prefixed lore PATH. The `@id`'s anchor. */
  loreHrefs: Record<number, string>;
  locale: Locale;
  t: TFunction;
  /** Root-relative -> absolute. `absoluteUrl` in the page, a literal in the test. */
  abs: (path: string) => string;
  /** `${origin}/#organization`. */
  creator: string;
}): ImageObjectArgs[] {
  const { cards, loreHrefs, locale, t, abs, creator } = input;

  return cards.map((card) => ({
    /*
     * **THE SAME `@id` THE LORE PAGE EMITS FOR THIS ARTWORK**, so the two pages
     * describe one image with two mentions rather than two unrelated nodes. It is
     * anchored on the lore page rather than on the file because that is the
     * artwork's per-locale document, and `/en/arcana/<slug>` is a different id
     * from `/arcana/<slug>` -- which is correct: the `description` below is
     * localised, so they are two descriptions of one picture rather than a
     * contradiction.
     */
    id: `${abs(loreHrefs[card.id])}#image`,
    /*
     * **THE IMAGE FILE, AGREEING WITH THE LORE PAGE'S NODE.** See the header: a
     * merged node with two `url` values is a coin flip. It is also what Google
     * documents for an `Article`'s `image`, which is the other caller.
     */
    url: abs(cardImagePath(card.slug)),
    /*
     * The highest-resolution bytes available. Today that is the same 800x1200
     * export; **when S5 lands it becomes `wallpaperPath(cardUrlSlug(card), 'card')`
     * at `WALLPAPER_SIZE.card`** -- 1024x1536, the art's true resolution and a
     * better Google Images target (S5's advisory D6). The only reason it is not
     * that today is that `contentUrl` must name a file that exists.
     *
     * UNVERSIONED, all three. `cardImage()`/`cardThumb()` append
     * `?v=${ART_VERSION}` for the browser cache; a version here would change 22
     * image URLs on every art regeneration, and Google Images treats a changed URL
     * as a new image with no history.
     */
    contentUrl: abs(cardImagePath(card.slug)),
    thumbnailUrl: abs(cardThumbPath(card.slug)),
    encodingFormat: 'image/webp',
    ...ART_SIZE,
    /*
     * **NO `caption`, AND THAT IS THE FIX FOR A COLLISION `imageJoin.test.ts`
     * CAUGHT.** The lore page's node captions the PAINTING (`doc.imageAlt`, a
     * sentence about what is in the picture) and this one used to caption the CARD
     * (`galleryAlt`, the keyword sentence). Same `@id`, two captions, one wins
     * arbitrarily. So the caption stays with the page that describes the picture and
     * this node carries `description` instead -- the merged result has one of each,
     * both true. `galleryAlt` keeps its real job: the tile's `alt`, which is the
     * indexed text a person searching Google Images actually matches.
     */
    /* The UPRIGHT gloss, through `cardMeaning` -- never
       `card.meaning[locale].upright`, which can get the locale wrong as well as
       the orientation. */
    description: cardMeaning({ card, reversed: false }, locale),
    /* The BARE tag (R15). `intlTag('en')` is `en-GB`, and `id-ID` on the `WebSite`
       node beside `id` on these 22 is the inconsistency the rule prevents. */
    inLanguage: locale,
    creator,
    /*
     * **NO `licenseUrl`, AND THAT IS THE HONEST VALUE RATHER THAN AN OMISSION.**
     * S3's plan passes `/terms#9` on the premise that S5 writes a wallpaper licence
     * into that clause. S5 has not landed, and clause 9 today RESERVES our rights
     * rather than granting any -- so `license` + `acquireLicensePage` would be a
     * claim a crawler believes about terms that do not say it: the `SearchAction`
     * mistake with legal consequences instead of cosmetic ones. `jsonld.test.ts`
     * asserts both directions.
     */
  }));
}

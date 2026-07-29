import { describe, expect, it } from 'vitest';
import {
  breadcrumbList,
  graph,
  imageGallery,
  imageObject,
  type ImageObjectArgs,
  type JsonLdNode,
  organization,
  serializeJsonLd,
  website,
} from './jsonld';

const ORIGIN = 'https://www.jmtarot.site';

describe('organization', () => {
  it('names the operator and the logo, both absolute', () => {
    const o = organization({
      origin: ORIGIN,
      name: 'JMTarot',
      legalName: 'PT Citra Suka Buana',
      logo: '/icon.png',
      description: 'Bacaan tarot Major Arcana bersama tiga pembaca.',
    });
    expect(o['@type']).toBe('Organization');
    expect(o['@id']).toBe(`${ORIGIN}/#organization`);
    expect(o.url).toBe(`${ORIGIN}/`);
    expect(o.logo).toBe(`${ORIGIN}/icon.png`);
    expect(o.legalName).toBe('PT Citra Suka Buana');
  });

  it('omits sameAs rather than emitting an empty array', () => {
    // There are no social accounts. `sameAs: []` is a claim about nothing and
    // Google's validator flags it; an absent field is the honest shape.
    const o = organization({ origin: ORIGIN, name: 'JMTarot', logo: '/icon.png' });
    expect('sameAs' in o).toBe(false);
    expect('legalName' in o).toBe(false);
    expect('description' in o).toBe(false);
  });
});

describe('website', () => {
  it('links itself to the organization by @id, not by repeating it', () => {
    const w = website({ origin: ORIGIN, name: 'JMTarot', description: 'x', inLanguage: 'id' });
    expect(w['@type']).toBe('WebSite');
    expect(w['@id']).toBe(`${ORIGIN}/#website`);
    expect(w.publisher).toEqual({ '@id': `${ORIGIN}/#organization` });
  });

  it('takes the BARE language tag, never intlTag() (R15)', () => {
    /*
     * `intlTag('en')` is `en-GB` and V6 chose that deliberately for date and time
     * formats. `inLanguage` is a different question: it is a factual claim a
     * crawler believes, nothing here was written as British English, and the bare
     * tag is what `<html lang>` already emits.
     *
     * The failure this prevents is `id-ID` on the WebSite node beside `id` on the
     * 22 ImageObjects S3 will add to the same `@graph`. Asserted here because
     * this is the first builder to take the argument and the convention it sets
     * binds S3, S4 and S6.
     */
    const w = website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'en' });
    expect(w.inLanguage).toBe('en');
    expect(String(w.inLanguage)).not.toContain('-');
  });

  it('EMITS NO SearchAction, EVER (S-D16)', () => {
    /*
     * There is no site search. Marking up one we do not have is a lie a crawler
     * can check by following the `target` template and getting a 404 -- and the
     * only outcome is that every other claim in our markup is trusted less.
     *
     * Asserted on the serialized string as well as on the object, because the
     * shape somebody reaches for is a nested `potentialAction`.
     */
    const w = website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'id' });
    expect('potentialAction' in w).toBe(false);
    expect(serializeJsonLd(w)).not.toContain('SearchAction');
  });
});

describe('breadcrumbList', () => {
  it('numbers positions from 1', () => {
    const b = breadcrumbList([
      { name: 'JMTarot', url: `${ORIGIN}/` },
      { name: 'Galeri', url: `${ORIGIN}/gallery` },
      { name: 'The Moon', url: `${ORIGIN}/arcana/the-moon` },
    ]);
    expect(b['@type']).toBe('BreadcrumbList');
    const items = b.itemListElement as { position: number; name: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2].name).toBe('The Moon');
  });

  it('refuses an empty trail', () => {
    // A BreadcrumbList with no items is invalid markup and the caller that
    // produced it has a bug worth failing on rather than shipping.
    expect(() => breadcrumbList([])).toThrow(/at least one/);
  });

  it('refuses a relative url, so a crumb cannot be half-absolute', () => {
    expect(() => breadcrumbList([{ name: 'x', url: '/gallery' }])).toThrow(/absolute/);
  });
});

describe('graph', () => {
  it('carries exactly one @context, at the top', () => {
    // Two nodes each with their own @context is valid and doubles the bytes on
    // the one public route strangers open over mobile data.
    const g = graph([
      organization({ origin: ORIGIN, name: 'x', logo: '/icon.png' }),
      website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'id' }),
    ]);
    expect(g['@context']).toBe('https://schema.org');
    expect((g['@graph'] as unknown[]).length).toBe(2);
    expect(serializeJsonLd(g).match(/@context/g)).toHaveLength(1);
  });
});

describe('serializeJsonLd', () => {
  it('cannot be closed out of its own script tag -- THE CANARY', () => {
    /*
     * `</script>` inside a JSON string ENDS THE SCRIPT ELEMENT as far as the HTML
     * parser is concerned, regardless of the JSON quoting -- the parser does not
     * know it is inside a string. Everything after it is parsed as markup.
     *
     * Every input today is authored or derived, so this is defence in depth. It is
     * here because the day somebody passes an article title through is the day it
     * stops being.
     */
    const s = serializeJsonLd(
      breadcrumbList([{ name: '</script><img src=x onerror=alert(1)>', url: `${ORIGIN}/` }]),
    );
    expect(s).not.toContain('</script');
    expect(s).not.toContain('<img');
    expect(s).toContain('\\u003c');
    // And it is still valid JSON afterwards -- an escape that broke the parse
    // would trade an injection for a silently ignored block.
    expect(JSON.parse(s)['@type']).toBe('BreadcrumbList');
  });

  it('escapes the two line separators that break inline JS', () => {
    // Legal in a JSON string and line terminators in JavaScript, so an unescaped
    // one is a syntax error in an inline block. Built with `\u2028` ESCAPES in
    // this source, never the literal characters -- they are invisible, and an
    // editor that normalises them would make this test pass vacuously.
    const name = 'a\u2028b\u2029c';
    const s = serializeJsonLd(breadcrumbList([{ name, url: `${ORIGIN}/` }]));
    expect(s).not.toMatch(/[\u2028\u2029]/);
    expect(s).toContain('\\u2028');
    expect(s).toContain('\\u2029');
    expect(JSON.parse(s).itemListElement[0].name).toBe(name);
  });

  it('round-trips & and " and < byte-identically (R1)', () => {
    /*
     * **THE TEST RECONCILIATION R1 ASKS FOR, MINUS THE RENDER** -- the render
     * half is in `JsonLd.test.ts`, which is where the component is.
     *
     * R1's measurement: on react-dom 19.2.8 a plain text child of `<script>`
     * round-trips through `JSON.parse` intact, and BOTH agents who reasoned about
     * it from memory were wrong, in opposite directions. The escaping here exists
     * so the output is correct whether or not that behaviour holds -- so what
     * this asserts is that pre-escaping did not itself corrupt anything.
     */
    const name = 'Syarat & Ketentuan, a "quoted" thing, </script>';
    const parsed = JSON.parse(serializeJsonLd(breadcrumbList([{ name, url: `${ORIGIN}/` }])));
    expect(parsed.itemListElement[0].name).toBe(name);
  });
});

/*
 * ── S3, v0.4.0: the gallery's two node types ─────────────────────────────────
 *
 * Appended to S1's file by S1's invitation (its own header sequences the appends
 * S1 -> S3 -> S4 -> S6). **S1's assertions above must still pass**: if they do
 * not, an append became an edit. The assertions below are chosen for failure
 * modes rather than for coverage -- each one names a way the markup can be valid
 * and wrong.
 */
const img = (i: number, licenseUrl?: string): ImageObjectArgs => ({
  id: `${ORIGIN}/arcana/card-${i}#image`,
  url: `${ORIGIN}/arcana/card-${i}`,
  contentUrl: `${ORIGIN}/cards/0${i}_card.webp`,
  thumbnailUrl: `${ORIGIN}/cards/thumb/0${i}_card.webp`,
  encodingFormat: 'image/webp',
  width: 800,
  height: 1200,
  caption: `caption ${i}`,
  description: `gloss ${i}`,
  inLanguage: 'id',
  creator: `${ORIGIN}/#organization`,
  licenseUrl,
});

const buildGallery = (n = 22, licenseUrl?: string) =>
  imageGallery({
    url: `${ORIGIN}/gallery`,
    name: 'Galeri',
    description: 'd',
    inLanguage: 'id',
    origin: ORIGIN,
    breadcrumb: breadcrumbList([{ name: 'JMTarot', url: `${ORIGIN}/` }]),
    images: Array.from({ length: n }, (_, i) => img(i, licenseUrl)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder
    // returns an index signature on purpose; the test reads named fields.
  }) as any;

describe('imageObject, S3\'s optional half', () => {
  it('is byte-identical to S4\'s four-field call when nothing else is passed', () => {
    /*
     * THE REGRESSION GUARD ON THE APPEND ITSELF. S4's lore page passes four
     * fields, and the optional ones must vanish rather than serialize as null --
     * a `"@id": null` in a graph is a node claiming to have no identity, which is
     * worse than a node with none.
     */
    const node = imageObject({ url: `${ORIGIN}/a.webp`, width: 800, height: 1200, caption: 'c' });
    expect(JSON.parse(JSON.stringify(node))).toEqual({
      '@type': 'ImageObject',
      url: `${ORIGIN}/a.webp`,
      width: 800,
      height: 1200,
      caption: 'c',
    });
  });

  it('refuses a relative contentUrl, thumbnailUrl or @id -- not only a relative url', () => {
    // The original check covered `url` alone, and a relative `contentUrl`
    // resolves against a base somebody else guessed, which is the whole reason
    // the check exists.
    const base = { url: `${ORIGIN}/a.webp`, width: 1, height: 1, caption: 'c' };
    expect(() => imageObject({ ...base, contentUrl: '/cards/x.webp' })).toThrow(/contentUrl/);
    expect(() => imageObject({ ...base, thumbnailUrl: '/cards/thumb/x.webp' })).toThrow(
      /thumbnailUrl/,
    );
    expect(() => imageObject({ ...base, id: '/arcana/x#image' })).toThrow(/@id/);
    expect(() => imageObject({ ...base, licenseUrl: '/terms#9' })).toThrow(/license/);
  });
});

describe('imageGallery', () => {
  it('is one ImageGallery holding every image', () => {
    const g = buildGallery();
    expect(g['@type']).toBe('ImageGallery');
    expect(g['@id']).toBe(`${ORIGIN}/gallery#gallery`);
    expect(g.numberOfItems).toBe(22);
    expect(g.associatedMedia).toHaveLength(22);
    expect(g.associatedMedia.every((m: JsonLdNode) => m['@type'] === 'ImageObject')).toBe(true);
    expect(g.isPartOf).toEqual({ '@id': `${ORIGIN}/#website` });
  });

  it('derives numberOfItems from the array rather than trusting a number', () => {
    // A literal beside a list of another length is a contradiction reported
    // against the whole node.
    expect(buildGallery(3).numberOfItems).toBe(3);
  });

  it('gives every image a UNIQUE @id anchored on its own lore page', () => {
    /*
     * A duplicate `@id` makes Google merge twenty-two images into one node, and
     * the symptom is "our cards do not appear in Google Images" with nothing in
     * the report. The `#image` suffix is also the JOIN with S4's lore page, which
     * emits the same id for the same artwork.
     */
    const ids = buildGallery().associatedMedia.map((m: JsonLdNode) => m['@id']);
    expect(new Set(ids).size).toBe(22);
    expect(ids[0]).toBe(`${ORIGIN}/arcana/card-0#image`);
  });

  it('emits NO query string anywhere -- the ?v= trap', () => {
    /*
     * `cardImage()`/`cardThumb()` append `?v=${ART_VERSION}`, which is right for
     * an `<img src>` and wrong here: every bump would change twenty-two image
     * URLs and Google Images treats a changed URL as a new image with no
     * history. `cardImagePath()`/`cardThumbPath()` are the unversioned twins.
     */
    expect(JSON.stringify(buildGallery())).not.toContain('?');
  });

  it('emits only absolute URLs, with nothing root-relative left behind', () => {
    const json = JSON.stringify(buildGallery());
    for (const url of json.match(/"https?:[^"]+"/g) ?? []) expect(url).toMatch(/^"https:\/\//);
    expect(json).not.toMatch(/"\/[a-z]/);
  });

  it('passes inLanguage through and decides nothing about it (R15)', () => {
    expect(buildGallery(1).inLanguage).toBe('id');
    expect(imageObject({ ...img(0), inLanguage: 'en' }).inLanguage).toBe('en');
  });

  it('claims a licence ONLY when the caller supplies one', () => {
    /*
     * The negative direction is the load-bearing half: a licence URL for a page
     * that states no terms is the `SearchAction` mistake with legal consequences
     * instead of cosmetic ones. `/terms#9` today RESERVES rights rather than
     * granting any, so `/gallery` passes nothing and both fields vanish.
     */
    const without = JSON.stringify(buildGallery(1));
    expect(without).not.toContain('license');
    expect(without).not.toContain('acquireLicensePage');
    expect(without).not.toContain('null');

    const m = buildGallery(1, `${ORIGIN}/terms#9`).associatedMedia[0];
    expect(m.license).toBe(`${ORIGIN}/terms#9`);
    expect(m.acquireLicensePage).toBe(`${ORIGIN}/terms#9`);
  });

  it('keeps contentUrl and thumbnailUrl distinct, because they are two files', () => {
    // `contentUrl` is the highest-resolution representation and `thumbnailUrl` is
    // what the tile paints. Collapsing them into one field is how a 240px thumb
    // ends up advertised to Google Images as the artwork.
    const m = buildGallery(1).associatedMedia[0];
    expect(m.contentUrl).toContain('/cards/');
    expect(m.thumbnailUrl).toContain('/cards/thumb/');
    expect(m.contentUrl).not.toBe(m.thumbnailUrl);
    expect(m.encodingFormat).toBe('image/webp');
  });

  it('refuses a relative page url', () => {
    expect(() =>
      imageGallery({
        url: '/gallery',
        name: 'x',
        description: 'x',
        inLanguage: 'id',
        origin: ORIGIN,
        breadcrumb: breadcrumbList([{ name: 'x', url: `${ORIGIN}/` }]),
        images: [],
      }),
    ).toThrow(/absolute url/);
  });
});

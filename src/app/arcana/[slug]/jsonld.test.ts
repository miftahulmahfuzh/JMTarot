import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardById } from '@/data/deck';
import { theMoonEn } from '@/content/arcana/the-moon.en';
import { theMoonId } from '@/content/arcana/the-moon.id';
import { arcanaGraph } from './jsonld';

const ORIGIN = 'https://www.jmtarot.site';
const CANONICAL = `${ORIGIN}/arcana/the-moon`;

function build(locale: 'id' | 'en') {
  return arcanaGraph({
    card: cardById(18)!,
    doc: locale === 'id' ? theMoonId : theMoonEn,
    canonical: locale === 'id' ? CANONICAL : `${ORIGIN}/en/arcana/the-moon`,
    origin: ORIGIN,
    locale,
    imageUrl: `${ORIGIN}/cards/18_moon.webp`,
    homeLabel: 'JMTarot',
    homeUrl: `${ORIGIN}/`,
    galleryLabel: 'Galeri',
    galleryUrl: `${ORIGIN}/gallery`,
  });
}

/** The nodes, by type, out of the `@graph`. */
function nodes(locale: 'id' | 'en') {
  const g = build(locale)['@graph'] as { '@type': string; [k: string]: unknown }[];
  return Object.fromEntries(g.map((n) => [n['@type'], n]));
}

describe('the arcana JSON-LD graph', () => {
  it('is an Article, and the string FAQPage appears nowhere in the file', () => {
    /*
     * S-D16. Google restricted FAQ rich results to authoritative government and
     * health sites in August 2023, so the markup buys approximately nothing --
     * and the Q&A CONTENT still ships, for the reader and for long-tail matching.
     * Asserted on the SOURCE as well as on the object, because the way `FAQPage`
     * returns is somebody adding it beside the Q&A loop for a reason that looks
     * good at the time.
     */
    expect(nodes('id').Article).toBeDefined();
    const src = readFileSync(join(process.cwd(), 'src/app/arcana/[slug]/jsonld.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('FAQPage');
    expect(code).not.toContain('WebPage');
    expect(code).not.toContain('VisualArtwork');
  });

  it('carries an ImageObject with the real dimensions and an ABSOLUTE url', () => {
    // A relative `ImageObject.url` is the bug the missing `metadataBase` was, and
    // `imageObject()` throws on one rather than emitting a claim about a host we
    // do not control.
    const image = nodes('id').Article.image as Record<string, unknown>;
    expect(image['@type']).toBe('ImageObject');
    expect(image.width).toBe(800);
    expect(image.height).toBe(1200);
    expect(String(image.url).startsWith('https://')).toBe(true);
    expect(image.caption).toBe(theMoonId.imageAlt);
    /*
     * S3, v0.4.0. TWO PROPERTIES, ONE REASON: `/gallery` emits an `ImageObject`
     * for this same artwork, so the two must share an `@id` (or Google ranks two
     * unrelated nodes) and neither may carry `?v=` (or a bump of `ART_VERSION`
     * orphans the indexed image). `image.url` is the unversioned path the page
     * passes; the `<img src>` on screen keeps its cache-buster.
     */
    expect(image['@id']).toBe(`${CANONICAL}#image`);
    expect(String(image.url)).not.toContain('?');
    expect(nodes('en').Article.image).toMatchObject({
      '@id': `${ORIGIN}/en/arcana/the-moon#image`,
    });
  });

  it('describes the CARD in `about`, with its English name in both locales', () => {
    // `## Card data`: the reading refers to The Moon and so must the markup. Not
    // `VisualArtwork` -- that would describe OUR painting rather than the card,
    // and the painting is the `image`.
    for (const locale of ['id', 'en'] as const) {
      const about = nodes(locale).Article.about as Record<string, unknown>;
      expect(about).toMatchObject({
        '@type': 'CreativeWork',
        name: 'The Moon',
        identifier: 'XVIII',
        isPartOf: 'Major Arcana',
      });
    }
  });

  it('uses the BARE language tag and never `intlTag()` (R15)', () => {
    // `intlTag('en')` is `en-GB`, which V6 chose deliberately for date formats and
    // which is a factual claim about a regional variant nothing here was written
    // in. `id-ID` on this node beside `id` on S3's ImageObjects in one graph is
    // exactly what the rule prevents.
    expect(nodes('id').Article.inLanguage).toBe('id');
    expect(nodes('en').Article.inLanguage).toBe('en');
  });

  it('points `mainEntityOfPage` at the canonical it was handed', () => {
    // **A CANONICAL POINTING AT THE WRONG HOST IS THE SINGLE WORST CLASS OF SEO
    // BUG, BECAUSE IT DE-INDEXES THE CORRECT PAGE AND REPORTS NOTHING** (S-D11).
    // One source for both the tag and the graph is what makes them unable to
    // disagree, so this asserts the value came from the argument.
    expect(nodes('id').Article.mainEntityOfPage).toBe(CANONICAL);
    expect(nodes('en').Article.mainEntityOfPage).toBe(`${ORIGIN}/en/arcana/the-moon`);
  });

  it('references the Organization by @id rather than inlining it', () => {
    // Two definitions of who published this will disagree the first time the
    // organisation's name changes, and a crawler joining the graph picks one.
    const a = nodes('id').Article;
    expect(a.author).toEqual({ '@id': `${ORIGIN}/#organization` });
    expect(a.publisher).toEqual({ '@id': `${ORIGIN}/#organization` });
    expect(a.isPartOf).toEqual({ '@id': `${ORIGIN}/#website` });
  });

  it('dates the document from a committed constant, never from `new Date()`', () => {
    /*
     * A page whose `dateModified` is the request time tells a crawler the content
     * changes on every fetch, which is a lie that costs crawl budget.
     * `sitemap.ts` carries the same rule and asserts byte-stability across two
     * calls; this is the same assertion in the cheapest available form.
     */
    const first = nodes('id').Article;
    const second = nodes('id').Article;
    expect(first.datePublished).toBe(second.datePublished);
    expect(first.dateModified).toBe(second.dateModified);
    expect(String(first.dateModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const src = readFileSync(join(process.cwd(), 'src/app/arcana/[slug]/jsonld.ts'), 'utf8');
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('new Date(');
  });

  it('has a three-item breadcrumb whose MIDDLE RUNG IS /gallery, never /arcana', () => {
    /*
     * `/arcana` is a deliberate 404 (§3.1, R6), so naming it in a breadcrumb is a
     * machine-readable claim that a page exists where one does not -- worse than a
     * two-item trail, because the trail is the part a crawler believes.
     * `/gallery` is the index of this collection by §3.1's own reasoning, which
     * makes it both valid and honest.
     */
    const crumbs = nodes('id').BreadcrumbList.itemListElement as Record<string, unknown>[];
    expect(crumbs).toHaveLength(3);
    expect(crumbs.map((c) => c.position)).toEqual([1, 2, 3]);
    expect(String(crumbs[1].item).endsWith('/gallery')).toBe(true);
    expect(String(crumbs[1].item)).not.toContain('/arcana');
    expect(crumbs[2].item).toBe(CANONICAL);
    expect(crumbs[2].name).toBe('The Moon');
  });

  it('emits ONE @context over both nodes', () => {
    // Two contexts is valid and doubles the bytes on a page a stranger opens over
    // mobile data.
    const g = build('id');
    expect(g['@context']).toBe('https://schema.org');
    expect((g['@graph'] as unknown[])).toHaveLength(2);
  });
});

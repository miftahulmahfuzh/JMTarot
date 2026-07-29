import { describe, expect, it } from 'vitest';
import { blogArticle, blogDoc, blogEntries } from '@/content/blog';
import { serializeJsonLd } from './jsonld';
import {
  blogIndexGraph,
  blogIndexNode,
  blogIndexUrl,
  blogPostingGraph,
  blogPostingNode,
  blogPostingUrl,
} from './blog';

const ORIGIN = 'https://www.jmtarot.site';
const SLUG = 'how-to-read-tarot';
const doc = blogDoc(SLUG, 'id')!;
const en = blogDoc(SLUG, 'en')!;
const entry = blogArticle(SLUG)!;
const canonical = `${ORIGIN}/blog/${SLUG}`;

const node = blogPostingNode({ origin: ORIGIN, doc, entry, locale: 'id', canonical }) as Record<
  string,
  unknown
>;

describe('blogPostingNode', () => {
  it('is a BlogPosting at an absolute, locale-correct URL', () => {
    expect(node['@type']).toBe('BlogPosting');
    expect(node.url).toBe(canonical);
    expect(node['@id']).toBe(`${canonical}#article`);
    expect(blogPostingUrl(ORIGIN, SLUG, 'id')).toBe(canonical);
    expect(blogPostingUrl(ORIGIN, SLUG, 'en')).toBe(`${ORIGIN}/en/blog/${SLUG}`);
    expect(blogIndexUrl(ORIGIN, 'en')).toBe(`${ORIGIN}/en/blog`);
  });

  it('takes the canonical rather than deriving it', () => {
    /*
     * The graph and the `<link rel="canonical">` must not be able to disagree — a
     * canonical pointing somewhere the page is not de-indexes the correct page and
     * nothing reports it. So the page computes it once through `contentAlternates()` and
     * hands it here. Passing a different string must move every id that derives from it.
     */
    const odd = blogPostingNode({
      origin: ORIGIN,
      doc,
      entry,
      locale: 'id',
      canonical: `${ORIGIN}/blog/elsewhere`,
    }) as Record<string, unknown>;
    expect(odd['@id']).toBe(`${ORIGIN}/blog/elsewhere#article`);
    expect(odd.mainEntityOfPage).toBe(`${ORIGIN}/blog/elsewhere`);
  });

  it('uses the BARE language tag, never `en-GB` (R15)', () => {
    /*
     * `intlTag('en')` is `en-GB`, which V6 chose for DATE FORMATS and which is a factual
     * claim about a regional variant nothing here was written in. **S6's own plan spelled
     * `en-GB` into this test**; the reconciliation outranks the plan and the plan is
     * wrong. The failure this prevents is `id-ID` on one node beside `id` on another
     * inside the same `@graph`.
     */
    expect(node.inLanguage).toBe('id');
    const enNode = blogPostingNode({
      origin: ORIGIN,
      doc: en,
      entry,
      locale: 'en',
      canonical: `${ORIGIN}/en/blog/${SLUG}`,
    }) as Record<string, unknown>;
    expect(enNode.inLanguage).toBe('en');
    expect(JSON.stringify(enNode)).not.toContain('en-GB');
  });

  it('names the ORGANISATION as author and publisher, never a person', () => {
    /*
     * The identity is S1's single `Organization` node, referenced by `@id`. A named human
     * byline would be a fabricated identity, and bylining it to a reader would contradict
     * `/terms` 4.4, which says in both locales that the three readers have no
     * qualifications.
     */
    expect(node.author).toEqual({ '@id': `${ORIGIN}/#organization` });
    expect(node.publisher).toEqual({ '@id': `${ORIGIN}/#organization` });
    const json = JSON.stringify(node);
    expect(json).not.toContain('Person');
    for (const reader of ['Thessaly', 'Margaret', 'Adrian']) {
      expect({ reader, present: json.includes(reader) }).toEqual({ reader, present: false });
    }
  });

  it('belongs to the Blog node the index emits, by @id', () => {
    // What makes four URLs one publication rather than four loose pages.
    expect(node.isPartOf).toEqual({ '@type': 'Blog', '@id': `${ORIGIN}/blog#blog` });
  });

  it('carries both dates, from the registry and never from a filesystem', () => {
    expect(node.datePublished).toBe(entry.datePublished);
    expect(node.dateModified).toBe(entry.revisions.id!.dateModified);
    // Not `new Date()`: a page reporting itself modified on every fetch is a lie that
    // costs crawl budget. Two calls, byte-identical.
    expect(serializeJsonLd(blogPostingNode({ origin: ORIGIN, doc, entry, locale: 'id', canonical })))
      .toBe(serializeJsonLd(node as never));
  });

  it('falls back to datePublished when a locale has no revision row', () => {
    const bare = { ...entry, revisions: {} };
    const n = blogPostingNode({
      origin: ORIGIN,
      doc,
      entry: bare,
      locale: 'id',
      canonical,
    }) as Record<string, unknown>;
    expect(n.dateModified).toBe(entry.datePublished);
  });

  it('keeps the headline inside the 110 characters Google will use', () => {
    expect(String(node.headline).length).toBeLessThanOrEqual(110);
  });

  it('counts words from the document rather than carrying a hand-typed number', () => {
    expect(typeof node.wordCount).toBe('number');
    expect(node.wordCount as number).toBeGreaterThan(1000);
  });

  it('carries the hero as an ABSOLUTE URL with NO cache-busting query', () => {
    /*
     * `cardImage()` appends `?v=`, which is right for a browser and wrong in structured
     * data: a crawler treats the query as part of the identity and re-fetches the same
     * bytes under a new name every time `ART_VERSION` moves — orphaning the indexed image
     * and reporting nothing. S3 established the rule for the gallery's twenty-two.
     */
    const image = node.image as Record<string, unknown>;
    expect(image['@type']).toBe('ImageObject');
    expect(image.url).toBe(`${ORIGIN}/cards/09_hermit.webp`);
    expect(String(image.url)).not.toContain('?v=');
    expect(image.caption).toBe(doc.hero!.alt);
  });

  it('gives the hero its OWN @id, never the one the lore page and gallery share', () => {
    /*
     * `/gallery` and `/arcana/<slug>` deliberately share `<lore url>#image` for one
     * artwork, so a consumer merges them. An article's hero must NOT join that node: it
     * would let this page's caption overwrite the card page's, which is the exact
     * collision S3 hit twice — on `url` and on `caption` — with a green suite both times.
     */
    const image = node.image as Record<string, unknown>;
    expect(image['@id']).toBe(`${canonical}#hero`);
    expect(String(image['@id'])).not.toContain('#image');
  });

  it('omits the image entirely for an article with no hero', () => {
    // `hero` is nullable, and `image: null` is a claim about nothing that a validator
    // flags. Omitted, not emptied — `organization()`'s `sameAs` rule.
    const n = blogPostingNode({
      origin: ORIGIN,
      doc: { ...doc, hero: null },
      entry,
      locale: 'id',
      canonical,
    }) as Record<string, unknown>;
    expect('image' in n).toBe(false);
  });

  it('serialises to JSON with no undefined and no function', () => {
    expect(() => JSON.parse(JSON.stringify(node))).not.toThrow();
    expect(JSON.stringify(node)).not.toContain('undefined');
  });
});

describe('blogIndexNode', () => {
  const entries = blogEntries();
  const index = blogIndexNode({
    origin: ORIGIN,
    locale: 'id',
    name: 'Artikel',
    description: 'Tulisan tentang tarot.',
    entries,
  }) as Record<string, unknown>;

  it('is a Blog listing every article by @id', () => {
    expect(index['@type']).toBe('Blog');
    expect(index['@id']).toBe(`${ORIGIN}/blog#blog`);
    expect(index.blogPost).toEqual(
      entries.map((e) => ({
        '@type': 'BlogPosting',
        '@id': `${ORIGIN}/blog/${e.slug}#article`,
      })),
    );
  });

  it('lists an article ONLY in the locales it exists in', () => {
    /*
     * The reciprocity rule at the list level rather than in `hreflang`: a `blogPost`
     * pointing at a URL that 404s is a claim a crawler can check and fail. An
     * `id`-only article must not appear on `/en/blog`.
     */
    const idOnly = { ...blogArticle(SLUG)!, locales: ['id'] as const };
    const enIndex = blogIndexNode({
      origin: ORIGIN,
      locale: 'en',
      name: 'Writing',
      description: 'x',
      entries: [idOnly],
    }) as Record<string, unknown>;
    expect(enIndex.blogPost).toEqual([]);
  });

  it('prefixes every article URL in the `en` tree', () => {
    const enIndex = blogIndexNode({
      origin: ORIGIN,
      locale: 'en',
      name: 'Writing',
      description: 'x',
      entries,
    }) as Record<string, unknown>;
    for (const post of enIndex.blogPost as { '@id': string }[]) {
      expect({ id: post['@id'], prefixed: post['@id'].includes('/en/blog/') }).toMatchObject({
        prefixed: true,
      });
    }
  });
});

describe('the graphs', () => {
  it('emit ONE @context over both nodes', () => {
    const g = blogPostingGraph({
      origin: ORIGIN,
      doc,
      entry,
      locale: 'id',
      canonical,
      homeLabel: 'JMTarot',
      homeUrl: `${ORIGIN}/`,
      indexLabel: 'Artikel',
    }) as Record<string, unknown>;
    expect(g['@context']).toBe('https://schema.org');
    expect((g['@graph'] as unknown[]).length).toBe(2);
    expect(JSON.stringify(g).match(/@context/g)!.length).toBe(1);
  });

  it("names `/blog` as the article's parent crumb, never `/arcana`'s deliberate 404", () => {
    /*
     * A lore page's middle rung is `/gallery` because `/arcana` is a real 404 and naming
     * it in a breadcrumb is a machine-readable claim a page exists. `/blog` IS a page, so
     * the honest trail here is home -> index -> article.
     */
    const g = blogPostingGraph({
      origin: ORIGIN,
      doc,
      entry,
      locale: 'id',
      canonical,
      homeLabel: 'JMTarot',
      homeUrl: `${ORIGIN}/`,
      indexLabel: 'Artikel',
    }) as Record<string, unknown>;
    const crumbs = (g['@graph'] as Record<string, unknown>[])[1];
    const items = crumbs.itemListElement as { position: number; item: unknown }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(JSON.stringify(items)).toContain(`${ORIGIN}/blog`);
    expect(JSON.stringify(items)).not.toContain('/arcana');
  });

  it('gives the index a two-item trail', () => {
    const g = blogIndexGraph({
      origin: ORIGIN,
      locale: 'en',
      name: 'Writing',
      description: 'x',
      entries: blogEntries(),
      homeLabel: 'JMTarot',
      homeUrl: `${ORIGIN}/en`,
    }) as Record<string, unknown>;
    const items = (g['@graph'] as Record<string, unknown>[])[1].itemListElement as unknown[];
    expect(items.length).toBe(2);
  });
});

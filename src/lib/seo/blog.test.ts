import { describe, expect, it } from 'vitest';
import { blogArticle, blogDoc, blogEntries } from '@/content/blog';
import type { ArticleFacts } from '@/lib/content/blogRow';
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

/**
 * **v0.5.0 / A6: `entry: BlogEntry` BECAME `article: ArticleFacts`.**
 *
 * The fixtures still come from the committed registry -- these are the two articles the
 * node builder has to be right about, and they are live in production -- but the shape
 * is the row's. The registry dies in task 26 and this file's fixtures go with it; what
 * survives is the assertion set, over whatever `loadArticle()` returns.
 *
 * The interesting difference is `dateModified`: it was
 * `entry.revisions[locale]?.dateModified ?? entry.datePublished`, and a row always has
 * one, so **the `??` is gone and the case that exercised it is gone with it** -- see
 * below.
 */
const facts = (locale: 'id' | 'en'): ArticleFacts => ({
  slug: entry.slug,
  datePublished: entry.datePublished,
  dateModified: entry.revisions[locale]!.dateModified,
  locales: entry.locales,
});

const node = blogPostingNode({
  origin: ORIGIN,
  doc,
  article: facts('id'),
  locale: 'id',
  canonical,
}) as Record<string, unknown>;

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
      article: facts('id'),
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
      article: facts('id'),
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

  it('carries both dates, from the ROW and never from a filesystem', () => {
    expect(node.datePublished).toBe(entry.datePublished);
    expect(node.dateModified).toBe(entry.revisions.id!.dateModified);
    // Not `new Date()`: a page reporting itself modified on every fetch is a lie that
    // costs crawl budget. Two calls, byte-identical.
    expect(
      serializeJsonLd(
        blogPostingNode({ origin: ORIGIN, doc, article: facts('id'), locale: 'id', canonical }),
      ),
    ).toBe(serializeJsonLd(node as never));
  });

  it('emits `dateModified` with NO fallback, because a row always has one', () => {
    /*
     * **THE CASE THAT USED TO BE HERE WAS `falls back to datePublished when a locale
     * has no revision row`, AND ITS SUBJECT NO LONGER EXISTS.** The registry's
     * `revisions` was `Partial<Record<Locale, …>>`, so a locale could be listed with no
     * revision and `blogPostingNode` wrote
     * `entry.revisions[locale]?.dateModified ?? entry.datePublished`.
     * `blog_post_locales.updated_at` is `NOT NULL DEFAULT now()`, written by the request
     * that changed the prose, in the same transaction — **the truthful source that did
     * not exist when `bodyHash` was invented** (A-D13). A `??` that can never fire is a
     * reader's second guess about which branch is live, so it is deleted and this case
     * asserts the deletion rather than the branch.
     */
    expect(node.dateModified).toBe(facts('id').dateModified);
    expect(String(node.dateModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
      article: facts('id'),
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
  /**
   * **`entries: BlogEntry[]` BECAME `articles: { slug }[]`, ALREADY FILTERED (A6-6).**
   * The filter used to live here AND on the index page — one predicate, two places.
   * Now the page passes what `publishedArticles(db, locale)` returned, so the visible
   * list and the `blogPost` array are the SAME array.
   */
  const entries = blogEntries();
  const articles = entries.map((e) => ({ slug: e.slug }));
  const index = blogIndexNode({
    origin: ORIGIN,
    locale: 'id',
    name: 'Artikel',
    description: 'Tulisan tentang tarot.',
    articles,
  }) as Record<string, unknown>;

  it('is a Blog listing every article by @id', () => {
    expect(index['@type']).toBe('Blog');
    expect(index['@id']).toBe(`${ORIGIN}/blog#blog`);
    expect(index.blogPost).toEqual(
      articles.map((e) => ({
        '@type': 'BlogPosting',
        '@id': `${ORIGIN}/blog/${e.slug}#article`,
      })),
    );
  });

  it('lists exactly what it is given, because the filter is a WHERE clause now', () => {
    /*
     * **THIS CASE CHANGED ITS SUBJECT, AND THE GUARANTEE GOT STRONGER.** It used to
     * hand this function an `id`-only entry and assert that asking for `en` produced an
     * empty `blogPost` — the reciprocity rule at the list level, enforced by a
     * `.filter()` inside the builder.
     *
     * A6-6 moved that filter into SQL: `publishedArticles(db, 'en')` **cannot return an
     * article that has no live English document**, so the builder never sees one and a
     * filter here would be the second spelling of a predicate. What is asserted instead
     * is that it adds nothing of its own — an empty list in, an empty list out — and
     * `blog.integration.test.ts` is where the `id`-only case is now proved, against
     * rows.
     */
    const enIndex = blogIndexNode({
      origin: ORIGIN,
      locale: 'en',
      name: 'Writing',
      description: 'x',
      articles: [],
    }) as Record<string, unknown>;
    expect(enIndex.blogPost).toEqual([]);
  });

  it('prefixes every article URL in the `en` tree', () => {
    const enIndex = blogIndexNode({
      origin: ORIGIN,
      locale: 'en',
      name: 'Writing',
      description: 'x',
      articles,
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
      article: facts('id'),
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
      article: facts('id'),
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
      articles: blogEntries().map((e) => ({ slug: e.slug })),
      homeLabel: 'JMTarot',
      homeUrl: `${ORIGIN}/en`,
    }) as Record<string, unknown>;
    const items = (g['@graph'] as Record<string, unknown>[])[1].itemListElement as unknown[];
    expect(items.length).toBe(2);
  });
});

import { cardByUrlSlug, cardImagePath } from '@/data/deck';
import type { Locale } from '@/data/types';
import type { BlogDoc } from '@/content/types';
import type { BlogEntry } from '@/content/blog';
import { wordCount } from '@/lib/content/doc';
import { localePath } from '@/lib/i18n/prefix';
import { breadcrumbList, graph, imageObject, organizationId, type JsonLdNode } from './jsonld';

/**
 * `Blog` and `BlogPosting` for S6 (S-D16).
 *
 * ── IN S1's DIRECTORY, BY THE PRECEDENT W3 SET ─────────────────────────────────
 *
 * W3 wrote `queries/onboarding.ts` into W1's directory against the interface its own
 * plan named, and no table was redefined. Same shape: S1 owns the primitives
 * (`organization`, `breadcrumbList`, `imageObject`, `graph`, `serializeJsonLd`) and only
 * S6 knows what a `BlogDoc` is, so only S6 can build a `BlogPosting` from one. **Nothing
 * here redefines an S1 export**, and `organizationId` was exported from `jsonld.ts`
 * rather than reimplemented here for exactly that reason.
 *
 * ── PURE. `origin` IS A PARAMETER, NEVER `process.env` ─────────────────────────
 *
 * S-D11's whole point is that one leaf owns the origin, and a builder that read the
 * environment would be a second one. It also makes every field here assertable without a
 * running server, which is why `blog.test.ts` can check the URLs by string.
 *
 * ── THREE THINGS THAT LOOK LIKE DETAILS AND ARE NOT ────────────────────────────
 *
 * **`inLanguage` IS THE BARE TAG — `id` / `en`, NEVER `intlTag()`** (R15). `intlTag('en')`
 * is `en-GB`, which V6 chose for date formats and which is a factual claim about a
 * regional variant nothing here was written in. S6's own plan spelled `en-GB` into its
 * test; the reconciliation outranks the plan and the plan is wrong. What must not ship is
 * `id-ID` on one node beside `id` on another inside the same `@graph`.
 *
 * **THE HERO IMAGE CARRIES NO `?v=`.** `cardImage()` appends `?v=${ART_VERSION}` and that
 * is correct for a browser cache; in structured data a query string is part of the
 * image's identity, so every version bump would present the same painting as a brand-new
 * image with no history. `cardImagePath()` is the unversioned twin and is the only one an
 * `ImageObject` may name — the rule S3 established for the gallery's twenty-two.
 *
 * **THE AUTHOR IS THE ORGANISATION, NOT A PERSON AND NOT A READER.** Three reasons and
 * the second is the binding one: there is no human author to name and inventing a byline
 * fabricates an identity on a page whose whole purpose is to be trusted by a stranger;
 * **bylining it to Thessaly, Margaret or Adrian would contradict `/terms` clause 4.4**,
 * which says in both locales that the three readers *"adalah persona, bukan orang. Mereka
 * tidak punya kualifikasi apa pun"* — attributing an instructional article to a character
 * the terms describe as unqualified is a claim the terms deny; and referencing S1's single
 * `Organization` by `@id` makes the identity consistent **by construction** rather than by
 * two files agreeing about a name.
 */

/** `https://host/blog/slug` for `id`, `https://host/en/blog/slug` for `en`. */
export function blogPostingUrl(origin: string, slug: string, locale: Locale): string {
  return `${origin}${localePath(locale, `/blog/${slug}`)}`;
}

export function blogIndexUrl(origin: string, locale: Locale): string {
  return `${origin}${localePath(locale, '/blog')}`;
}

export type PostingArgs = {
  origin: string;
  doc: BlogDoc;
  entry: BlogEntry;
  locale: Locale;
  /**
   * The canonical, absolute, from `contentAlternates()`.
   *
   * **PASSED RATHER THAN DERIVED, so the graph and the `<link rel="canonical">` cannot
   * disagree** — S4's `arcanaGraph` takes it for the same reason. A canonical pointing
   * somewhere the page is not de-indexes the correct page and nothing reports it.
   */
  canonical: string;
};

/**
 * One article's node. `BlogPosting` rather than `Article`, and the distinction earns its
 * place: `BlogPosting` is an `Article` subtype, so every eligibility `Article` has it
 * keeps, and it additionally lets `isPartOf` name the `Blog` node `/blog` emits — which
 * is what tells a crawler these four URLs are one publication rather than four loose
 * pages.
 */
export function blogPostingNode({
  origin,
  doc,
  entry,
  locale,
  canonical,
}: PostingArgs): JsonLdNode {
  const card = doc.hero ? cardByUrlSlug(doc.hero.cardUrlSlug) : undefined;

  const node: JsonLdNode = {
    '@type': 'BlogPosting',
    '@id': `${canonical}#article`,
    url: canonical,
    mainEntityOfPage: canonical,
    isPartOf: { '@type': 'Blog', '@id': `${blogIndexUrl(origin, locale)}#blog` },
    headline: doc.title,
    description: doc.description,
    inLanguage: locale,
    datePublished: entry.datePublished,
    /*
     * A COMMITTED CONSTANT FROM THE REGISTRY, never `new Date()` and never a filesystem
     * mtime. `revisions[locale]` is the per-locale one: the two locales are two URLs and
     * two nodes, so claiming the English changed because the Indonesian did is a small
     * lie in structured data. `bodyHash` is what keeps it honest.
     */
    dateModified: entry.revisions[locale]?.dateModified ?? entry.datePublished,
    author: { '@id': organizationId(origin) },
    publisher: { '@id': organizationId(origin) },
    wordCount: wordCount(doc.body),
  };

  if (card && doc.hero) {
    node.image = imageObject({
      /*
       * **NOT the `#image` id the lore page and the gallery share.** Those two describe
       * the same artwork as their subject; here the painting is decoration on an article
       * about method, and merging an article's hero into the card's image node would let
       * this page's `caption` overwrite the one `/arcana/<slug>` carries. S3 paid for that
       * exact collision twice before it shipped, on `url` and on `caption`.
       */
      id: `${canonical}#hero`,
      url: `${origin}${cardImagePath(card.slug)}`,
      width: 800,
      height: 1200,
      caption: doc.hero.alt,
    });
  }

  return node;
}

export type IndexArgs = {
  origin: string;
  locale: Locale;
  name: string;
  description: string;
  entries: readonly BlogEntry[];
};

export function blogIndexNode({
  origin,
  locale,
  name,
  description,
  entries,
}: IndexArgs): JsonLdNode {
  const url = blogIndexUrl(origin, locale);
  return {
    '@type': 'Blog',
    '@id': `${url}#blog`,
    url,
    name,
    description,
    inLanguage: locale,
    publisher: { '@id': organizationId(origin) },
    /*
     * ONLY the articles that exist in THIS locale. A `blogPost` pointing at a 404 is a
     * claim a crawler can check and fail, and `/en/blog` listing an Indonesian-only
     * article is exactly the state roadmap §1 permits (*"`id` ships complete and `en`
     * waits"*). The list page filters the same way, from the same field, so the markup
     * and the visible list cannot disagree.
     */
    blogPost: entries
      .filter((e) => e.locales.includes(locale))
      .map((e) => ({
        '@type': 'BlogPosting',
        '@id': `${blogPostingUrl(origin, e.slug, locale)}#article`,
      })),
  };
}

/**
 * The whole graph for one article page, and for the index.
 *
 * **ONE `@context` OVER N NODES** — `graph()`'s rule, and two contexts is valid markup
 * that doubles the bytes on the pages whose TTFB a crawler measures.
 *
 * **THE BREADCRUMB'S MIDDLE RUNG IS `/blog` AND ITS FIRST IS `/`.** Unlike a lore page,
 * whose middle rung is `/gallery` because `/arcana` is a deliberate 404, `/blog` is a real
 * page and is the honest parent of an article.
 */
export function blogPostingGraph(
  args: PostingArgs & { homeLabel: string; homeUrl: string; indexLabel: string },
): JsonLdNode {
  const { origin, doc, locale, canonical } = args;
  return graph([
    blogPostingNode(args),
    breadcrumbList([
      { name: args.homeLabel, url: args.homeUrl },
      { name: args.indexLabel, url: blogIndexUrl(origin, locale) },
      { name: doc.title, url: canonical },
    ]),
  ]);
}

export function blogIndexGraph(
  args: IndexArgs & { homeLabel: string; homeUrl: string },
): JsonLdNode {
  const { origin, locale, name } = args;
  return graph([
    blogIndexNode(args),
    breadcrumbList([
      { name: args.homeLabel, url: args.homeUrl },
      { name, url: blogIndexUrl(origin, locale) },
    ]),
  ]);
}

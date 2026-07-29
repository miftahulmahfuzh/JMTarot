/**
 * The PUBLIC blog reads. **v0.5.0 / A6, §9.1. PUBLISHED-ONLY, IN SQL.**
 *
 * ── A6-25. THE PUBLIC PAGES NEVER IMPORT THE ADMIN QUERY MODULE ─────────────
 *
 * There are two modules and **one of them cannot return an unpublished row at
 * all.** `queries/admin/blog.ts` sees every status and holds the writes; this one
 * sees `published` and nothing else. A page importing the admin module reads as if
 * a public route had admin capability, and the real cost is one edit later: somebody
 * adds `status` to a shared query's projection for the admin list, and a draft
 * becomes reachable on `/blog`. Same discipline `publicReadingQuery` applies to V7's
 * share path. Roadmap §7 names only `admin/blog.ts`; §20 records that as a gap and
 * this file is the resolution.
 *
 * ── A6-6. THE `locales` SET IS DERIVED FROM PUBLISHED ROWS WITH A BODY, IN SQL ─
 *
 * Not from an intent field, not from a `locales` column, not from `LOCALES`, and not
 * from *"the row exists"*. The predicate is `PUBLISHED` below and it is a **`WHERE`
 * clause rather than a filter in TypeScript**, because a caller that forgets the
 * filter is exactly the shape that ships. There is no `locales` column on
 * `blog_posts` and adding one would be re-creating the hand-written array in a place
 * no reviewer reads.
 *
 * That set feeds `contentAlternates()`, which R2 of v0.4.0 says in capitals is *"the
 * parameter a future edit will want to default to `LOCALES`. DO NOT."* A pair naming
 * a URL that 404s is non-reciprocal and **Google discards the whole set, silently.**
 *
 * ── A6-7 / R42. `en` PUBLISHED WITH `id` NOT PUBLISHED IS NOT FOUND ─────────
 *
 * `alternates.ts:115-120` **throws** without an `id` document -- deliberately, per
 * R2, because a wrong canonical de-indexes the correct page -- so that state is a
 * **500 on a URL in the sitemap**. The status route refuses the transition
 * (`canTransition`); this is the second defence, and it is the one that holds when
 * the state is reached another way: a direct `db:studio` edit, a future bulk tool.
 * **Two defences because one of them is a validation somebody will route around.**
 *
 * Mechanically: `idIsLive` is an `EXISTS` in every query here, so an article whose
 * `id` document is not published has an EMPTY locale set and is absent from the
 * index, the sitemap, the alternates and both trees. That is also A6-22 --
 * unpublishing `id` makes the `en` URL 404 **by derivation rather than by a
 * cascade**, with no second write and no second event, and re-publishing `id`
 * restores `en` without a second decision.
 *
 * ── A6-24. A DATABASE FAILURE IS NOT A 404 ──────────────────────────────────
 *
 * **THE RULE MOST LIKELY TO BE LOST IN A `try { … } catch { notFound() }`.** A
 * transient outage answering 404 on indexable URLs is a de-indexing event; a 500 is
 * a retry. `loadArticle` returns `null` **only** for "no such published row" and lets
 * a driver error propagate. Nothing here catches one, and **nothing here logs one
 * either** -- *"a postgres error quotes the failing statement and its bound
 * parameters"*, and the bound parameter here is a slug from the URL (harmless)
 * reached through a path where the next person will add one that is not.
 *
 * `sitemap.ts` is the one exception and it goes the other way (§10.2, A6-29): there
 * a failure costs the blog rows and never the file.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Locale } from '@/data/types';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import { toArticleFacts, toBlogDoc, utcDay, type LoadedArticle } from '@/lib/content/blogRow';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/i18n/locale';

/**
 * "Has a body", guarded. **`CASE`, NOT `AND`, AND THE DIFFERENCE IS MEASURED.**
 *
 * `jsonb_array_length` RAISES `22023 cannot get array length of a non-array`. The
 * body is an array by zod on every write path, so only a hand-edited row can be
 * anything else -- and the honest answer for one is *"not published"*, never a 500
 * on a public page.
 *
 * The obvious spelling is
 * `jsonb_typeof(body) = 'array' AND jsonb_array_length(body) > 0`, and **it does not
 * work.** SQL does not promise left-to-right evaluation of `AND` operands: the
 * planner is free to evaluate the length first, and here it did. The integration
 * case *"does not raise on a body that is not an array at all"* failed with exactly
 * that error, on the query that was supposed to be defended.
 *
 * **A `CASE` EXPRESSION IS THE ONE CONSTRUCT POSTGRES GUARANTEES SHORT-CIRCUITS** --
 * only the selected branch is evaluated, and the documentation says so in as many
 * words while warning that `AND`/`OR` do not. Same class as the
 * `moderation_flags` partial-index subtlety and R15's `IS DISTINCT FROM`: **the
 * obvious spelling is silently wrong, and here it is loudly wrong only on the row it
 * was written for.**
 */
const hasBody = sql`(case when jsonb_typeof(${blogPostLocales.body}) = 'array'
                          then jsonb_array_length(${blogPostLocales.body}) else 0 end) > 0`;

/**
 * **THE PREDICATE. ONE DEFINITION, USED BY EVERY QUERY IN THIS FILE.**
 */
const PUBLISHED = and(eq(blogPostLocales.status, 'published'), hasBody);

/** A6-7's `EXISTS`: does this post have a live Indonesian document? */
const idIsLive = sql`exists (
  select 1 from ${blogPostLocales} i
  where i.post_id = ${blogPosts.id}
    and i.locale = ${DEFAULT_LOCALE}
    and i.status = 'published'
    and (case when jsonb_typeof(i.body) = 'array' then jsonb_array_length(i.body) else 0 end) > 0
)`;

/** What the index renders per row, plus what `blogIndexNode` needs. */
export type PublishedArticle = {
  slug: string;
  datePublished: string;
  dateModified: string;
  title: string;
  description: string;
  /** For `readingMinutes(wordCount(body))`. The index shows a reading time. */
  body: unknown;
};

/**
 * Every article live in `locale`, **newest first then by slug**.
 *
 * **THE TIE-BREAK IS NOT COSMETIC AND IT MOVED INTO SQL.** Both launch articles
 * published on the same day, and `Array.prototype.sort` is only stable within one
 * engine's implementation of one array -- a sitemap whose row order changes between
 * builds churns a crawl for nothing. `ORDER BY date_published DESC, slug ASC` is the
 * same rule `blogEntries()` carried, expressed where the rows come from.
 *
 * `NULLS LAST` because `date_published` is NULL until the first publish; a published
 * row always has one, so the clause is defensive rather than load-bearing, and
 * writing it is cheaper than the day somebody makes it reachable.
 */
export async function publishedArticles(
  db: DbOrTx,
  locale: Locale,
): Promise<PublishedArticle[]> {
  const rows = await db
    .select({
      slug: blogPosts.slug,
      datePublished: blogPosts.datePublished,
      updatedAt: blogPostLocales.updatedAt,
      title: blogPostLocales.title,
      description: blogPostLocales.description,
      body: blogPostLocales.body,
    })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(and(eq(blogPostLocales.locale, locale), PUBLISHED, idIsLive))
    .orderBy(sql`${blogPosts.datePublished} desc nulls last`, asc(blogPosts.slug));

  return rows.map((r) => ({
    slug: r.slug,
    dateModified: utcDay(r.updatedAt),
    datePublished: r.datePublished ?? utcDay(r.updatedAt),
    title: r.title,
    description: r.description,
    body: r.body,
  }));
}

/**
 * The locales an article is actually served in. **`[]` for an article that is not.**
 *
 * The answer `contentAlternates()` and `sitemapLanguages()` are fed, and the reason
 * neither function forks (A6-5): *"`sitemapLanguages` delegates, and that delegation
 * is the only reason the `<xhtml:link>` set in `sitemap.xml` and the
 * `<link rel="alternate">` set in the head cannot disagree."* **A6 changes what feeds
 * them and forks nothing.**
 *
 * Ordered by `LOCALES` rather than by the database, so the array is stable across
 * calls -- `sitemap.test.ts` asserts byte-stability and a set whose order came from
 * a scan would fail it intermittently.
 */
export async function publishedLocales(db: DbOrTx, slug: string): Promise<Locale[]> {
  const rows = await db
    .select({ locale: blogPostLocales.locale })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(and(eq(blogPosts.slug, slug), PUBLISHED, idIsLive));
  const live = new Set(rows.map((r) => r.locale));
  return LOCALES.filter((l) => live.has(l));
}

/**
 * One article in one language, with everything a page and its metadata need.
 *
 * **ONE READ RETURNING THE DOC, THE FACTS AND THE LOCALE SET TOGETHER.** The registry
 * had `blogArticle()` and `blogDoc()`, *"two accessors, two lookups and two chances
 * to disagree about existence"*; there is one here, and `[slug]/load.ts` wraps it in
 * `React.cache()` so `generateMetadata` and the body share it.
 *
 * `null` means **no such published row in this language**, which the caller renders
 * as `notFound()`. It does NOT mean the database is down -- see the header.
 */
export async function loadArticle(
  db: DbOrTx,
  slug: string,
  locale: Locale,
): Promise<LoadedArticle | null> {
  const rows = await db
    .select({
      slug: blogPosts.slug,
      datePublished: blogPosts.datePublished,
      locale: blogPostLocales.locale,
      title: blogPostLocales.title,
      description: blogPostLocales.description,
      heroCardSlug: blogPostLocales.heroCardSlug,
      heroAlt: blogPostLocales.heroAlt,
      body: blogPostLocales.body,
      updatedAt: blogPostLocales.updatedAt,
    })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(and(eq(blogPosts.slug, slug), PUBLISHED, idIsLive));

  const mine = rows.find((r) => r.locale === locale);
  if (!mine) return null;

  const live = new Set(rows.map((r) => r.locale));
  const post = { slug: mine.slug, datePublished: mine.datePublished };
  return {
    doc: toBlogDoc(post, mine),
    facts: toArticleFacts(post, mine, LOCALES.filter((l) => live.has(l))),
  };
}

/** One article's row in the sitemap: its addresses, and a `lastModified` per address. */
export type SitemapArticle = {
  slug: string;
  locales: readonly Locale[];
  /** `'YYYY-MM-DD'` per locale, from that locale row's `updated_at` (A6-13). */
  lastModifiedFor: Partial<Record<Locale, string>>;
};

/**
 * Every published article, for `sitemap.ts`.
 *
 * **`lastModified` PER URL IS §10.3's DISCHARGE OF A RECORDED LOSS.**
 * `sitemap.ts:156-162` said `lastModified` stays a per-release constant *"because
 * the field's only use is 'has this changed since I crawled', which one constant per
 * release answers honestly. **Worth revisiting the day an article is edited without
 * a release.**"* **A6 is that day**, and the row's `updated_at` is the truthful
 * per-locale source that did not exist -- the same one `BlogPosting.dateModified`
 * already claims. Everything else in the sitemap keeps the constant.
 */
export async function publishedSitemapRows(db: DbOrTx): Promise<SitemapArticle[]> {
  const rows = await db
    .select({
      slug: blogPosts.slug,
      datePublished: blogPosts.datePublished,
      locale: blogPostLocales.locale,
      updatedAt: blogPostLocales.updatedAt,
    })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(and(PUBLISHED, idIsLive))
    .orderBy(sql`${blogPosts.datePublished} desc nulls last`, asc(blogPosts.slug));

  /*
   * Folded in the query's order, so the emitted rows follow `date_published DESC,
   * slug ASC` -- `sitemap.test.ts` asserts byte-stability across two calls, and a
   * `Map` preserves insertion order where an object keyed by slug does not promise
   * to for every key shape.
   */
  const bySlug = new Map<string, { live: Set<Locale>; lastModifiedFor: Partial<Record<Locale, string>> }>();
  for (const r of rows) {
    const entry = bySlug.get(r.slug) ?? { live: new Set<Locale>(), lastModifiedFor: {} };
    entry.live.add(r.locale);
    entry.lastModifiedFor[r.locale] = utcDay(r.updatedAt);
    bySlug.set(r.slug, entry);
  }
  return [...bySlug.entries()].map(([slug, e]) => ({
    slug,
    // `LOCALES` order, never the scan's, for the same byte-stability reason.
    locales: LOCALES.filter((l) => e.live.has(l)),
    lastModifiedFor: e.lastModifiedFor,
  }));
}

/**
 * Every published slug, newest first. **Used by the `bare-path` resolution check.**
 *
 * `blog.content.test.ts` asserted that a `/blog/<slug>` link in one article names a
 * real article; the save endpoint asks the same question of a submitted body, and it
 * has to ask the database now. `desc(createdAt)` is not the ordering -- `slug` is,
 * because this is a membership test and a stable order makes its failure message
 * readable.
 */
export async function publishedSlugs(db: DbOrTx): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: blogPosts.slug })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(and(PUBLISHED, idIsLive))
    .orderBy(asc(blogPosts.slug));
  return rows.map((r) => r.slug);
}

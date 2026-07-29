/**
 * A row becomes a document. **v0.5.0 / A6, §4. THE ONLY PLACE IT HAPPENS.**
 *
 * PURE. No `server-only`, no `@/lib/db/**`, no React, no `next/*`. It imports the
 * SHAPE of a document and nothing else, which is what lets A6-35's byte-identity
 * oracle be a unit test with no database on its path.
 *
 * ── A6-10. ONE TRANSFORM, AND THE PAGE NEVER READS `row.body` ────────────────
 *
 * `toBlogDoc(post, localeRow)` and nothing else. Two reasons, and the second is the
 * one that decays without a rule: it is what §13.3's oracle can be written against
 * without a database, **and it is what stops the page reading `row.body` directly
 * and drifting from `BlogDoc`'s shape one field at a time.** A page that spreads a
 * row into a `BlogDoc` works perfectly until the day the two disagree about `hero`.
 *
 * ── A6-12. IT DOES NOT VALIDATE AND IT DOES NOT THROW ────────────────────────
 *
 * `body` is `jsonb` and the database hands back whatever was stored; validation
 * happened on the write path (`blockSchema.ts`). A transform that re-validated on
 * every read would put a zod parse on the request path of the pages this release
 * exists to get indexed -- and, worse, **a page that threw on a row it could not
 * parse would 500 on a URL in the sitemap for a defect that is already committed.**
 * The write path is the gate; `Prose`'s exhaustive `switch` and `plainText`'s are
 * the backstop, and an unknown kind there is a compile error rather than a runtime
 * one.
 *
 * ── A6-13. `dateModified` IS FORMATTED IN UTC, BY HAND ───────────────────────
 *
 * `tsCol` is `mode: 'date'`, so the driver returns a `Date`, and **`local_date`'s
 * trap runs in reverse here**: a `Date` rendered in the server's zone is a day out
 * for a Jakarta edit made between 00:00 and 07:00 local, and `BlogPosting.dateModified`
 * is a CLAIM IN STRUCTURED DATA. UTC is the honest choice for a publication
 * timestamp with no querent behind it -- `llm_calls`'s own rule for a call with no
 * querent (roadmap §3.2). `toISOString().slice(0, 10)` and never a formatter.
 */
import type { BlogDoc } from '@/content/types';
import type { Locale } from '@/lib/i18n/locale';

/**
 * What a page needs about an article that is not its prose.
 *
 * **`dateModified` HAS NO `??` AND IT IS NOT NULLABLE.** `seo/blog.ts` used to write
 * `entry.revisions[locale]?.dateModified ?? entry.datePublished`, because the
 * registry's `revisions` map was `Partial<Record<Locale, …>>` and a locale could be
 * listed with no revision. A ROW ALWAYS HAS ONE: `updated_at` is `NOT NULL DEFAULT
 * now()`. The fallback goes, and its going is the point -- a `??` that can never
 * fire is a reader's second guess about which branch is live.
 */
export type ArticleFacts = {
  slug: string;
  /** `'YYYY-MM-DD'`. Locale-invariant: the article was published once. */
  datePublished: string;
  /** `'YYYY-MM-DD'`, from `blog_post_locales.updated_at`. **This IS `dateModified`.** */
  dateModified: string;
  /**
   * The locales that are PUBLISHED AND HAVE A BODY (A6-6), derived in SQL.
   *
   * **THIS IS WHAT `contentAlternates()` AND `sitemapLanguages()` ARE FED, AND R2
   * BINDS**: *"a pair naming a URL that 404s makes Google discard the whole set
   * silently."* Never `LOCALES`, never a column, never "the row exists".
   */
  locales: readonly Locale[];
};

/** One article in one locale, ready to render, plus the facts around it. */
export type LoadedArticle = { doc: BlogDoc; facts: ArticleFacts };

/** The `blog_posts` half a transform needs. */
export type PostRowLike = {
  slug: string;
  datePublished: string | null;
};

/** The `blog_post_locales` half a transform needs. */
export type LocaleRowLike = {
  locale: Locale;
  title: string;
  description: string;
  heroCardSlug: string | null;
  heroAlt: string | null;
  body: unknown;
  updatedAt: Date;
};

/**
 * The row pair, as a `BlogDoc`.
 *
 * **A6-11. `hero` IS `null` OR BOTH FIELDS, NEVER A HALF-SET OBJECT.** The CHECK
 * constraint is one half and this is the other, and it must not construct
 * `{ cardUrlSlug: row.heroCardSlug!, alt: row.heroAlt ?? '' }` -- an empty `alt` on
 * a hero image is an accessibility failure that renders as a perfectly normal-looking
 * page. Both present or `null`; a half-set pair reads as `null`, which is the
 * degradation that loses a decorative image rather than the one that lies to a
 * screen reader.
 */
export function toBlogDoc(post: PostRowLike, row: LocaleRowLike): BlogDoc {
  return {
    slug: post.slug,
    locale: row.locale,
    title: row.title,
    description: row.description,
    hero:
      row.heroCardSlug !== null && row.heroAlt !== null
        ? { cardUrlSlug: row.heroCardSlug, alt: row.heroAlt }
        : null,
    // A6-12: no parse, no validation, no throw. The write path is the gate.
    body: row.body as BlogDoc['body'],
  };
}

/**
 * `'YYYY-MM-DD'` in UTC. **A6-13, and the reason is in this file's header.**
 *
 * Exported because `sitemap.ts` formats the same column for `lastModified` and two
 * spellings of a date are two dates.
 */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * The facts, from the two rows plus the derived locale set.
 *
 * **`datePublished` FALLS BACK TO `dateModified` AND NOT TO TODAY.** The column is
 * NULL until the first publish, so a DRAFT has no publication date -- and a draft
 * never reaches a public page, which is the only caller that needs one. If one ever
 * does, the honest answer is the date the row was last written, never `new Date()`:
 * a date that moves on every render is the `lastModified: new Date()` spam signal
 * `sitemap.ts` refuses in as many words.
 */
export function toArticleFacts(
  post: PostRowLike,
  row: Pick<LocaleRowLike, 'updatedAt'>,
  locales: readonly Locale[],
): ArticleFacts {
  const dateModified = utcDay(row.updatedAt);
  return {
    slug: post.slug,
    datePublished: post.datePublished ?? dateModified,
    dateModified,
    locales,
  };
}

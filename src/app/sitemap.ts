import type { MetadataRoute } from 'next';
import { LORE_SLUGS } from '@/content/arcana';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { sitemapLanguages } from '@/lib/seo/alternates';
import { absoluteUrl, siteOrigin } from '@/lib/seo/origin';
import { db } from '@/lib/db/client';
import { publishedSitemapRows } from '@/lib/db/queries/blog';

/**
 * `sitemap.xml`, both locales.
 *
 * ── IT WAS A LEAF, AND EXACTLY ONE HALF OF THE RULE BENT (S-D11, A6-28, R39) ─
 *
 * `robots.ts` refused to import `shareOrigin()` because that pulls `server-only`,
 * `queries/share.ts` and the whole Drizzle schema into a static route. **The same
 * argument binds harder here**, because this is the response a crawler fetches
 * first and the one that must never 500.
 *
 * **A-D15 MADE THIS FILE'S CONTENTS A QUERY RESULT WHILE A COMMITTED TEST FORBADE
 * THE IMPORT THAT WOULD MAKE IT ONE**, and reconciliation R39 calls that the
 * roadmap's largest single omission. The two halves of the LEAF rule are
 * separable and only one of them has to bend:
 *
 *   - *"must not acquire the message catalog, the auth stack or the share
 *     subsystem"* — **FULLY INTACT.** None of those becomes reachable, and
 *     `sitemap.test.ts` still asserts every one of them absent.
 *   - *"must never 500"* — **PRESERVED BY A CATCH, NOT BY AN ABSENCE** (A6-29).
 *
 * So there is **exactly one database import, `@/lib/db/queries/blog`, NAMED in the
 * test's allowlist** — a single named exception, so a SECOND one fails, which is
 * the `queries/contract.test.ts` move of excluding `client.ts` by name rather than
 * loosening the rule. The lore pages, the gallery, the legal documents and the two
 * locale roots keep being emitted from pure data and are unaffected by any outage.
 *
 * ── A6-29. AN OUTAGE COSTS THE BLOG ROWS AND NEVER THE FILE ─────────────────
 *
 * **THIS IS THE OPPOSITE OF THE RULE FOR THE PAGES, AND THE ASYMMETRY IS THE WHOLE
 * POINT.** `/blog/<slug>` lets a driver error propagate, because a 404 on one
 * indexable URL is a de-indexing event and a 500 is a retry (A6-24). Here:
 *
 *   - A page is one URL. A 500 there is a retry against one address.
 *   - **`sitemap.xml` is the crawler's entry point to fifty-six indexable pages**,
 *     fifty-two of which come from pure leaves. A 500 here costs the crawl of `/`,
 *     `/en`, `/terms`, `/privacy`, `/gallery` ×2 and 44 lore pages **to protect the
 *     listing of two articles.**
 *
 * The catch is NARROW — it wraps the one call, not the function — so a bug in
 * `entriesFor` still throws loudly. It is the one place in A6 that swallows a
 * database error, which is why it is numbered, and the comment is there because **a
 * bare catch in this codebase reads as sloppiness and this one is a decision.**
 *
 * ── WHAT IS DELIBERATELY NOT IN HERE ────────────────────────────────────────
 *
 * `/s/<slug>` -- a 60-bit slug is a capability and a sitemap is publication. It
 * carries `x-robots-tag: noindex, nofollow, noarchive` and `robots.txt` disallows
 * the prefix; listing it here would undo all three.
 *
 * `/api/**` -- nothing under it is a document, and a crawler walking
 * `/api/events` would be writing analytics rows.
 *
 * Every gated route -- `/history`, `/history/[id]`, `/account`, `/onboarding`,
 * `/[reader]`, `/[reader]/[service]`. A crawler carries no cookie, so each is a
 * 302 to `/login`; a sitemap full of redirects is worse than a short sitemap.
 *
 * `/login` -- it is `robots: { index: false }` and it is a form, not a document.
 * A sitemap entry for a noindex page is a contradiction Search Console reports
 * against the whole file.
 *
 * ── `/terms` AND `/privacy` ARE IN, AND THAT IS RECONCILIATION R4 ───────────
 *
 * Both carried `robots: { index: false, follow: false }` with the recorded reason
 * *"an indexed legal page for an app behind auth is noise."* **The app stops
 * being behind auth in this release**, so the premise expires with it — and
 * `jsonld.ts` points a licence at `/terms#9`, which a de-indexed page cannot
 * serve as a licence target. The `robots` field came off both pages in the same
 * commit as these two lines; doing one half would have left the contradiction
 * pointing the other way.
 *
 * ── `localized` IS PER PATH, NOT PER RELEASE (R2) ───────────────────────────
 *
 * **A `hreflang` PAIR NAMING A URL THAT 404s IS NON-RECIPROCAL, AND GOOGLE
 * DISCARDS THE WHOLE SET SILENTLY.** Nothing reports it. So the alternates for a
 * path are the locales that ACTUALLY HAVE THEIR OWN ADDRESS for it, never
 * `LOCALES`.
 *
 * `/` has two addresses -- `/` and `/en` -- because it is in S2's content route
 * table and middleware rewrites the prefix. **`/terms` and `/privacy` have ONE
 * address each and serve both languages at it**, by D6's chain, exactly as they
 * did before this release: they are not content routes, `/en/terms` is not
 * served, and claiming an English twin there would name a 404. One address and
 * no alternates is the honest markup for a page whose language follows the
 * reader.
 *
 * S3 adds `/gallery`, S4 the 22 `/arcana/<slug>`, S6 `/blog` and the articles --
 * each `localized: true`, each in the commit that adds the page, and **each with
 * its English document actually written** (R2 again: per card, not per release).
 *
 * ── `lastModified` IS A COMMITTED CONSTANT — EXCEPT FOR THE BLOG (§10.3) ────
 *
 * `new Date()` reports every page as changed on every fetch, which is a spam
 * signal and throws away the field's only use. A constant changes when the content
 * changes, in a diff a reviewer can see.
 *
 * **THE BLOG ROWS ARE THE ONE EXCEPTION, AND THIS DISCHARGES A LOSS THIS FILE
 * RECORDED ON PURPOSE.** The old note under S6's entry read: *"`lastModified` STAYS
 * `CONTENT_UPDATED_AT` RATHER THAN `revisions[locale]` … the field's only use is
 * 'has this changed since I crawled', which one constant per release answers
 * honestly. **Worth revisiting the day an article is edited without a release.**"*
 * **A6 is that day** — publishing without a deploy is the feature — and
 * `blog_post_locales.updated_at` is a truthful per-locale source, the same one
 * `BlogPosting.dateModified` already claims. An article edited on Tuesday now says
 * Tuesday, on its own URL, per locale. Everything else keeps the constant.
 */

/**
 * **`force-dynamic`, AND WITHOUT IT THIS WHOLE WORKSTREAM DOES NOT WORK.** A6, found
 * by reading `npm run build`'s output rather than by reasoning about it.
 *
 * A `sitemap.ts` with no async work is a STATIC route -- the build output says `○` --
 * and Next kept prerendering it after it grew a database read. **The build ran the
 * query and baked fifty-six URLs into `.next/server/app/sitemap.xml.body`**, so an
 * article published through the editor would not appear in `sitemap.xml` until the next
 * deploy. That is precisely the failure R41 identified in the other direction --
 * *"the build-time slug closure is exactly what would prevent publishing without a
 * deploy"* -- arriving through a route nobody costed, and it would have looked like
 * everything working: the article's own URL 200s, the index lists it, `hreflang` is
 * right, and only the crawler's entry point is a release behind.
 *
 * On Vercel it is worse than stale: the build has `DATABASE_URL`, so it would freeze
 * PRODUCTION's article set at deploy time and keep serving it.
 *
 * The build output flipping `○` -> `ƒ` is the symptom of this working, exactly as
 * `## Localization` rule 5 says of the root layout. **Do not "optimise" it back.**
 */
export const dynamic = 'force-dynamic';

/** Bump when the content behind these paths changes. Not a build timestamp. */
const CONTENT_UPDATED_AT = '2026-07-29';

type SitemapPath = {
  /** The bare, Indonesian address. Never prefixed — `localePath` derives the twin. */
  path: string;
  /**
   * Does this path have a SEPARATE address per locale?
   *
   * `true` -> `/x` and `/en/x`, a reciprocal `hreflang` pair plus `x-default`.
   * `false` -> one address serving both languages by D6's chain, and NO
   * alternates at all. See the header: the second is not a smaller version of
   * the first, it is a different claim.
   *
   * OPTIONAL SINCE S6, because `locales` below is the more precise form of the
   * same question. Exactly one of the two is set on every entry.
   */
  localized?: boolean;
  /**
   * The locales that ACTUALLY HAVE A DOCUMENT at this path. **Present only where
   * the answer can be something other than "both".**
   *
   * This is the field `entriesFor`'s comment predicted: *"the first path that
   * ships Indonesian-only turns `localized: boolean` into a locale list and passes
   * it straight through as this third argument, which is what the parameter exists
   * for."* S6's articles are the first entries whose locale set is a fact about a
   * DOCUMENT rather than about a route, so they carry it, and `blogEntries()` is
   * the single source of that fact — the same field `hreflang`, the visible index
   * list and the `Blog` node's `blogPost` array all read.
   *
   * `localized: true` is shorthand for `locales: LOCALES` and stays on the routes
   * where the two addresses are one route file (`/`, `/gallery`, `/blog`), which
   * cannot 404 in either language.
   */
  locales?: readonly Locale[];
  /**
   * `'YYYY-MM-DD'` per locale, overriding `CONTENT_UPDATED_AT` **for that URL only**
   * (§10.3). Present on blog article rows and on nothing else.
   *
   * A `Partial<Record<Locale, string>>` rather than one string, because the two
   * locales are two URLs and two documents: claiming the English changed because the
   * Indonesian did is the same small lie in `sitemap.xml` that it is in
   * `BlogPosting.dateModified`. That per-locale shape is exactly what `SitemapPath`
   * could not express before, which is why the constant was kept.
   */
  lastModifiedFor?: Partial<Record<Locale, string>>;
};

/**
 * The paths in the sitemap, and the ONLY place they are listed.
 *
 * S3 adds `/gallery`. S4 spreads the 22 `/arcana/<slug>`. S6 adds `/blog` and the
 * articles. Each also adds its line to `sitemap.test.ts`'s exact set, in the same
 * commit — a path here with no page behind it is a 404 in a sitemap, and Search
 * Console reports that against the whole file rather than against the row.
 */
const SITEMAP_PATHS: readonly SitemapPath[] = [
  { path: '/', localized: true },
  // R4. Indexable since v0.4.0; one address each, language by D6.
  { path: '/terms', localized: false },
  { path: '/privacy', localized: false },
  /*
   * ── S3: the gallery ────────────────────────────────────────────────────────
   *
   * ONE entry, and both `/gallery` and `/en/gallery` come out: S2 owns the locale
   * expansion, so adding both by hand would be two rows for one page and a
   * self-referential `hreflang` set on each.
   *
   * `localized: true` is honest because there is ONE route file and middleware
   * rewrites the prefix, so neither address can 404 -- unlike a lore page, whose
   * English document is a thing somebody has to write.
   *
   * **LANDED AFTER THE PAGE, WHICH IS THE ORDERING RULE RATHER THAN A
   * COINCIDENCE** (R9): a path here with no page behind it is a 404 in a sitemap,
   * and Search Console reports that against the whole FILE rather than the row.
   */
  { path: '/gallery', localized: true },
  /*
   * ── S6: the blog index and its articles ────────────────────────────────────
   *
   * `/blog` is `localized: true` for the gallery's reason: ONE route file, and
   * middleware rewrites the prefix, so neither address can 404.
   *
   * **THE ARTICLES COME FROM `blogEntries()`, WHICH CARRIES `locales` PER
   * ARTICLE**, and that is R2 at page granularity rather than at release
   * granularity. Roadmap §1 permits an Indonesian-only article, and an `hreflang`
   * pair naming an English URL that 404s is non-reciprocal -- **Google discards
   * the whole set silently**, so one unwritten translation would break the
   * language targeting of every article that IS complete. Both ship in both
   * locales today, which is exactly when somebody replaces this with
   * `localized: true` and nothing fails until the next partial release.
   *
   * **THE ARTICLE ROWS ARE NO LONGER LISTED HERE AT ALL.** They came from
   * `blogEntries()`, a committed registry; they now come from a query, appended
   * by `sitemap()` below, because a `const` cannot await one. `/blog` itself
   * stays here: it is chrome served by one route file and cannot 404.
   *
   * The `lastModified` loss this paragraph used to record is discharged --
   * see `lastModifiedFor` on `SitemapPath` and the header.
   */
  { path: '/blog', localized: true },
  /*
   * ── S4: the twenty-two lore pages ──────────────────────────────────────────
   *
   * **FROM `LORE_SLUGS`, THE REGISTRY -- NEVER FROM `CARD_URL_SLUGS`.** The deck
   * has twenty-two cards whatever is written; the registry has the ones with a
   * document. While the forty-four were being authored, advertising an address
   * whose document did not exist would have been telling a crawler about a 404,
   * and Search Console reports that against the whole file rather than the row.
   * The two lists are identical now, which is exactly when somebody "simplifies"
   * this to the deck and nothing fails until the next partial release.
   *
   * `localized: true` is honest for all twenty-two because every card has BOTH
   * documents -- `lore.test.ts`'s completeness case is the gate, and R2 is per
   * PAGE rather than per release. A card shipping Indonesian-only would need its
   * own locale list here, not a `true`.
   *
   * `LORE_SLUGS` is `Object.keys(ARCANA_LORE)` and `registry.test.ts` pins that
   * to card order, so the sitemap comes out in Fool's Journey order rather than
   * in whatever order the files were written.
   */
  ...LORE_SLUGS.map((slug) => ({ path: `/arcana/${slug}`, localized: true })),
];

function entriesFor(entry: SitemapPath): MetadataRoute.Sitemap {
  /*
   * **RECIPROCAL, AND `x-default` IS THE INDONESIAN URL.** `id` is the default
   * and the source language (`## Localization`), so a visitor whose language we
   * do not serve belongs there. A non-reciprocal set is discarded SILENTLY by
   * Google -- the whole set stops working and nothing reports it.
   *
   * ── IT COMES OUT OF S2's HELPER, AND THAT IS THE POINT (register §5) ───────
   *
   * S1 shipped this as a local `{ ...urls, 'x-default': urls.id }` because
   * `alternates.ts` had not landed. It has now, so the `<xhtml:link>` set here
   * and the `<link rel="alternate">` set every content page's
   * `generateMetadata` emits come out of ONE function: Google reads both and
   * treats a disagreement as a broken group, so two builders is a second
   * definition of the same claim. The reconciliation's single-definition
   * register names `sitemapLanguages` with this file as its consumer, and a
   * helper with no callers is how V7's `liveShareLinkFor` shipped a bug in
   * silence.
   *
   * `localePath('en', '/')` is `/en` and never `/en/` -- two URLs for one page
   * is the exact duplicate a canonical exists to resolve -- and that subtlety
   * now lives in the leaf rather than here.
   *
   * `undefined` rather than a one-entry set for an unlocalized path: a `hreflang`
   * naming only the page you are already on is noise a validator flags, and it
   * would also be the shape somebody later "completes" by adding an `en` URL that
   * does not exist.
   *
   * **`localized: true` IS SHORTHAND FOR `LOCALES`, AND IT IS ONLY CORRECT ON A
   * PATH WHOSE TWO ADDRESSES ARE ONE ROUTE FILE** (`/`, `/gallery`, `/blog`) --
   * those cannot 404 in either language. R2 is per PAGE, not per release, so a
   * path whose locale set is a fact about a DOCUMENT carries `locales` instead
   * and it is passed straight through as this third argument, which is what the
   * parameter exists for. **S6's articles are the first entries to use it**, and
   * the prediction that used to sit in this paragraph is now the field above.
   * Passing `LOCALES` for a document that exists in one language would name a 404
   * and discard the whole set, silently.
   *
   * A path with exactly ONE locale gets `null` here rather than a one-entry set,
   * for the reason two paragraphs up.
   */
  const declared = entry.locales ?? (entry.localized ? LOCALES : []);
  const languages =
    declared.length > 1 ? sitemapLanguages(siteOrigin(), entry.path, declared) : null;

  /** Every address this path is served at, in locale order. */
  const urls: Partial<Record<Locale, string>> = languages
    ? Object.fromEntries(
        LOCALES.filter((locale) => languages[locale] !== undefined).map((locale) => [
          locale,
          languages[locale]!,
        ]),
      )
    : { id: absoluteUrl(entry.path) };

  const alternates = languages ? { languages } : undefined;

  return LOCALES.filter((locale) => urls[locale] !== undefined).map((locale) => ({
    url: urls[locale]!,
    // §10.3: per URL where the row knows, the release constant everywhere else.
    lastModified: entry.lastModifiedFor?.[locale] ?? CONTENT_UPDATED_AT,
    /*
     * `changeFrequency` and `priority` are HINTS Google has said publicly it
     * ignores. They are here because Bing and smaller crawlers still read them
     * and they cost nothing -- not because they do anything for the ranking that
     * matters.
     */
    changeFrequency: 'monthly' as const,
    priority: entry.path === '/' ? 1 : 0.7,
    ...(alternates ? { alternates } : {}),
  }));
}

/**
 * The blog's rows, or **`[]` if the database is unreachable** (A6-29).
 *
 * The catch wraps THE ONE CALL rather than the function, so a bug in `entriesFor`
 * still throws loudly. The failure is logged with the error's class only -- *"a
 * postgres error quotes the failing statement and its bound parameters"*, and this
 * statement binds nothing, which is exactly the path on which somebody later adds one
 * that does.
 */
async function blogPaths(): Promise<SitemapPath[]> {
  try {
    const rows = await publishedSitemapRows(db);
    return rows.map((row) => ({
      path: `/blog/${row.slug}`,
      /*
       * **R2 AT PAGE GRANULARITY, FROM A QUERY RESULT INSTEAD OF A COMMITTED ARRAY.**
       * Roadmap §1 permits an Indonesian-only article, and an `hreflang` pair naming
       * an English URL that 404s is non-reciprocal -- **Google discards the whole set
       * silently.** `publishedSitemapRows` derives the set in SQL from published rows
       * that have a body (A6-6); this file passes it straight through, exactly as it
       * passed `entry.locales` through before, and `sitemapLanguages()` is unchanged.
       */
      locales: row.locales,
      lastModifiedFor: row.lastModifiedFor,
    }));
  } catch (err) {
    console.error('[sitemap] blog rows unavailable; emitting the other 50 URLs', {
      name: err instanceof Error ? err.name : typeof err,
    });
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /*
   * **THE ARTICLES GO LAST, WHICH CHANGES THE FILE'S ROW ORDER FROM v0.4.0's.** They
   * used to be spread into `SITEMAP_PATHS` immediately after `/blog`; a `const` cannot
   * await, so they are appended here. Order in a sitemap carries no meaning to a
   * crawler -- what matters is that it is STABLE across two fetches, which
   * `publishedSitemapRows`'s `ORDER BY date_published DESC, slug ASC` and `LOCALES`
   * ordering guarantee, and which `sitemap.test.ts` asserts.
   */
  return [...SITEMAP_PATHS, ...(await blogPaths())].flatMap(entriesFor);
}

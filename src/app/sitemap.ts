import type { MetadataRoute } from 'next';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { sitemapLanguages } from '@/lib/seo/alternates';
import { absoluteUrl, siteOrigin } from '@/lib/seo/origin';

/**
 * `sitemap.xml`, both locales.
 *
 * ── IT IS A LEAF AND IT HAS TO STAY ONE (S-D11) ─────────────────────────────
 *
 * `robots.ts` refused to import `shareOrigin()` because that pulls `server-only`,
 * `queries/share.ts` and the whole Drizzle schema into a static route. **The same
 * argument binds harder here**, because this is the response a crawler fetches
 * first and the one that must never 500: there is no database on its path, so a
 * database outage cannot reach it. `@/lib/seo/origin`, `@/lib/i18n/{locale,prefix}`
 * and `@/data/**` are the only import families permitted — every one of them a
 * pure leaf — and `sitemap.test.ts` asserts the absence of the rest.
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
 * ── `lastModified` IS A COMMITTED CONSTANT, NEVER `new Date()` ───────────────
 *
 * `new Date()` reports every page as changed on every fetch, which is a spam
 * signal and throws away the field's only use. A constant changes when the content
 * changes, in a diff a reviewer can see. `sitemap.test.ts` asserts byte-stability
 * across two calls, which is the mechanical form of that rule.
 */

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
   */
  localized: boolean;
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
   * **`LOCALES` IS CORRECT HERE ONLY BECAUSE EVERY LOCALIZED PATH IN THE LIST
   * TODAY HAS BOTH DOCUMENTS.** R2 is per PAGE, not per release: the first path
   * that ships Indonesian-only turns `localized: boolean` into a locale list and
   * passes it straight through as this third argument, which is what the
   * parameter exists for. Passing `LOCALES` for a card with no English lore
   * would name a 404 and discard the whole set.
   */
  const languages = entry.localized
    ? sitemapLanguages(siteOrigin(), entry.path, LOCALES)
    : null;

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
    lastModified: CONTENT_UPDATED_AT,
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

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.flatMap(entriesFor);
}

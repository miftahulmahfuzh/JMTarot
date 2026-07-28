import type { MetadataRoute } from 'next';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { localePath } from '@/lib/i18n/prefix';
import { absoluteUrl } from '@/lib/seo/origin';

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

/**
 * Every address a path is served at, in locale order.
 *
 * `localePath` is S2's, from the same pure leaf `gate.ts` imports. S1's plan
 * shipped a local `const EN_PREFIX = '/en'` for S2 to delete later; the leaf
 * landed first, so the seam closed instead of being created. The one subtlety it
 * already handles: `localePath('en', '/')` is `/en` and never `/en/`, because
 * those would be two URLs for one page — the exact duplicate a canonical exists
 * to resolve, arriving from the file whose job is to prevent it.
 */
function addresses(entry: SitemapPath): Partial<Record<Locale, string>> {
  if (!entry.localized) return { id: absoluteUrl(entry.path) };
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, absoluteUrl(localePath(locale, entry.path))]),
  );
}

function entriesFor(entry: SitemapPath): MetadataRoute.Sitemap {
  const urls = addresses(entry);

  /*
   * **RECIPROCAL, AND `x-default` IS THE INDONESIAN URL.** `id` is the default
   * and the source language (`## Localization`), so a visitor whose language we
   * do not serve belongs there. A non-reciprocal set is discarded SILENTLY by
   * Google -- the whole set stops working and nothing reports it -- which is why
   * every row of a localized path is emitted from one object over one map.
   *
   * `undefined` rather than a one-entry set for an unlocalized path: a `hreflang`
   * naming only the page you are already on is noise a validator flags, and it
   * would also be the shape somebody later "completes" by adding an `en` URL that
   * does not exist.
   */
  const alternates = entry.localized
    ? { languages: { ...urls, 'x-default': urls.id } }
    : undefined;

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

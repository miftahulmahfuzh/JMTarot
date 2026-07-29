/**
 * Canonical, `hreflang` and `x-default` for a public content page (S-D15).
 *
 * ── ONE HELPER, AND THE REASON IS A FAILURE THAT REPORTS NOTHING ─────────────
 *
 * Forty-four pages hand-writing three `<link rel="alternate">` tags is
 * forty-four chances to emit a NON-RECIPROCAL pair -- and **Google discards a
 * non-reciprocal group silently**. Not the broken edge: the whole group. The
 * pages stay indexed, the language targeting simply stops existing, and there is
 * no console, no header and no report that says so. So this is one function, with
 * a test that walks the graph, called by every content page's
 * `generateMetadata()`.
 *
 * ── FIVE PROPERTIES, EACH OF WHICH IS A BUG IF LOST ─────────────────────────
 *
 * 1. **ABSOLUTE URLS, BUILT FROM AN `origin` PARAMETER.** A relative `hreflang`
 *    is discarded by Google. Next would resolve one against `metadataBase`, and
 *    depending on that puts the correctness of every alternate on a field in
 *    `layout.tsx` that S1 owns and that is absent in local development. So the
 *    caller names the origin and this function does the joining.
 * 2. **NO `process.env`, AND NO IMPORT OF `./origin`.** S-D11's leafness
 *    argument, applied to the module that runs on the most cacheable responses on
 *    the domain. It also means this file needed nothing from S1 to be written or
 *    tested.
 * 3. **`x-default` IS THE INDONESIAN URL.** S-D1's table: `id` is the default and
 *    the source language, and the bare path is where a visitor we cannot match
 *    should land.
 * 4. **`locales` IS THE SET THAT ACTUALLY EXISTS, NEVER `LOCALES` (R2).** See
 *    the block on the parameter below -- this is the one property that is not
 *    obvious and the one whose absence is silent.
 * 5. **IT THROWS ON A PATH IT SHOULD NOT HAVE BEEN GIVEN.** A prefixed path
 *    (`/en/gallery`) or an app path (`/history`) would produce a canonical
 *    pointing somewhere that does not exist -- and a wrong canonical de-indexes
 *    the correct page, which is the worst class of SEO bug because it looks like
 *    nothing at all. `generateMetadata` throwing during implementation is the
 *    cheap version of finding out.
 *
 * **`path` IS ALWAYS THE BARE PATH.** `/`, `/gallery`, `/arcana/the-moon`. The
 * `/en/` form is derived here and nowhere else; a contract test forbids the
 * literal anywhere outside this file and `@/lib/i18n/prefix`.
 */
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';
import { isContentPath, localePath, stripLocalePrefix } from '@/lib/i18n/prefix';

export type ContentAlternates = {
  /** The absolute address of THIS locale's copy. */
  canonical: string;
  /**
   * The whole group, identical on every page in it -- which is what
   * reciprocity means, and the only form Google does not discard.
   *
   * A locale with no document at this path is **absent**, not null and not an
   * empty string: R2, and the reason is in `contentAlternates`.
   */
  languages: Partial<Record<Locale, string>> & { 'x-default': string };
};

export function contentAlternates(input: {
  origin: string;
  path: string;
  locale: Locale;
  /**
   * The locales that ACTUALLY HAVE A DOCUMENT at `path`.
   *
   * **THIS IS RECONCILIATION R2 AND IT IS THE PARAMETER A FUTURE EDIT WILL WANT
   * TO DEFAULT TO `LOCALES`. DO NOT.** `hreflang` must be reciprocal, and a pair
   * naming an English URL that 404s is non-reciprocal, so **Google discards the
   * whole set — silently, with nothing reporting it.** S4 found the trap: the
   * roadmap's "when effort has to be cut, `id` ships complete and `en` waits" is
   * correct at RELEASE granularity and dangerous at PAGE granularity, because a
   * card whose English lore is not written yet has no `/en/arcana/<slug>` and
   * emitting the pair anyway breaks the language targeting of every card that IS
   * complete.
   *
   * So a card with no English document emits `id` + `x-default` only, and the
   * release is never in a broken state at any point in the writing order. It is
   * required rather than defaulted because the whole point is that the caller
   * has to know the answer, and `LOCALES` is the answer that is wrong exactly
   * when it matters.
   */
  locales: readonly Locale[];
}): ContentAlternates {
  const { origin, path, locale, locales } = input;

  if (stripLocalePrefix(path).locale !== null) {
    throw new Error(
      `contentAlternates received an already-prefixed path: ${path}. Pass the BARE path; ` +
        'the /en/ form is derived here.',
    );
  }
  if (!isContentPath(path)) {
    throw new Error(
      `contentAlternates received ${path}, which is not a content path. Only the routes in ` +
        'src/lib/i18n/prefix.ts may carry a canonical/hreflang group; D6 still holds for the app.',
    );
  }
  /*
   * The canonical is THIS locale's address, so a locale with no document cannot
   * have one. Silent, otherwise: the page would name itself in a group it is not
   * a member of, which is the non-reciprocal shape R2 is about.
   */
  if (!locales.includes(locale)) {
    throw new Error(
      `contentAlternates was asked for the ${locale} canonical of ${path}, but locales is ` +
        `[${locales.join(', ')}]. A locale with no document at a path has no canonical there.`,
    );
  }
  /*
   * `x-default` is the Indonesian URL, so `id` is not optional. Indonesian is
   * the source language (S-D1): a content path with an English document and no
   * Indonesian one is not a state this project has, and if it ever is, the
   * `x-default` decision has to be made deliberately rather than fall out of an
   * `undefined`.
   */
  if (!locales.includes(DEFAULT_LOCALE)) {
    throw new Error(
      `contentAlternates: ${path} has no ${DEFAULT_LOCALE} document, and x-default points at ` +
        `the ${DEFAULT_LOCALE} URL. Indonesian is the source language (S-D1).`,
    );
  }

  // A human types `NEXT_PUBLIC_SITE_ORIGIN` into a dashboard, so a trailing
  // slash is likely and would produce `https://host//gallery`.
  const base = origin.replace(/\/+$/, '');
  const url = (l: Locale) => `${base}${localePath(l, path)}`;

  const languages: Partial<Record<Locale, string>> = {};
  for (const l of locales) languages[l] = url(l);

  return {
    canonical: url(locale),
    languages: { ...languages, 'x-default': url(DEFAULT_LOCALE) },
  };
}

/**
 * The `<xhtml:link>` set for one sitemap entry (roadmap §7's S1/S2 seam).
 *
 * **S1 OWNS `src/app/sitemap.ts` AND WRITES ONE LINE PER ENTRY; S2 OWNS THIS
 * FUNCTION.** It delegates to `contentAlternates` rather than rebuilding the
 * URLs, so the sitemap's alternate set and the head's cannot drift -- Google
 * reads both and a disagreement is a broken group.
 *
 * `locales` carries R2 here too, and in the sitemap it carries something extra:
 * S1's own rule is that the sitemap set is EXACT rather than a superset, so a
 * path lands in the file only after its page exists. This parameter is how a
 * half-translated path lands honestly instead of waiting.
 */
export function sitemapLanguages(
  origin: string,
  path: string,
  locales: readonly Locale[],
): ContentAlternates['languages'] {
  return contentAlternates({ origin, path, locale: DEFAULT_LOCALE, locales }).languages;
}

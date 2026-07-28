import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/origin';

/**
 * `robots.txt`. **THE ONE LINE THAT MATTERS IS `Disallow: /s/`.**
 *
 * V7 makes `/s/[slug]` public, and a 60-bit slug is unguessable but not
 * unindexable: the moment one link is posted anywhere a crawler reaches, "I sent
 * this to one friend" becomes a permanent search result. This file is the third of
 * three halves — the `X-Robots-Tag` header in `next.config.ts`, the
 * `robots: { index: false }` metadata twin on the page, and this.
 *
 * **NONE OF THE THREE IS REDUNDANT.** A `Disallow` is a request a polite crawler
 * honours BEFORE fetching, which is the only one of the three that prevents the
 * fetch at all; `X-Robots-Tag` binds a response that was fetched anyway, including
 * ones nothing parses as HTML; the `<meta>` tag is what a crawler that ignored the
 * first two and rendered the page still sees. A misbehaving crawler ignores all
 * three, which is why the real control is the entropy in the slug.
 *
 * `/api/` is disallowed too, for the ordinary reason: nothing under it is a
 * document, and a crawler walking `/api/events` would be writing analytics rows.
 *
 * The middleware matcher already excludes `robots`, so this file needs no session
 * and does not appear in `isPublic()`.
 *
 * **IT USED TO IMPORT NOTHING, AND THE REFUSAL IS AMENDED RATHER THAN REVERSED.**
 * The obvious first draft set `host: shareOrigin()`, which pulls
 * `@/lib/share/links` — and with it `server-only`, `queries/share.ts` and the
 * whole schema — into a route whose entire output is four lines of text. `host`
 * is a non-standard directive Google ignores outright, so that import bought
 * nothing and cost a static route its independence.
 *
 * `sitemap:` is different in exactly the way that matters: **the directive is
 * specified to take an ABSOLUTE URL**, so it genuinely needs the origin and there
 * is no version of this line that does not. S-D11 is the answer —
 * `@/lib/seo/origin` is a leaf with no imports of its own, and `origin.test.ts`
 * asserts that. A leaf stays a leaf; it does not have to stay alone.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/s/', '/api/'],
      },
    ],
    /*
     * ONE SITEMAP, AND `sitemap.ts` DECIDES WHAT IS IN IT. A second entry here
     * for a per-locale sitemap would be a second place that has to agree about
     * the route set; S2 expands the locales inside that one file instead.
     *
     * The middleware matcher already excludes `sitemap` and `robots`, so neither
     * path needs a session and neither appears in `isPublic()`.
     */
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}

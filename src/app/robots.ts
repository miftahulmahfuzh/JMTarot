import type { MetadataRoute } from 'next';

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
 * **IT IMPORTS NOTHING, AND THAT IS ON PURPOSE.** The obvious first draft set
 * `host: shareOrigin()`, which pulls `@/lib/share/links` — and with it
 * `server-only`, `queries/share.ts` and the whole schema — into a route whose
 * entire output is four lines of text. `host` is a non-standard directive that
 * Google ignores outright, so the import bought nothing and cost a static route
 * its independence. A leaf stays a leaf.
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
  };
}

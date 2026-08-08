import type { NextConfig } from 'next';

/**
 * One hour at the edge, a day of stale-while-revalidate (v0.4.0 / S-D10).
 *
 * A CONSTANT because eight entries share it and eight hand-typed copies is eight
 * chances for one to say `s-maxage=360`. `headers.test.ts` asserts the value.
 */
const CONTENT_CACHE = [
  { key: 'cache-control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /* The floating dev badge sits over the bottom-left of the viewport, which is
     exactly where the fan lives. It obscures the thing we screenshot most. */
  devIndicators: false,

  async headers() {
    return [
      {
        /*
         * Card art and reader portraits are generated assets with stable,
         * slug-based filenames, so a long cache is safe and worth having: the
         * fan pulls 22 files on the first draw.
         *
         * `immutable` is doing real work here and carries a real cost. The
         * filenames are NOT content-hashed, so if the art is ever regenerated
         * -- and it should be; the three source generations are visually
         * inconsistent, which is the open art issue -- anyone who has loaded
         * the app will keep the old art for up to a year. Regenerating means
         * either changing the filenames or shortening this first.
         */
        source: '/cards/:path*',
        headers: [{ key: 'cache-control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/dukuns/:path*',
        headers: [{ key: 'cache-control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        /*
         * Security headers, every route (W7 §6.5).
         *
         * LAST in the array on purpose: Next applies every matching entry, and
         * the two cache rules above are narrower. Putting this first would still
         * work today and would read as if it overrode them.
         */
        source: '/(.*)',
        headers: [
          { key: 'x-content-type-options', value: 'nosniff' },
          { key: 'referrer-policy', value: 'strict-origin-when-cross-origin' },
          {
            /*
             * **`SAMEORIGIN`, NOT `DENY`, AND THIS IS THE ONE A SECURITY
             * CHECKLIST WILL TELL THE NEXT PERSON TO "FIX".**
             *
             * CLAUDE.md documents this project's only way of driving its own UI
             * without a WebDriver: a scratch page under `public/cards/` that
             * loads the app in a SAME-ORIGIN IFRAME and patches its `fetch`.
             * Chromium cannot launch in this WSL image, so that harness is not a
             * convenience -- it is the technique that caught the two worst bugs
             * in this project's history, and W7's own refusal screenshots were
             * taken with it.
             *
             * `DENY` kills it. `SAMEORIGIN` blocks clickjacking from another
             * origin, which is the actual threat, and keeps the harness working.
             */
            key: 'x-frame-options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'permissions-policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            /*
             * Two years, subdomains included, **without `preload`**. Vercel
             * already sets HSTS on `*.vercel.app`; this is for the custom domain.
             * Preload is a one-way door -- removal takes months and a browser
             * release -- and `jmtarot.site` is days old.
             */
            key: 'strict-transport-security',
            value: 'max-age=63072000; includeSubDomains',
          },
          {
            /*
             * Safe because Auth.js's Google provider does a FULL REDIRECT here
             * (reconciliation R21), not a popup. **If sign-in ever becomes a
             * popup this must become `same-origin-allow-popups`**, or the popup
             * cannot talk to its opener and sign-in breaks with no error worth
             * reading.
             */
            key: 'cross-origin-opener-policy',
            value: 'same-origin',
          },
          {
            /*
             * **THE FOUR DIRECTIVES THAT COST NOTHING AND NEED NO NONCE**
             * (W7-D17). Enforced today.
             *
             * `frame-ancestors 'self'` rather than `'none'`, for the same reason
             * `x-frame-options` is SAMEORIGIN -- and note that `frame-ancestors`
             * is the modern one that browsers honour when both are present, so
             * setting it to `'none'` here would kill the harness even with
             * SAMEORIGIN above.
             */
            key: 'content-security-policy',
            value: "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'self'",
          },
          {
            /*
             * **REPORT-ONLY, AND IT DELIBERATELY SHIPS WITHOUT `report-uri`.**
             * Reconciliation §7.9a cut `CSP_REPORT_URI` as "a report endpoint
             * that nothing reads", so violations surface in the browser console
             * during development rather than being posted anywhere. That is the
             * intended state: this policy exists to be READ by whoever next
             * opens devtools, not collected.
             *
             * `script-src` cannot be enforced yet. Next inlines bootstrap
             * scripts and RSC flight data, so a real one needs a per-request
             * nonce generated in middleware -- and W2 owns middleware. The
             * `'unsafe-inline'` on `style-src` is likewise Next's doing: CSS
             * modules are fine, but the framework emits inline style attributes.
             *
             * Two assumptions checked rather than shipped: the built HTML
             * contains no `fonts.gstatic.com` reference (`next/font/google`
             * self-hosts, verified on 2026-07-27 by grepping `.next`), and
             * `img-src` needs no `lh3.googleusercontent.com` because W2 does not
             * render the Google avatar (reconciliation R21). If either changes,
             * this directive list changes with it.
             */
            key: 'content-security-policy-report-only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "connect-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
      /*
       * ── v0.4.0 / S1. THE CONTENT ROUTES ARE CDN-CACHEABLE (S-D10) ──────────
       *
       * These are the pages whose TTFB a crawler measures, and they are
       * session-invariant by construction: `PublicShell` calls no `currentUser()`,
       * `ReadingView` is not mounted, and after S2's rewrite the LANGUAGE comes
       * from the URL prefix rather than from a cookie. That last property is what
       * makes an edge cache correct rather than merely fast -- **a page whose
       * language depends on the visitor's cookie cannot be cached and cannot be
       * canonicalised** (§4.1).
       *
       * `s-maxage` and not `max-age`: the shared cache holds it for an hour, the
       * browser revalidates. `stale-while-revalidate=86400` means a crawler after
       * the hour is up gets the stale copy immediately and the refresh happens
       * behind it, which is the whole point on a Hobby lambda in `sin1`.
       *
       * **NO `x-robots-tag` ON ANY OF THESE, AND THAT IS S-D12.** Next applies
       * every matching entry and a later one with the same key wins, so a
       * broadly-matching entry carrying that header would silently `noindex` the
       * site. `headers.test.ts` asserts these entries carry `cache-control` and
       * nothing else, and that `/s/:path*` is the only entry in the file with an
       * `x-robots-tag`.
       *
       * **`/` AND `/en` ARE DELIBERATELY ABSENT.** `/` dual-renders by session
       * (S-D5), middleware writes `jmt_locale` on it -- and a `Set-Cookie` makes a
       * response uncacheable at the edge whatever this header says -- and its
       * language follows D6's chain because the signed-in arm is an app route
       * (S-D1). All three would have to be solved together. The test asserts the
       * absence, because adding `/` here would look symmetrical.
       *
       * **BOTH LOCALES ARE LISTED, AND THAT IS NOT REDUNDANT.** Next's `headers()`
       * matches the INCOMING request path, before middleware's rewrite -- ordering
       * is headers -> redirects -> middleware -> rewrites -- so `/en/gallery` never
       * matches `/gallery`.
       *
       * **WHETHER THESE SURVIVE A DYNAMIC RESPONSE IS MEASURED, NOT ASSUMED
       * (R21).** Four plans flagged it independently. Answered locally on
       * 2026-07-29 against a real `next start` -- see `docs/workstream-notes.md`
       * -- and it must still be re-checked with `curl -sI` against a Vercel
       * PREVIEW before anything is allowed to depend on the cache, because the dev
       * server has no CDN in front of it. **Nothing in v0.4.0 depends on it today
       * and nothing new may.**
       */
      { source: '/gallery', headers: CONTENT_CACHE },
      { source: '/en/gallery', headers: CONTENT_CACHE },
      { source: '/arcana/:slug', headers: CONTENT_CACHE },
      { source: '/en/arcana/:slug', headers: CONTENT_CACHE },
      { source: '/blog', headers: CONTENT_CACHE },
      { source: '/en/blog', headers: CONTENT_CACHE },
      { source: '/blog/:slug', headers: CONTENT_CACHE },
      { source: '/en/blog/:slug', headers: CONTENT_CACHE },
      {
        /*
         * S5's asset class. §6.4 says **S5 declares this header and S1 writes it**,
         * and the value it declared is W-D4's -- one day plus a week of
         * stale-while-revalidate. **IT SHIPPED FOR ONE COMMIT AS A YEAR OF
         * `immutable`, AND THAT IS THE ONE THING NOT TO RESTORE** (corrected by S5,
         * 2026-07-29): the entry was written from `/cards/*`'s reasoning rather than
         * from the declaration.
         *
         * ITS OWN ENTRY RATHER THAN JOINING `/cards/*` (S-D9), so the two lifecycles
         * can diverge -- and diverging is the entire point. `/cards/:path*` above
         * carries a year of `immutable` on non-content-hashed filenames because the
         * fan pulls 22 thumbnails on every cold draw, and its comment says at length
         * what that costs: regenerate the art and every existing install keeps the
         * old images for up to a year, with `src/data/deck.ts`'s `ART_VERSION` as the
         * workaround.
         *
         * **THAT TRADE DOES NOT TRANSFER, BECAUSE THE TRAFFIC SHAPE IS THE OPPOSITE
         * ONE.** A wallpaper is fetched ONCE, by somebody who tapped a button, and
         * never again -- `/gallery` draws `cards/thumb`, not these -- so a year of
         * caching buys approximately nothing and costs the whole documented
         * staleness problem. 86400 plus a week of `stale-while-revalidate` means a
         * regenerated deck propagates on its own, which is also why these filenames
         * carry no `?v=` and no content hash and `src/lib/wallpaper.ts` has no
         * version to forget to bump. A new deployment already invalidates Vercel's
         * edge copy, so this bounds the BROWSER's copy -- the one that outlives a
         * deploy.
         *
         * **NO `content-disposition: attachment`** (W-D10). It would force a download
         * and make the image impossible to VIEW, and viewing is the prerequisite for
         * iOS's long-press -> Add to Photos, which is the fallback when the Web Share
         * sheet is unavailable. `WallpaperDownload` sets the filename with the
         * `download` attribute instead, which costs that door nothing.
         *
         * **NO `x-robots-tag`.** These are 22 pieces of original art at high
         * resolution and Google Images is upside, not a leak. S-D12's warning is
         * about a broad entry ACQUIRING `noindex` from `/s/:path*`; this entry shares
         * no key with that one and sits above `/(.*)` rather than below it, so
         * nothing here overrides anything.
         *
         * **`wallpapers/` ALSO HAS TO JOIN `src/middleware.ts`'s NEGATIVE
         * LOOKAHEAD, AND THAT IS S2's LINE (R7).** Without it a signed-out
         * stranger is 302'd to `/login` on every wallpaper request, and adding
         * `/wallpapers` to `isPublic()` instead returns 200 but leaves middleware
         * running -- so the locale-cookie write fires and puts a `Set-Cookie` on a
         * ~550KB static response, making it edge-uncacheable. A direct S-D10
         * breach on the response where CDN caching matters most.
         */
        source: '/wallpapers/:path*',
        headers: [
          {
            key: 'cache-control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        /*
         * v0.7.0's three reader avatars (F4, `C-D16`, `F4-18`). Written by
         * `tools/make_avatars.py`, committed, never hand-edited.
         *
         * **DELIBERATELY NOT `/cards/*`'s YEAR OF `immutable`, AND THE REASON IS
         * `/wallpapers/*`'s ONE-COMMIT MISTAKE REPEATED IN ADVANCE.** That entry
         * shipped as `immutable` because it was written from `/cards/*`'s
         * reasoning rather than from a declaration, and was corrected a commit
         * later. The declaration here: **the crop boxes are a hand-written table
         * of three rows that will be tuned once somebody has seen them at 28px on
         * glass** (loop 6), and the filenames are `thessaly.webp`,
         * `margaret.webp`, `adrian.webp` -- no content hash, no `?v=`. A year of
         * `immutable` means every existing install keeps a bad crop until 2027.
         *
         * The traffic shape does not argue the other way either: three files
         * totalling ~8KB, fetched once and then served from the memory cache for
         * the life of the room. 86400 plus a week of `stale-while-revalidate`
         * costs nothing measurable and lets a re-crop propagate on its own.
         *
         * **`readers/` ALSO HAS TO JOIN `src/middleware.ts`'s NEGATIVE LOOKAHEAD,
         * AND THAT IS A SEPARATE RULE** (`R7`). Without it middleware runs on
         * every avatar request and puts a `Set-Cookie` on a static image -- per
         * message rendered, since this is the one asset class a signed-in querent
         * hits on every chat render. Adding `/readers` to `isPublic()` instead
         * returns 200 and prevents none of it.
         */
        source: '/readers/:path*',
        headers: [
          {
            key: 'cache-control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        /*
         * V7's public page, and the two headers Miftah's security amendment calls
         * the most important lines in it.
         *
         * **AFTER the `/(.*)` block on purpose.** Next applies every matching
         * entry and a later one with the same key WINS, so this is what makes
         * `referrer-policy: no-referrer` beat the global
         * `strict-origin-when-cross-origin` on `/s/` and only on `/s/`. Verified
         * against a real response rather than assumed -- `headers.test.ts`
         * asserts the ordering, because reversing these two entries would be a
         * silent no-op that reads as correct.
         *
         * **`x-robots-tag`.** A 60-bit slug is unguessable; it is NOT
         * unindexable. One link posted anywhere a crawler reaches -- a public
         * WhatsApp group with a web bridge, a Telegram preview bot, a pasted
         * forum link -- and "I sent this to one friend" becomes a permanent
         * search result with a cache that survives revocation. `noarchive`
         * because an index entry is recoverable and a cached copy is not. The
         * header rather than only the `<meta>` twin, because a header is honoured
         * on a response a crawler never parses, and `robots.ts` disallows the
         * prefix as the third half.
         *
         * **`referrer-policy: no-referrer`.** THE SLUG IS IN THE URL, so any
         * outbound navigation leaks the capability itself in a `Referer` header.
         * `Try It Yourself` is same-origin, but `/terms` and `/privacy` are
         * linked from the footer and any future outbound link inherits the leak.
         * This is the one place in the app where the URL *is* the secret.
         *
         * `x-frame-options` and `frame-ancestors` are NOT tightened here. A
         * security review of a newly public page will say `DENY` and `'none'`;
         * both would kill the same-origin iframe harnesses under `public/cards/`
         * while blocking nothing that SAMEORIGIN does not, and
         * `src/lib/headers.test.ts` asserts both in two separate tests so that
         * tightening one is a failure rather than a half-fix.
         */
        source: '/s/:path*',
        headers: [
          { key: 'x-robots-tag', value: 'noindex, nofollow, noarchive' },
          { key: 'referrer-policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;

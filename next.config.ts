import type { NextConfig } from 'next';

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

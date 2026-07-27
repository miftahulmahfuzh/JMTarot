/**
 * Locale resolution, on the edge.
 *
 * THE PLAN'S §4 PUT `import 'server-only'` AT THE TOP OF THIS FILE AND
 * `getLocale()` IN IT. Both moved, and the reason is the trap CLAUDE.md already
 * records for `@/lib/db/client`: the `server-only` package throws anywhere the
 * `react-server` condition is not set, which includes Vitest. This module is
 * imported by `src/middleware.ts` AND by its own unit test, so it cannot carry
 * that import. `getLocale()` — which needs `next/headers` and React `cache()`,
 * neither of which belongs in an edge middleware bundle — lives in `./t` with
 * the `server-only` marker on it instead. One server-only module in this layer,
 * one edge-safe one.
 *
 * THE ORDER IS FIXED BY D6: profile -> cookie -> Accept-Language -> 'id'. What
 * "profile" means here is the `loc` claim on the session JWT, not a row in
 * `users`: reading `users.locale` on the render path would violate the roadmap's
 * first non-negotiable, so W2 stamps the column into the token at sign-in and
 * `POST /api/locale` re-mints it on every switch. Operationally, "profile" is
 * "session claim".
 */
import type { NextRequest } from 'next/server';

import { DEFAULT_LOCALE, isLocale, negotiate, type Locale } from './locale';

/**
 * `httpOnly` on purpose (I11): nothing client-side reads it. The provider is
 * handed its locale by the server, so this is one less thing an injected script
 * can see. One year, because a language choice does not expire.
 */
export const LOCALE_COOKIE = 'jmt_locale';
export const LOCALE_COOKIE_MAX_AGE = 31_536_000;

/**
 * The header middleware sets on the FORWARDED request (I10).
 *
 * `NextResponse.next({ request: { headers } })` is the only form that mutates
 * what downstream server components see. Setting a header on the plain response
 * does nothing for RSC, and the symptom is `getLocale()` silently returning the
 * cookie value forever — which looks like the cookie working rather than like the
 * header failing.
 */
export const LOCALE_HEADER = 'x-jmt-locale';

/** The dev-only query override (I12). */
export const LOCALE_QUERY = 'lang';

/**
 * The whole chain, run once per request in middleware.
 *
 * `sessionLocale` is `readToken(request.auth?.user)?.loc ?? null` — middleware
 * has already decoded the cookie for the auth gate, so the claim is free and
 * there is no second decode. The plan asked W2 for a `readSessionLocale(req)`
 * helper; passing the claim that is already in hand is the same thing without a
 * redundant JWE decrypt on every request.
 */
export function resolveForMiddleware(
  req: NextRequest,
  sessionLocale: Locale | null,
): Locale {
  /*
   * The override wins over everything, INCLUDING a signed-in user's claim.
   *
   * It exists because `tools/shot.sh` drives headless Windows Chrome against the
   * dev server and cannot plant a cookie, and because the iframe harnesses under
   * `public/cards/` sign in as a real dev user — an override that lost to the
   * session claim would be useless for exactly the screenshots it was added for.
   * There is precedent in the tree: `StillMode` reads `?still=1` the same way.
   *
   * READ AT CALL TIME, NOT MODULE SCOPE. A `const isDev = ...` at the top of the
   * file would be inlined by the bundler and would make the guard untestable,
   * which for a guard whose whole job is "never in production" is the wrong
   * trade.
   */
  if (process.env.NODE_ENV !== 'production') {
    const forced = req.nextUrl.searchParams.get(LOCALE_QUERY);
    if (isLocale(forced)) return forced;
  }

  if (sessionLocale) return sessionLocale;

  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;

  return negotiate(req.headers.get('accept-language'));
}

/**
 * Header first, cookie second, default last. For anything downstream of
 * middleware that has a request but not a `NextRequest`.
 *
 * THE COOKIE FALLBACK IS NOT REDUNDANT. `manifest.ts` is excluded from the
 * middleware matcher — deliberately, and correctly, because gating
 * `/manifest.webmanifest` breaks Add to Home Screen and does not look like an
 * auth problem — so the header is simply not there for it. That is why I13 has
 * the manifest read the cookie.
 */
export function localeFromHeaders(
  header: string | null | undefined,
  cookie: string | null | undefined,
): Locale {
  if (isLocale(header)) return header;
  if (isLocale(cookie)) return cookie;
  return DEFAULT_LOCALE;
}

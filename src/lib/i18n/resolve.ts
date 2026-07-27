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

import { DEFAULT_LOCALE, isLocale, negotiate, negotiateOrNull, type Locale } from './locale';

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
 * Whether to render the language toggle (`LOCALE_SWITCHER`, plan §6).
 *
 * SERVER-SIDE, and it has to be: `LOCALE_SWITCHER` carries no `NEXT_PUBLIC_`
 * prefix, so inside a `'use client'` module the bundler inlines `undefined` and
 * the flag silently stops working. It lived in `LocaleSwitch.tsx` for about ten
 * minutes. The two callers are both server pages, which is the only place it is
 * meaningful.
 *
 * RENDERING ONLY. It does not change the key set, does not change the resolution
 * order, and does not gate `en` behind a 404 -- an `en-GB` browser gets English
 * with the toggle hidden, because `negotiate()` is upstream of this and stays that
 * way. A flag that changed the key set would break the type guarantee, which is
 * the one thing here worth protecting. It exists because the English readings are
 * the likeliest thing to be unfinished on launch day, and the interface work
 * should be able to land without advertising a half-written Margaret.
 *
 * NOT `=== '1'`, following `ANALYTICS_ENABLED`'s precedent in this codebase: only
 * an explicit `'0'` turns it off, so a typo shows the switcher rather than
 * silently hiding a shipped feature. The two flags default in opposite directions
 * from the same rule -- collect data rather than silently collect none, show the
 * control rather than silently hide it -- because in both cases the quiet failure
 * is the one nobody notices.
 */
export function localeSwitcherEnabled(): boolean {
  return process.env.LOCALE_SWITCHER !== '0';
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

/**
 * What locale to stamp into a `users` row at CREATION, and whether that stamp is
 * a decision (V2, roadmap VD11 / T17).
 *
 * ── WHY THIS IS NOT `localeFromHeaders` WITH AN EXTRA RETURN VALUE ────────────
 *
 * It has a third rung. `localeFromHeaders` serves callers downstream of
 * middleware, where a missing header means the matcher excluded the route and the
 * cookie is the answer; there is no `Accept-Language` left to consult because
 * middleware already consulted it. The sign-in callback is different: it runs
 * inside Google's redirect, and the raw `Accept-Language` the browser sent is
 * both present and the last honest signal available if the first two are missing.
 * Two independent signals ahead of it is what keeps §6.1's link 5 from being
 * load-bearing on its own.
 *
 * ── AND WHY `source` IS NOT DERIVABLE FROM `locale` ──────────────────────────
 *
 * `negotiate(null)` returns `'id'`. So does `negotiate('id')`. The first is the
 * absence of information and the second is a browser saying what it wants, and
 * the whole value of `users.locale_source` is telling those apart — a row stamped
 * `'negotiated'` must never be re-stamped, and a row stamped `'default'` safely
 * can be. Recording the first as `'negotiated'` would claim a negotiation that
 * never happened and quietly collapse the three-value enum back into two.
 *
 * Hence: `'default'` ONLY when no rung produced a locale we have. Every other
 * path is `'negotiated'`, including the ones that land on `id`.
 *
 * PURE, and it must stay that way — no `next/headers`, no `server-only`. The
 * caller reads the request; this decides. That split is what makes all four rungs
 * testable without a sign-in, which matters because the real thing can only be
 * exercised by going to Google and back.
 */
export function resolveForSignIn(
  headerLocale: string | null | undefined,
  cookieLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): { locale: Locale; source: 'negotiated' | 'default' } {
  if (isLocale(headerLocale)) return { locale: headerLocale, source: 'negotiated' };
  if (isLocale(cookieLocale)) return { locale: cookieLocale, source: 'negotiated' };

  /*
   * `negotiateOrNull` rather than `negotiate`, and that is the whole reason it
   * exists: `negotiate` answers `'id'` both for "the browser asked for
   * Indonesian" and for "the browser asked for nothing I have", and this is the
   * one caller in the app that must not conflate them.
   */
  const negotiated = negotiateOrNull(acceptLanguage);
  return negotiated
    ? { locale: negotiated, source: 'negotiated' }
    : { locale: DEFAULT_LOCALE, source: 'default' };
}

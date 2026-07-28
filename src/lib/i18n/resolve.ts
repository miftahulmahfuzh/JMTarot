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
/**
 * ── THE PREFIX HELPERS ARE NOT IN THIS FILE (v0.4.0 S2) ─────────────────────
 *
 * Roadmap §6.5 puts `stripLocalePrefix` / `localePath` here. They are in
 * `./prefix` instead, and the reason is `src/lib/auth/gate.ts`: it imports them
 * (contract G2) and its header says there is not a `NextRequest` or a
 * `NextResponse` anywhere in it, while this module opens with
 * `import type { NextRequest }`. This module also reads `process.env`, which is
 * the trap `localeSwitcherEnabled` below records.
 *
 * There is deliberately NO re-export: two import paths for one function is how
 * the two copies drift.
 *
 * **AND THE CHAIN BELOW IS NOT CONSULTED ON A CONTENT ROUTE.** §4.1: the URL
 * wins and is the only input there. `contentRewrite` decides that before
 * `middleware.ts` reaches this function.
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
 * ── THE LOCALE AND THE SOURCE COME FROM DIFFERENT PLACES, AND MEASUREMENT IS ──
 * ── WHAT SETTLED THAT ─────────────────────────────────────────────────────────
 *
 * The first version read header → cookie → `Accept-Language`, and called anything
 * that produced a locale a negotiation. **That is wrong, and a live sign-in proved
 * it.** `POST /api/auth/dev-session` with no `Accept-Language` at all recorded
 * `locale_source = 'negotiated'`:
 *
 *   dev:v2test   (accept-language: en-GB)   -> en / negotiated   correct
 *   dev:v2plain  (no accept-language)       -> id / negotiated   WRONG
 *
 * The mechanism is in `src/middleware.ts`, and it is not subtle once seen:
 * middleware sets `x-jmt-locale` to the RESOLVED locale on every matched request,
 * and refreshes `jmt_locale` whenever it disagrees with the request — both
 * UNCONDITIONALLY, including when it had no signal and resolved to
 * `DEFAULT_LOCALE`. So by the time a sign-in reads them, the header and the cookie
 * exist for every visitor, and **neither is evidence that anybody negotiated
 * anything.** V2's plan verified that the header is AVAILABLE on this path; it did
 * not notice that it is ALWAYS available and is itself sometimes a bare default.
 *
 * Left as written, `'default'` would be unreachable through a real sign-in and the
 * three-value enum would have collapsed to two with nothing failing — which is
 * exactly the lie T17 exists to prevent, arriving through the door T17 was not
 * watching.
 *
 * So the two answers are derived separately:
 *
 *   `locale` — header → cookie → `Accept-Language` → default. **What the visitor
 *   was actually looking at on `/login`**, which is the right thing to stamp
 *   whatever its provenance.
 *
 *   `source` — `'negotiated'` only on real evidence: `Accept-Language` names a
 *   locale we have, OR the resolved locale is not the default. The second arm is
 *   what catches a visitor who pressed the toggle before signing in — a non-default
 *   locale cannot arise from an absence.
 *
 * A pre-sign-in toggle is therefore recorded as `'negotiated'` rather than
 * `'chosen'`, which under-states it. That is deliberate and safe: only `'default'`
 * is ever re-stamped, so `'negotiated'` protects the choice just as well, and a
 * sign-in is not allowed to claim a choice — hence `'chosen'` is absent from the
 * return type.
 *
 * PURE, and it must stay that way — no `next/headers`, no `server-only`. The
 * caller reads the request; this decides. That split is what makes every rung
 * testable without going to Google and back.
 */
export function resolveForSignIn(
  headerLocale: string | null | undefined,
  cookieLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): { locale: Locale; source: 'negotiated' | 'default' } {
  /*
   * `negotiateOrNull` rather than `negotiate`, and this is the whole reason it
   * exists: `negotiate` answers `'id'` both for "the browser asked for Indonesian"
   * and for "the browser asked for nothing I have", and this is the one caller in
   * the app that must not conflate them.
   */
  const negotiated = negotiateOrNull(acceptLanguage);

  const locale = isLocale(headerLocale)
    ? headerLocale
    : isLocale(cookieLocale)
      ? cookieLocale
      : (negotiated ?? DEFAULT_LOCALE);

  const source =
    negotiated !== null || locale !== DEFAULT_LOCALE ? 'negotiated' : 'default';

  return { locale, source };
}

import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { decide, LEGACY_SESSION_COOKIE } from '@/lib/auth/gate';
import { readToken } from '@/lib/auth/token';
import { contentRewrite } from '@/lib/i18n/prefix';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_HEADER,
  resolveForMiddleware,
} from '@/lib/i18n/resolve';

/**
 * The gate. Every route needs a session except the ones `isPublic()` names.
 *
 * THIS FILE MUST STAY AT src/middleware.ts, not the repo root, because the app
 * lives under src/. At the root it is NOT AN ERROR: Next finds nothing, logs
 * nothing, and every route in the application is open. There is no symptom. If a
 * tool ever "helpfully" relocates it, the way to notice is
 * `curl -i -X POST localhost:3001/api/reading` returning anything other than 401.
 *
 * IT IMPORTS `config.ts` AND NEVER `auth.ts`. That is the whole edge/Node split:
 * `auth.ts` reaches the Postgres driver, and this function runs on the edge for
 * every request the matcher does not exclude. `config.ts`'s header explains both
 * the loud failure (a build error, which is fine) and the silent one (middleware
 * re-issues the session cookie from whatever `callbacks.jwt` returns, so a careless
 * callback there strips `uid` and `onb` on the next navigation).
 *
 * Two NextAuth initialisations with two configs is not a mistake and does not need
 * reconciling. Decoding is symmetric: it depends on AUTH_SECRET and the cookie name
 * used as the HKDF salt, not on the providers array. Middleware never handles
 * /api/auth/* -- that path is public -- so it never needs Google's client secret or
 * the Credentials provider, and bcryptjs therefore never enters the edge bundle.
 */
const { auth } = NextAuth(authConfig);

/**
 * The analytics beacon, named here only so the cookie guard below can exclude it
 * (R22).
 *
 * A literal rather than an import from `gate.ts`: that file lists the path as one
 * of nine strings inside `isPublic()` and exports none of them, and exporting one
 * for this would invite the next reader to think the guard and the allowlist are
 * the same list. They are not — `/api/locale` is public and MUST keep writing the
 * cookie, because writing it is the whole point of that route.
 */
const EVENTS_BEACON = '/api/events';

export default auth((request) => {
  const { pathname } = request.nextUrl;

  /*
   * `request.auth` is the Session that @auth/core built from the decoded cookie, so
   * this is the same narrowing `currentUser()` performs and it costs no I/O. A
   * token that fails to narrow -- no `uid`, a `uid` that is not uuid-shaped, a
   * claim set from before this release -- reads as signed out, which sends the user
   * to /login rather than into a query with `undefined` as a foreign key.
   */
  const viewer = readToken(request.auth?.user);
  const signedIn = viewer !== null;

  /*
   * ── S2: THE CONTENT PREFIX, RESOLVED BEFORE ANYTHING ELSE (S-D1/S-D2) ──────
   *
   * v0.4.0's only breach of D6, fenced to the five routes in
   * `@/lib/i18n/prefix`. Indonesian serves bare, English serves under `/en/`,
   * and a content page's language comes from its URL and from nothing else.
   *
   * **THIS RUNS FIRST, AND CONTRACT G1 IS THE REASON.** `decide()` is handed the
   * STRIPPED path, so it never sees `/en/gallery` and S1's `isPublic()` is
   * written against bare paths only. Two consequences worth knowing:
   *
   *   - `/en` rewrites to `/`, so S-D5's `pathname === '/'` clause fires for the
   *     English landing AND the signed-in-but-not-onboarded arm still redirects
   *     to `/onboarding`. Under the other ordering that arm is missed and nobody
   *     tests it.
   *   - A prefixed path that is NOT content is never stripped. `/en/history`
   *     reaches `decide()` verbatim and matches nothing. A stripping bug that
   *     made the whole app reachable under `/en/` is the worst outcome available
   *     in this release and would look like a working feature.
   */
  const content = contentRewrite(pathname, signedIn);

  /*
   * A non-canonical content address: `/id/gallery`, or a trailing slash.
   *
   * RETURNED BEFORE THE GATE ON PURPOSE, and it is safe because `contentRewrite`
   * only ever redirects when the target is a PUBLIC content path -- no gated
   * route is reachable through it. `clone()` keeps the query, so a `?utm_source`
   * survives the hop. 301 and not the 307 `NextResponse.redirect` defaults to:
   * this is a permanent statement about where the page lives.
   */
  if (content.kind === 'redirect') {
    const url = request.nextUrl.clone();
    url.pathname = content.to;
    return NextResponse.redirect(url, 301);
  }

  /*
   * W6: the one place `Accept-Language` is parsed (I10) -- FOR THE NINE APP
   * ROUTES ONLY, now.
   *
   * On a content path the URL already decided (§4.1), and calling the chain here
   * would be the bug: an `en` cookie would render `/gallery` in English, which
   * cannot be canonicalised and cannot be cached at the edge. On everything else
   * this is W6 unchanged -- the claim comes off the token decoded above, so the
   * whole chain costs no I/O and no second JWE decrypt. `viewer.loc` is D6's
   * "profile": `users.locale` is stamped into the token at sign-in and re-minted
   * by `POST /api/locale`, because reading the column per request would break the
   * roadmap's first non-negotiable.
   */
  const locale =
    content.kind === 'passthrough'
      ? resolveForMiddleware(request, viewer?.loc ?? null)
      : content.locale;

  const decision = decide({
    // Contract G1: the STRIPPED path. `bare` and `passthrough` are already bare.
    pathname: content.kind === 'rewrite' ? content.path : pathname,
    signedIn,
    onboarded: viewer?.onb === true,
  });

  const response = respond(
    request,
    decision,
    locale,
    content.kind === 'rewrite' ? content.path : null,
  );

  /*
   * Refresh the cookie only when it disagrees, so an ordinary navigation does not
   * carry a redundant Set-Cookie. This cannot run for paths outside the matcher
   * and must not: `manifest`, `cards/`, `dukuns/` and `_next/` are excluded, which
   * is precisely why `manifest.ts` reads the cookie rather than the header (I13).
   *
   * **V7: `/s/` IS EXCLUDED, AND A THIRD PARTY MUST LEAVE WITH NOTHING IN THEIR
   * JAR.** A share page's viewer is a stranger who never agreed to anything and
   * may never come back; setting a cookie on them buys a locale preference for a
   * visit that is usually one page long, and it is the difference between
   * `/privacy` §4.4 saying "we count the view" and having to say "we also set a
   * cookie". `share.viewed` carries no `session_id` for the same reason, so there
   * is nothing to correlate on either way.
   *
   * **THE HEADER IS STILL SET**, on the line above, so `await getLocale()` and
   * `await getT()` work normally on the public page and the chrome comes out in
   * the VIEWER's language. Only the write is skipped. `manifest.ts` is the
   * precedent for a path resolving locale without the cookie being refreshed for
   * it; the difference is that the manifest is outside the matcher entirely and
   * `/s/` is inside it, because it needs `decide()` to say `next`.
   *
   * **R22: `/api/events` IS EXCLUDED TOO, AND THAT CLOSES A HOLE IN THE SENTENCE
   * ABOVE RATHER THAN ADDING A NEW RULE.** The beacon is in `isPublic()` and
   * INSIDE the matcher, so `share.viewed` fired from `/s/` collected the very
   * cookie the page had just refused to set: V7's "a third party must leave with
   * nothing in their jar" was already narrower than it read, and `/privacy` §4.4
   * disagreed with the wire. Two plans found the two halves independently. The
   * beacon needs no locale -- it writes rows, it renders nothing -- so there is
   * nothing to trade.
   *
   * **S2/S-D10: EVERY CONTENT RESPONSE IS EXCLUDED TOO, AND FOR A SECOND REASON
   * AS STRONG AS THE FIRST.** `content.kind !== 'passthrough'` covers `/gallery`,
   * `/en/gallery`, the 44 lore pages, the blog and the signed-out `/`:
   *
   *   1. THE PRIVACY REASON, which is V7's verbatim. `/privacy` §4.4 is honest
   *      only because a public page sets nothing, and v0.4.0 multiplies that
   *      surface from one route to forty-odd. Reading a blog post must also not
   *      silently change the language of a signed-in user's app.
   *   2. THE MECHANICAL REASON. **A `Set-Cookie` makes a response uncacheable at
   *      the edge**, and these are the pages whose TTFB a crawler measures. The
   *      whole point of pinning the locale from the URL is that the response is
   *      invariant, and a cookie is the one header that would undo it.
   *
   * A signed-in visitor on `/` takes the `passthrough` arm (S-D5: the root is
   * the app for them), so their cookie behaviour is exactly as it was.
   */
  if (
    content.kind === 'passthrough' &&
    !pathname.startsWith('/s/') &&
    pathname !== EVENTS_BEACON &&
    request.cookies.get(LOCALE_COOKIE)?.value !== locale
  ) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });
  }

  /*
   * Evict the legacy cookie.
   *
   * Anyone signed in to the current deployment is carrying a `jmtarot_session`
   * that nothing will ever read again. Left alone it sits in the jar for thirty
   * days. Three lines, and it is the only remaining mention of that name anywhere
   * in the app.
   *
   * NOT reached on the 301 branch above, deliberately: deleting a cookie on a
   * redirect is a `Set-Cookie` on a response we want cacheable, and the next
   * request through the matcher evicts it anyway.
   */
  if (request.cookies.has(LEGACY_SESSION_COOKIE)) {
    response.cookies.delete(LEGACY_SESSION_COOKIE);
  }

  return response;
});

/**
 * Translate a decision into a response. The only part of the gate that knows what
 * a NextResponse is; the reasoning is in `gate.decide()`, which Vitest owns.
 *
 * `rewriteTo` is S2's: the bare route a `/en/…` request should render, or `null`
 * for every other request.
 */
function respond(
  request: Parameters<Parameters<typeof auth>[0]>[0],
  decision: ReturnType<typeof decide>,
  locale: string,
  rewriteTo: string | null,
): NextResponse {
  switch (decision.kind) {
    case 'next': {
      /*
       * `{ request: { headers } }` IS THE ONLY FORM THAT MUTATES WHAT DOWNSTREAM
       * SERVER COMPONENTS SEE -- for `NextResponse.next()` AND for
       * `NextResponse.rewrite()`. Setting a header on the plain response does
       * nothing for RSC, and the failure is silent: `getLocale()` falls through
       * to the `jmt_locale` cookie and appears to work, so the bug shows up as a
       * locale that lags one navigation behind.
       *
       * **ON THE REWRITE BRANCH THAT SILENCE IS WORSE, AND IT IS WHY S-D2 SAYS
       * SO IN CAPITALS.** `/en/gallery` would render the right route with no
       * `x-jmt-locale` at all, so the language would come from the VIEWER's
       * cookie: English for whoever is testing it, Indonesian for the next
       * stranger, on a page whose canonical says it is English. Nothing throws
       * and no test in this project's unit suite can see it. The check that
       * catches it is the live one -- `curl` `/gallery` carrying
       * `Cookie: jmt_locale=en` and reading `<html lang>`.
       */
      const headers = new Headers(request.headers);
      headers.set(LOCALE_HEADER, locale);

      if (rewriteTo === null) return NextResponse.next({ request: { headers } });

      const url = request.nextUrl.clone();
      url.pathname = rewriteTo;
      return NextResponse.rewrite(url, { request: { headers } });
    }

    /*
     * An API caller wants a status code, not a login page. Returning the HTML
     * redirect makes a fetch() look like it succeeded and then die on JSON
     * parsing, which is a confusing way to learn the cookie expired. That used to
     * be true of one status code and is now true of two: 401 means "sign in
     * again", 403 means "finish onboarding", and they lead to different screens.
     */
    case 'json':
      return NextResponse.json({ error: decision.error }, { status: decision.status });

    case 'redirect': {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      // Drop the original query FIRST, so a stale parameter from the request
      // cannot ride along into the login page.
      url.search = '';
      if (decision.to === '/login') {
        /*
         * Where to return to after signing in. The login page validates this
         * before handing it to signIn() -- Auth.js's default redirect callback
         * already restricts to same-origin, but an open redirect on a login page
         * is worth two checks rather than one.
         */
        url.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
      }
      return NextResponse.redirect(url);
    }
  }
}

export const config = {
  /*
   * Static assets are excluded here rather than in isPublic, because middleware
   * should not run for them at all.
   *
   * Getting this wrong is expensive to diagnose: gating /cards or
   * /manifest.webmanifest does not look like an auth problem, it looks like
   * missing artwork and a broken Add to Home Screen.
   *
   * `cards/` is excluded TWICE OVER, and the second reason is not obvious from
   * either file alone. CLAUDE.md's iframe-harness technique puts a scratch HTML
   * file under `public/cards/` specifically so it lands outside this matcher; that
   * harness is how the two worst bugs in this project were found, and it is the
   * project's only way to drive its own UI without a WebDriver, since Chromium
   * cannot launch in this WSL image. Narrowing the matcher would remove it.
   *
   * ── `wallpapers/` JOINED THE LIST IN v0.4.0, AND §6.2 SAID IT WOULD NOT ─────
   *
   * That section read "the matcher itself should not need to change; if a plan
   * thinks it does, that is a flag". S5 raised the flag and was right, and
   * reconciliation R7 verified it against this regex: `wallpapers/` was absent,
   * so middleware RAN for `/wallpapers/the-moon-phone.jpg`, nothing in
   * `isPublic()` matched, and **a signed-out stranger was 302'd to `/login` on
   * the one asset class S5 exists to hand to strangers.**
   *
   * **THE FIX IS HERE AND NOT IN `isPublic()`**, which is the non-obvious half.
   * Adding `/wallpapers` to the allowlist also returns 200, but it leaves
   * middleware running -- so the locale-cookie write fires and puts a
   * `Set-Cookie` on a ~550KB static response, making it edge-uncacheable. That
   * is a direct S-D10 breach on the response where CDN caching matters most.
   * `cards/` and `dukuns/` are here for the same reason, and this entry lands
   * before S5's files do so the pipeline cannot ship into a gated path.
   */
  matcher: [
    '/((?!_next/|cards/|dukuns/|wallpapers/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
  ],
};

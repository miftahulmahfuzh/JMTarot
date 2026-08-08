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

/**
 * The marker the inner handler leaves on a public content response, and the outer
 * wrapper below deletes along with every `Set-Cookie` on it.
 *
 * ── WHY A MARKER AND NOT AN `if` IN ONE FUNCTION ─────────────────────────────
 *
 * **`auth()` APPENDS ITS OWN COOKIES AFTER OUR HANDLER HAS RETURNED**, so nothing
 * inside that handler can prevent them. Read it in
 * `node_modules/next-auth/lib/index.js`: the wrapper builds
 * `new Response(response?.body, response)` from whatever we returned and then
 * `finalResponse.headers.append('set-cookie', …)` for every cookie its internal
 * session request produced. On a request carrying neither, that is
 * `authjs.csrf-token` and `authjs.callback-url`, minted fresh — which is why
 * `/privacy` §4.4's "a third party leaves with nothing in their jar" was false on
 * `/s/` for a whole release and would have been false on forty-odd public pages.
 *
 * The outer wrapper is the only place downstream of that append. It cannot decide
 * on its own whether the response was a content response, because the one path
 * where `contentRewrite`'s answer depends on the session is `/` (S-D5) and
 * deciding would mean a second JWE decrypt that can disagree with the first. So
 * the handler that already knows says so, in a header nobody outside this file
 * ever sees.
 */
const STRIP_COOKIES = 'x-jmt-strip-cookies';

const gate = auth((request) => {
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
    const redirect = NextResponse.redirect(url, 301);
    // A 301 carrying a cookie is a 301 no CDN will cache, and this one is a
    // permanent statement about a public address.
    redirect.headers.set(STRIP_COOKIES, '1');
    return redirect;
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

  /*
   * ── S-D10, THE OTHER HALF: NOT ONE COOKIE, NOT OURS AND NOT AUTH.JS's ──────
   *
   * The guard above only decides what WE write. `auth()` appends
   * `authjs.csrf-token` and `authjs.callback-url` after we return, so a public
   * content response left this file with an empty jar and reached the visitor
   * with two cookies in it. Both halves of S-D10 were still broken:
   *
   *   1. **THE PRIVACY HALF.** A stranger who never agreed to anything left with
   *      two cookies, and `/privacy` §4.4 is honest only because they do not.
   *   2. **THE MECHANICAL HALF, WHICH IS THE ONE THAT LOOKED FINE.** A
   *      `Set-Cookie` makes a response uncacheable at the edge **whatever
   *      `Cache-Control` says**, so `next.config.ts`'s `s-maxage` on the content
   *      routes was buying nothing at all. The header was measured, correct, and
   *      inert.
   *
   * **NOTHING ON A CONTENT PATH NEEDS EITHER COOKIE.** The csrf token is read by
   * `POST /api/auth/*`, which is a `passthrough` path and keeps it; the
   * callback-url is written again by `/login`, which is also `passthrough`. A
   * stranger clicking from `/blog` into `/login` mints both there, one request
   * later, exactly as they do today for a visitor arriving cold.
   *
   * **THE ONE THING IT COSTS, AND IT IS DELIBERATE:** the sliding session cookie
   * is not re-issued on a content response either, so reading `/blog` for a day
   * does not extend a signed-in querent's 24-hour idle timeout. Browsing public
   * content is not app activity, the 30-day absolute cap is untouched, and the
   * alternative is a `Set-Cookie` on every cacheable page in the product to keep
   * a timer alive for a person who is reading a blog post.
   */
  if (content.kind !== 'passthrough') response.headers.set(STRIP_COOKIES, '1');

  return response;
});

/**
 * The outer wrapper, and the only reason it exists is the block above.
 *
 * `auth()` appends its cookies to a response built from ours, so this is the one
 * position downstream of that. It deletes every `Set-Cookie` on a response the
 * inner handler marked, and then deletes the marker — which must not be observable
 * on the wire, or it is a header that tells a reader something about our internals
 * on the pages most likely to be read by a stranger.
 *
 * `Headers.delete('set-cookie')` removes every value, which is what is wanted: on
 * a marked response the correct number of cookies is zero. The middleware
 * directives Next reads (`x-middleware-next`, `x-middleware-rewrite`) are
 * untouched, and the rewrite is verified on the wire rather than trusted.
 */
export default async function middleware(
  request: Parameters<typeof gate>[0],
  event: Parameters<typeof gate>[1],
) {
  const response = await gate(request, event);
  if (response instanceof Response && response.headers.get(STRIP_COOKIES) !== null) {
    response.headers.delete('set-cookie');
    response.headers.delete(STRIP_COOKIES);
  }
  return response;
}

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
   *
   * ── `readers/` JOINED IN v0.7.0 (F4, `F4-18`, and `R7` again) ──────────────
   *
   * The three reader avatars, `tools/make_avatars.py`'s output. Same rule as
   * `wallpapers/` with one difference that makes it worse rather than better:
   * these are fetched by a SIGNED-IN querent, on every render of a room that may
   * hold hundreds of bubbles, so middleware running here would write the locale
   * cookie onto a static image PER MESSAGE. `/readers` in `isPublic()` would also
   * return 200 and would not stop any of that; **only the matcher does.**
   */
  matcher: [
    '/((?!_next/|cards/|dukuns/|readers/|wallpapers/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
  ],
};

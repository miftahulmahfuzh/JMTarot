import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { decide, LEGACY_SESSION_COOKIE } from '@/lib/auth/gate';
import { readToken } from '@/lib/auth/token';
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

  const decision = decide({
    pathname,
    signedIn: viewer !== null,
    onboarded: viewer?.onb === true,
  });

  /*
   * W6: the one place `Accept-Language` is parsed (I10).
   *
   * The claim comes off the token we have already decoded above, so the whole
   * chain costs no I/O and no second JWE decrypt. `viewer.loc` is D6's "profile":
   * `users.locale` is stamped into the token at sign-in and re-minted by
   * `POST /api/locale`, because reading the column per request would break the
   * roadmap's first non-negotiable.
   */
  const locale = resolveForMiddleware(request, viewer?.loc ?? null);
  const response = respond(request, decision, locale);

  /*
   * Refresh the cookie only when it disagrees, so an ordinary navigation does not
   * carry a redundant Set-Cookie. This cannot run for paths outside the matcher
   * and must not: `manifest`, `cards/`, `dukuns/` and `_next/` are excluded, which
   * is precisely why `manifest.ts` reads the cookie rather than the header (I13).
   */
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
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
   */
  if (request.cookies.has(LEGACY_SESSION_COOKIE)) {
    response.cookies.delete(LEGACY_SESSION_COOKIE);
  }

  return response;
});

/**
 * Translate a decision into a response. The only part of the gate that knows what
 * a NextResponse is; the reasoning is in `gate.decide()`, which Vitest owns.
 */
function respond(
  request: Parameters<Parameters<typeof auth>[0]>[0],
  decision: ReturnType<typeof decide>,
  locale: string,
): NextResponse {
  switch (decision.kind) {
    case 'next': {
      /*
       * `NextResponse.next({ request: { headers } })` IS THE ONLY FORM THAT
       * MUTATES WHAT DOWNSTREAM SERVER COMPONENTS SEE. Setting a header on the
       * plain response does nothing for RSC, and the failure is silent:
       * `getLocale()` falls through to the cookie and appears to work, so the
       * bug only shows up as a locale that lags one navigation behind.
       */
      const headers = new Headers(request.headers);
      headers.set(LOCALE_HEADER, locale);
      return NextResponse.next({ request: { headers } });
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
   */
  matcher: [
    '/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
  ],
};

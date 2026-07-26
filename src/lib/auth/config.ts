/**
 * The shared Auth.js configuration. EDGE-SAFE, and that is a hard constraint.
 *
 * THIS FILE IS IMPORTED BY src/middleware.ts, so anything it pulls in -- however
 * transitively -- lands in the edge bundle. **It must never import `@/lib/db`.**
 * The DB-touching callbacks live in `auth.ts`, which composes on top of this and
 * is only ever reached from a Node route handler.
 *
 * That rule has a loud failure and a silent one, and the silent one is why this
 * comment is long.
 *
 * THE LOUD ONE. A `@/lib/db/client` import here reaches `postgres`, which reaches
 * `node:net`/`node:tls`/`node:dns`, and the build dies with "the edge runtime does
 * not support Node.js 'net' module". Fine -- `npm run build` catches it. What is
 * NOT fine is making that error go away with `export const runtime = 'nodejs'` on
 * the middleware. Next 16 supports Node middleware, so the build would pass and a
 * Postgres pool would be instantiated inside a function that runs on every request
 * the matcher does not exclude. The gate exists to be cheap.
 *
 * It is tempting to think a DB import is safe because the write is guarded by
 * `trigger === 'signIn'`. That guard is a RUNTIME guard and the import is STATIC:
 * the bundler pulls `pg` into the edge chunk whether or not the branch is taken.
 * The premise is also false. Traced in the installed package:
 * `next-auth/lib/index.js#handleAuth` -> `getSession()` -> `Auth(request, config)`
 * -> `@auth/core/lib/actions/session.js`, which on the JWT path calls
 * `callbacks.jwt({ token })` UNCONDITIONALLY. There is no "only on sign-in"
 * anywhere in this system.
 *
 * ============================ THE SILENT ONE =============================
 * THE RULE, AND IT IS A RULE: `config.ts` defines exactly ONE `jwt` callback, it
 * is PURE, it takes no arguments other than `token`, and it returns either the
 * SAME `token` object or `null`. Additions happen in `auth.ts`, which composes on
 * top.
 *
 * Why: five lines below the `callbacks.jwt` call above,
 * `@auth/core/lib/actions/session.js` re-encodes the token and pushes fresh
 * `Set-Cookie` headers, and `next-auth/lib/index.js#handleAuth` copies them onto
 * the middleware response. **Middleware re-issues the session cookie on every
 * matched request, from whatever this callback returns.** The default callback is
 * `({ token }) => token`, which is why a naive split works at all. But a
 * plausible-looking addition here --
 *
 *     jwt({ token, user }) { return { ...token, name: user?.name } }
 *
 * -- returns a NEW object, so every claim `auth.ts` added is dropped from the
 * cookie on the user's next page navigation. The symptom: sign-in works, the
 * first page works, then `requireUser()` starts returning null (or worse, a user
 * whose `id` is `undefined` that reaches a SQL query) with nothing in any log.
 * Nobody finds this quickly.
 * =========================================================================
 */
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';
import { absoluteCapExpired, nowSeconds } from './token';
import { sessionMaxAgeSeconds } from './ttl';

/**
 * Whether @auth/core will use the `__Secure-` cookie prefix.
 *
 * Mirrors its own rule (`useSecureCookies` defaults to whether the resolved URL
 * is https) rather than guessing, because `dev-session`'s JWE has to be encrypted
 * with the cookie name as the HKDF salt -- a name mismatch produces a cookie that
 * decrypts to nothing, which reads exactly like a wrong secret.
 */
const secureCookies =
  (process.env.AUTH_URL ?? '').startsWith('https://') ||
  (!process.env.AUTH_URL && !!process.env.VERCEL);

/** Needed by anything that has to encode or clear the cookie by hand. */
export const SESSION_COOKIE_NAME = secureCookies
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

/**
 * The one pure check, exported so `auth.ts` can run it first and so a test can
 * reach it without constructing a NextAuth instance.
 *
 * Returning null makes @auth/core clean the session cookies -- verified in
 * `lib/actions/session.js`, the `else` branch of `if (token !== null)`.
 *
 * ANY FURTHER PURE CHECK GOES INSIDE THIS FUNCTION, not into the callback body
 * below. `auth.ts` calls this function by name, so a check added here is
 * inherited by the Node side automatically; one added to the callback body would
 * run on the edge and silently not run on sign-in.
 */
export function enforceAbsoluteCap(token: JWT): JWT | null {
  if (absoluteCapExpired(token, nowSeconds())) return null;
  return token; // THE SAME OBJECT. See the header.
}

export const authConfig = {
  /*
   * Env vars named STATICALLY rather than left to Auth.js's dynamic
   * `AUTH_${ID}_ID` lookup, which reads `process.env` as a value passed around
   * and so cannot be inlined by Next's build-time substitution. On the Node side
   * either works; this is insurance for the edge side, and it costs one line.
   *
   * `authorization.params.scope` is deliberately ABSENT. @auth/core's default for
   * an OIDC provider is literally `openid profile email`, which is exactly the
   * three non-sensitive scopes registered in the Google console -- and those being
   * non-sensitive is why this app needs no Google verification review. Writing
   * the scope out by hand only creates a way to drift from what is registered.
   *
   * `access_type: 'offline'` and `prompt: 'consent'` are likewise absent on
   * purpose. We have no use for offline access to a Google account, asking for it
   * makes the consent screen worse, and a Testing-mode app has its refresh tokens
   * expired by Google after 7 days -- a failure mode worth simply not having.
   */
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],

  /*
   * `maxAge` is read HERE, which both halves of the edge/Node split import, so it
   * matches by construction. Do not override it in `auth.ts`.
   *
   * Do not set `jwt.maxAge` either: @auth/core/lib/init.js already defaults it to
   * `session.maxAge`, and setting both is two places to forget.
   *
   * This is an IDLE timeout and it SLIDES. `session.updateAge` is documented as
   * the refresh throttle but is only honoured on the database strategy; on the JWT
   * path `lib/actions/session.js` unconditionally recomputes the expiry and
   * re-issues the cookie. Setting `updateAge` and expecting a hard cap does not
   * work -- that is what SESSION_ABSOLUTE_TTL_DAYS is for.
   */
  session: {
    strategy: 'jwt',
    maxAge: sessionMaxAgeSeconds(process.env.SESSION_TTL_HOURS),
  },

  /*
   * BOTH entries, and `error` is not optional in practice.
   *
   * `signIn` alone is not enough, which we learned the hard way: a wrong
   * AUTH_GOOGLE_SECRET makes the token exchange fail with `CallbackRouteError`,
   * and @auth/core routes that to `pages.error`. With `error` unset it falls back
   * to Auth.js's own page, which is unstyled, in English, says "There is a problem
   * with the server configuration", and answers with a 500. That is the wrong
   * thing to show a querent for any reason, and there are several -- an expired
   * secret and a revoked client both land there too.
   *
   * Pointing both at /login means every failure arrives as `?error=<code>` on a
   * page that renders one Indonesian sentence and offers the button again.
   */
  pages: { signIn: '/login', error: '/login' },

  callbacks: {
    jwt({ token }) {
      return enforceAbsoluteCap(token);
    },

    /**
     * Copy the app's claims from the token onto the session object.
     *
     * THIS LIVES HERE, IN THE SHARED CONFIG, AND NOT IN auth.ts. It is pure -- it
     * moves fields between two objects and touches nothing -- so it is edge-safe,
     * and it MUST be edge-safe, because middleware reads `request.auth.user` and
     * narrows it with `readToken()`.
     *
     * Putting it in `auth.ts` alone produces an infinite redirect loop, which is
     * how this comment came to be written. Middleware's `NextAuth(authConfig)`
     * instance would then have no session callback, so `request.auth.user` carried
     * only Auth.js's defaults -- `name`, `email`, `image`, no `uid` -- `readToken`
     * returned null, and middleware concluded the user was signed out and
     * redirected `/` to `/login`. `/login` meanwhile saw a perfectly good session
     * and redirected back to `/`. Neither side logged anything; the only symptom
     * was ERR_TOO_MANY_REDIRECTS after a sign-in that had actually succeeded.
     *
     * The general rule the loop teaches: **the two NextAuth instances must agree
     * about what a session contains.** `config.ts` is the only place that can
     * guarantee it, because both of them import this object.
     */
    session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, {
          uid: token.uid,
          sub: token.sub,
          onb: token.onb,
          loc: token.loc,
        });
      }
      return session;
    },
    /*
     * NO `authorized` CALLBACK, deliberately.
     *
     * The gate is `decide()` in middleware, where it can build a `?callbackUrl`
     * and distinguish 401 from 403. Splitting the routing decision across two
     * mechanisms -- some of it here, some of it there -- would be worse than
     * either one alone, because the next person to change the public path set
     * would have no way to know there was a second place to look.
     */
  },
} satisfies NextAuthConfig;

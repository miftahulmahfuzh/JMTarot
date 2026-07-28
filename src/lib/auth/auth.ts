/**
 * The Node half of the auth configuration. NEVER import this from middleware.
 *
 * It reaches `@/lib/db/client`, which begins with `import 'server-only'`, so an
 * accidental import from a client component fails at build rather than shipping a
 * connection string to a browser. `config.ts` is the half middleware may see; see
 * that file's header for why the split exists and what breaks silently without it.
 *
 * WHERE THE DATABASE IS TOUCHED, AND WHY THAT OBEYS THE LATENCY RULE. Roadmap §6
 * says the auth path does not touch the database. Two paths, not one:
 *
 *   The SIGN-IN path runs at most once per user per SESSION_TTL_HOURS, inside a
 *   round trip that already went to Google's consent screen and back. One indexed
 *   write is invisible in it.
 *
 *   The REQUEST path -- every page render, every POST /api/reading, every
 *   middleware invocation -- reads `uid` and `onb` out of the decoded cookie and
 *   touches nothing. That is the property §6 protects and it is preserved exactly.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { Locale } from '@/data/types';
import { DEFAULT_LOCALE } from '@/lib/i18n/locale';
import { LOCALE_COOKIE, LOCALE_HEADER, resolveForSignIn } from '@/lib/i18n/resolve';
import { db } from '@/lib/db/client';
import { readSessionFacts, upsertUserOnSignIn } from '@/lib/db/queries/profile';
import { hit } from '@/lib/ratelimit';
import { authConfig, enforceAbsoluteCap } from './config';
import { maySignIn, nowSeconds, readExternalSub, readUid } from './token';
import { absoluteCapSeconds } from './ttl';
import { verifyCredentials } from './users';

/**
 * The dev-only password path (roadmap D2, as amended by reconciliation R10).
 *
 * BOTH conditions, and the second is the belt to the first's braces: Vercel builds
 * -- including previews -- run as `NODE_ENV=production`, so this is inoperative in
 * any deployment even if someone sets the flag in the dashboard by accident.
 */
const devPasswordLogin =
  process.env.DEV_PASSWORD_LOGIN === '1' && process.env.NODE_ENV !== 'production';

/**
 * Google sends `email_verified` as a JSON boolean, but tolerate the string form.
 *
 * Not defensiveness for its own sake: this value is the only thing standing
 * between "anyone can create a Google account claiming an address" and
 * `users.email`, which support and every "signed in as" line will trust. A
 * provider quirk must not be able to turn the check into a no-op, in either
 * direction -- so it is normalised here and compared strictly in `maySignIn`.
 */
function emailVerified(profile: unknown): boolean {
  if (typeof profile !== 'object' || profile === null) return false;
  const raw = (profile as { email_verified?: unknown }).email_verified;
  return raw === true || raw === 'true';
}

/**
 * What language this sign-in's browser asked for, and whether it asked (VD11).
 *
 * ── THE CHAIN, AND WHY THERE ARE THREE RUNGS AND NOT ONE ─────────────────────
 *
 * Verified against the files rather than assumed, because the whole fix rests on
 * these reads working inside @auth/core's jwt callback:
 *
 *   1. `src/middleware.ts`'s matcher does not exclude `/api/auth/callback/google`,
 *      and `gate.isPublic()` returns true for `/api/auth/`, so the request is a
 *      `NextResponse.next({ request: { headers } })` with `x-jmt-locale` set.
 *   2. Middleware sets `jmt_locale` on the response whenever it disagrees with the
 *      request -- including on the redirect that sends a signed-out visitor from `/`
 *      to `/login` -- so by the time anyone reaches a sign-in button the cookie
 *      exists. It is `sameSite: 'lax'` and Google's callback is a top-level GET
 *      navigation, which is exactly what `lax` permits.
 *   3. `Accept-Language` arrives from the browser regardless of either of the above.
 *
 * TWO INDEPENDENT SIGNALS AHEAD OF THE THIRD, so no single link is load-bearing. If
 * `headers()` throws -- @auth/core stepping outside the request's async context --
 * this returns `'default'` rather than failing the sign-in, which is the whole point
 * of `'default'` being an honest value rather than a synonym for Indonesian.
 *
 * **MEASURED 2026-07-27, BECAUSE IT IS THE ONE CLAIM HERE THAT CANNOT BE
 * UNIT-TESTED: `headers()` AND `cookies()` DO RESOLVE INSIDE THIS CALLBACK.** Driven
 * through the Credentials provider -- the same jwt callback the Google path runs --
 * with `accept-language: en-GB`, the created row was `locale = 'en'`,
 * `locale_source = 'negotiated'`. Had the read thrown it would have been
 * `id`/`default`, so the result is its own negative control. V2's plan sketched an
 * `AsyncLocalStorage` wrapper around `handlers.GET/POST` as the fallback if this
 * turned out false; it is not needed and was not built.
 *
 * NOT `getLocale()`, which is React-`cache()`d and belongs to a render.
 */
async function negotiatedLocaleForSignIn(): Promise<{
  locale: Locale;
  source: 'negotiated' | 'default';
}> {
  try {
    const { headers, cookies } = await import('next/headers');
    const [h, jar] = await Promise.all([headers(), cookies()]);
    return resolveForSignIn(
      h.get(LOCALE_HEADER),
      jar.get(LOCALE_COOKIE)?.value,
      h.get('accept-language'),
    );
  } catch (err) {
    /*
     * IT LOGS, AND THE FIRST DRAFT DID NOT. A silent fallback here is
     * indistinguishable in the data from "no visitor has ever had a browser locale":
     * both produce a table full of `'default'`. That is the shape of failure this
     * whole workstream keeps finding, so the one case where the mechanism is broken
     * rather than merely unexercised has to say so.
     *
     * The error's CLASS only, per the rule everywhere else in this codebase. Nothing
     * here holds querent text, but the habit is worth more than the exception.
     */
    console.error('sign-in could not read the negotiated locale', {
      name: err instanceof Error ? err.name : typeof err,
    });
    return { locale: DEFAULT_LOCALE, source: 'default' };
  }
}

/**
 * The SQLSTATE, the error's class, and nothing else.
 *
 * ── THIS IS THE SAME RULE AS `flush.ts` AND THE MODERATION PATH, AND THE
 *    SIGN-IN PATH WAS THE ONE PLACE STILL BREAKING IT ─────────────────────────
 *
 * CLAUDE.md's Traps section says "never log a driver error" twice, for
 * `flush.ts` (whose bound parameters include `readings.question`) and for
 * `moderation/log.ts` (same reason). `upsertUserOnSignIn`'s statement binds
 * **nine** parameters and four of them identify a person: the Google `sub`, the
 * email, the display name and the avatar URL.
 *
 * NOT HYPOTHETICAL. Read out of a real production log on 2026-07-28, while
 * diagnosing the missing `locale_source` migration:
 *
 *     sign-in upsert failed; refusing the session Error: Failed query: ...
 *       params: 105739332935278811728,105739332935278811728,
 *               <address>@gmail.com,true,<full name>,
 *               https://lh3.googleusercontent.com/a/<id>=s96-c,en,negotiated,30
 *
 * So every failed sign-in wrote the querent's email and real name into Vercel's
 * log -- a different audience and a different retention story from the column
 * they were meant to live in, which is the exact wording `/privacy` relies on.
 * The failure that exposed it was a schema drift, i.e. the case where EVERY
 * sign-in fails, so the leak scales with the outage.
 *
 * `sqlstate` is duplicated rather than imported: `flush.ts` is an analytics
 * module that reaches `@/lib/db/client` through a dynamic import to stay out of
 * the auth graph, and importing it here to save six lines would drag that whole
 * module into the edge-adjacent auth bundle. The comment is the shared thing,
 * not the code.
 *
 * Development still prints the error, for the reason `flush.ts` gives: there is
 * nobody to leak it to, and a stack trace is the difference between a
 * five-minute fix and an hour. `JSON.stringify` because Next's dev logger
 * renders a bare object argument as `{}`.
 */
function logSignInFailure(where: string, err: unknown): void {
  try {
    const kind = err instanceof Error ? err.name : typeof err;
    const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
    const code = typeof cause?.code === 'string' ? cause.code : undefined;
    const detail = JSON.stringify({ where, sqlstate: code, kind });
    if (process.env.NODE_ENV === 'production') {
      console.error('[auth] sign-in failed; refusing the session', detail);
    } else {
      console.error('[auth] sign-in failed; refusing the session', detail, err);
    }
  } catch {
    /* a logger that throws must not take the sign-in with it */
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,

  providers: [
    ...authConfig.providers,
    /*
     * A Credentials provider rather than the old hand-rolled /api/auth/login
     * route, which is deleted (R10). The route minted a `jmtarot_session` cookie
     * -- a plain signed JWT -- while the app now reads an encrypted JWE with a
     * completely different claim set. Keeping it behind a flag would mean the
     * application accepts TWO session formats and middleware has to try both,
     * which is how holes happen.
     *
     * It is also self-defeating: a dev login that produces a different kind of
     * session stops exercising the sign-in upsert, the token shape, the
     * onboarding flag and the gate. Every bug in the paths that matter would be
     * invisible locally and appear only in production. This provider runs the
     * same jwt callback, the same upsert, and produces the same cookie.
     */
    ...(devPasswordLogin
      ? [
          Credentials({
            name: 'Development password',
            credentials: {
              username: { label: 'Username', type: 'text' },
              password: { label: 'Password', type: 'password' },
            },
            async authorize(raw) {
              const username = typeof raw?.username === 'string' ? raw.username : '';
              const password = typeof raw?.password === 'string' ? raw.password : '';
              if (!username || !password) return null;

              let ok: string | null;
              try {
                ok = await verifyCredentials(username, password);
              } catch (err) {
                // parseUsers throws when AUTH_USERS is missing or malformed. That
                // is a local setup fault, not a bad password, and it must say so
                // rather than looking like a typo in the password.
                console.error('DEV_PASSWORD_LOGIN is on but AUTH_USERS is unusable', err);
                return null;
              }
              if (!ok) return null;

              /*
               * A SYNTHETIC SUB. `dev:` cannot collide with a real Google `sub`,
               * which is a decimal string, and the prefix makes dev rows greppable
               * in a local database (`delete from users where google_sub like
               * 'dev:%'`). It flows into the same jwt callback, the same upsert and
               * the same `users.google_sub` column, so a dev sign-in produces a
               * real uuid and a real 548-byte JWE.
               *
               * `users.email` is `not null`, hence `@localhost`.
               */
              return { id: `dev:${ok}`, name: ok, email: `${ok}@localhost` };
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    ...authConfig.callbacks,

    /**
     * Pure refusal only. No I/O.
     *
     * This is the one check that can be made before any round trip, and an
     * unverified Google email is not an identity. Refusing here costs nothing.
     */
    signIn({ account, profile }) {
      // The dev provider carries no OIDC profile; `verifyCredentials` already ran.
      if (account?.provider === 'credentials') return true;
      return maySignIn({ emailVerified: emailVerified(profile) });
    },

    async jwt({ token, user, account, trigger, profile }) {
      /*
       * COMPOSITION, NOT REPLACEMENT. The edge config's pure rules run first, by
       * name, so a check added there is inherited here rather than silently
       * skipped on the sign-in path.
       */
      const carried = enforceAbsoluteCap(token);
      if (!carried) return null;

      if (trigger === 'signIn') {
        /*
         * `account.providerAccountId`, and NEVER `token.sub`. See
         * `readExternalSub`'s comment: @auth/core overwrites `user.id` -- and
         * therefore `token.sub` -- with a fresh `crypto.randomUUID()` on every
         * sign-in, on purpose. Reading `token.sub` here inserted a new `users` row
         * every time anyone signed in, with no error anywhere.
         */
        const googleSub = readExternalSub(account);
        const email = user?.email ?? carried.email;
        if (!googleSub || typeof email !== 'string' || email.length === 0) {
          console.error('sign-in produced no stable subject or no email; refusing');
          return null;
        }

        /*
         * THE ONE PLACE IN THIS APP WHERE A DATABASE ERROR MUST NOT BE SWALLOWED.
         * A session with no `uid` is worse than no session at all: every
         * downstream write would take `undefined` as a foreign key and produce
         * rows attached to nobody. Log it and kill the sign-in.
         *
         * The write lives here rather than in `callbacks.signIn` because `signIn`
         * returns a boolean and gives no way to carry the resulting `users.id`
         * into the token -- you would have to write there and read back here, two
         * round trips for one row.
         */
        /*
         * VD11. THE ONE MOMENT THE BROWSER'S LANGUAGE IS STILL VISIBLE.
         *
         * After this callback returns, the `loc` claim is first in the resolution
         * chain forever -- so if the row takes the column default here, an `en-GB`
         * visitor who negotiated English on `/login` is snapped to Indonesian on
         * their next navigation and there is nothing left to recover it from.
         */
        const negotiated = await negotiatedLocaleForSignIn();

        let row: Awaited<ReturnType<typeof upsertUserOnSignIn>>;
        try {
          row = await upsertUserOnSignIn(db, {
            googleSub,
            email,
            emailVerified: account?.provider === 'credentials' || emailVerified(profile),
            displayName: user?.name ?? null,
            avatarUrl: user?.image ?? null,
            negotiatedLocale: negotiated.locale,
            localeSource: negotiated.source,
          });
        } catch (err) {
          logSignInFailure('upsert', err);
          return null;
        }

        if (row.outcome === 'restored' || row.outcome === 'recreated') {
          // Worth a line in the log: both mean the user had asked to be erased.
          console.warn(`sign-in ${row.outcome} account for ${googleSub}`);
        }

        /*
         * Overwrite `sub` with the REAL external identity, replacing the random
         * uuid @auth/core put there. Nothing on the JWT path reads `sub` -- there is
         * no adapter -- so this is safe, and it makes the claim mean what
         * `JmtarotToken.sub` says it means. Without it, `currentUser().googleSub`
         * would hand every caller a uuid that changes on each sign-in.
         */
        carried.sub = googleSub;
        carried.uid = row.id;
        carried.onb = row.onboardingComplete;
        carried.loc = row.locale;

        /*
         * `picture` is stripped, not merely unused. Measured: 548 B of cookie
         * without it against 676 B with it, on every request. Nothing in the
         * design renders a user avatar (reconciliation R21 settled that
         * deliberately, since keeping it would also cost a CSP `img-src`
         * exception to lh3.googleusercontent.com for a decorative element), and
         * `users.avatar_url` still stores the value.
         */
        carried.picture = null;

        /*
         * Set ONCE, here, and never refreshed -- that is what makes it absolute.
         * Checked on the edge on every request by `enforceAbsoluteCap`. Zero means
         * the cap is disabled, in which case the claim is simply absent.
         */
        const cap = absoluteCapSeconds(process.env.SESSION_ABSOLUTE_TTL_DAYS);
        if (cap > 0) carried.abs = nowSeconds() + cap;

        return carried;
      }

      if (trigger === 'update') {
        /*
         * THIS BRANCH IGNORES ITS PAYLOAD ENTIRELY, and that is a security
         * control rather than a style choice.
         *
         * `POST /api/auth/session` with a JSON body reaches exactly here -- it is
         * what `useSession().update()` does -- so a signed-in user who has not
         * finished onboarding can ask for `{ onboardingComplete: true }`. If this
         * callback believed the payload, onboarding would be one curl away from
         * optional, and since `onb` also gates /api/reading that is the whole
         * gate. So the truth is re-read from the database and the payload is not
         * even destructured.
         *
         * `unstable_update({})` with an empty payload is enough to trigger it,
         * which is a good sign the design is right: the client supplies no data
         * because none of it would be believed.
         */
        const uid = readUid(carried);
        if (!uid) return null;

        /*
         * Namespaced so it does not share a budget with the reading limiter.
         * Without it, an authenticated user can spin database reads by spamming
         * the session endpoint. A throttled refresh returns the STALE token: being
         * a few minutes behind on a flag is fine, handing out DB load is not.
         */
        const gate = await hit(`session-update:${uid}`, Date.now(), 20);
        if (!gate.ok) return carried;

        const facts = await readSessionFacts(db, uid);
        // Gone or soft-deleted. Refusing here is what stops a warm cookie from
        // outliving the row it points at.
        if (!facts) return null;

        carried.onb = facts.onboardingComplete;
        carried.loc = facts.locale;
        return carried;
      }

      return carried;
    },

    /*
     * NOTE: there is deliberately NO `session` callback here. It lives in
     * `config.ts` so that BOTH NextAuth instances have it -- middleware's and this
     * one. It was here once, and the result was an infinite redirect loop between
     * `/` and `/login` with nothing in any log; see config.ts for the mechanism.
     * The `...authConfig.callbacks` spread above is what carries it in.
     */
  },
});

/**
 * Force the token to catch up with the database.
 *
 * W3 calls this from its "onboarding complete" server action, and W6 must call it
 * when a user changes locale -- `onb` and `loc` live in the cookie, so the
 * database changing does not move them. The payload is IGNORED by design; pass
 * nothing.
 *
 * Wrapped rather than re-exported so the `unstable_` prefix appears in exactly
 * one place. If a future beta renames it, this is the only line that changes.
 */
export function refreshSession() {
  return unstable_update({});
}

/** Whether the dev password path is live. Read by the dev-session route. */
export const DEV_PASSWORD_LOGIN_ENABLED = devPasswordLogin;

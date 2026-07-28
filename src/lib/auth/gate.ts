/**
 * The routing decision, as a pure function.
 *
 * PURE. No next-auth, no next/server, nothing under @/lib/db -- there is not a
 * `NextRequest` or a `NextResponse` anywhere in this file. `middleware.ts` is
 * then a translator: it decodes the session, calls `decide()`, and turns the
 * answer into a response.
 *
 * That split exists because the gate is the security-relevant half of this
 * workstream and there is no browser to test it in. Chromium cannot launch in
 * this WSL image and there is no Playwright, so a decision function that Vitest
 * can call directly with a table of paths is the difference between "covered in
 * milliseconds" and "not covered".
 *
 * **THE ONE IMPORT (v0.4.0 / S1) DOES NOT BREAK THAT PROMISE, AND IT WAS CHOSEN
 * FOR IT.** `@/lib/i18n/prefix` is a pure leaf with no `next/*` -- not even a
 * type -- no `server-only` and no `process.env`; reconciliation R11 put the
 * prefix helpers there rather than in `resolve.ts` precisely because
 * `resolve.ts` opens with `import type { NextRequest }` and this file's first
 * paragraph promises there is none in its graph.
 */
import { isPublicContentPath, stripLocalePrefix } from '@/lib/i18n/prefix';

/** The legacy cookie from the password era. Evicted, never read. */
export const LEGACY_SESSION_COOKIE = 'jmtarot_session';

export type GateInput = {
  pathname: string;
  signedIn: boolean;
  onboarded: boolean;
};

export type GateDecision =
  | { kind: 'next' }
  | { kind: 'redirect'; to: '/login' | '/onboarding' | '/' }
  | { kind: 'json'; status: 401 | 403; error: string };

/**
 * Paths reachable without a session.
 *
 * A FUNCTION AND NOT A REGEX, and the reason has now bitten this project once
 * and would bite it far worse under Auth.js.
 *
 * The old reason: the obvious matcher -- exclude `login` and the static prefixes
 * -- still gates `/api/auth/login`, because that path does not begin with
 * "login". The result is a login endpoint that 401s everyone, and the failure
 * looks like a wrong password.
 *
 * The new reason, which is worse: Google's callback lands on
 * `/api/auth/callback/google`. Gate it and the failure is a LOOP. Middleware
 * sends the callback to `/login`, `/login` shows a button, the button goes to
 * Google, Google returns to `/api/auth/callback/google`, middleware sends it to
 * `/login`, forever. Nothing logs an error and the only visible fact is "Google
 * login doesn't work". Deciding this in readable code rather than inside a
 * negative-lookahead regex is what makes it survivable.
 *
 * `/terms` and `/privacy` are public because the login page links to them and a
 * stranger has to be able to read the terms before agreeing to them. They are
 * also the two pages that must stay statically renderable, which is why nothing
 * above them may call `auth()`.
 *
 * `/api/events` is public because the events that matter most happen BEFORE
 * there is a session: `terms.viewed`, `app.launched`, and a sign-in that
 * failed. Roadmap §3 allows `events.user_id` to be null for exactly this. It is
 * named exactly, not by widening a prefix, and it is the only writing endpoint
 * in the app a stranger can reach -- W4's route carries its own caps and IP
 * limit, it never reads a user id from the body, and it only ever writes names
 * from the closed taxonomy, so it cannot be used as free storage.
 */
export function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname === '/api/events' ||
    /*
     * W6. The login page carries a language switcher and there is no session yet,
     * so this has to answer before anyone is signed in -- a querent whose browser
     * says `en-GB` should not have to sign in through an Indonesian form to find
     * the toggle. It is the same trap `/api/events` is here for: the obvious
     * matcher gates a route that must work without a session, and the failure looks
     * like a dead button rather than like an auth problem.
     */
    pathname === '/api/locale' ||
    /*
     * W7. **THE DAILY SWEEP HAS NO SESSION AND CANNOT HAVE ONE.** Vercel Cron
     * issues a plain GET with `Authorization: Bearer $CRON_SECRET` and no
     * cookie, so the session gate would answer 401 and the job would appear to
     * run successfully forever while deleting nothing -- which is the exact
     * failure this list exists to prevent, and the same trap `/api/events` is
     * here for.
     *
     * **"PUBLIC" HERE MEANS "NO SESSION REQUIRED", NOT "UNAUTHENTICATED".** The
     * route's own guard is strictly stronger than a session: a 32-byte shared
     * secret compared with `timingSafeEqual`, and a 503 rather than a run if
     * `CRON_SECRET` is unset. An open endpoint that deletes rows is worse than a
     * sweep that never runs.
     *
     * Added by W7 to W2's list, the same way `/terms` and `/privacy` are here.
     * Reconciliation §7.8 assigns the sweep to W7 and it is the mechanism behind
     * the privacy policy's 30-day erasure promise.
     */
    pathname.startsWith('/api/cron/') ||
    /*
     * V7. **THE FIRST PATH IN THIS APP A STRANGER CAN OPEN.**
     *
     * A share link is a capability (VD9): the slug IS the authorization, so
     * `requireUser()` must not run and the onboarding gate must not run. What
     * replaces them is written down in `src/lib/share/slug.ts` and the sharing
     * plan §4.4 -- 60 bits of entropy, a per-IP limit and a fleet-wide limit
     * inside the page itself, because middleware cannot see a database.
     *
     * A PREFIX, AND THE ONLY PREFIX THAT IS SAFE HERE. `/s/` has exactly one route
     * under it, `[slug]`, plus the OG image Next generates inside the same segment
     * -- both must be public and both must be public for the same reason (a
     * messenger crawler fetching a preview has no cookie). Anything else added
     * under `/s/` is public too with no further edit, which is why nothing else
     * goes there.
     *
     * `/api/share` is deliberately NOT matched: minting and revoking need a
     * session, and `startsWith('/s/')` does not reach it. Nor does it reach
     * `/settings` or any other `/s`-initial path, which is why the clause is
     * `'/s/'` and not `'/s'` -- there is a test for exactly that.
     */
    pathname.startsWith('/s/') ||
    pathname.startsWith('/api/auth/') ||
    /*
     * ── v0.4.0 / S1. THE INDEXABLE CONTENT SURFACE (S-D3) ────────────────────
     *
     * Today a search engine can see three pages of this application and one of
     * them is a login form. This clause is most of the fix.
     *
     * **THE ROUTE TABLE IS NOT WRITTEN OUT HERE, AND THAT IS DELIBERATE.**
     * `isPublicContentPath` lives in `@/lib/i18n/prefix`, beside the prefix
     * maths, because you cannot decide whether to honour `/en/x` without knowing
     * whether `/x` is content -- and the alternative is two copies of a list of
     * permanent public addresses, kept in step by hand across two owners. It is
     * two exact-match tables plus a ONE-SEGMENT tree check, never a `startsWith`
     * on a bare name, so `/blogroll` cannot become public by looking like
     * `/blog`. That is the same property this function's header argues for, one
     * module along; `prefix.test.ts` carries the negative controls.
     *
     * **`/arcana` IS PUBLIC THOUGH IT HAS NO PAGE, AND THAT IS RECONCILIATION
     * R6.** It is the parent of 22 indexed URLs, so it must 404 from Next's own
     * routing rather than 302 to `/login` -- Google reads a login redirect on a
     * content path as a soft 404, on the one subtree this release is built
     * around. The negative controls are `/arcanax` and `/arcana-foo`.
     *
     * **THIS CLAUSE STRIPS AN `/en/` PREFIX AND THE OTHERS ABOVE MUST NOT
     * (contract G2).** Middleware strips before calling `decide()` (contract
     * G1), so in production a prefixed path never reaches here at all; this is
     * DEFENCE IN DEPTH, so that a future edit breaking the strip is still fenced
     * rather than a 302 on an indexable page. Unconditional stripping would make
     * `/en/api/events` public, which is why it is one clause and not a line at
     * the top of the function. `/en/history` is `false` here, and there is a test
     * named for the worst outcome available in this release.
     *
     * **`'/'` IS DELIBERATELY ABSENT (S-D5)**, and `isPublicContentPath` excludes
     * it for this reason rather than by accident. This function short-circuits
     * `decide()` BEFORE the onboarding check, so `/` in the public set would stop
     * sending a signed-in, un-onboarded querent to `/onboarding` and would land
     * them on a picker that assumes a completed profile. The `/` clause is in
     * `decide()` instead, where the signed-in arms still run.
     */
    isPublicContentPath(stripLocalePrefix(pathname).path)
  );
}

/**
 * Paths a signed-in but un-onboarded user may still reach.
 *
 * Every entry here is an infinite redirect loop if forgotten: `/onboarding`
 * itself would redirect to itself, and `/api/onboarding/*` would leave the
 * questionnaire unable to submit the answers that would end the redirect.
 */
export function isOnboardingExempt(pathname: string): boolean {
  return (
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname.startsWith('/api/onboarding/')
  );
}

/**
 * An API caller wants a status code, not a login page.
 *
 * Returning the HTML redirect makes a `fetch()` look like it succeeded and then
 * fail on JSON parsing, which is a confusing way to learn the cookie expired.
 * That was true of one status code and is now true of two.
 */
function isApi(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/**
 * 401 and 403 are distinguished on purpose: the client needs to tell "your
 * session died, sign in again" from "finish onboarding first", and the two lead
 * to different screens.
 */
export function decide(input: GateInput): GateDecision {
  const { pathname, signedIn, onboarded } = input;

  if (isPublic(pathname)) return { kind: 'next' };

  /*
   * ── S-D5. `/` DUAL-RENDERS, AND THIS IS WHY IT IS NOT IN `isPublic()` ──────
   *
   * Signed out, `/` is a static, crawlable landing page. Signed in, it is the
   * reader picker, byte for byte as before. `src/app/page.tsx` decides which by
   * calling `currentUser()`, which is database-free.
   *
   * **`isPublic()` WOULD HAVE BEEN THE ONE-LINE VERSION AND IT IS WRONG.** That
   * function short-circuits this one ABOVE the onboarding check, so `'/'` in the
   * public set would stop redirecting a signed-in, un-onboarded querent to
   * `/onboarding` and would land them on the picker -- a route that assumes a
   * completed `profiles` row, in an app where onboarding is asked exactly once.
   * There is a test named for exactly that case.
   *
   * `!signedIn &&` is therefore the whole guard: both signed-in arms below run
   * unchanged, and the only cell of the decision table that moves is
   * (signed out, `/`).
   *
   * **IT IS `=== '/'` AND NOT ALSO `'/en'`, BECAUSE THE STRIP RUNS FIRST**
   * (contract G1). `/en` rewrites to `/` in middleware, so this single clause
   * covers the English landing AND keeps the half-onboarded redirect for it.
   * Under gate-first this would have had to read `'/' || '/en' || '/en/'`, and
   * nobody would ever have tested `/en` while signed in and half-onboarded.
   *
   * It also closes a blocker CLAUDE.md has carried for two releases -- Google's
   * branding requirement is an app homepage that is not a login page, and
   * publishing the OAuth consent screen was blocked on `/` redirecting to
   * `/login`. One change, two problems.
   */
  if (!signedIn && pathname === '/') return { kind: 'next' };

  if (!signedIn) {
    return isApi(pathname)
      ? { kind: 'json', status: 401, error: 'Unauthorized' }
      : { kind: 'redirect', to: '/login' };
  }

  if (!onboarded) {
    if (isOnboardingExempt(pathname)) return { kind: 'next' };
    return isApi(pathname)
      ? { kind: 'json', status: 403, error: 'Onboarding required' }
      : { kind: 'redirect', to: '/onboarding' };
  }

  /*
   * Onboarding is asked EXACTLY ONCE (roadmap §1), and `profiles` is keyed on
   * user_id, so leaving the route reachable invites a second run that would
   * collide with a primary key. The edit path is `/account` (reconciliation
   * R14/R22), which is a different route and therefore needs no special case
   * here.
   *
   * Only the PAGE bounces. `/api/onboarding/*` stays reachable, because
   * `/account` reuses those endpoints to edit and delete answers.
   */
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) {
    return { kind: 'redirect', to: '/' };
  }

  return { kind: 'next' };
}

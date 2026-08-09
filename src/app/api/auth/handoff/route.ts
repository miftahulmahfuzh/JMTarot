/**
 * **THE ONE REQUEST THE INSTALLED APP MAKES THAT COMES BACK WITH A SESSION.**
 *
 * `src/lib/auth/handoff.ts` carries the whole mechanism and why it has to exist;
 * `docs/plans/2026-08-09-standalone-signin-handoff-design.md` §1 carries the seven
 * measurements it is built on. The one sentence: iOS gives a home-screen app its
 * own cookie jar, seeded from Safari at install time and never again, and it hands
 * `accounts.google.com` to an overlay — so the session Google mints lands in a jar
 * the standalone shell cannot see, and the installed app could never sign in.
 *
 * **A COOKIE SET ON A RESPONSE TO THE PWA'S OWN REQUEST IS IN THE PWA'S JAR BY
 * DEFINITION.** This is that request. It is a POST from `HandoffClaim`, carrying
 * `jmt_pwa` and nothing else, and finding 6 of §1 — *the origin governs what iOS
 * punts to the overlay, not the manifest's `scope`* — is what guarantees it never
 * leaves the app.
 *
 * ── WHY IT IS PUBLIC, AND WHY THAT IS NOT A HOLE ─────────────────────────────
 *
 * It has to be: the caller's entire problem is that it has no session.
 * `gate.isPublic()` needs no edit — `pathname.startsWith('/api/auth/')` already
 * covers it, which is the same clause `dev-session` has always lived under.
 * "Public" there means "no session required", never "unauthenticated": what
 * replaces the session is a 256-bit httpOnly cookie that must ALSO match a row
 * some other browser bound after Google said yes. Guessing it is guessing a
 * session token, which is what the alternative would have been anyway.
 *
 * ── FOUR THINGS IT DELIBERATELY DOES NOT DO ──────────────────────────────────
 *
 *   1. **It reads no user id from the body**, and there is no body. The only
 *      input is a cookie the browser had already; `/api/events`'s rule.
 *   2. **It never says whether a device secret is known.** Every unsuccessful
 *      outcome is one 204: no row, expired, already claimed, unbound, a user
 *      since deleted. A route that distinguished them would be an oracle for
 *      probing the table.
 *   3. **It sets no `jmt_locale`.** The token carries `loc` from the row, so the
 *      first navigation after the claim resolves the language off the session
 *      claim — D6's first rung — exactly as it does after an ordinary sign-in.
 *   4. **It does not redirect.** The client decides, because only the client
 *      knows whether the querent is looking at the app.
 */
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/config';
import { PWA_COOKIE, deviceHash } from '@/lib/auth/handoff';
import { encodeSessionToken } from '@/lib/auth/mint';
import { db } from '@/lib/db/client';
import { claimHandoff } from '@/lib/db/queries/handoff';
import { getUserById, readSessionFacts } from '@/lib/db/queries/profile';
import { hit } from '@/lib/ratelimit';
import { clientIp } from '@/lib/ratelimit/clientIp';

export const runtime = 'nodejs';

/**
 * **A WRITING ROUTE ON THE COLD PATH, SO IT DECLARES A DURATION** (CLAUDE.md's
 * `POST /api/locale` trap). This is very likely the request that wakes a
 * suspended Neon compute: it fires seconds after a sign-in, on a phone, in an app
 * that has been closed. Hobby's default is ten seconds, which is enough to lose
 * the claim; the client's own bound is in `HandoffClaim`.
 */
export const maxDuration = 30;

/**
 * Sixty claims a minute per address.
 *
 * Not a security control — a 256-bit secret does not need one — but a bound on
 * what a stuck client can do to the database, and this route is fired from a
 * `visibilitychange` handler, which is the class of caller that fires far more
 * often than anybody expects. The limiter's own silent fallback to per-instance
 * memory costs nothing here for the same reason `RATELIMIT_SESSION_BACKEND` is
 * left unset: a per-device burst lands mostly on one warm instance.
 */
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;

/** Every unsuccessful outcome, indistinguishable from every other one. */
const NOTHING_TO_CLAIM = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  const secret = cookieFrom(request.headers.get('cookie'), PWA_COOKIE);
  // Not the installed app. The overwhelmingly common case, and it costs one
  // string scan and no I/O at all.
  if (!secret) return NOTHING_TO_CLAIM();

  const gate = await hit(
    `handoff:${clientIp(request.headers)}`,
    Date.now(),
    RATE_MAX,
    RATE_WINDOW_MS,
  );
  if (!gate.ok) return NOTHING_TO_CLAIM();

  let userId: string | null;
  try {
    userId = await claimHandoff(db, await deviceHash(secret));
  } catch (err) {
    /*
     * The error's CLASS only. This statement's bound parameter is a hash and
     * nothing else, but the rule is *never log a driver error from any path that
     * runs a query* and the exception is what somebody copies.
     */
    console.error('[auth] handoff claim failed', err instanceof Error ? err.name : 'unknown');
    return NOTHING_TO_CLAIM();
  }
  if (!userId) return NOTHING_TO_CLAIM();

  /*
   * **THE ROW IS ALREADY SPENT AT THIS POINT, AND THAT ORDERING IS DELIBERATE.**
   * `claimHandoff` marks it claimed in the same statement that reads it, so a
   * failure below costs the querent one retry of the whole sign-in rather than
   * leaving a claimable row behind. Single use is worth more than a smooth retry:
   * the alternative is a capability that survives its own first use.
   *
   * Two reads rather than one join, because both already exist and are tested:
   * `getUserById` filters soft-deleted rows, so an account erased between the
   * overlay's bind and this claim cannot collect a session.
   */
  let user: Awaited<ReturnType<typeof getUserById>> = null;
  let facts: Awaited<ReturnType<typeof readSessionFacts>> = null;
  try {
    [user, facts] = await Promise.all([getUserById(db, userId), readSessionFacts(db, userId)]);
  } catch (err) {
    console.error(
      '[auth] handoff subject read failed',
      err instanceof Error ? err.name : 'unknown',
    );
  }
  if (!user || !facts) return NOTHING_TO_CLAIM();

  const { token, maxAge } = await encodeSessionToken({
    // `users.google_sub`, never `users.id` — `readExternalSub`'s rule, one release
    // later and in the other direction: what goes back into `sub` is the external
    // identity, so `currentUser().googleSub` means what its type says.
    sub: user.googleSub,
    uid: user.id,
    email: user.email,
    name: user.displayName,
    onb: facts.onboardingComplete,
    loc: facts.locale,
  });

  const response = NextResponse.json({ ok: true });

  /*
   * `SESSION_COOKIE_NAME`, never a literal: @auth/core prefixes `__Secure-` on
   * https, so a typed name would set the wrong cookie in production only and look
   * perfectly correct locally. V8's delete route records the same trap.
   *
   * `secure` follows the cookie's own name for the same reason — the two are
   * decided by one fact, and a `__Secure-` cookie without the attribute is
   * rejected by the browser outright.
   */
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: SESSION_COOKIE_NAME.startsWith('__Secure-'),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return response;
}

/**
 * One cookie out of a raw `Cookie` header.
 *
 * The raw header rather than `cookies()`, matching `dev-session`: this route's
 * only input is one opaque value, and the fewer request-scope APIs stand between
 * the wire and the decision, the fewer ways it can fail for a reason that has
 * nothing to do with the handoff.
 */
function cookieFrom(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

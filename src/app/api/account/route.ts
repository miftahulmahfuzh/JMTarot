/**
 * `DELETE /api/account` — the button `/privacy` §8 has been describing for a
 * whole release (VD13).
 *
 *   DELETE  (no body)
 *     -> 200 { deleted: true, restorableUntil }  + Set-Cookie clearing the session
 *     -> 401 no session
 *     -> 404 already deleted, or the row is gone
 *     -> 429 rate limited
 *     -> 500 the transaction failed; NOTHING was changed
 *
 * **`requireOnboarding: false`, DELIBERATELY (A4).** Fail-closed is the right
 * default for `requireUser` and the wrong posture here: somebody who signed in,
 * saw the questionnaire and wants out has a `users` row and a right to erase it.
 * Saying so explicitly is cheaper than discovering it from a support message.
 *
 * **THE ROUTE CLEARS THE SESSION COOKIE ITSELF, BY NAME (A3).** There is no
 * server-side session revocation on the JWT path — `CLAUDE.md`'s `## Auth`
 * section is explicit that the 30-day absolute cap is the only thing bounding a
 * live cookie — so a session surviving a soft delete would keep returning the
 * querent's data from every query until it expired. A client-side `signOut()`
 * alone is not enough: if it fails, the session outlives the deletion.
 * `SESSION_COOKIE_NAME` is exported from `config.ts` for exactly this.
 *
 * **NO `GET`, AND NO `PATCH` HERE.** The facts editor is
 * `PATCH /api/account/facts`, a separate handler, because a route that both reads
 * the account and destroys it is one typo away from a very bad afternoon.
 */
import { NextResponse, after } from 'next/server';

import {
  LOCAL_DATE_HEADER,
  parseLocalDate,
  SESSION_HEADER,
  validSessionId,
} from '@/lib/analytics/localdate';
import { track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { SESSION_COOKIE_NAME } from '@/lib/auth/config';
import { requireUser } from '@/lib/auth/server';
import { deleteAccount } from '@/lib/account/delete';
import { db } from '@/lib/db/client';
import { readingCountAllTime } from '@/lib/db/queries/allTime';
import { getPersona } from '@/lib/db/queries/persona';
import { getUserById } from '@/lib/db/queries/profile';
import { getLocale } from '@/lib/i18n/t';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * A user action that WRITES, so it is one of the few things likely to be the
 * request that wakes a suspended Neon compute — `CLAUDE.md` records
 * `POST /api/locale` being killed at Vercel's Hobby default of ten seconds for
 * exactly that reason. Three reads and one three-statement transaction is
 * milliseconds warm and nothing like that cold, and this is the one request in
 * the app a user must not have to make twice.
 */
export const maxDuration = 20;

/**
 * Five per hour. Generous for a thing done once, and it exists because this is a
 * WRITE reachable with a session, not because anybody deletes their account
 * repeatedly. `hit()` prefixes `read:`, so the effective key is
 * `read:account:delete:<uid>` — its own namespace, so a burst here cannot spend
 * the budget that lets somebody take a reading.
 */
const DELETE_MAX = 5;
const HOUR_MS = 3_600_000;

export async function DELETE(request: Request) {
  const auth = await requireUser({ requireOnboarding: false });
  if (!auth.ok) return auth.response;
  const user = auth.user;

  // AWAITED. `hit()` has been async since V9, and a forgotten `await` evaluates
  // a Promise as truthy — i.e. never refuses.
  const gate = await hit(`account:delete:${user.id}`, Date.now(), DELETE_MAX, HOUR_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
    );
  }

  const startedAt = performance.now();

  return withAnalytics(await context(request, user.id), async () => {
    /*
     * THE THREE FACTS FOR THE EVENT ARE READ BEFORE THE TRANSACTION, and they
     * have to be: `readings` and `personas` both cascade at the hard delete, and
     * `account.deleted` is the only trace this ever happened. Reading them
     * afterwards would work today (the delete is soft) and silently start
     * reporting zeroes the day anybody makes it hard.
     *
     * A failure here must not cost the querent their deletion, so each degrades
     * to a null-shaped default rather than throwing. An analytics prop is not
     * worth a 500 on this route.
     */
    const facts = await preDeleteFacts(user.id);

    let out;
    try {
      out = await deleteAccount(db, user.id);
    } catch (err) {
      /*
       * NEVER LOG THE DRIVER ERROR. A postgres error quotes the failing statement
       * AND its bound parameters, and `moderation_flags` is one of the tables in
       * this transaction — its `question` column holds text W7's classifier
       * flagged. `flush.ts`, `log.ts` and `auth.ts` all carry this rule and
       * `auth.ts` earned it in production on 2026-07-28.
       */
      logFailure(err);
      return NextResponse.json({ error: 'delete failed' }, { status: 500 });
    }

    /*
     * 404 FOR AN ALREADY-DELETED ACCOUNT, and no cookie clearing either. It is not
     * an error the user can act on and there is nothing to erase; the client
     * navigates to `/login?deleted=1` on a 200 only, and middleware sends a
     * session pointing at a soft-deleted row there anyway.
     */
    if (!out.deleted) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    /*
     * FIRED IN `after()`, AFTER THE COMMIT, so a rolled-back transaction never
     * records an erasure that did not happen. The row it writes outlives the
     * account with `user_id` nulled, which is why every prop is a count.
     */
    after(() =>
      track('account.deleted', {
        reading_count: facts.readingCount,
        had_persona: facts.hadPersona,
        flags_redacted: out.flagsRedacted,
        links_revoked: out.linksRevoked,
        days_since_signup: facts.daysSinceSignup,
        elapsed_ms: Math.round(performance.now() - startedAt),
      }),
    );

    const response = NextResponse.json(
      { deleted: true, restorableUntil: out.restorableUntil },
      { headers: { 'cache-control': 'no-store' } },
    );

    /*
     * `maxAge: 0` AND AN EMPTY VALUE, on the cookie's own name and path. Auth.js
     * prefixes the name with `__Secure-` when the deployment is https, which is
     * why the constant is imported rather than typed: clearing the wrong name
     * leaves a working session behind a page that says the account is gone.
     */
    response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return response;
  });
}

/**
 * The three analytics facts, each independently degradable.
 *
 * `days_since_signup` is derived from `users.created_at` here rather than stored,
 * because the row is about to become unreadable and this is the last moment it is
 * true.
 */
async function preDeleteFacts(userId: string): Promise<{
  readingCount: number;
  hadPersona: boolean;
  daysSinceSignup: number;
}> {
  try {
    const [readingCount, persona, row] = await Promise.all([
      readingCountAllTime(db, userId),
      getPersona(db, userId),
      getUserById(db, userId),
    ]);
    return {
      readingCount,
      hadPersona: persona !== null,
      daysSinceSignup: row
        ? Math.max(0, Math.floor((Date.now() - row.createdAt.getTime()) / 86_400_000))
        : 0,
    };
  } catch (err) {
    logFailure(err);
    return { readingCount: 0, hadPersona: false, daysSinceSignup: 0 };
  }
}

/**
 * `localDate` IS THE QUERENT'S CALENDAR DAY AND THE SERVER CANNOT COMPUTE IT
 * (roadmap §7). Repaired rather than rejected, like `/api/share`: an erasure is
 * not dated, so a fallback costs an analytics dimension one day of accuracy while
 * refusing would cost somebody their deletion over a missing header.
 */
async function context(request: Request, userId: string): Promise<AnalyticsContext> {
  return {
    userId,
    sessionId: validSessionId(request.headers.get(SESSION_HEADER)),
    // The RESOLVED UI locale, not `user.locale` — they diverge under `?lang=`.
    locale: await getLocale(),
    localDate: parseLocalDate(request.headers.get(LOCAL_DATE_HEADER)).date,
  };
}

/** The whole error in development, the class alone in production. See above. */
function logFailure(err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[account] deletion failed', err);
  } else {
    console.error('[account] deletion failed', {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}

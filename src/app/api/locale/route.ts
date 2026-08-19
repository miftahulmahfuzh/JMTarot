import { cookies } from 'next/headers';

import { refreshSession } from '@/lib/auth/auth';
import { currentUser } from '@/lib/auth/server';
import { isLocale } from '@/lib/i18n/locale';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n/resolve';

/**
 * Change language.
 *
 * PUBLIC (it is in `isPublic()`), because the login page carries a switcher and
 * there is no session yet: a querent whose browser says `en-GB` should not have to
 * sign in through an Indonesian form to find the toggle. With no session this
 * writes the cookie and stops, which is the whole of what an anonymous visitor
 * needs.
 *
 * ==========================================================================
 * THE PLAN SAID `users.locale` GOES THROUGH `after()` (I25, citing roadmap §6
 * and D9). IT CANNOT, AND THE REASON IS A DETAIL OF W2's SESSION REFRESH.
 *
 * The resolution chain puts the session `loc` claim AHEAD of the cookie (D6:
 * profile beats cookie), so the claim has to be re-minted in this same response
 * or a stale one silently snaps the language back on the querent's next
 * navigation. W2's `refreshSession()` is the only way to re-mint it — and its jwt
 * `trigger === 'update'` branch DELIBERATELY IGNORES ITS PAYLOAD and re-reads the
 * row instead (`carried.loc = facts.locale`). That is a security control, not an
 * implementation detail: the same branch sets `onb`, and believing a client
 * payload there would make onboarding one curl away from optional.
 *
 * So the order is forced. Deferring the write means `refreshSession()` reads the
 * OLD locale and re-stamps exactly the stale claim this route exists to replace —
 * the cookie would be right, middleware would read the claim, and the switch would
 * revert with nothing logged. That is the plan's own "a stale session claim undoes
 * every locale switch" risk, arriving from the direction the plan did not check.
 *
 * What is actually being traded: ONE indexed UPDATE by primary key, on an explicit
 * user action that is already awaiting a `router.refresh()`. §6's rule is that the
 * database must not be in the way of A BYTE THE USER IS WAITING FOR — a streamed
 * reading, a rendered page. This is neither. Nothing renders until the response
 * lands either way.
 * ==========================================================================
 *
 * ── THE COLD PATH, AND WHY THIS ROUTE NEEDED A BUDGET (v0.3.0) ───────────────
 *
 * THE PARAGRAPH ABOVE IS STILL TRUE AND IT DESCRIBES THE WARM PATH ONLY.
 * "ONE indexed UPDATE by primary key" is what this costs when the compute is
 * awake; measured against Docker Postgres it is 22ms end to end, with the RSC
 * refresh behind it at 53ms. It was reported as HANGING in production, and the
 * whole difference is cold start.
 *
 * `docs/DEPLOY-VERCEL.md` puts functions on Vercel's **Hobby** plan in `sin1`,
 * Neon on the **free plan** in `ap-southeast-1`, and Upstash in `ap-southeast-1`
 * as well. Hobby's default function budget is TEN SECONDS, and a free-plan Neon
 * compute SUSPENDS WHEN IDLE. So the first switch after a quiet spell is:
 *
 *   1. a cold lambda, whose graph includes @auth/core, postgres.js and -- by way
 *      of `auth.ts` -> `users.ts` -- bcrypt;
 *   2. `setUserLocale`, which may be the request that WAKES the Neon compute, on
 *      a `max: 1` connection (see `db/client.ts`);
 *   3. `refreshSession()`, which is one Upstash hop (`hit()` in the jwt update
 *      branch) and THEN a second query to that same compute.
 *
 * Three sequential round trips, one of them a database wake. Killed at ten
 * seconds the write is lost, no response arrives, and the querent is looking at
 * a disabled toggle -- which is exactly the reported symptom, and why it always
 * "works if you try again".
 *
 * **THE GEOGRAPHY IN THAT LIST WAS WRONG IN BOTH DIRECTIONS AND THE ROUTE'S
 * CONCLUSION SURVIVES ANYWAY.** Step 3 said `Singapore->Tokyo`: Upstash has an
 * `ap-southeast-1` region (console, 2026-07-29), and the functions were in
 * `iad1` rather than `sin1` until 2026-08-19, so every hop above was
 * transpacific -- **a worse stack than the one this comment describes, which is
 * why the cold path was even easier to truncate than the argument claimed.**
 * Now that all three sit in Singapore the wake dominates and the hops do not.
 * **Do not use that as a reason to drop `maxDuration` back to the default**: the
 * Neon compute still suspends, and a cold wake is still the one outcome that
 * means UNKNOWN. Re-measure on a phone before touching it.
 *
 * **A BIGGER BUDGET IS NOT A LATENCY REGRESSION.** It does not make the warm
 * path slower; it stops the cold path being TRUNCATED. And it is deliberately
 * paired with a bound on the CLIENT (`LocaleSwitch`'s `AbortSignal.timeout`), so
 * the extra budget buys the WRITE time to land without ever buying the user more
 * time in front of a dead control. Raise one without the other and you have
 * simply made the hang longer.
 *
 * NOT AN LLM CALL, and it is worth writing down because the bug was reported as
 * one. Nothing on this path reaches a model: the only callers of
 * `translateOrCached`/`translateStream` are `/api/translate` and `chain.ts`, and
 * the two generated lines on the screens that carry this control are fetched by
 * their own client components afterwards. See `FrequencyLine` and `DaySummary`.
 *
 * `runtime = 'nodejs'` is declared for the same reason every other
 * database-touching route declares it -- and being the only one that left both
 * implicit is how this escaped review in the first place.
 */
export const runtime = 'nodejs';

/** See the header. 30, matching the other routes that can wake a cold compute. */
export const maxDuration = 30;

export async function POST(request: Request) {
  let locale: unknown;
  try {
    locale = (await request.json())?.locale;
  } catch {
    return new Response(null, { status: 400 });
  }

  /*
   * `isLocale` and not a cast. This body is attacker-controlled, and an `'en-US'`
   * reaching the cookie would come back through `localeFromHeaders`, fail
   * `isLocale` there, and resolve to the default — so the bug would present as
   * "the switcher does nothing" rather than as bad input.
   */
  if (!isLocale(locale)) return new Response(null, { status: 400 });

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  /*
   * `currentUser()` rather than `requireUser()`: this route is public and must work
   * with no session at all, and it must ALSO work for a signed-in user who has not
   * finished onboarding — who is in fact the likeliest person to want it, since the
   * questionnaire is the longest stretch of copy in the app. `requireUser()`
   * demands completed onboarding by default and would 403 them.
   */
  const user = await currentUser();

  if (user && user.locale !== locale) {
    try {
      // Dynamic, so this module does not pull `server-only` and the Postgres
      // driver into a route that must also answer for anonymous callers.
      const [{ setUserLocale }, { db }] = await Promise.all([
        import('@/lib/db/queries/profile'),
        import('@/lib/db/client'),
      ]);
      /*
       * BEFORE the refresh. See the header.
       *
       * `'chosen'` (V2 / VD11), and it is the only place in the app that writes that
       * value: this route is reached by pressing the toggle, which is the definition
       * of a choice. It is what stops the sign-in path from ever re-stamping the
       * negotiated locale over it -- see `users.locale_source`.
       */
      await setUserLocale(db, user.id, locale, 'chosen');
      await refreshSession();
    } catch (err) {
      /*
       * A FAILED SWITCH IS NOT A 500 (roadmap §6's failure policy). The cookie is
       * already on this response, so an anonymous-shaped degradation is what the
       * querent gets: this navigation is in the new language, and the next one
       * reverts because the claim still wins.
       *
       * That is worse than it sounds and better than the alternative. It is
       * honest — the language really did not stick — and it is one more click to
       * retry, whereas a 500 on a language toggle reads as the app being broken.
       * The log line is how we would ever know.
       */
      console.error('locale switch failed', { userId: user.id, locale, err });
    }
  }

  return new Response(null, { status: 204 });
}

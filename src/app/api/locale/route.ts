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
 */
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

'use server';

/**
 * The one server action W3 owns, and it exists to break a redirect loop.
 *
 * THE LOOP IT PREVENTS. `onb` is a claim in the session cookie and
 * `profiles.completed_at` is the authority (L4). They can disagree -- the user
 * finished onboarding in another browser, or the completion request's re-mint
 * failed after the row was written. In that state middleware sees `onb: false`
 * and lets `/onboarding` render (it is exempt), the page reads the profile and
 * finds it complete, and a plain `redirect('/')` from here would send the user
 * to a path middleware bounces straight back to `/onboarding`. The browser
 * reports `ERR_TOO_MANY_REDIRECTS` and names neither rule.
 *
 * So the flag has to be REPAIRED before the navigation, not after it. The plan
 * says "ask W2 to re-mint the token"; this is where that is possible.
 *
 * WHY A SERVER ACTION AND NOT THE PAGE. A server component cannot write
 * cookies -- `cookies().set()` throws outside an action or a route handler --
 * and re-minting the session is exactly a cookie write. `refreshSession()`'s own
 * doc comment in `@/lib/auth/auth` names a server action as its caller.
 *
 * The stale flag is not a security event in either direction (L4): stale-false
 * costs one wrong navigation, which this repairs, and stale-true only lets
 * someone skip a questionnaire.
 */
import { refreshSession } from '@/lib/auth/auth';
import { readToken } from '@/lib/auth/token';

/**
 * Re-mint the session from the database and report whether `onb` is now true.
 *
 * THE RETURN VALUE IS LOAD-BEARING: the caller must not navigate on false. Two
 * things make it false, and neither is an error worth a stack trace:
 *
 *   - the jwt callback's `trigger === 'update'` branch found no completed
 *     profile, so the page was right to render the questionnaire after all
 *   - that branch is rate-limited (`session-update:<uid>`, 20/window) and
 *     returned the STALE token rather than spending a database read
 *
 * In both cases navigating anyway is the loop. Reporting false lets the client
 * stay put and offer a retry.
 *
 * The payload is deliberately empty. That branch IGNORES what it is sent and
 * re-reads the truth, which is why `POST /api/auth/session` is not a way to
 * declare yourself onboarded.
 */
export async function repairSessionFlag(): Promise<{ ok: boolean }> {
  const session = await refreshSession();

  /*
   * The SAME narrowing `currentUser()` and middleware use. Reading
   * `session.user.onb` directly would accept a token this app considers dead --
   * one with no `uid`, or a `uid` that is not uuid-shaped -- and report success
   * for a session that the very next request will reject.
   */
  return { ok: readToken(session?.user)?.onb === true };
}

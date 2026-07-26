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
 */

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
    pathname.startsWith('/api/auth/')
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

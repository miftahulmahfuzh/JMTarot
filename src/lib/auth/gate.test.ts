import { describe, expect, it } from 'vitest';
import { decide, isOnboardingExempt, isPublic, type GateDecision } from './gate';

const signedOut = { signedIn: false, onboarded: false };
const halfway = { signedIn: true, onboarded: false };
const settled = { signedIn: true, onboarded: true };

function at(pathname: string, who: { signedIn: boolean; onboarded: boolean }): GateDecision {
  return decide({ pathname, ...who });
}

describe('isPublic', () => {
  it('lets the three public pages through', () => {
    expect(isPublic('/login')).toBe(true);
    expect(isPublic('/terms')).toBe(true);
    expect(isPublic('/privacy')).toBe(true);
  });

  it('lets the WHOLE of /api/auth through, including the Google callback', () => {
    // THE test in this file. If a future change to the public set gates the
    // callback, the symptom is an infinite redirect loop with nothing in any log
    // and "Google login doesn't work" as the only visible fact. This says so in
    // milliseconds instead.
    expect(isPublic('/api/auth/callback/google')).toBe(true);
    expect(isPublic('/api/auth/signin')).toBe(true);
    expect(isPublic('/api/auth/signout')).toBe(true);
    expect(isPublic('/api/auth/session')).toBe(true);
    expect(isPublic('/api/auth/csrf')).toBe(true);
    expect(isPublic('/api/auth/dev-session')).toBe(true);
  });

  it('lets the analytics collector through, and only that exact path', () => {
    // W4. The events that matter most happen before there is a session --
    // terms.viewed, app.launched, a sign-in that failed -- and roadmap §3
    // allows events.user_id to be null for exactly that reason. Exact match,
    // never a prefix: /api/events is public, nothing near it is.
    expect(isPublic('/api/events')).toBe(true);
    expect(isPublic('/api/events/replay')).toBe(false);
    expect(isPublic('/api/eventsomething')).toBe(false);
  });

  it('does not make the app public by accident', () => {
    expect(isPublic('/')).toBe(false);
    expect(isPublic('/api/reading')).toBe(false);
    expect(isPublic('/thessaly/spread3')).toBe(false);
    expect(isPublic('/onboarding')).toBe(false);
    // Prefix confusions, each of which would be a hole: a path that merely
    // starts with a public path's characters is not that path.
    expect(isPublic('/login-as-admin')).toBe(false);
    expect(isPublic('/terms-and-conditions')).toBe(false);
    expect(isPublic('/api/authenticated-thing')).toBe(false);
  });
});

describe('isPublic -- v0.4.0 opens the content surface (S-D3)', () => {
  it('opens the content tree', () => {
    expect(isPublic('/gallery')).toBe(true);
    expect(isPublic('/arcana/the-moon')).toBe(true);
    expect(isPublic('/arcana/wheel-of-fortune')).toBe(true);
    expect(isPublic('/blog')).toBe(true);
    expect(isPublic('/blog/how-to-read-tarot')).toBe(true);
  });

  it('opens the bare /arcana SO THAT ITS 404 IS A 404 (R6)', () => {
    /*
     * **THIS REVERSES S1's OWN PLAN, AND THE REVERSAL IS RECONCILIATION R6.**
     *
     * Roadmap §3.1 and §6.1 contradicted each other: §3.1 called `/arcana` "a
     * 404, deliberately" (because `/gallery` is the index of the collection and
     * two indexes compete), while §6.1 listed it as a NEGATIVE control -- and a
     * non-public path inside the middleware matcher is a 302 to `/login`, not a
     * 404. S1's plan accepted the soft 404; S4 asked for the real one and WON.
     *
     * The stake is exact: `/arcana` is the PARENT of 22 indexed URLs, and a
     * parent that redirects to a login form is the failure roadmap §1's table
     * exists to describe. Google calls a login redirect on a content path a soft
     * 404, on the one subtree this release is built around.
     *
     * S1's objection was answered rather than dismissed -- it argued that
     * widening the allowlist for a path with no page is how `isPublic` stops
     * being readable. Correct, so the negative controls moved to `/arcanax` and
     * `/arcana-foo`, and the path is expected to acquire a `notFound()` page.
     */
    expect(isPublic('/arcana')).toBe(true);
  });

  it('does not widen a prefix -- THE NEGATIVE CONTROLS', () => {
    /*
     * Each of these is a hole if the clause is written as the obvious prefix.
     * `isPublicContentPath` is two exact-match tables and a one-segment tree
     * check, never a `startsWith` on a bare name, precisely so `/blogroll`
     * cannot become public by looking like `/blog`.
     */
    expect(isPublic('/gallerywhatever')).toBe(false);
    expect(isPublic('/gallery/secret')).toBe(false);
    expect(isPublic('/arcanax')).toBe(false);
    expect(isPublic('/arcana-foo')).toBe(false);
    expect(isPublic('/arcana/the-moon/extra')).toBe(false);
    expect(isPublic('/blogroll')).toBe(false);
    expect(isPublic('/blogs')).toBe(false);
    expect(isPublic('/blog/a/b')).toBe(false);
  });

  it('STRIPS THE PREFIX FOR THE CONTENT CLAUSE ONLY (contract G2)', () => {
    /*
     * **THIS ALSO REVERSES S1's PLAN §1.1, AND THE REVERSAL IS RECONCILIATION
     * R14.** That plan chose "the gate never sees a prefix, so `/en/gallery` is
     * `false`". S2's contract G2 is kept instead, as DEFENCE IN DEPTH: middleware
     * still strips before calling `decide()` (contract G1), so in production this
     * function never sees a prefixed content path -- but if a future edit ever
     * broke the strip, the gate is still a fence rather than a 302 on an
     * indexable page.
     *
     * **THE `ONLY` IS THE WHOLE SECURITY PROPERTY.** Unconditional stripping
     * would make `/en/api/events` public, so `/login`, `/terms`, `/privacy`,
     * `/api/*` and `/s/` keep matching the RAW path and the content clause is the
     * one that strips.
     */
    expect(isPublic('/en/gallery')).toBe(true);
    expect(isPublic('/en/arcana/the-moon')).toBe(true);
    expect(isPublic('/en/blog')).toBe(true);
  });

  it('NEVER makes the gated app reachable under /en/ -- THE WORST OUTCOME, FENCED', () => {
    /*
     * §6.1: "A prefix-stripping bug that makes the whole app reachable under
     * `/en/` is the worst outcome available in this release, and it would look
     * like a working feature." The clause above strips, so these are the
     * assertions that prove the strip is fenced by the route TABLE rather than
     * by the parser.
     */
    expect(isPublic('/en/history')).toBe(false);
    expect(isPublic('/en/history/abc')).toBe(false);
    expect(isPublic('/en/account')).toBe(false);
    expect(isPublic('/en/onboarding')).toBe(false);
    expect(isPublic('/en/thessaly')).toBe(false);
    // And the raw-path clauses must NOT strip, or a prefixed API route opens.
    expect(isPublic('/en/api/events')).toBe(false);
    expect(isPublic('/en/api/auth/callback/google')).toBe(false);
    expect(isPublic('/en/api/locale')).toBe(false);
    expect(isPublic('/en/s/abcdefghjkmn')).toBe(false);
    expect(isPublic('/en/login')).toBe(false);
    expect(isPublic('/en/terms')).toBe(false);
  });

  it('still does not make the app public by accident', () => {
    // V6 rule 5 and V7's assertion, restated from S1's side. `/history` is
    // somebody's entire reading history.
    expect(isPublic('/history')).toBe(false);
    expect(isPublic('/history/abc')).toBe(false);
    expect(isPublic('/account')).toBe(false);
    expect(isPublic('/api/reading')).toBe(false);
  });
});

describe('decide -- S-D5 makes / dual-render', () => {
  it('lets a stranger reach the landing page', () => {
    // This is the whole change: signed out, `/` renders instead of bouncing.
    // It also closes the blocker CLAUDE.md has carried for two releases --
    // "Google's branding requirement of an app homepage that is not a login
    // page" -- because signed out, `/` no longer redirects to `/login`.
    expect(at('/', signedOut)).toEqual({ kind: 'next' });
  });

  it('STILL sends a signed-in, un-onboarded querent to /onboarding', () => {
    /*
     * **THE ASSERTION THIS WHOLE CLAUSE EXISTS FOR.** `isPublic()`
     * short-circuits `decide()` before the onboarding check, so putting `'/'`
     * in that function -- the obvious one-line version of this change -- would
     * land a half-onboarded querent on the reader picker, a route that assumes
     * a completed `profiles` row. The clause is here, below `isPublic()` and
     * gated on `!signedIn`, so both signed-in arms are untouched.
     */
    expect(at('/', halfway)).toEqual({ kind: 'redirect', to: '/onboarding' });
  });

  it('still lets a settled querent reach the picker', () => {
    expect(at('/', settled)).toEqual({ kind: 'next' });
  });

  it('keeps / OUT of isPublic(), which is what makes the above true', () => {
    // A negative control on the MECHANISM rather than on the behaviour: this is
    // the assertion that fails if somebody later "simplifies" the clause into
    // `isPublic`. `isPublicContentPath` differs from `isContentPath` by exactly
    // this one path, and `prefix.test.ts` asserts that difference too.
    expect(isPublic('/')).toBe(false);
  });

  it('does not open anything else that merely starts with a slash', () => {
    expect(at('/thessaly', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/history', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/account', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/onboarding', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/api/reading', signedOut)).toEqual({
      kind: 'json',
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('sends a signed-out visitor to /login on every /en/ app path', () => {
    // The chosen failure mode, stated as behaviour: a prefixed GATED path costs
    // a login redirect, which is visible and recoverable. The opposite failure
    // -- a prefix that fails OPEN -- would expose `/history` and look fine.
    for (const path of ['/en/history', '/en/account', '/en/onboarding', '/en/thessaly']) {
      expect({ [path]: at(path, signedOut) }).toEqual({
        [path]: { kind: 'redirect', to: '/login' },
      });
    }
  });
});

describe('isOnboardingExempt', () => {
  it('exempts the questionnaire and its endpoints', () => {
    // Each of these is an infinite redirect loop if forgotten: the page would
    // redirect to itself, and the API would leave the form unable to submit the
    // answers that would end the redirect.
    expect(isOnboardingExempt('/onboarding')).toBe(true);
    expect(isOnboardingExempt('/onboarding/3')).toBe(true);
    expect(isOnboardingExempt('/api/onboarding/answer')).toBe(true);
  });

  it('exempts nothing else', () => {
    expect(isOnboardingExempt('/')).toBe(false);
    expect(isOnboardingExempt('/api/reading')).toBe(false);
    expect(isOnboardingExempt('/account')).toBe(false);
    expect(isOnboardingExempt('/onboarding-bypass')).toBe(false);
  });
});

describe('decide -- signed out', () => {
  it('sends a page to /login', () => {
    /*
     * **`/` USED TO BE THE FIRST LINE OF THIS BLOCK AND IS NOW ASSERTED THE
     * OTHER WAY, IN `decide -- S-D5 makes / dual-render` ABOVE.** Inverted rather
     * than deleted, because this is the ONE cell of the decision table v0.4.0
     * moves and the failure mode of removing an assertion is somebody restoring
     * the behaviour six months later with nothing to argue with.
     *
     * Signed out, `/` now renders a landing page (S-D5). Every other path in
     * this list is untouched, which is the property worth keeping here: the
     * change had to move one cell and nothing else.
     */
    expect(at('/thessaly', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/thessaly/spread3', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/account', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
  });

  it('gives an API caller 401, never a redirect', () => {
    expect(at('/api/reading', signedOut)).toEqual({
      kind: 'json',
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('lets the public paths through', () => {
    expect(at('/login', signedOut)).toEqual({ kind: 'next' });
    expect(at('/terms', signedOut)).toEqual({ kind: 'next' });
    expect(at('/privacy', signedOut)).toEqual({ kind: 'next' });
    expect(at('/api/auth/callback/google', signedOut)).toEqual({ kind: 'next' });
  });

  it('does not send an un-onboarded-looking signed-out user to /onboarding', () => {
    // `onboarded: false` is the shape of BOTH "no session at all" and "session,
    // no profile". The signed-out branch must be checked first, or a stranger is
    // sent to a questionnaire instead of a login page.
    expect(at('/onboarding', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
  });
});

describe('decide -- signed in, not onboarded', () => {
  it('sends a page to /onboarding', () => {
    expect(at('/', halfway)).toEqual({ kind: 'redirect', to: '/onboarding' });
    expect(at('/thessaly/daily', halfway)).toEqual({ kind: 'redirect', to: '/onboarding' });
  });

  it('gives an API caller 403 and not 401', () => {
    // The distinction is the whole point: 401 means "sign in again", 403 means
    // "finish onboarding". They lead to different screens, so the client cannot
    // be left to guess from one status code.
    expect(at('/api/reading', halfway)).toEqual({
      kind: 'json',
      status: 403,
      error: 'Onboarding required',
    });
  });

  it('lets the questionnaire and its endpoints through', () => {
    expect(at('/onboarding', halfway)).toEqual({ kind: 'next' });
    expect(at('/onboarding/2', halfway)).toEqual({ kind: 'next' });
    expect(at('/api/onboarding/answer', halfway)).toEqual({ kind: 'next' });
  });

  it('still lets the public paths through', () => {
    expect(at('/login', halfway)).toEqual({ kind: 'next' });
    expect(at('/terms', halfway)).toEqual({ kind: 'next' });
    expect(at('/api/auth/signout', halfway)).toEqual({ kind: 'next' });
  });
});

describe('decide -- signed in and onboarded', () => {
  it('lets everything through', () => {
    expect(at('/', settled)).toEqual({ kind: 'next' });
    expect(at('/thessaly/spread3', settled)).toEqual({ kind: 'next' });
    expect(at('/api/reading', settled)).toEqual({ kind: 'next' });
    expect(at('/account', settled)).toEqual({ kind: 'next' });
  });

  it('bounces the questionnaire page to /', () => {
    expect(at('/onboarding', settled)).toEqual({ kind: 'redirect', to: '/' });
    expect(at('/onboarding/1', settled)).toEqual({ kind: 'redirect', to: '/' });
  });

  it('leaves the onboarding ENDPOINTS reachable, because /account edits answers', () => {
    // R14/R22: the stepper runs once, but `/account` reuses W3's endpoints to
    // edit and delete answers. Bouncing the API too would break that.
    expect(at('/api/onboarding/answer', settled)).toEqual({ kind: 'next' });
  });
});

describe('decide -- V7 makes /s/ public', () => {
  const SLUG = 'abcdefghjkmn';

  it('lets a stranger open a share link and its OG image', () => {
    expect(at(`/s/${SLUG}`, signedOut)).toEqual({ kind: 'next' });
    /*
     * The OG image is a segment INSIDE `/s/[slug]`, and Next appends a hash to
     * its path in production. A messenger crawler fetching a preview carries no
     * cookie, so it has to be public for the same reason the page does -- and a
     * prefix is the only match that survives the hash.
     */
    expect(at(`/s/${SLUG}/opengraph-image`, signedOut)).toEqual({ kind: 'next' });
    expect(at(`/s/${SLUG}/opengraph-image-abc123.png`, signedOut)).toEqual({ kind: 'next' });
  });

  it('leaves minting and revoking gated', () => {
    // The slug authorizes a READ. Creating one needs a session, and
    // `startsWith('/s/')` does not reach `/api/share`.
    expect(at('/api/share', signedOut)).toEqual({
      kind: 'json',
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('is not a prefix of anything else -- this is why the clause is "/s/"', () => {
    expect(at('/settings', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/s', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/share', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
  });

  it('does not make a signed-in but un-onboarded viewer finish onboarding first', () => {
    // A share link is a capability and its holder may be halfway through the
    // questionnaire, or be somebody else entirely on the same device.
    expect(at(`/s/${SLUG}`, halfway)).toEqual({ kind: 'next' });
    expect(at(`/s/${SLUG}`, settled)).toEqual({ kind: 'next' });
  });

  it('never lets /history become public alongside it', () => {
    // V6's rule 5, asserted from V7's side: `/history` is somebody's entire
    // reading history and `isPublic()` must never learn it.
    expect(at('/history', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/history/abc', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
  });
});

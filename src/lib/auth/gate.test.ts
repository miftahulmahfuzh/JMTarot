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

  /**
   * ── THE STANDALONE SIGN-IN HANDOFF (2026-08-09) ─────────────────────────────
   *
   * **THE FIRST SIGN-IN IS THE CASE THIS CLAUSE EXISTS FOR, AND IT IS THE ONE
   * NOBODY WOULD TEST BY HAND.** `/handoff` is reached inside an
   * `SFSafariViewController` overlay, immediately after Google, by a querent whose
   * `onb` is `false` because they have never been here before. Without the
   * exemption they would be redirected to `/onboarding` INSIDE the overlay and
   * answer nine screens in a browser whose session the standalone app can never
   * see -- so the feature would fail for every new user and work for every
   * returning one, which is the worst available way for it to fail.
   */
  it('exempts /handoff, so a FIRST sign-in binds instead of onboarding in the overlay', () => {
    expect(isOnboardingExempt('/handoff')).toBe(true);
    expect(at('/handoff', halfway)).toEqual({ kind: 'next' });
  });

  it('exempts nothing else', () => {
    expect(isOnboardingExempt('/')).toBe(false);
    expect(isOnboardingExempt('/api/reading')).toBe(false);
    expect(isOnboardingExempt('/account')).toBe(false);
    expect(isOnboardingExempt('/onboarding-bypass')).toBe(false);
    // The `'/s/'` precedent: an exact match and never a prefix, so a second route
    // cannot become exempt by being spelled similarly.
    expect(isOnboardingExempt('/handoffs')).toBe(false);
    expect(isOnboardingExempt('/handoff/x')).toBe(false);
  });
});

describe('/handoff is gated, and isPublic() must never learn it', () => {
  /*
   * **IT NEEDS A SESSION -- BINDING ONE IS ITS ENTIRE JOB.** `isPublic()`
   * short-circuits `decide()` above every signed-in arm, so putting it there
   * would leave the page rendering for a stranger who typed the URL, with no user
   * to bind and nothing to say. The exemption above is the right list; this is the
   * assertion that keeps the two apart.
   */
  it('is not public, in either tree', () => {
    expect(isPublic('/handoff')).toBe(false);
    expect(isPublic('/en/handoff')).toBe(false);
  });

  it('sends a signed-out visitor to /login rather than rendering', () => {
    expect(at('/handoff', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
  });

  it('lets a settled querent through, because a second sign-in is ordinary', () => {
    // A returning querent whose session lapsed signs in from the installed app
    // exactly as a new one does, and `onb` is true for them.
    expect(at('/handoff', settled)).toEqual({ kind: 'next' });
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

describe('v0.5.0 / A1 -- /admin is an ORDINARY GATED PATH, and isPublic() knows nothing', () => {
  /*
   * ── THIS BLOCK ASSERTS AN ABSENCE, AND IT PASSED THE DAY IT WAS WRITTEN ─────
   *
   * A-D2: **`isPublic()` MUST NEVER LEARN `/admin`.** Not as a convenience, not
   * "so the 404 comes from Next". There is no safe version of the edit, because
   * this function short-circuits `decide()` ABOVE the onboarding check and above
   * the signed-out arm -- so `/admin` in the allowlist makes it reachable by a
   * stranger, which is the whole surface this release is built to hide.
   *
   * What actually hides it is `requireAdmin()` in the handler and
   * `requireAdminPage()` in the page (A-D2, plan §1.2). Middleware's job on this
   * path is exactly what it already does for `/history` and `/account`: send a
   * signed-out visitor to `/login`.
   *
   * So there is no production change to fence, and the fence is that a future
   * "helpful" edit turns this block red. Reconciliation R1 is the ruling:
   * `git diff --stat src/lib/auth/gate.ts src/middleware.ts` is EMPTY for A1.
   */
  it('never makes /admin public, under any spelling', () => {
    expect(isPublic('/admin')).toBe(false);
    expect(isPublic('/admin/')).toBe(false);
    expect(isPublic('/admin/users')).toBe(false);
    expect(isPublic('/admin/users/9f3c1d2e-0000-4000-8000-000000000000')).toBe(false);
    expect(isPublic('/admin/tokens')).toBe(false);
    expect(isPublic('/admin/blog')).toBe(false);
  });

  it('never makes /api/admin/** public', () => {
    /*
     * `/api/admin/users/<id>/answer/worst_thing` is the most sensitive endpoint
     * this project has ever had. It is not in `isPublic()` and the `/api/auth/`
     * and `/api/cron/` prefixes do not reach it -- which is worth an assertion,
     * because `startsWith('/api/')` clauses live three lines apart in that file.
     */
    expect(isPublic('/api/admin')).toBe(false);
    expect(isPublic('/api/admin/users')).toBe(false);
    expect(isPublic('/api/admin/users/abc/answer/worst_thing')).toBe(false);
    expect(isPublic('/api/admin/blog')).toBe(false);
  });

  it('NEVER OPENS /admin UNDER /en/ EITHER -- contract G2, the worst outcome', () => {
    /*
     * Only the CONTENT clause strips a locale prefix. `/admin` is not a content
     * path, so `contentRewrite` returns `passthrough` and `decide()` receives
     * `/en/admin` spelled exactly as requested -- where it matches nothing, and
     * Next has no such route. The v0.4.0 assertion for `/en/history` is the
     * precedent and this is the same fence one release later.
     */
    expect(isPublic('/en/admin')).toBe(false);
    expect(isPublic('/en/admin/users')).toBe(false);
    expect(isPublic('/en/api/admin/users')).toBe(false);
  });

  it('does not open anything that merely LOOKS like /admin', () => {
    // The negative controls on the absence of a clause. They pass today, and
    // they are what catches somebody writing `startsWith('/admin')` -- which
    // would also open `/administrator` if such a route were ever added.
    expect(isPublic('/adminx')).toBe(false);
    expect(isPublic('/administrator')).toBe(false);
    expect(isPublic('/admins')).toBe(false);
  });

  it('sends a signed-out visitor on /admin to /login (roadmap §10.2)', () => {
    expect(at('/admin', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/admin/users', { signedIn: false, onboarded: true })).toEqual({
      kind: 'redirect',
      to: '/login',
    });
  });

  it('gives a signed-out API caller 401, not a redirect and not a 404', () => {
    /*
     * The 404 is `requireAdmin()`'s answer to a SIGNED-IN non-admin. Middleware
     * answers a signed-out caller the way it answers every other gated endpoint,
     * because making middleware 404 here would mean teaching the edge which paths
     * are admin paths -- a second copy of the allowlist decision, on the one
     * runtime that cannot read an environment secret safely.
     *
     * **RECONCILIATION R36: §10.2 NEEDS BOTH CODES AND A PROBE THAT CONFLATES
     * THEM REDS ON CORRECT BEHAVIOUR.** 401 signed out, 404 signed in.
     */
    expect(at('/api/admin/users', signedOut)).toEqual({
      kind: 'json',
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('still sends a signed-in, UN-ONBOARDED user to /onboarding', () => {
    // R34, documented and deliberately not fixed: for an ADMIN this redirect
    // reads exactly like a misspelt ADMIN_EMAILS. Exempting /admin would mean
    // `isOnboardingExempt` learning an admin path, and S-D5's argument is that
    // this chain must not acquire special cases.
    expect(at('/admin', halfway)).toEqual({ kind: 'redirect', to: '/onboarding' });
    expect(isOnboardingExempt('/admin')).toBe(false);
  });

  it('lets a signed-in, onboarded NON-ADMIN through the gate -- AND THAT IS CORRECT', () => {
    /*
     * **`next` HERE IS NOT ACCESS.** The gate's job ends at "this request has a
     * session and a completed profile". `requireAdminPage()` is what turns this
     * querent into a 404, in the page, one layer down. Written out because a
     * reader who sees `next` for `/admin` will otherwise conclude the gate is
     * broken and will "fix" it in `isPublic()` -- the one edit that opens the
     * surface to a stranger.
     */
    expect(at('/admin', settled)).toEqual({ kind: 'next' });
    expect(at('/api/admin/users', settled)).toEqual({ kind: 'next' });
  });
});

/**
 * ── v0.7.0's `/chat`, AND `gate.ts` GETS ZERO LINES (`F1-D11`, `C-D12`) ────
 *
 * `isPublic()` is an allowlist of exact strings and narrow prefixes plus one content
 * clause; **`/chat` is simply not in it**, so no code change is required and none may
 * be made. That is A1's ruling about `/admin` in the same words — *"`src/middleware.ts`
 * and `src/lib/auth/gate.ts` need NO code change"* — and **the deliverable is these
 * negative controls rather than an edit.**
 *
 * The reason `/chat` gets the same sentence `/history` gets, only stronger: **this room
 * contains a person's six onboarding answers spoken aloud** (`C-D8`).
 */
describe('/chat is gated, and the gate learns nothing to make it so', () => {
  it('is NEVER public', () => {
    expect(isPublic('/chat')).toBe(false);
    expect(isPublic('/api/chat/message')).toBe(false);
    expect(isPublic('/api/chat/advance')).toBe(false);
    expect(isPublic('/api/chat/state')).toBe(false);
  });

  it('MUST 404 UNDER /en/ -- THE WORST OUTCOME IN THIS RELEASE, FENCED (G2)', () => {
    /*
     * **THE ASSERTION NAMED FOR THE WORST OUTCOME**, following the v0.4.0 precedent
     * directly above.
     *
     * `isPublicContentPath` returns false for `/chat` (it is not a content path), so
     * the content clause's `/en/` strip never runs for it, so the path stays gated —
     * and having fallen through the gate it matches nothing in the route tree, which
     * is a real 404. **`G2` is the rule that makes this hold: the content clause
     * strips `/en/`, and the other clauses must not.** Unconditional stripping would
     * make `/en/api/chat/message` public.
     *
     * A prefix-stripping bug here would not merely expose a page: it would expose a
     * room where three characters quote a stranger's onboarding answers back at them.
     */
    expect(isPublic('/en/chat')).toBe(false);
    expect(isPublic('/en/api/chat/message')).toBe(false);
    expect(isPublic('/en/api/chat/state')).toBe(false);
  });

  it('sends a signed-out visitor to /login, and an API caller a 401', () => {
    expect(at('/chat', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/en/chat', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/api/chat/state', signedOut)).toEqual({
      kind: 'json',
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('sends a signed-in, UN-ONBOARDED querent to /onboarding', () => {
    /*
     * Not a special case — the ordinary arm. And it is the right one for this route
     * specifically: **the readers' context IS the six answers and the Lotus**, so a
     * half-onboarded querent has nothing for the room to be built from.
     * `requireUser()` requires completed onboarding by default and answers 403 on the
     * API side, which is the same decision one layer down.
     */
    expect(at('/chat', halfway)).toEqual({ kind: 'redirect', to: '/onboarding' });
    expect(at('/api/chat/message', halfway)).toEqual({
      kind: 'json',
      status: 403,
      error: 'Onboarding required',
    });
  });

  it('lets a settled querent through', () => {
    expect(at('/chat', settled)).toEqual({ kind: 'next' });
    expect(at('/api/chat/advance', settled)).toEqual({ kind: 'next' });
  });

  it('does not open a path that merely LOOKS like the chat', () => {
    // `isPublic()` is exact strings and narrow prefixes for this reason -- the same
    // property `/arcanax` and `/arcana-foo` are the negative controls for.
    expect(isPublic('/chatter')).toBe(false);
    expect(isPublic('/chat/anything')).toBe(false);
    expect(at('/chatter', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
  });
});

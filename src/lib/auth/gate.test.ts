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
    expect(at('/', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
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

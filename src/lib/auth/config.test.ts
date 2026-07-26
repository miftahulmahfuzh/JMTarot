/**
 * The contract between the two NextAuth instances.
 *
 * `middleware.ts` builds one from `authConfig` alone; `auth.ts` builds another from
 * `authConfig` plus the DB-touching callbacks. Everything the EDGE side needs to
 * make a routing decision therefore has to live in `authConfig` -- and the failure
 * mode when it does not is an infinite redirect loop with nothing in any log.
 *
 * These tests exist because that loop shipped once. No test caught it: `decide()`
 * was correct, `readToken()` was correct, the build passed, and typecheck passed.
 * What was wrong was WHERE a pure callback lived.
 */
import { describe, expect, it } from 'vitest';
import { authConfig, enforceAbsoluteCap, SESSION_COOKIE_NAME } from './config';
import { readToken } from './token';

/** Shaped like what @auth/core hands the session callback on the JWT path. */
function callSession(token: Record<string, unknown>) {
  const session = {
    user: { name: 'Miftahul Mahfuzh', email: 'mahfuzh74@gmail.com', image: null },
    expires: '2026-08-01T00:00:00.000Z',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @auth/core's
  // callback param is a union across session strategies; the JWT branch is the
  // only one this project can reach.
  return (authConfig.callbacks.session as any)({ session, token });
}

describe('authConfig carries what the edge needs', () => {
  it('defines the session callback, so middleware sees uid/onb/loc', () => {
    // THE REGRESSION TEST. With this callback in auth.ts instead of here,
    // middleware's `request.auth.user` carries only Auth.js's defaults, readToken
    // returns null, middleware concludes "signed out" and redirects / to /login --
    // and /login sees a valid session and redirects back. ERR_TOO_MANY_REDIRECTS
    // after a sign-in that actually succeeded.
    expect(authConfig.callbacks.session).toBeTypeOf('function');
  });

  it('produces a session that readToken accepts', () => {
    // The two halves of the loop, asserted end to end: what the session callback
    // emits must satisfy the narrowing that middleware applies to it. Testing the
    // callback's output shape alone would not catch a renamed claim.
    const out = callSession({
      sub: '107384726150398472615',
      uid: '3f9a2c71-4b0e-4d21-9c88-1a2b3c4d5e6f',
      onb: false,
      loc: 'id',
      email: 'mahfuzh74@gmail.com',
      name: 'Miftahul Mahfuzh',
    });

    const narrowed = readToken(out.user);
    expect(narrowed).not.toBeNull();
    expect(narrowed?.uid).toBe('3f9a2c71-4b0e-4d21-9c88-1a2b3c4d5e6f');
    expect(narrowed?.onb).toBe(false);
    expect(narrowed?.loc).toBe('id');
  });

  it('defines the jwt callback, and it returns the SAME token object', () => {
    // config.ts's header rule. A callback here that returned a NEW object would
    // strip every claim auth.ts added, on the user's next navigation, because
    // middleware re-encodes the cookie from whatever this returns.
    const token = { uid: 'x', onb: true } as never;
    expect(authConfig.callbacks.jwt).toBeTypeOf('function');
    expect(enforceAbsoluteCap(token)).toBe(token); // identity, not equality
  });

  it('does not put a database-shaped callback in the shared config', () => {
    // The mirror of the rule above: `signIn` and anything async that touches
    // `@/lib/db` belongs in auth.ts, or `pg` lands in the edge bundle. Only the
    // build can prove the bundle, but this catches the intent cheaply.
    expect(Object.keys(authConfig.callbacks).sort()).toEqual(['jwt', 'session']);
  });

  it('uses a JWT session, since every claim-based shortcut depends on it', () => {
    expect(authConfig.session.strategy).toBe('jwt');
  });

  it('sends BOTH sign-in and error failures to our own page', () => {
    // `error` unset means a failed token exchange renders Auth.js's own unstyled
    // English 500 page. An expired or revoked client secret both land there.
    expect(authConfig.pages).toEqual({ signIn: '/login', error: '/login' });
  });

  it('names the session cookie without the __Secure- prefix on http', () => {
    // The dev-session route encrypts its JWE with this exact string as the HKDF
    // salt. A mismatch produces a cookie that decrypts to nothing, which reads
    // exactly like a wrong AUTH_SECRET.
    expect(SESSION_COOKIE_NAME).toBe('authjs.session-token');
  });
});

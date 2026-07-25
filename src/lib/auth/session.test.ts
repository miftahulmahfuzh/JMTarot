import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from './session';

const SECRET = 'test-secret-at-least-32-bytes-long-ok';

describe('session', () => {
  it('round-trips a username', async () => {
    const token = await signSession('miftah', SECRET);
    expect(await verifySession(token, SECRET)).toBe('miftah');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession('miftah', SECRET);
    expect(await verifySession(token, 'another-secret-also-32-bytes-long!')).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signSession('miftah', SECRET);
    expect(await verifySession(token.slice(0, -3) + 'aaa', SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signSession('miftah', SECRET, '-1s');
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  /*
   * Middleware calls verifySession on whatever arrived in the cookie, which is
   * attacker-controlled. It must never throw: an exception there is a 500 on
   * every route, which is a worse failure than a redirect to /login.
   */
  it('returns null rather than throwing on junk input', async () => {
    for (const junk of ['', 'not-a-jwt', 'a.b.c', '...', '{}']) {
      expect(await verifySession(junk, SECRET)).toBeNull();
    }
  });

  it('rejects a token carrying no subject', async () => {
    // A well-formed, correctly-signed token is still not a session if it does
    // not say who it is for.
    const token = await signSession('', SECRET);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
});

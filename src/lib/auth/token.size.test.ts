/**
 * The session cookie must not chunk. Plan §11 item 6.
 *
 * @auth/core splits an oversized session into `authjs.session-token.0`, `.1`, ...
 * It works, but it multiplies the per-request header cost and makes every future
 * debugging session harder -- and it happens SILENTLY, which is the actual problem.
 * This turns §5.2's measurement into a regression test, so a future claim addition
 * fails here instead of quietly splitting the cookie in production.
 *
 * Encoded with the real `encode` from @auth/core/jwt, not an approximation, because
 * the whole number of interest is the JWE overhead (`dir` + `A256CBC-HS512`, plus a
 * 43-char `kid` thumbprint) and an estimate of that is worth nothing.
 */
import { encode } from '@auth/core/jwt';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME } from './config';

/** `4096 - 160`, from @auth/core's lib/utils/cookie.js. */
const CHUNK_THRESHOLD = 3936;

/** Irrelevant to the length, but `encode` requires one. Not a real secret. */
const SECRET = 'test-secret-at-least-32-bytes-long-for-hkdf-aaaaaaaa';

/**
 * A REPRESENTATIVE claim set, deliberately at the pessimistic end of realistic:
 * a 21-digit Google `sub`, a long-ish Gmail address, a three-part display name.
 */
const CLAIMS = {
  sub: '107384726150398472615',
  uid: '3f9a2c71-4b0e-4d21-9c88-1a2b3c4d5e6f',
  email: 'someone.with.a.longish.name@gmail.com',
  name: 'Someone With A Longish Name',
  onb: true,
  loc: 'id' as const,
  abs: 1_800_000_000,
};

describe('the session cookie stays under the chunking threshold', () => {
  it('encodes our claim set well under 3936 bytes', async () => {
    const token = await encode({
      salt: SESSION_COOKIE_NAME,
      secret: SECRET,
      maxAge: 60 * 60 * 24,
      token: CLAIMS,
    });

    // Reported on failure, because the useful information is the margin, not the
    // boolean. §5.2 measured 548 B for this shape.
    expect(
      token.length,
      `cookie is ${token.length} B, threshold ${CHUNK_THRESHOLD} B`,
    ).toBeLessThan(CHUNK_THRESHOLD);
  });

  it('is not already close to the threshold', async () => {
    // A test that only fires AT the limit would pass at 3900 B and leave no room
    // for W3/W6 to add a claim. Half the budget is the real bar, and 548 B is
    // nowhere near it.
    const token = await encode({
      salt: SESSION_COOKIE_NAME,
      secret: SECRET,
      maxAge: 60 * 60 * 24,
      token: CLAIMS,
    });
    expect(token.length).toBeLessThan(CHUNK_THRESHOLD / 2);
  });

  it('shows what stripping `picture` buys, so nobody re-adds it casually', async () => {
    // W2-6 strips `picture` to null: measured 548 B without against 676 B with, on
    // EVERY request. Nothing in the design renders a user avatar, reconciliation
    // R21 settled that deliberately, and users.avatar_url still stores the value.
    const withPicture = await encode({
      salt: SESSION_COOKIE_NAME,
      secret: SECRET,
      maxAge: 60 * 60 * 24,
      token: { ...CLAIMS, picture: 'https://lh3.googleusercontent.com/a/ACg8ocLKvF7xQ2mN9pR4sT6uV8wX0yZ1aB3cD5eF7gH9iJ=s96-c' },
    });
    const without = await encode({
      salt: SESSION_COOKIE_NAME,
      secret: SECRET,
      maxAge: 60 * 60 * 24,
      token: CLAIMS,
    });

    expect(withPicture.length).toBeGreaterThan(without.length);
  });
});

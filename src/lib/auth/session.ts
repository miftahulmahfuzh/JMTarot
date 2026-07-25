import { SignJWT, jwtVerify } from 'jose';
import { requireEnv } from '@/lib/env';

export const SESSION_COOKIE = 'jmtarot_session';

/** 30 days. Long on purpose: two people, each typing their password once. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * jose is used rather than a Node crypto helper because signature
 * verification has to run in middleware, which is the edge runtime. bcryptjs
 * cannot run there, which is why password checking stays in a Node route and
 * only this half is edge-safe.
 */
function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(
  username: string,
  secret = requireEnv('AUTH_SECRET'),
  expiresIn: string | number = `${SESSION_MAX_AGE}s`,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key(secret));
}

/**
 * Returns the username, or null.
 *
 * Never throws. Middleware calls this with whatever arrived in the cookie,
 * which is attacker-controlled: a malformed token must become a redirect to
 * /login, not a 500 on every route in the app. jose throws for expiry, bad
 * signature and malformed input alike, and all three mean the same thing here.
 */
export async function verifySession(
  token: string | undefined,
  secret = requireEnv('AUTH_SECRET'),
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    // A correctly-signed token with no subject is not a session. Guard against
    // it rather than returning `undefined` as if it were a username.
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

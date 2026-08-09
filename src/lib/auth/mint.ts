import 'server-only';

/**
 * Encode a genuine Auth.js session JWE by hand.
 *
 * ── TWO CALLERS, AND THE SECOND IS WHY THIS FILE EXISTS ──────────────────────
 *
 * `POST /api/auth/dev-session` has done this inline since W2, for the iframe
 * harnesses under `public/cards/`. `POST /api/auth/handoff` now does it too, in
 * PRODUCTION, so that the installed home-screen app can be handed a session
 * cookie in its own jar. Two hand-rolled copies of the encode would be two places
 * to get the `salt` wrong, and the symptom of getting it wrong is a cookie that
 * decrypts to nothing — which reads exactly like a wrong `AUTH_SECRET` and sends
 * you looking in the wrong file.
 *
 * **THE COOKIE ATTRIBUTES ARE DELIBERATELY NOT HERE.** They legitimately differ:
 * the dev route sets `secure: false` because it only exists on `http://localhost`
 * and a secure cookie there is set and then never sent back. The part that must
 * not drift is the encoding, and that is all this file owns.
 *
 * ── THIS IS NOT A SECOND WAY TO AUTHENTICATE ─────────────────────────────────
 *
 * It mints a token from claims a caller supplies; it decides nothing. Both
 * callers establish who the user is first — the dev route through the real
 * sign-in upsert, the claim route through a row the overlay bound after Google
 * said yes — and neither reads a user id from a request body. A third caller that
 * cannot say the same sentence does not belong here.
 */
import { encode } from '@auth/core/jwt';
import type { Locale } from '@/data/types';
import { requireEnv } from '@/lib/env';
import { SESSION_COOKIE_NAME } from './config';
import { nowSeconds } from './token';
import { absoluteCapSeconds, sessionMaxAgeSeconds } from './ttl';

export type SessionClaims = {
  /** The EXTERNAL subject — `users.google_sub`, never `users.id`. `token.ts`'s rule. */
  sub: string;
  /** `users.id`. The only key anything joins on. */
  uid: string;
  email: string;
  name: string | null;
  /** `profiles.completed_at !== null`. Gates every route below `/onboarding`. */
  onb: boolean;
  loc: Locale;
};

/**
 * The JWE and the `Max-Age` that goes with it.
 *
 * `salt` IS THE COOKIE NAME. @auth/core uses it as the HKDF salt when deriving
 * the encryption key from `AUTH_SECRET`, so the name and the ciphertext are bound
 * together — which is the whole reason `SESSION_COOKIE_NAME` is imported rather
 * than written out at either call site.
 *
 * `abs` is stamped from NOW rather than carried in, because both callers mint at
 * most a few minutes after the sign-in they represent and the absolute cap is
 * thirty days. Naming it here rather than at the call sites keeps
 * `SESSION_ABSOLUTE_TTL_DAYS = 0` meaning "no cap, so no claim" in one place.
 *
 * `picture` is never set, matching `auth.ts`: measured at 548 B of cookie without
 * it against 676 B with it, on every request, for a value nothing renders.
 */
export async function encodeSessionToken(
  claims: SessionClaims,
): Promise<{ token: string; maxAge: number }> {
  const maxAge = sessionMaxAgeSeconds(process.env.SESSION_TTL_HOURS);
  const cap = absoluteCapSeconds(process.env.SESSION_ABSOLUTE_TTL_DAYS);

  const token = await encode({
    salt: SESSION_COOKIE_NAME,
    secret: requireEnv('AUTH_SECRET'),
    maxAge,
    token: {
      sub: claims.sub,
      uid: claims.uid,
      email: claims.email,
      name: claims.name,
      onb: claims.onb,
      loc: claims.loc,
      ...(cap > 0 ? { abs: nowSeconds() + cap } : {}),
    },
  });

  return { token, maxAge };
}

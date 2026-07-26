/**
 * The session token's claim shape, and its runtime narrowing.
 *
 * PURE. No next-auth, no next/server, nothing under @/lib/db. Imported by
 * config.ts and therefore by the edge bundle.
 *
 * WHY THERE IS A NARROWING FUNCTION AT ALL, when the token is our own encrypted
 * JWE and the claims are set by our own callback: because `readToken` is what
 * stops `undefined` reaching a SQL query as a foreign key. The cookie is
 * attacker-controlled input in the sense that matters -- it may be from a
 * previous deploy with a different claim set, from a rolled-back release, or
 * simply from before `uid` existed. A token with no `uid` must become "no
 * session", not a `CurrentUser` whose `id` is `undefined`; the second one reaches
 * the database and inserts orphan rows.
 *
 * WHAT EACH CLAIM COSTS. Measured, not estimated: the four claims we add beyond
 * Auth.js's defaults cost 107 bytes of cookie on every request, and stripping
 * `picture` gives 128 of them back. `token.size.test.ts` asserts the encoded
 * total stays under @auth/core's 3936-byte chunking threshold, so a future claim
 * addition fails a test rather than silently splitting the session cookie into
 * `authjs.session-token.0`, `.1`, ...
 */
import type { Locale } from '@/data/types';

/** Reconciliation R4: `Locale` is defined once, in `src/data/types.ts`. */
export type { Locale };

export type JmtarotToken = {
  /** Google's OIDC `sub`, or `dev:<username>`. Stable, but NEVER a foreign key. */
  sub: string;
  /** users.id. THE only key anything in the schema joins on. */
  uid: string;
  email: string;
  name: string | null;
  /** profiles.completed_at IS NOT NULL, cached so the gate costs no DB read. */
  onb: boolean;
  loc: Locale;
  /**
   * Absolute expiry, epoch SECONDS. Set once at sign-in and never refreshed.
   *
   * Absent means no cap, which is what `SESSION_ABSOLUTE_TTL_DAYS=0` asks for.
   */
  abs?: number;
};

const LOCALES = new Set<string>(['id', 'en'] satisfies Locale[]);

/**
 * Any RFC-4122-shaped uuid, not specifically v4.
 *
 * `gen_random_uuid()` produces v4 today, and pinning the version here would make
 * a future switch to v7 -- which is a better choice for a primary key -- fail as
 * "every session is invalid" rather than as a migration.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(t: unknown): t is Record<string, unknown> {
  return typeof t === 'object' && t !== null;
}

/**
 * The decoded token, narrowed, or null.
 *
 * Never throws: it is called with whatever arrived in the cookie, and a
 * malformed value must become a redirect to /login rather than a 500 on every
 * route in the app.
 */
export function readToken(t: unknown): JmtarotToken | null {
  if (!isRecord(t)) return null;

  const { sub, uid, email, name, onb, loc, abs } = t;

  if (typeof sub !== 'string' || sub.length === 0) return null;
  // The check that earns this whole file. A uuid-shaped string or nothing.
  if (typeof uid !== 'string' || !UUID.test(uid)) return null;
  if (typeof email !== 'string' || email.length === 0) return null;
  if (typeof onb !== 'boolean') return null;
  if (typeof loc !== 'string' || !LOCALES.has(loc)) return null;
  if (abs !== undefined && typeof abs !== 'number') return null;

  return {
    sub,
    uid,
    email,
    // Google always sends a name for a consented profile scope, but it is the
    // one claim the app only uses for greeting copy, so a missing one is a
    // nullable field rather than a rejected session.
    name: typeof name === 'string' && name.length > 0 ? name : null,
    onb,
    loc: loc as Locale,
    ...(abs === undefined ? {} : { abs }),
  };
}

/**
 * Just the user id, for callers that have nothing else to do with the token.
 *
 * Separate from `readToken` because the `trigger === 'update'` branch of the jwt
 * callback runs against a token it is about to REWRITE -- the `onb` and `loc` in
 * it are exactly the stale values being replaced, so demanding they narrow
 * cleanly first would be asking the wrong question.
 */
export function readUid(t: unknown): string | null {
  if (!isRecord(t)) return null;
  const { uid } = t;
  return typeof uid === 'string' && UUID.test(uid) ? uid : null;
}

/**
 * Has the absolute cap passed?
 *
 * Checked on the EDGE, on every matched request, and set in Node at sign-in.
 * Returning true makes config.ts's jwt callback return null, which makes
 * @auth/core clean the session cookies (verified: lib/actions/session.js, the
 * `else` branch of `if (token !== null)`).
 *
 * A malformed `abs` counts as expired. Fail closed: the cost is one extra
 * sign-in, and the alternative is a cookie that a corrupted claim has quietly
 * exempted from the only bound this design has on a stolen session.
 */
export function absoluteCapExpired(t: unknown, nowSeconds: number): boolean {
  if (!isRecord(t)) return false; // not our problem -- readToken rejects it anyway
  const { abs } = t;
  if (abs === undefined || abs === null) return false; // no cap was set
  if (typeof abs !== 'number' || !Number.isFinite(abs)) return true;
  return abs <= nowSeconds;
}

/** Seconds, floored. @auth/core's own `exp`/`iat` are in the same unit. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * THE EXTERNAL IDENTITY, AND IT COMES FROM `account.providerAccountId`. NOT
 * `token.sub`, NOT `user.id`. This function exists because getting it wrong
 * creates a brand-new user row on every single sign-in, and it did.
 *
 * @auth/core DELIBERATELY DISCARDS the provider's `sub`. In
 * `lib/actions/callback/oauth/callback.js:218`:
 *
 *     const user = {
 *       ...userFromProfile,
 *       // The user's id is intentionally not set based on the profile id, as
 *       // the user should remain independent of the provider and the profile id
 *       // is saved on the Account already, as `providerAccountId`.
 *       id: crypto.randomUUID(),
 *     }
 *
 * and `token.sub` is set from `user.id`. So `token.sub` is a FRESH RANDOM UUID on
 * every sign-in. Using it as `users.google_sub` means the upsert's conflict target
 * never matches, so every sign-in inserts. The symptom is not an error: it is two
 * rows with the same email, a working app, and every memory feature silently
 * reading an empty history because yesterday's readings belong to yesterday's row.
 *
 * `account.providerAccountId` is right for BOTH providers:
 *   OAuth       `userFromProfile.id` -- Google's real `sub`, a decimal string
 *                (callback.js:233)
 *   Credentials `user.id` -- our `dev:<username>` (callback/index.js:240)
 *
 * A UUID-SHAPED VALUE IS REFUSED. @auth/core falls back to `crypto.randomUUID()`
 * for `providerAccountId` too, when the profile had no `sub`. That fallback has the
 * same non-repeating disease, so accepting it would reintroduce this bug through
 * the back door. No legitimate value here is uuid-shaped: Google's subs are decimal
 * and ours are `dev:`-prefixed. Refusing means a failed sign-in the user can retry,
 * instead of an account they can never return to.
 */
export function readExternalSub(account: unknown): string | null {
  if (!isRecord(account)) return null;
  const { providerAccountId } = account;
  if (typeof providerAccountId !== 'string' || providerAccountId.length === 0) return null;
  if (UUID.test(providerAccountId)) return null;
  return providerAccountId;
}

/**
 * The one sign-in check that needs no I/O, and it is a security control.
 *
 * An unverified Google email is not an identity: anyone can create a Google
 * account claiming an address they do not control, and `users.email` is what
 * support and every "signed in as" line will trust. Refusing here, in
 * `callbacks.signIn`, means it costs nothing -- no database round trip has
 * happened yet.
 */
export function maySignIn(p: { emailVerified: boolean }): boolean {
  return p.emailVerified === true;
}

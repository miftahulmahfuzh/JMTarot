/**
 * The standalone sign-in handoff, as names and arithmetic.
 *
 * **EDGE-SAFE, AND THAT IS A HARD CONSTRAINT.** `src/middleware.ts` imports this
 * to mint the device secret and name the cookie, so it must carry no
 * `server-only`, no `next/*` — not even a type — and nothing under `@/lib/db`.
 * The DB-touching halves live in `handoffMint.ts` (NODE-ONLY) and in the two
 * route files, exactly as `config.ts` and `auth.ts` are split.
 *
 * **WEB CRYPTO, NEVER `node:crypto`, FOR THE SAME REASON.** `randomBytes` and
 * `createHash` do not exist on the edge; `crypto.getRandomValues` and
 * `crypto.subtle` do, and are also present in Node 24. The cost is that
 * `deviceHash` is async, which is fine — it is only ever called from a route
 * handler or a server action.
 *
 * ── WHAT THE MECHANISM IS FOR ────────────────────────────────────────────────
 *
 * **THE HOME-SCREEN APP COULD NEVER SIGN IN, AND IT IS STORAGE RATHER THAN
 * ROUTING.** Measured on an iPhone (iOS 18.7) on 2026-08-09 and written up in
 * `docs/plans/2026-08-09-standalone-signin-handoff-design.md` §1. iOS seeds a new
 * web app's cookie jar from Safari **at install time** and the two diverge from
 * then on: a cookie written after the install never crosses. Signing in navigates
 * to `accounts.google.com`, which iOS hands to an `SFSafariViewController`
 * overlay, so the session cookie lands in Safari's jar and the standalone shell
 * never sees it. The querent presses `Done`, returns, and is signed out — for
 * ever, through every retry.
 *
 * **NOTHING HERE MOVES A COOKIE BETWEEN JARS, BECAUSE NOTHING CAN.** What it does
 * is get the installed app to make one request the server answers with a session
 * cookie — a cookie set on a response to the PWA's own request is in the PWA's jar
 * by definition. Finding 6 of §1 is what guarantees that request never leaves the
 * app: **the manifest's `scope` does not govern what iOS punts to the overlay, the
 * ORIGIN does**, so any same-origin navigation stays inside the standalone shell
 * however far outside `scope` it is.
 *
 *   1. `manifest.ts` launches the app at {@link START_URL}. Middleware sees the
 *      marker and sets {@link PWA_COOKIE} — 256 bits, httpOnly, long-lived, and
 *      existing only in the standalone jar.
 *   2. The sign-in server action sees that cookie and writes an `auth_handoffs`
 *      row holding {@link deviceHash} of it plus a fresh challenge, then sends
 *      Google to {@link handoffPath} as the return address.
 *   3. Google returns into the OVERLAY, where there is a session. `/handoff`
 *      fills in `user_id` and asks the querent to press `Done`.
 *   4. Back in the app, `HandoffClaim` POSTs the device secret to
 *      `/api/auth/handoff`, and the session cookie is minted on THAT response.
 *
 * **THE OVERLAY KNOWS THE CHALLENGE AND NEVER THE DEVICE SECRET; THE APP KNOWS
 * THE DEVICE SECRET AND NEVER SEES THE OVERLAY.** A usable session needs both
 * halves to have happened, so neither is a capability alone — which is why the
 * only value that appears in a URL is the challenge, and why it grants nothing
 * but the right to bind a row somebody else must still collect.
 *
 * **BLAST RADIUS: NONE, FOR EVERYONE ELSE.** No {@link PWA_COOKIE} means no row
 * is ever written, so Safari, Chrome, desktop and every existing session stay on
 * a byte-identical path to the one they were on before this shipped.
 */

/**
 * The device secret's cookie.
 *
 * **NOT `NEXT_PUBLIC_`, NOT READABLE FROM JAVASCRIPT, AND THAT IS THE WHOLE
 * SECURITY MODEL.** httpOnly means the capability cannot be exfiltrated by any
 * script on the page; `SameSite=Lax` means it rides the top-level navigations
 * this flow is made of and nothing else. The claim request carries it because it
 * is a same-origin `fetch` with credentials, and for no other reason.
 *
 * `jmt_` to match `jmt_locale`, the only other cookie this application writes.
 */
export const PWA_COOKIE = 'jmt_pwa';

/**
 * How long the device secret lives.
 *
 * **LONGER THAN ANY SESSION, ON PURPOSE.** It is not an authenticator; it is the
 * standalone jar's name for itself, and it has to still be there the day a
 * seven-day session lapses and the querent signs in again. 400 days is the
 * ceiling Chrome enforces on `Max-Age` and is therefore the longest honest value
 * to write.
 */
export const PWA_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

/**
 * The query marker on the manifest's `start_url`.
 *
 * A QUERY PARAMETER RATHER THAN A PATH, because `/` has to keep being `/`: it is
 * the canonical address of the landing page, it carries an `hreflang` set and a
 * canonical tag, and a second address for it would be a duplicate in the index.
 * A parameter is invisible to `contentRewrite`, which is handed the pathname
 * alone (`prefix.ts`'s signature is `(pathname, signedIn)` precisely so a query
 * string cannot reach it).
 */
export const PWA_LAUNCH_PARAM = 'src';
export const PWA_LAUNCH_VALUE = 'pwa';

/** The manifest's `start_url`. One owner, so the two halves cannot drift. */
export const START_URL = `/?${PWA_LAUNCH_PARAM}=${PWA_LAUNCH_VALUE}`;

/**
 * How long a handoff row is claimable.
 *
 * Five minutes is the whole of a Google consent screen plus a slow phone, and it
 * is short enough that a challenge read out of a server log is worthless by the
 * time anybody reads it. A row that expires unclaimed costs the querent one
 * retry; a row that lives for an hour is an hour in which a bound session is
 * sitting in a table waiting to be collected.
 */
export const HANDOFF_TTL_SECONDS = 300;

/** The parameter the challenge travels in. */
export const CHALLENGE_PARAM = 'c';

/**
 * Was this request the home-screen app launching?
 *
 * **ONLY ON `/`, DELIBERATELY.** The marker exists in exactly one place — the
 * manifest's `start_url` — so honouring it anywhere else would only widen the
 * ways a stray link can plant the cookie in an ordinary browser. It is not
 * harmful there (see `/handoff`'s own escape hatch), but it is not wanted.
 */
export function isPwaLaunch(pathname: string, params: URLSearchParams): boolean {
  return pathname === '/' && params.get(PWA_LAUNCH_PARAM) === PWA_LAUNCH_VALUE;
}

/** Where Google is told to return to. Read back by `/handoff`. */
export function handoffPath(challenge: string): string {
  return `/handoff?${CHALLENGE_PARAM}=${encodeURIComponent(challenge)}`;
}

/**
 * 256 bits, base64url.
 *
 * Used for BOTH the device secret and the challenge, because both are opaque
 * values whose only property is being unguessable, and giving them different
 * sizes would invite the reader to work out which one mattered less.
 *
 * `btoa` rather than `Buffer`: this file runs on the edge. base64url rather than
 * base64 for `crypto.ts`'s reason — no `+`, `/`, `=` or `$`, so the value is safe
 * in a cookie, a URL, a JSON body and a log line with no quoting anywhere.
 */
export function newSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * `sha256(secret)`, hex.
 *
 * **THE TABLE HOLDS THE HASH AND NEVER THE SECRET.** A dump of `auth_handoffs`
 * therefore cannot be replayed into a session: the claim compares the hash of
 * what the browser presented, so possession of the row is not possession of the
 * capability. Same reasoning as never storing a password.
 *
 * Hex rather than base64url here, alone in this file, because it is a column a
 * person will `select` by hand when something is wrong and hex survives a
 * copy-paste out of a terminal.
 */
export async function deviceHash(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

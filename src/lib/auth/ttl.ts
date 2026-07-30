/**
 * The two session expiries, as seconds, read defensively from the environment.
 *
 * PURE. No next-auth, no next/server, nothing under @/lib/db. This file is
 * imported by config.ts, which middleware imports, so anything it pulls in lands
 * in the edge bundle -- and it is imported by tests, which have no bundler at
 * all. Both properties are why the parsing lives here and not inline in
 * config.ts.
 *
 * The two numbers are easy to conflate, so plainly:
 *
 *   SESSION_TTL_HOURS         idle,     SLIDES. Any request resets it.
 *   SESSION_ABSOLUTE_TTL_DAYS absolute, NEVER slides. Bounds a stolen cookie.
 *
 * Both parsers are deliberately forgiving about the input and strict about the
 * output. `SESSION_TTL_HOURS=` -- set but empty -- is exactly the shape a
 * .env.example line has, and it must not produce a session that expires
 * immediately; `SESSION_TTL_HOURS=Infinity` must not produce one that expires in
 * the year 275760.
 */

/**
 * 168 hours -- seven days. **Roadmap D3 said 24 and this is a deliberate
 * amendment**, made on 2026-07-30 after a returning querent reported the landing
 * page where they expected the reader picker.
 *
 * ── WHY IT MOVED, WHICH IS NOT THE REASON IT LOOKS LIKE ─────────────────────
 *
 * Nothing was broken. `/` has dual-rendered since S-D5 and does so correctly; the
 * report was a 24-hour idle timeout doing exactly what it says. What changed is
 * what expiry LOOKS like: before the landing page, an expired session 302'd to
 * `/login`, and one tap on a Google button restored it almost instantly because
 * Google's own session persists — it read as "the app remembered me". Now the
 * same expiry presents a page addressed to a stranger. A one-day idle window is
 * simply too short for an app somebody opens most days but not every day.
 *
 * ── WHAT IT WIDENS. THREE THINGS, ALL OF THEM REAL ──────────────────────────
 *
 *   1. A STOLEN COOKIE stays useful for up to seven idle days instead of one.
 *      `SESSION_ABSOLUTE_TTL_DAYS` is unchanged at 30 and is still the only hard
 *      bound, because there is no server-side revocation on the JWT path.
 *   2. ADMIN REVOCATION (A-D1/R38). `requireAdmin()` reads the session token and
 *      not `users.deleted_at`, so demoting an admin — including deleting the
 *      admin's own account — is bounded by THIS value. One day becomes seven.
 *   3. ERASURE ON A SECOND DEVICE. `DELETE /api/account` clears the cookie it can
 *      see; a session in another browser survives until idle expiry. Inside the
 *      30-day restore grace, but seven days rather than one.
 *
 * **Do not raise it to 720 to match the absolute cap.** At that point the sliding
 * window does no work at all and all three costs above stretch to a month.
 */
const DEFAULT_TTL_HOURS = 168;

/** 30 days, per reconciliation R11. */
const DEFAULT_ABSOLUTE_TTL_DAYS = 30;

/**
 * A year, in hours and in days.
 *
 * Not a policy, a sanity bound: past this the value is more likely a typo or a
 * unit confusion (someone writing seconds into an hours variable) than an
 * intention, and falling back to the default is more useful than honouring it.
 */
const MAX_TTL_HOURS = 24 * 366;
const MAX_ABSOLUTE_TTL_DAYS = 366;

/**
 * A positive finite integer, or null.
 *
 * `Number('')` is 0 and `Number(' ')` is 0, which is why the empty check comes
 * first: an unset-looking variable must reach the default, not zero.
 */
function positiveInteger(raw: string | undefined, max: number): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n <= 0 || n > max) return null;
  return n;
}

/**
 * `session.maxAge`, in seconds. Defaults to 24 hours.
 *
 * This is the ONE place the idle timeout is decided, and both halves of the
 * edge/Node split reach it through config.ts, so the two cannot drift. Do not
 * also set `jwt.maxAge`: @auth/core already defaults it to `session.maxAge`, and
 * setting both is two places to forget.
 */
export function sessionMaxAgeSeconds(raw?: string): number {
  const hours = positiveInteger(raw, MAX_TTL_HOURS) ?? DEFAULT_TTL_HOURS;
  return hours * 60 * 60;
}

/**
 * The absolute cap, in seconds. Defaults to 30 days. **0 means no cap.**
 *
 * Zero is the one value that is honoured rather than replaced, because it is the
 * documented escape hatch: an operator who explicitly wants a purely sliding
 * session can have one, and knows from .env.example what that costs. Every other
 * unusable value falls back to 30 days, so a typo fails safe rather than
 * silently removing the only bound on a stolen cookie.
 */
export function absoluteCapSeconds(raw?: string): number {
  if (raw !== undefined && raw.trim() === '0') return 0;
  const days = positiveInteger(raw, MAX_ABSOLUTE_TTL_DAYS) ?? DEFAULT_ABSOLUTE_TTL_DAYS;
  return days * 60 * 60 * 24;
}

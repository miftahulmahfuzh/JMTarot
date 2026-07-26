/**
 * The querent's calendar day, and the browser session id, both untrusted.
 *
 * ISOMORPHIC AND DEPENDENCY-FREE. The client sends these two values, the
 * server validates them, and both sides need the header names -- so this file
 * imports nothing and can be pulled into either bundle.
 *
 * WHY THE CLIENT SENDS ITS OWN DATE AT ALL (roadmap §7). `todayKey()` in
 * `src/lib/storage.ts` already explains it from the other side: the server
 * does not know the querent's calendar day, and `toISOString()` rolls over at
 * 07:00 in Jakarta. Every server-side feature keyed to "today" -- the daily
 * summary, the "this week" frequency window -- reads `local_date`, which is
 * stored as sent and NEVER recomputed from `created_at`.
 *
 * WHY IT IS NEVER REJECTED (plan A15). It is untrusted input, so it is bounded;
 * but a bad date must not cost anyone their reading. Out-of-range falls back to
 * the server's UTC date and emits `analytics.local_date_fallback`, so the
 * breakage is COUNTABLE rather than silent. If that event has volume, a client
 * is broken and somebody can see it.
 */

/** The browser session id (plan A7). A header, not a cookie: a cookie rides on
 *  every image request in the fan and survives the tab. */
export const SESSION_HEADER = 'x-jm-session';

/** The querent's own `YYYY-MM-DD`, from `todayKey()`. */
export const LOCAL_DATE_HEADER = 'x-jm-local-date';

export type LocalDateResult =
  | { date: string; source: 'client'; received: string }
  | {
      date: string;
      source: 'fallback';
      reason: 'absent' | 'malformed' | 'out_of_range';
      received: string | null;
    };

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The server's own UTC date, as `YYYY-MM-DD`.
 *
 * The fallback, and deliberately the only one available: `readings.local_date`
 * is `not null` and there is no third option. It is wrong for roughly a third
 * of a day for a Jakarta user, which is exactly why every use of it emits a
 * diagnostic event.
 */
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Validate a client-supplied calendar day.
 *
 * The order of the checks matters -- each one is only meaningful once the
 * previous has passed -- and the reasons are distinguished because they mean
 * different things operationally: `absent` is a client that forgot the header,
 * `malformed` is a client that computed it wrong, and `out_of_range` is a
 * broken clock or a tampered request.
 */
export function parseLocalDate(raw: unknown, now: Date = new Date()): LocalDateResult {
  const fallbackDate = utcDateString(now);

  if (typeof raw !== 'string' || raw === '') {
    return { date: fallbackDate, source: 'fallback', reason: 'absent', received: null };
  }

  if (!SHAPE.test(raw)) {
    return { date: fallbackDate, source: 'fallback', reason: 'malformed', received: raw };
  }

  /*
   * The ROUND TRIP, not just `isNaN`. `new Date('2026-02-30T00:00:00Z')` does
   * not throw and does not produce NaN -- it silently normalises to March 2nd,
   * and storing that would put a reading on a day the querent never had. Only
   * re-formatting and comparing catches it, and it catches `2026-13-01` too.
   */
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    return { date: fallbackDate, source: 'fallback', reason: 'malformed', received: raw };
  }

  /*
   * ONE DAY EITHER SIDE, NOT TWO. Real UTC offsets run from -12 to +14, so a
   * legitimate client's local date is the server's UTC date, the day before, or
   * the day after, and nothing else. Admitting anything further would let a
   * reading dated 1970 sit inside the "this week" window forever.
   */
  const serverMidnight = new Date(`${fallbackDate}T00:00:00Z`).getTime();
  const offsetDays = Math.round((parsed.getTime() - serverMidnight) / 86_400_000);
  if (Math.abs(offsetDays) > 1) {
    return { date: fallbackDate, source: 'fallback', reason: 'out_of_range', received: raw };
  }

  return { date: raw, source: 'client', received: raw };
}

/*
 * Version 1-8, variant 8/9/a/b. Anything else is not a uuid this app minted.
 * The point is not cryptographic: it stops an arbitrary 4KB string being
 * stored in `events.session_id` and `readings.session_id`, which are indexed.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A uuid-shaped session id, or null. Never throws, never stores junk. */
export function validSessionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

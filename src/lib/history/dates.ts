/**
 * Dates for the history filter. PURE, isomorphic, no imports.
 *
 * **DO NOT REUSE `parseLocalDate` FROM `src/lib/analytics/localdate.ts` HERE.**
 * That function bounds its input to +/-1 day around the server's UTC date,
 * because it answers "is this plausibly the querent's TODAY" -- UTC-12 to UTC+14
 * is the whole range of real answers to that question. A history filter's whole
 * job is to ask about days that are NOT today, so that bound would reject every
 * interesting request, and it would do it as a 400 that reads like a client bug.
 * Same column, same format, opposite question. Both functions are used by
 * `/api/history`, one per parameter, and its comment says which is which.
 *
 * WHY THIS IS NOT IN `src/lib/db/queries/`. `queries/contract.test.ts` requires
 * the database handle as the first parameter of every exported function in that
 * directory, and a date validator has no handle to take. Same wall W3 hit with
 * the Lotus cache and W5 with `windowBounds`; same resolution.
 */

/**
 * How many chips the strip will render at most. Beyond this the native picker
 * takes over -- a horizontal strip nobody can reach the end of is not a control.
 */
export const DAY_CHIP_LIMIT = 120;

/**
 * How many distinct days `historyDays` will return. Roughly a year of daily use.
 *
 * ARBITRARY, AND KNOWN TO BE. Nobody has 400 days of readings yet. W5's frequency
 * ladder has a 666-day window, which is longer than this -- so a verdict could in
 * principle name a card drawn on a day this filter cannot navigate to. Raising it
 * to 700 costs one integer and has not been done because 400 already exceeds
 * anything real; recorded so the inconsistency is a known one rather than a bug
 * somebody discovers.
 */
export const HISTORY_DAY_LIMIT = 400;

/**
 * Nothing in this app predates the 2026 rewrite. The floor only keeps
 * `0001-01-01` and friends out of an indexed comparison.
 */
const FLOOR = '2000-01-01';

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar day, not in the future, in `'YYYY-MM-DD'`.
 *
 * THE ROUND TRIP, NOT JUST `isNaN`, for the reason `parseLocalDate` records:
 * `new Date('2026-02-30T00:00:00Z')` silently normalises to March 2nd and is a
 * perfectly valid `Date`, so only re-formatting and comparing catches it. It
 * catches `2026-13-01` in the same move.
 *
 * Both bounds are STRING comparisons, which is exact for a zero-padded ISO date
 * and is what lets this run identically on the server and in the browser with no
 * timezone anywhere in it.
 */
export function isHistoryDate(raw: unknown, today: string): raw is string {
  if (typeof raw !== 'string' || !SHAPE.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return false;
  return raw >= FLOOR && raw <= today;
}

/**
 * Whole days between two `'YYYY-MM-DD'` strings. Positive means `date` is in the
 * past relative to `today`.
 *
 * THIS IS THE ONE PLACE `new Date('YYYY-MM-DD')` IS CORRECT IN THIS CODEBASE,
 * and it looks exactly like the bug `local_date` exists to prevent -- so, in as
 * many words: both operands are parsed into the SAME fiction (UTC midnight) and
 * only the DIFFERENCE between them is used. No instant is ever rendered, no zone
 * is consulted, and the answer is identical in every timezone on earth. Rendering
 * either side, or parsing only one of them, would be the bug.
 *
 * `Math.round` and not `Math.floor`: UTC midnight to UTC midnight is an exact
 * multiple of 86_400_000 with no leap seconds in the JavaScript time scale, so
 * the division is already whole -- the rounding is there so that a future change
 * introducing a fractional millisecond cannot turn 2 into 1.
 */
export function dayOffset(today: string, date: string): number {
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

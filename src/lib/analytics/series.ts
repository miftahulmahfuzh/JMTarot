/**
 * Calendar days as strings. **PURE. ZERO IMPORTS. NO TIMEZONE ANYWHERE.**
 *
 * A3, v0.5.0. The bucket layer every admin aggregate is zero-filled through, and the
 * one part of A3's data path a unit test can reach at all.
 *
 * ── WHY A BUCKET KEY IS A STRING AND NEVER A `date_trunc` ────────────────────
 *
 * `date_trunc('week', local_date)` returns a `timestamptz`, and inside a raw `sql`
 * template there is no Drizzle mapper, so postgres.js hands it back as something like
 * `'2026-07-27 00:00:00+00'` -- **a timestamp rendered in the server's zone, wearing
 * the type you asserted.** That is the exact class of bug `local_date` exists to
 * prevent, reintroduced one layer up. `local_date` is already a `'YYYY-MM-DD'` string;
 * it is bucketed with string operations and it crosses the driver boundary as a
 * string.
 *
 * The SQL side of that rule, recorded here because this file is where somebody looks:
 *
 *   day    `local_date::text`
 *   week   `to_char(local_date - ((extract(dow from local_date)::int + 6) % 7), 'YYYY-MM-DD')`
 *   month  `substring(local_date::text, 1, 7)`
 *
 * **`::text` IS REQUIRED AND ITS ABSENCE IS A HARD ERROR.** `dateCol` is
 * `date(name, { mode: 'string' })` and `mode: 'string'` is a **Drizzle-side** mapping
 * -- the Postgres column is still `date`, so `substring(local_date, 1, 7)` fails with
 * *"function substring(date, integer, integer) does not exist"*. Measured against the
 * local Postgres 16 on 2026-07-29, and A3's plan had it wrong on the first draft. It
 * fails loudly, which makes it the friendliest member of this family: every other one
 * is silent.
 *
 * ── ZERO-FILL LIVES HERE AND NOT IN SQL ─────────────────────────────────────
 *
 * `generate_series` over dates returns timestamps, straight back into the trap above.
 * And a gap is what a forecast is most sensitive to: a missing day silently becomes a
 * missing *observation* rather than a zero, which tilts every slope upward. Filling in
 * TypeScript makes the gap a unit test's subject.
 *
 * ── `new Date('2026-07-29T00:00:00Z')`, NEVER `new Date('2026-07-29')` ───────
 *
 * The date-only form's parsing is implementation-defined in older engines and has
 * been read as local time by some. The explicit `T00:00:00Z` form is exact, and UTC
 * has no DST, so adding 86_400_000 per step is exact arithmetic rather than calendar
 * arithmetic. `localdate.ts` uses the explicit form for the same reason and says so.
 */

/**
 * The longest range any admin query will enumerate.
 *
 * **THE SAME NUMBER AS `HISTORY_DAY_LIMIT` AND AS `LLM_CALLS_RETENTION_DAYS`, ON
 * PURPOSE.** The retention window and the maximum queryable range being equal is what
 * makes it impossible for the dashboard to offer a range whose data was already swept
 * -- a smaller retention number produces a chart that looks broken and reads as a bug
 * in the chart. Three constants that must agree, agreeing.
 *
 * It is not imported from `@/lib/history/dates` because this module has **zero
 * imports** by contract, and that contract is worth more than one deduplicated
 * integer. `series.test.ts` asserts the two are equal, so a drift is a red test rather
 * than a discovery.
 */
export const MAX_RANGE_DAYS = 400;

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC midnight for a bare calendar day, or `NaN` for anything that is not one. */
function utc(day: string): number {
  if (typeof day !== 'string' || !SHAPE.test(day)) return NaN;
  const t = new Date(`${day}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return NaN;
  // The round trip, not just `isNaN`: `new Date('2026-02-30T00:00:00Z')` normalises
  // to March 2nd and is a perfectly valid Date. `isHistoryDate` records the same.
  return new Date(t).toISOString().slice(0, 10) === day ? t : NaN;
}

const DAY_MS = 86_400_000;

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Every day from `from` to `to`, **inclusive at both ends**.
 *
 * `[]` for a malformed date, for a reversed range, and for anything longer than
 * `MAX_RANGE_DAYS` -- **the caller refuses rather than this function truncating.** A
 * silently shortened range is a chart that is missing its left-hand side and says
 * nothing about it.
 */
export function enumerateDays(from: string, to: string): string[] {
  const a = utc(from);
  const b = utc(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return [];
  const n = (b - a) / DAY_MS + 1;
  if (n > MAX_RANGE_DAYS) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(fmt(a + i * DAY_MS));
  return out;
}

/**
 * Days in an inclusive range, or `0` if the range is not usable.
 *
 * Separate from `enumerateDays().length` so a caller can bound a range **before**
 * allocating 400 strings, and so `meanCallsPerDay` has an honest denominator.
 */
export function dayCount(from: string, to: string): number {
  const a = utc(from);
  const b = utc(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return (b - a) / DAY_MS + 1;
}

/**
 * The **Monday** of `day`'s week, ISO. `''` for a malformed input.
 *
 * `(dow + 6) % 7` is what turns Postgres's and JavaScript's Sunday-is-0 into
 * Monday-is-0. **The naive `getUTCDay()` puts Sunday in the following week**, which is
 * wrong for one day in seven and is invisible for about a month -- long enough that
 * the first person to notice is looking at a weekly chart wondering why the last bar
 * is short. The SQL twin in this file's header uses the same expression, so the two
 * bucketings cannot disagree.
 */
export function weekStart(day: string): string {
  const t = utc(day);
  if (Number.isNaN(t)) return '';
  const dow = new Date(t).getUTCDay();
  return fmt(t - ((dow + 6) % 7) * DAY_MS);
}

/** `'YYYY-MM'`. `''` for a malformed input. A pure string slice; no Date involved. */
export function monthOf(day: string): string {
  return Number.isNaN(utc(day)) ? '' : day.slice(0, 7);
}

/**
 * Fill the gaps. Returns one row per day in `days`, in `days`' order.
 *
 * **A row whose key is not in `days` is DROPPED**, deliberately: the caller enumerated
 * the range it asked about, and a bucket outside it is a range predicate that did not
 * do what its author thought. Dropping it makes a chart's x-axis exactly the range
 * requested; keeping it would put a bar past the edge of the axis.
 */
export function zeroFill<T>(
  rows: readonly T[],
  days: readonly string[],
  key: (row: T) => string,
  empty: (day: string) => T,
): T[] {
  const byDay = new Map<string, T>();
  for (const row of rows) byDay.set(key(row), row);
  return days.map((day) => byDay.get(day) ?? empty(day));
}

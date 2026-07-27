/**
 * The eight frequency windows, and the date maths that turns one into a pair of
 * bounds (W5 plan §3.1, M1).
 *
 * WHY THIS IS NOT IN `src/lib/db/queries/frequency.ts`, WHERE THE PLAN PUTS IT.
 * `queries/contract.test.ts` enforces that every exported function in that
 * directory takes the database handle as its first parameter, and
 * `windowBounds` is pure -- it has no handle to take. This is the same wall W3
 * hit with the Lotus cache and resolved the same way (CLAUDE.md: "The cache
 * cannot live in `queries/`. Rule 1 of that directory needs the handle first").
 * The plan predates the contract test; the contract test wins, and the split it
 * forces is the right one anyway: the maths is unit-testable with no database,
 * which is exactly what the plan's Task 1 asked for when it said the file should
 * grow its database dependency in a later commit.
 *
 * So: pure window maths here, the single-table scan in `queries/frequency.ts`
 * taking `db` first, and the orchestration that joins them in
 * `src/lib/memory/frequency.ts`.
 *
 * MILLISECOND ARITHMETIC IS ALL IN UTC, AND NEVER `new Date(string)`.
 * Every date crossing this module is a `'YYYY-MM-DD'` string that already means
 * the QUERENT'S calendar day (roadmap §7). `new Date('2026-07-26')` parses as
 * UTC midnight and then renders in the server's zone, which is a day out for
 * exactly the users `local_date` exists to protect. `Date.UTC(y, m, d)` and
 * manual formatting keep the string a string and the arithmetic exact.
 *
 * `today` IS ALWAYS A PARAMETER AND NEVER `new Date()`. The server does not know
 * what day it is where the user is. Same for `birthDate`, which is a parameter
 * rather than a read: roadmap §6's non-negotiable is that the profile is read
 * once and cached, and this module never touches `profiles`.
 */
import type { Locale } from '@/data/types';
import { tFor } from '@/lib/i18n/catalog';

export type WindowKey =
  | 'week' | 'd3' | 'd13' | 'd666' | 'month' | 'quarter' | 'year' | 'birthday';

export type WindowSpec =
  | { key: WindowKey; kind: 'rolling'; days: number }
  | { key: WindowKey; kind: 'calendar'; unit: 'week' | 'month' | 'quarter' | 'year' }
  | { key: WindowKey; kind: 'anniversary' };

/**
 * Eight named specs in one object, not eight functions (M1).
 *
 * All eight are the same query with a different lower bound, so eight functions
 * would drift. Computing the bounds in TypeScript rather than with `date_trunc`
 * makes the maths unit-testable without a database and removes any dependence
 * on the server's locale or on the database's `DateStyle`/week-start settings.
 */
export const WINDOWS: Record<WindowKey, WindowSpec> = {
  week: { key: 'week', kind: 'calendar', unit: 'week' },
  d3: { key: 'd3', kind: 'rolling', days: 3 },
  d13: { key: 'd13', kind: 'rolling', days: 13 },
  d666: { key: 'd666', kind: 'rolling', days: 666 },
  month: { key: 'month', kind: 'calendar', unit: 'month' },
  quarter: { key: 'quarter', kind: 'calendar', unit: 'quarter' },
  year: { key: 'year', kind: 'calendar', unit: 'year' },
  birthday: { key: 'birthday', kind: 'anniversary' },
};

/**
 * The windows the release UI actually walks, narrowest first (§3.3).
 *
 * "This week" is a more interesting statement than "this year", so the ladder
 * stops at the first window that passes the gate. The four windows NOT on the
 * ladder -- `d3`, `d666`, `quarter`, `birthday` -- are fully supported by the
 * query and the cache and are simply not surfaced yet; they are one page away
 * whenever `/jejak` is built, which is deliberately not in this workstream.
 */
export const VERDICT_LADDER: readonly WindowKey[] = ['week', 'd13', 'month', 'year'];

export type WindowBounds = { from: string; to: string };

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `'2026-07-26'` -> epoch ms at UTC midnight, or null if it is not a real date. */
function parse(date: string): number | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  /*
   * Round-trip check, because `Date.UTC(2026, 1, 30)` is 2 March rather than an
   * error. Without this, '2026-02-30' silently becomes a window starting two
   * days later than the caller asked for.
   */
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/** Epoch ms at UTC midnight -> `'YYYY-MM-DD'`. */
function format(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The birthday's date in a given year.
 *
 * A 29 FEBRUARY BIRTH DATE RESOLVES TO 28 FEBRUARY IN A NON-LEAP YEAR, NOT
 * 1 MARCH. The person's birthday has passed by the end of February, and pushing
 * it into March would silently shorten the window by a day in three years out of
 * every four.
 */
function anniversaryIn(year: number, month: number, day: number): number {
  if (month === 2 && day === 29 && !isLeap(year)) return Date.UTC(year, 1, 28);
  return Date.UTC(year, month - 1, day);
}

/**
 * The bounds for one window, as two inclusive `'YYYY-MM-DD'` strings.
 *
 * Returns null when the window cannot be computed: the `birthday` spec with no
 * `birth_date`, or a malformed date from either argument. Null rather than a
 * throw, and rather than a silently wrong window, because every caller's
 * response to "no window" is already M14's -- render nothing -- so a null costs
 * one branch the caller has anyway.
 *
 * `to` IS ALWAYS `today`, in every window including the calendar ones. There are
 * no readings in the future, so a `week` bound running to Sunday would only add
 * empty days to the range and make the phrase "this week" describe a stretch of
 * time the querent has not lived yet.
 *
 * Rules, each of which is a named test:
 *  - `rolling` is INCLUSIVE OF BOTH ENDS. `d3` on 2026-07-26 is
 *    `2026-07-24 .. 2026-07-26` -- three calendar days, not four.
 *  - `week` STARTS MONDAY. ISO-8601 and Postgres agree on Monday; Indonesian
 *    wall calendars commonly start Sunday, and the difference is visible on
 *    exactly one day a week. Settled with Miftah on 2026-07-27 (plan open
 *    question 1): Monday.
 *  - `quarter` is the standard calendar quarter -- Jan-Mar, Apr-Jun, Jul-Sep,
 *    Oct-Dec.
 *  - `birthday` is `[most recent anniversary of birth_date that is <= today,
 *    today]`. Crossing a year boundary is the normal case.
 *  - ON THE BIRTHDAY ITSELF THE WINDOW IS ONE DAY, `[today, today]`, and the
 *    gate then hides it. Settled with Miftah on 2026-07-27 (plan open question
 *    2): leave it collapsed, because "since your last birthday" means the same
 *    thing on that day as on every other, and `birthday` is not on
 *    VERDICT_LADDER so nothing surfaces it in this release anyway.
 */
export function windowBounds(
  spec: WindowSpec,
  today: string,
  birthDate?: string | null,
): WindowBounds | null {
  const todayMs = parse(today);
  if (todayMs === null) return null;

  if (spec.kind === 'rolling') {
    return { from: format(todayMs - (spec.days - 1) * DAY_MS), to: today };
  }

  if (spec.kind === 'calendar') {
    const d = new Date(todayMs);
    switch (spec.unit) {
      case 'week': {
        // getUTCDay(): 0 = Sunday. Monday-based offset makes Sunday 6.
        const offset = (d.getUTCDay() + 6) % 7;
        return { from: format(todayMs - offset * DAY_MS), to: today };
      }
      case 'month':
        return { from: format(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), to: today };
      case 'quarter': {
        const firstMonth = Math.floor(d.getUTCMonth() / 3) * 3;
        return { from: format(Date.UTC(d.getUTCFullYear(), firstMonth, 1)), to: today };
      }
      case 'year':
        return { from: format(Date.UTC(d.getUTCFullYear(), 0, 1)), to: today };
    }
  }

  // anniversary
  if (!birthDate) return null;
  const birthMs = parse(birthDate);
  if (birthMs === null) return null;

  const birth = new Date(birthMs);
  const bMonth = birth.getUTCMonth() + 1;
  const bDay = birth.getUTCDate();
  const year = new Date(todayMs).getUTCFullYear();

  const thisYear = anniversaryIn(year, bMonth, bDay);
  const from = thisYear <= todayMs ? thisYear : anniversaryIn(year - 1, bMonth, bDay);
  return { from: format(from), to: today };
}

/**
 * The phrase the frequency prompt is told to use instead of the dates (§3.6).
 *
 * Lives here rather than at the call site so that adding a window to `WINDOWS`
 * without giving it a phrase is a compile error: `MessageKey` is a closed union and
 * the template below has to resolve to one of its members.
 */
export function windowPhrase(key: WindowKey, locale: Locale): string {
  // No cast. The template literal's type is
  // `memory.frequency.windows.${WindowKey}`, and it is assignable to MessageKey
  // only while the catalog has an entry for every window -- which is the whole
  // point. A cast here would turn that guarantee back into a runtime blank.
  return tFor(locale)(`memory.frequency.windows.${key}`);
}

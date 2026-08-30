/**
 * OFFSET + INSTANT -> THE QUERENT'S WALL CLOCK. One producer, no exceptions.
 *
 * PURE, and a leaf over two other leaves: `@/lib/chat/types` for the shape and
 * `@/lib/analytics/utcoffset` for the bounds and the UTC date. No `server-only`
 * (phase 8's `eligibility.ts` is pure and will import this), no `next/*`, no
 * `react`, no `process.env`.
 *
 * ── THE ARITHMETIC IS DONE IN UTC ON PURPOSE ───────────────────────────────
 *
 * `shifted.getUTCHours()` on an instant that has been moved forward by the
 * offset, NEVER `getHours()`, which reads the SERVER's zone -- `iad1`, `sin1`
 * or a WSL box, three different answers for one line of code. Shift, then read
 * in UTC: the standard trick, written down because the wrong version looks
 * identical and passes every test run in a UTC container.
 *
 * ── AND THE DAY COMES FROM THE OFFSET, NOT FROM THE HEADER ─────────────────
 *
 * When the offset is known, `localDate` is DERIVED rather than taken from
 * `x-jm-local-date`. Two sources for one fact is two sources that will
 * disagree, and the one that must win is the one consistent with the clock time
 * rendered beside it: a prompt saying "Sabtu, 30 Agustus, 08:39" whose day and
 * whose hour came from different places is the class of bug this phase exists
 * to end. The header's value is kept as the fallback for the `known: false`
 * arm, where it is strictly better than the server's UTC date.
 */
import { MAX_UTC_OFFSET_MINUTES, MIN_UTC_OFFSET_MINUTES } from '@/lib/analytics/utcoffset';
import type { ChatClock, DayPart, Weekday } from './types';

export type ResolveClockArgs = {
  /** From `chat_threads.utc_offset_minutes`, or a freshly parsed header. */
  offsetMinutes: number | null;
  /** Injected so every test is deterministic. Defaults to now. */
  now?: Date;
  /** The client's `x-jm-local-date`, when a client sent one. Used only when the
   *  offset is unknown; the derived day wins whenever there is one. */
  fallbackLocalDate?: string | null;
};

/**
 * **IT NEVER THROWS AND NEVER RETURNS `NaN`.** It is on the path of every chat
 * model call, and `ttl.ts`'s rule applies: a defensive parse falls back, it does
 * not produce a number that is wrong in a way nothing can see. An out-of-range
 * stored offset -- which no writer can produce today, but a future one might --
 * degrades to `known: false` rather than rendering a time on no planet.
 */
export function resolveChatClock(args: ResolveClockArgs): ChatClock {
  /* An invalid `Date` makes `toISOString()` THROW. This function is called from
   * inside `advance()`, which is written not to throw at all. */
  const now =
    args.now instanceof Date && !Number.isNaN(args.now.getTime()) ? args.now : new Date();

  const offsetMinutes = args.offsetMinutes;
  const usable =
    typeof offsetMinutes === 'number' &&
    Number.isInteger(offsetMinutes) &&
    offsetMinutes >= MIN_UTC_OFFSET_MINUTES &&
    offsetMinutes <= MAX_UTC_OFFSET_MINUTES;

  if (!usable) {
    return {
      known: false,
      offsetMinutes: null,
      localDate: args.fallbackLocalDate ?? now.toISOString().slice(0, 10),
    };
  }

  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const iso = shifted.toISOString();

  const hour = shifted.getUTCHours();
  return {
    known: true,
    offsetMinutes,
    localDate: iso.slice(0, 10),
    localTime: iso.slice(11, 16),
    /* `getUTCDay()` is 0–6 by specification and `WEEKDAYS` is Sunday-first, so this
     * index is total. **The ONE place the integer becomes the token**; nothing
     * downstream sees the integer. */
    weekday: WEEKDAYS[shifted.getUTCDay()],
    part: dayPartOf(hour),
    minutesOfDay: hour * 60 + shifted.getUTCMinutes(),
  };
}

/** Sunday-first, matching `Date.prototype.getUTCDay()`'s numbering. */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const satisfies
  readonly Weekday[];

/** The five parts, in order. Phase 7's `MATERIAL_ORDER`-adjacent tables index off this. */
export const DAY_PARTS = ['morning', 'midday', 'afternoon', 'evening', 'late'] as const satisfies
  readonly DayPart[];

/**
 * Which part of the day an hour falls in. **Total over every integer**, so a corrupted hour
 * files under `late` rather than becoming `undefined` in a prompt.
 *
 * The boundaries are Indonesian — pagi, siang, sore, malam, larut — because `id` is the
 * source language. `late` starts at 22, which is where phase 8's default quiet window
 * starts; that agreement is deliberate and is the reason these boundaries won over the
 * other candidate set.
 */
export function dayPartOf(hour: number): DayPart {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'midday';
  if (h >= 15 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'late';
}

/**
 * The weekday of a `'YYYY-MM-DD'` string. **NOT VIA A `Date`, EVER.**
 *
 * Phase 7's function, landed here so there is one calendar in the release. `brief.ts`
 * rehydrates a `tod:<date>:<part>` key at plan time with no offset in hand, so it needs a
 * weekday from a bare string — and `local_date`'s trap (*"`getMonth()` on a server in UTC
 * wishes somebody in Jakarta a happy birthday a day early"*) eats a weekday exactly the
 * same way. This is integer arithmetic over the three numbers in the string: it has no
 * timezone, so it cannot be right in one and wrong in another.
 *
 * `null` on a malformed string rather than a throw — `brief.ts`'s rule is that an
 * unrecognised key is a run it cannot describe, not one it should fail.
 */
const SAKAMOTO = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

export function weekdayOf(localDate: string): Weekday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const y = Number(localDate.slice(0, 4));
  const m = Number(localDate.slice(5, 7));
  const d = Number(localDate.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const yy = m < 3 ? y - 1 : y;
  const idx =
    (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + SAKAMOTO[m - 1] + d) %
    7;
  return WEEKDAYS[idx];
}

/**
 * `to` minus `from`, in whole local calendar days. `0` is today, `1` is yesterday.
 *
 * Phase 2's function, landed here for the same one-calendar reason. **Two `'YYYY-MM-DD'`
 * STRINGS, and the arithmetic is done at UTC midnight** — `shiftLocalDate`'s technique in
 * `context.ts`. Both dates have already had the offset applied, so treating them as UTC
 * midnights is exact rather than approximate. `null` on anything unparseable.
 */
export function localDayDelta(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

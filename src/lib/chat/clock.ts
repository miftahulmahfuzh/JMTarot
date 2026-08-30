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
import type { Locale } from '@/data/types';
import { MAX_UTC_OFFSET_MINUTES, MIN_UTC_OFFSET_MINUTES } from '@/lib/analytics/utcoffset';
import { formatLocalDate } from '@/lib/i18n/format';
import type { ChatClock, DayPart, KnownChatClock, Weekday } from './types';

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

/**
 * MODEL-FACING VOCABULARY, NEVER UI COPY (`LABELS`' rule in `prompt/build.ts`).
 *
 * **ONE TABLE FOR THE WHOLE RELEASE.** `<waktu>`, the director's `SEKARANG:` line and phase
 * 7's `time_of_day` material notes all read it, which is the point: a second table is how
 * one prompt ends up saying *"Monday morning"* on one line and *"siang"* on another. Phase
 * 7's `WEEKDAY_WORDS_{ID,EN}` and `DAY_PART_WORDS_{ID,EN}` are cancelled in favour of it.
 *
 * Exported so `chatPromptVersion` can hash it: it is a **static layer** of the prompt, and a
 * change to a weekday word is exactly what `llm_calls.prompt_version` exists to make visible.
 * The rendered value is per-request and is NOT hashed.
 *
 * `weekdays` is indexed by `WEEKDAYS`' Sunday-first order, so it is read with
 * `WEEKDAYS.indexOf(clock.weekday)` and never with a raw integer.
 *
 * `id` IS THE SOURCE AND THE DAY-PART BOUNDARIES ARE ITS OWN — dini hari, pagi, siang, sore,
 * malam. English is given words that fit those hours rather than boundaries of its own, so
 * one hour maps to one member in both locales and a token cannot mean two things per
 * language.
 *
 * The month names come from `formatLocalDate`, which SPLITS the string rather than parsing
 * it — the counterpart trap, and the reason a `local_date` never becomes a `Date`.
 */
export const CHAT_TIME_VOCAB: Record<
  Locale,
  { weekdays: readonly string[]; parts: Record<DayPart, string> }
> = {
  id: {
    weekdays: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    parts: {
      morning: 'pagi',
      midday: 'siang',
      afternoon: 'sore',
      evening: 'malam',
      late: 'dini hari',
    },
  },
  en: {
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    parts: {
      morning: 'morning',
      midday: 'the middle of the day',
      afternoon: 'late afternoon',
      evening: 'evening',
      late: 'the small hours',
    },
  },
};

/**
 * `14.05` / `14:05`. **24-HOUR IN BOTH LOCALES, AND ONLY THE SEPARATOR DIFFERS** —
 * `formatTimeOfDay`'s measured finding in `i18n/format.ts`, reproduced by hand rather than
 * reused, because that function hands a `Date` to `Intl` and lets it render in the RUNTIME's
 * zone. We have an offset and no zone, so the runtime's zone is precisely what must not be
 * consulted. **Do not "deduplicate" this into `formatTimeOfDay`.**
 */
function clockTime(clock: KnownChatClock, locale: Locale): string {
  return locale === 'id' ? clock.localTime.replace(':', '.') : clock.localTime;
}

/**
 * THE SENTENCE. `Jumat, 7 Agustus 2026, 14.05 (siang)`.
 *
 * **ONE PRODUCER FOR BOTH PROMPTS.** The voice wraps it in `<waktu>` and the director
 * prefixes it with `SEKARANG:` / `NOW:`; neither builds its own. Two renderers would
 * eventually disagree about what time it is inside one run, which is a worse bug than the
 * one this phase is fixing.
 *
 * **IT TAKES A `KnownChatClock`**, so a caller cannot reach it without having branched on
 * `clock.known` — which is the whole reason phase 1's type is a discriminated union rather
 * than five nullable fields.
 *
 * **THE YEAR IS INCLUDED AND `<riwayat>`'s dates do not carry one.** Not a mismatch to tidy:
 * `<riwayat>` names days inside a thirty-day window where the year is never in question, and
 * this line is the anchor everything else is measured against.
 *
 * **DIGITS, DELIBERATELY, AND V3's RULE DOES NOT APPLY HERE.** V3 deleted counts from two
 * prompts because *"a model cannot recite a count it was never given"* — the counts were
 * evidence a reader would read out. A clock is not evidence, it is the frame, and the model
 * has to compare it numerically to decide *tadi* from *nanti*. The rule against reciting it
 * lives where it belongs: in the contract, which forbids reading the date out.
 */
export function renderNow(clock: KnownChatClock, locale: Locale): string {
  const vocab = CHAT_TIME_VOCAB[locale];
  const day = vocab.weekdays[WEEKDAYS.indexOf(clock.weekday)] ?? '';
  const date = formatLocalDate(clock.localDate, locale, true);
  return `${day}, ${date}, ${clockTime(clock, locale)} (${vocab.parts[clock.part]})`;
}

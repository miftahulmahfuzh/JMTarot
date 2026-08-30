import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/lib/i18n/locale';
import {
  CHAT_TIME_VOCAB,
  dayPartOf,
  renderNow,
  resolveChatClock,
  WEEKDAYS,
  weekdayOf,
} from './clock';

/** `01:39:48Z` on 2026-08-30 — the bubble that started this workstream. */
const THE_BUG = new Date('2026-08-30T01:39:48.000Z');

describe('resolveChatClock, with an offset', () => {
  it('turns the reported bug into a wall clock', () => {
    const clock = resolveChatClock({ offsetMinutes: 420, now: THE_BUG });
    expect(clock).toEqual({
      known: true,
      offsetMinutes: 420,
      localDate: '2026-08-30',
      localTime: '08:39',
      /* 2026-08-30 is a Sunday. A token, not an integer — see `Weekday`. */
      weekday: 'sun',
      part: 'morning',
      minutesOfDay: 8 * 60 + 39,
    });
  });

  /**
   * **`weekdayOf` AND `resolveChatClock` MUST NEVER DISAGREE**, and they reach the answer
   * two different ways: one shifts an instant and reads `getUTCDay()`, the other does
   * integer arithmetic on a string with no `Date` at all. Phase 7 rehydrates a weekday
   * through the second on a run the first minted, so a divergence would ship a Monday
   * greeting on a Sunday and nothing would report it.
   */
  it('agrees with weekdayOf on the day it derived', () => {
    for (const iso of ['2026-08-30T01:39:48.000Z', '2026-08-29T23:30:00.000Z', '2027-03-01T00:00:00.000Z']) {
      const clock = resolveChatClock({ offsetMinutes: 420, now: new Date(iso) });
      if (clock.known) expect(weekdayOf(clock.localDate)).toBe(clock.weekday);
    }
  });

  it('walks the five day parts in order and is total over every integer', () => {
    expect([0, 4, 5, 10, 11, 14, 15, 17, 18, 21, 22, 23].map(dayPartOf)).toEqual([
      'late', 'late', 'morning', 'morning', 'midday', 'midday',
      'afternoon', 'afternoon', 'evening', 'evening', 'late', 'late',
    ]);
    /* **RECONCILED (round 2): this expectation was `'evening'` and would have FAILED.**
     * `-1` wraps to `23` through `((h % 24) + 24) % 24`, and `evening` ends at 21 — so 23
     * is `late`, which is also what the docblock says. The case is kept because the WRAP is
     * the property worth pinning; only the expected token was wrong. */
    expect(dayPartOf(-1)).toBe('late');
    expect(dayPartOf(Number.NaN)).toBe('late');
  });

  /**
   * **THE DAY, NOT ONLY THE HOUR.** 23:00 UTC is already tomorrow in Jakarta,
   * and the thirty-day lookback floor and the daily proactive cap are both keyed
   * on this string.
   */
  it('rolls the day over at the querent’s midnight, not at UTC’s', () => {
    const clock = resolveChatClock({
      offsetMinutes: 420,
      now: new Date('2026-08-30T23:30:00.000Z'),
    });
    expect(clock.localDate).toBe('2026-08-31');
    if (clock.known) expect(clock.localTime).toBe('06:30');
  });

  it('goes the other way for a negative offset', () => {
    const clock = resolveChatClock({
      offsetMinutes: -300,
      now: new Date('2026-08-30T02:00:00.000Z'),
    });
    expect(clock.localDate).toBe('2026-08-29');
    if (clock.known) expect(clock.localTime).toBe('21:00');
  });

  it('treats zero as a known offset, because UTC is a place', () => {
    const clock = resolveChatClock({ offsetMinutes: 0, now: THE_BUG });
    expect(clock.known).toBe(true);
    expect(clock.offsetMinutes).toBe(0);
    if (clock.known) expect(clock.localTime).toBe('01:39');
  });

  it('handles a quarter-hour zone', () => {
    const clock = resolveChatClock({ offsetMinutes: 345, now: THE_BUG });
    if (clock.known) expect(clock.localTime).toBe('07:24');
  });

  it('ignores the client’s day when it can derive one', () => {
    const clock = resolveChatClock({
      offsetMinutes: 420,
      now: THE_BUG,
      fallbackLocalDate: '1999-01-01',
    });
    expect(clock.localDate).toBe('2026-08-30');
  });
});

describe('resolveChatClock, without one', () => {
  it('is not known, is not zero, and still has a day', () => {
    const clock = resolveChatClock({ offsetMinutes: null, now: THE_BUG });
    expect(clock).toEqual({ known: false, offsetMinutes: null, localDate: '2026-08-30' });
  });

  it('prefers the client’s own day to the server’s UTC one', () => {
    const clock = resolveChatClock({
      offsetMinutes: null,
      now: new Date('2026-08-30T23:30:00.000Z'),
      fallbackLocalDate: '2026-08-31',
    });
    expect(clock.localDate).toBe('2026-08-31');
  });

  /** A value no writer can produce today. It must degrade, never render. */
  it('refuses an out-of-range or non-integer stored offset', () => {
    for (const offsetMinutes of [841, -721, 4.2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveChatClock({ offsetMinutes, now: THE_BUG }).known).toBe(false);
    }
  });

  it('never throws on a broken instant', () => {
    const clock = resolveChatClock({ offsetMinutes: 420, now: new Date('nonsense') });
    /* It fell back to the real now rather than throwing inside `advance()`. */
    expect(clock.known).toBe(true);
    expect(clock.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/* ------------------------------------------------------------------------- *
 * Phase 2: the rendering half. `resolveChatClock`, `dayPartOf` and
 * `localDayDelta` are phase 1's and their cases are above; what follows covers
 * `renderNow` and the vocabulary's completeness.
 * ------------------------------------------------------------------------- */

describe('renderNow', () => {
  const known = (ms: number, offset: number) => {
    const c = resolveChatClock({ offsetMinutes: offset, now: new Date(ms) });
    if (!c.known) throw new Error('fixture clock must be known');
    return c;
  };

  it('names the weekday, the dated month, a 24-hour clock and the part of the day', () => {
    const w = known(THE_BUG.getTime(), 420);
    expect(renderNow(w, 'id')).toBe('Minggu, 30 Agustus 2026, 08.39 (pagi)');
    expect(renderNow(w, 'en')).toBe('Sunday, 30 August 2026, 08:39 (morning)');
  });

  /**
   * `formatTimeOfDay`'s measured finding, carried over: **both locales are a 24-hour
   * clock and only the separator differs.** A meridiem would reopen `en-GB` vs `en-US`
   * for a time the model reasons about, which is worse than for one a person reads.
   */
  it('writes no meridiem in either locale, and pads both fields', () => {
    const early = known(Date.parse('2026-08-30T00:05:00.000Z'), 0);
    for (const locale of LOCALES) {
      const line = renderNow(early, locale);
      expect(line).not.toMatch(/AM|PM/i);
      expect(line).toMatch(/00[.:]05/);
    }
  });

  /**
   * **ONE VOCABULARY FOR THE RELEASE.** Phase 7's `time_of_day` notes read this same table,
   * which is what stops one prompt saying *"Monday morning"* on one line and *"siang"* on
   * another. If a second table ever appears, this test is where the duplication should have
   * been caught.
   */
  it('has a word for every weekday and every day part, in both locales', () => {
    for (const locale of LOCALES) {
      expect(CHAT_TIME_VOCAB[locale].weekdays).toHaveLength(WEEKDAYS.length);
      for (const word of CHAT_TIME_VOCAB[locale].weekdays) expect(word.length).toBeGreaterThan(2);
      for (const word of Object.values(CHAT_TIME_VOCAB[locale].parts)) {
        expect(word.length).toBeGreaterThan(2);
      }
    }
  });
});

/**
 * **PHASE 7 IS `weekdayOf`'s FIRST REAL CONSUMER**, and it reaches it from a bare
 * `'YYYY-MM-DD'` string with no offset in hand: `brief.ts` rehydrates a `tod:<date>:<part>`
 * key at plan time, hours after the mint. So the depth lives here, with the function,
 * rather than in `material.test.ts` with the material — reconciliation ruling 1 moved the
 * calendar into this module and its tests move with it.
 */
describe('weekdayOf — the calendar phase 7 rehydrates from', () => {
  it('derives a weekday without ever touching a `Date`', () => {
    /*
     * The birthday detector's discipline: `getMonth()` on a server in UTC wishes a Jakarta
     * querent a happy birthday a day early, and the same trap eats a weekday on the one
     * material whose entire content is which day it is. Sakamoto's algorithm is arithmetic
     * over three integers and has no timezone to be wrong in.
     */
    expect(weekdayOf('2026-08-30')).toBe('sun');
    expect(weekdayOf('2026-08-31')).toBe('mon');
    expect(weekdayOf('2026-08-09')).toBe('sun');
    /* Leap days, because February is where a hand-rolled calendar breaks. */
    expect(weekdayOf('2024-02-29')).toBe('thu');
    expect(weekdayOf('2000-02-29')).toBe('tue');
    expect(weekdayOf('1900-03-01')).toBe('thu');
  });

  it('agrees with `Date` across a long stretch, which is the only honest oracle', () => {
    /* A `Date` is fine HERE and banned in `material.ts`; a test is where the two meet. */
    for (let i = 0; i < 4000; i += 7) {
      const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      expect({ iso, got: weekdayOf(iso) }).toEqual({ iso, got: WEEKDAYS[d.getUTCDay()] });
    }
  });

  it('refuses a malformed day rather than throwing on a prompt path', () => {
    for (const bad of ['', '2026-8-9', 'yesterday', '2026-13-01', '2026-01-00']) {
      expect({ bad, got: weekdayOf(bad) }).toEqual({ bad, got: null });
    }
  });

  /**
   * **THE BUG PHASE 7's `time_of_day` EXISTS NOT TO REPRODUCE.** At 23:30 UTC a Jakarta
   * querent is at 06:30 the NEXT morning, and the cron would otherwise pair that hour with
   * `utcDateString()`'s yesterday — shipping *"Monday morning"* stamped Sunday. What is
   * asserted here is the composition `detectTimeOfDay` depends on: one derivation answers
   * both the day and the part, so they cannot come from different places.
   */
  it('reads the querent’s own day and part from ONE derivation', () => {
    const at = (iso: string, off: number | null) =>
      resolveChatClock({ offsetMinutes: off, now: new Date(iso) });

    const jakarta = at('2026-08-30T23:30:00.000Z', 420);
    expect(jakarta.known && { date: jakarta.localDate, part: jakarta.part }).toEqual({
      date: '2026-08-31',
      part: 'morning',
    });
    expect(jakarta.known && weekdayOf(jakarta.localDate)).toBe('mon');

    const utc = at('2026-08-30T23:30:00.000Z', 0);
    expect(utc.known && { date: utc.localDate, part: utc.part }).toEqual({
      date: '2026-08-30',
      part: 'late',
    });

    /* West of Greenwich the day goes the other way. */
    const ny = at('2026-08-31T02:00:00.000Z', -300);
    expect(ny.known && { date: ny.localDate, part: ny.part }).toEqual({
      date: '2026-08-30',
      part: 'evening',
    });

    /* A nonsense offset degrades to `known: false`, so no time material is minted. */
    expect(at('2026-08-30T23:30:00.000Z', 5000).known).toBe(false);
    expect(at('2026-08-30T23:30:00.000Z', null).known).toBe(false);
  });
});

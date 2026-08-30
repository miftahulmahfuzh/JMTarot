import { describe, expect, it } from 'vitest';

import { dayPartOf, resolveChatClock, weekdayOf } from './clock';

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

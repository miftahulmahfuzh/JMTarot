/**
 * The window maths (W5 plan Task 1). Pure, no database, no Docker.
 *
 * Every case named in the plan's Task 1 is here as a named test, plus the ones
 * the implementation invited: the round-trip validity check, and the assertion
 * that `to` is always today.
 */
import { describe, expect, it } from 'vitest';
import { VERDICT_LADDER, WINDOWS, windowBounds, windowPhrase } from './windows';

/** Shorthand: bounds for a window key, as a `'from..to'` string. */
function span(key: keyof typeof WINDOWS, today: string, birthDate?: string | null) {
  const b = windowBounds(WINDOWS[key], today, birthDate);
  return b === null ? null : `${b.from}..${b.to}`;
}

describe('rolling windows', () => {
  it('is inclusive of both ends: d3 on 2026-07-26 is three calendar days', () => {
    // Three days, not four. The off-by-one here would be invisible in the UI
    // and would quietly change what "the last three days" counts.
    expect(span('d3', '2026-07-26')).toBe('2026-07-24..2026-07-26');
  });

  it('d13 spans thirteen days inclusive', () => {
    expect(span('d13', '2026-07-26')).toBe('2026-07-14..2026-07-26');
  });

  it('d666 from 2026-07-26 crosses two year boundaries and lands in 2024', () => {
    expect(span('d666', '2026-07-26')).toBe('2024-09-29..2026-07-26');
  });

  it('crosses a month boundary backwards', () => {
    expect(span('d3', '2026-08-01')).toBe('2026-07-30..2026-08-01');
  });

  it('crosses a leap day backwards', () => {
    // 2028 is a leap year, so stepping back three days from 1 March must land
    // on 28 February, not 27.
    expect(span('d3', '2028-03-01')).toBe('2028-02-28..2028-03-01');
  });
});

describe('the week window starts Monday', () => {
  // This is the pair that pins M1's Monday decision, settled with Miftah on
  // 2026-07-27. Indonesian wall calendars commonly start Sunday and the
  // difference is visible on exactly one day a week -- this test is the record
  // of which day that is.
  it('on a Monday, from is that same Monday', () => {
    // 2026-07-20 is a Monday.
    expect(span('week', '2026-07-20')).toBe('2026-07-20..2026-07-20');
  });

  it('on a Sunday, from is the Monday six days earlier', () => {
    // 2026-07-26 is a Sunday. Under a Sunday-start week this would be
    // '2026-07-26..2026-07-26' instead.
    expect(span('week', '2026-07-26')).toBe('2026-07-20..2026-07-26');
  });

  it('on a Wednesday, from is the Monday two days earlier', () => {
    expect(span('week', '2026-07-22')).toBe('2026-07-20..2026-07-22');
  });

  it('reaches back across a month boundary', () => {
    // 2026-08-01 is a Saturday; its Monday is in July.
    expect(span('week', '2026-08-01')).toBe('2026-07-27..2026-08-01');
  });
});

describe('calendar windows on the first and last day of each period', () => {
  it('month collapses to one day on the first of the month', () => {
    expect(span('month', '2026-07-01')).toBe('2026-07-01..2026-07-01');
  });

  it('month spans the whole month on the last day', () => {
    expect(span('month', '2026-07-31')).toBe('2026-07-01..2026-07-31');
  });

  it('quarter starts Jan, Apr, Jul, Oct', () => {
    expect(span('quarter', '2026-02-14')).toBe('2026-01-01..2026-02-14');
    expect(span('quarter', '2026-05-14')).toBe('2026-04-01..2026-05-14');
    expect(span('quarter', '2026-08-14')).toBe('2026-07-01..2026-08-14');
    expect(span('quarter', '2026-11-14')).toBe('2026-10-01..2026-11-14');
  });

  it('quarter collapses on the first day and spans on the last', () => {
    expect(span('quarter', '2026-10-01')).toBe('2026-10-01..2026-10-01');
    expect(span('quarter', '2026-12-31')).toBe('2026-10-01..2026-12-31');
  });

  it('year collapses on 1 January and spans on 31 December', () => {
    expect(span('year', '2026-01-01')).toBe('2026-01-01..2026-01-01');
    expect(span('year', '2026-12-31')).toBe('2026-01-01..2026-12-31');
  });
});

describe('the birthday window', () => {
  it('crosses a year boundary: born 1994-03-14, today 2026-01-05', () => {
    // The normal case, and the one a naive "same year" implementation gets
    // wrong by producing a window that starts in the future.
    expect(span('birthday', '2026-01-05', '1994-03-14')).toBe('2025-03-14..2026-01-05');
  });

  it('stays in this year once the birthday has passed: today 2026-06-01', () => {
    expect(span('birthday', '2026-06-01', '1994-03-14')).toBe('2026-03-14..2026-06-01');
  });

  it('resolves 29 February to 28 February in a non-leap year', () => {
    // NOT 1 March. The birthday has passed by the end of February, and pushing
    // it into March would shorten the window by a day three years in four.
    expect(span('birthday', '2026-06-01', '2000-02-29')).toBe('2026-02-28..2026-06-01');
  });

  it('keeps 29 February in a leap year', () => {
    expect(span('birthday', '2028-06-01', '2000-02-29')).toBe('2028-02-29..2028-06-01');
  });

  it('clamps the PREVIOUS year too when that is the one it lands in', () => {
    // Born 29 Feb, today is January 2027: the last anniversary is in 2026,
    // which is not a leap year, so it must clamp there and not produce
    // '2026-02-29', a date that does not exist.
    expect(span('birthday', '2027-01-10', '2000-02-29')).toBe('2026-02-28..2027-01-10');
  });

  it('collapses to one day on the birthday itself', () => {
    // Settled with Miftah 2026-07-27 (plan open question 2): leave it
    // collapsed. The gate then hides it, which is the intended behaviour --
    // `birthday` is not on VERDICT_LADDER, so nothing surfaces it anyway.
    expect(span('birthday', '2026-03-14', '1994-03-14')).toBe('2026-03-14..2026-03-14');
  });

  it('returns null with no birth date, and does not throw', () => {
    expect(span('birthday', '2026-06-01', null)).toBeNull();
    expect(span('birthday', '2026-06-01', undefined)).toBeNull();
    expect(span('birthday', '2026-06-01', '')).toBeNull();
  });
});

describe('malformed input', () => {
  it('returns null rather than throwing on an unparseable today', () => {
    for (const bad of ['', 'today', '2026-7-26', '26-07-2026', '2026-07-26T00:00:00Z']) {
      expect(span('week', bad), bad).toBeNull();
    }
  });

  it('rejects a date that looks well-formed but does not exist', () => {
    // Date.UTC(2026, 1, 30) is 2 March rather than an error, so without the
    // round-trip check this would silently return a window starting two days
    // late.
    expect(span('month', '2026-02-30')).toBeNull();
    expect(span('month', '2026-13-01')).toBeNull();
    expect(span('birthday', '2026-06-01', '2026-02-30')).toBeNull();
  });

  it('accepts 29 February in a leap year as today', () => {
    expect(span('d3', '2028-02-29')).toBe('2028-02-27..2028-02-29');
  });
});

describe('the shape of the configuration', () => {
  it('every window ends at today', () => {
    // `to` is always today in every kind of window: there are no readings in
    // the future, and a bound running to the end of the calendar period would
    // make "this week" describe time the querent has not lived yet.
    for (const key of Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]) {
      const b = windowBounds(WINDOWS[key], '2026-07-26', '1994-03-14');
      expect(b?.to, key).toBe('2026-07-26');
    }
  });

  it('from is never after to', () => {
    for (const key of Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]) {
      const b = windowBounds(WINDOWS[key], '2026-07-26', '1994-03-14');
      expect(b && b.from <= b.to, key).toBe(true);
    }
  });

  it('keys its own entries consistently', () => {
    // A copy-paste in the WINDOWS object -- `d13: { key: 'd3', ... }` -- would
    // make the cache write under one key and read under another.
    for (const [k, spec] of Object.entries(WINDOWS)) expect(spec.key).toBe(k);
  });

  it('the ladder is narrowest first and only names real windows', () => {
    expect(VERDICT_LADDER).toEqual(['week', 'd13', 'month', 'year']);
    for (const k of VERDICT_LADDER) expect(WINDOWS[k]).toBeDefined();
  });

  it('has a phrase for every window in both locales', () => {
    for (const key of Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]) {
      expect(windowPhrase(key, 'id'), key).toBeTruthy();
      expect(windowPhrase(key, 'en'), key).toBeTruthy();
      // The phrase is interpolated into the prompt as words, not dates -- a
      // digit-only phrase would defeat §3.6's instruction. (666 is allowed to
      // carry digits; it is the name of the window.)
      expect(windowPhrase(key, 'id'), key).toMatch(/[A-Za-z]/);
    }
  });
});

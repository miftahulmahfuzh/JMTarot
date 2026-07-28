import { describe, expect, it } from 'vitest';
import { DAY_CHIP_LIMIT, HISTORY_DAY_LIMIT, dayOffset, isHistoryDate } from './dates';

const TODAY = '2026-07-27';

describe('isHistoryDate', () => {
  it('accepts a real day at or before today', () => {
    expect(isHistoryDate('2026-07-27', TODAY)).toBe(true);
    expect(isHistoryDate('2026-07-26', TODAY)).toBe(true);
    expect(isHistoryDate('2000-01-01', TODAY)).toBe(true);
  });

  /**
   * THE ROUND TRIP IS WHY THIS PASSES. `new Date('2026-02-30T00:00:00Z')` is a
   * valid Date -- it normalises to March 2nd -- so an `isNaN` check alone reports
   * this as a good date and the query then returns an empty day for a date the
   * querent never had.
   */
  it('rejects a day that does not exist, which isNaN alone would not', () => {
    expect(new Date('2026-02-30T00:00:00Z').getTime()).not.toBeNaN();
    expect(isHistoryDate('2026-02-30', TODAY)).toBe(false);
    expect(isHistoryDate('2025-02-29', TODAY)).toBe(false);
    // ...and 2024 was a leap year, so the check is not just rejecting the 29th.
    expect(isHistoryDate('2024-02-29', TODAY)).toBe(true);
  });

  it('rejects an impossible month or day', () => {
    expect(isHistoryDate('2026-13-01', TODAY)).toBe(false);
    expect(isHistoryDate('2026-00-01', TODAY)).toBe(false);
    expect(isHistoryDate('2026-07-32', TODAY)).toBe(false);
  });

  it('rejects the future, because a reading cannot have happened yet', () => {
    expect(isHistoryDate('2026-07-28', TODAY)).toBe(false);
    expect(isHistoryDate('2099-01-01', TODAY)).toBe(false);
  });

  it('rejects anything below the floor', () => {
    expect(isHistoryDate('1999-12-31', TODAY)).toBe(false);
    expect(isHistoryDate('0001-01-01', TODAY)).toBe(false);
  });

  it('rejects the wrong shape without throwing', () => {
    for (const bad of ['banana', '2026-7-27', '26-07-2026', '2026-07-27T00:00:00Z', '']) {
      expect({ bad, ok: isHistoryDate(bad, TODAY) }).toEqual({ bad, ok: false });
    }
  });

  it('rejects a non-string without throwing', () => {
    for (const bad of [null, undefined, 42, {}, [], new Date()]) {
      expect(isHistoryDate(bad, TODAY)).toBe(false);
    }
  });
});

describe('dayOffset', () => {
  it('counts whole days back', () => {
    expect(dayOffset(TODAY, '2026-07-25')).toBe(2);
    expect(dayOffset(TODAY, TODAY)).toBe(0);
  });

  it('goes negative for a day after today', () => {
    expect(dayOffset(TODAY, '2026-07-28')).toBe(-1);
  });

  it('crosses a year boundary', () => {
    expect(dayOffset('2026-01-01', '2025-12-31')).toBe(1);
    expect(dayOffset('2026-01-01', '2025-01-01')).toBe(365);
  });

  /**
   * THE CASE UTC-MIDNIGHT PARSING EXISTS TO MAKE SAFE. 2026-03-29 is when the
   * UK and the EU spring forward, so in a local-time parse one of these two
   * differences is 23 hours and floors to 0 or 1 depending on the runner's
   * timezone. Both operands are parsed as UTC, so the answer is the same
   * everywhere.
   */
  it('is unaffected by a DST boundary', () => {
    expect(dayOffset('2026-03-30', '2026-03-28')).toBe(2);
    expect(dayOffset('2026-03-29', '2026-03-28')).toBe(1);
    // ...and the autumn one, which falls back rather than forward.
    expect(dayOffset('2026-10-26', '2026-10-24')).toBe(2);
  });

  it('crosses a leap day', () => {
    expect(dayOffset('2024-03-01', '2024-02-28')).toBe(2);
    expect(dayOffset('2025-03-01', '2025-02-28')).toBe(1);
  });
});

describe('the two limits', () => {
  /**
   * Not decoration: the strip is built by slicing the days array to
   * `DAY_CHIP_LIMIT`, so a chip limit above the day limit would be a slice that
   * can never bite and a reader would have to check the query to find that out.
   */
  it('keeps the chip strip inside what the query returns', () => {
    expect(DAY_CHIP_LIMIT).toBeLessThanOrEqual(HISTORY_DAY_LIMIT);
  });
});

/**
 * `series.ts`. A3, v0.5.0.
 *
 * The Sunday `weekStart` case is the one that earns its place: it is the single day in
 * seven the naive `getUTCDay()` gets wrong, and the negative control was run --
 * replacing `(dow + 6) % 7` with `dow` fails exactly this test and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { HISTORY_DAY_LIMIT } from '@/lib/history/dates';
import {
  MAX_RANGE_DAYS,
  dayCount,
  enumerateDays,
  monthOf,
  weekStart,
  zeroFill,
} from './series';

describe('the module contract', () => {
  it('has zero imports, so a bucket key can never acquire a timezone', () => {
    // Read off disk rather than asserted about behaviour: the rule is about what this
    // file may depend on, and the only way to check that is the source.
    const src = require('node:fs').readFileSync('src/lib/analytics/series.ts', 'utf8');
    expect(src.match(/^\s*import\s/gm)).toBeNull();
  });

  it('agrees with HISTORY_DAY_LIMIT, because three constants have to', () => {
    // The retention window, the max queryable range and the history limit are one
    // number on purpose (plan §7.2). Duplicated rather than imported, so this is what
    // catches a drift.
    expect(MAX_RANGE_DAYS).toBe(HISTORY_DAY_LIMIT);
  });
});

describe('enumerateDays', () => {
  it('returns one day for a single-day range', () => {
    expect(enumerateDays('2026-07-29', '2026-07-29')).toEqual(['2026-07-29']);
  });

  it('is inclusive at both ends', () => {
    expect(enumerateDays('2026-07-29', '2026-07-31')).toEqual([
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ]);
  });

  it('returns [] for a reversed range rather than counting backwards', () => {
    expect(enumerateDays('2026-07-31', '2026-07-29')).toEqual([]);
  });

  it('crosses a month boundary', () => {
    expect(enumerateDays('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(enumerateDays('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('counts a leap day: 2024-02-28 to 2024-03-01 is three days', () => {
    expect(enumerateDays('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });

  it('returns 400 days at the limit and [] at 401', () => {
    // 2026-01-01 + 399 = 2027-02-04 inclusive is exactly 400.
    expect(enumerateDays('2026-01-01', '2027-02-04')).toHaveLength(MAX_RANGE_DAYS);
    expect(enumerateDays('2026-01-01', '2027-02-05')).toEqual([]);
  });

  it('refuses a date that is not a real calendar day', () => {
    // Feb 30th normalises to March 2nd inside `Date` and is otherwise perfectly valid.
    expect(enumerateDays('2026-02-30', '2026-03-05')).toEqual([]);
    expect(enumerateDays('2026-13-01', '2026-13-05')).toEqual([]);
    expect(enumerateDays('not-a-date', '2026-07-29')).toEqual([]);
  });
});

describe('dayCount', () => {
  it('counts inclusively and answers 0 on an unusable range', () => {
    expect(dayCount('2026-07-29', '2026-07-29')).toBe(1);
    expect(dayCount('2026-07-01', '2026-07-31')).toBe(31);
    expect(dayCount('2026-07-31', '2026-07-01')).toBe(0);
    expect(dayCount('nope', '2026-07-01')).toBe(0);
  });

  it('does NOT refuse a long range, unlike enumerateDays', () => {
    // A denominator for a mean is legitimate at any length; allocating 4000 strings
    // is not. The two functions differ on purpose.
    expect(dayCount('2020-01-01', '2026-01-01')).toBe(2193);
  });
});

describe('weekStart', () => {
  it('gives the same Monday for all seven days of one week', () => {
    // 2026-07-27 is a Monday.
    const week = [
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ];
    for (const day of week) expect(weekStart(day)).toBe('2026-07-27');
  });

  it('puts a SUNDAY in the week that is ending, not the one starting', () => {
    /*
     * THE NEGATIVE CONTROL, RUN: replacing `(dow + 6) % 7` with `dow` makes this the
     * only failing assertion in the file -- `weekStart('2026-08-02')` returns
     * '2026-08-02' instead of '2026-07-27'. Every other day of the week still passes,
     * which is precisely why the naive version survives a month of use.
     */
    expect(weekStart('2026-08-02')).toBe('2026-07-27');
    expect(weekStart('2026-07-26')).toBe('2026-07-20');
  });

  it('agrees with the SQL twin on real rows', () => {
    // Verified against the local Postgres 16 with the header's `to_char(...)`
    // expression on 2026-07-29.
    expect(weekStart('2026-07-21')).toBe('2026-07-20');
    expect(weekStart('2026-07-22')).toBe('2026-07-20');
    expect(weekStart('2026-07-28')).toBe('2026-07-27');
  });

  it("returns '' rather than a wrong Monday for a malformed day", () => {
    expect(weekStart('2026-02-30')).toBe('');
    expect(weekStart('')).toBe('');
  });
});

describe('monthOf', () => {
  it("slices to 'YYYY-MM'", () => {
    expect(monthOf('2026-07-29')).toBe('2026-07');
    expect(monthOf('2026-01-01')).toBe('2026-01');
  });

  it("returns '' for a malformed day rather than a truncated one", () => {
    expect(monthOf('2026-13-01')).toBe('');
  });
});

describe('zeroFill', () => {
  type Row = { bucket: string; calls: number };
  const empty = (bucket: string): Row => ({ bucket, calls: 0 });
  const key = (r: Row) => r.bucket;

  it('fills a gap day with the empty row', () => {
    const rows: Row[] = [
      { bucket: '2026-07-27', calls: 3 },
      { bucket: '2026-07-29', calls: 5 },
    ];
    const days = ['2026-07-27', '2026-07-28', '2026-07-29'];
    expect(zeroFill(rows, days, key, empty)).toEqual([
      { bucket: '2026-07-27', calls: 3 },
      { bucket: '2026-07-28', calls: 0 },
      { bucket: '2026-07-29', calls: 5 },
    ]);
  });

  it("returns days' order, not the rows' order", () => {
    const rows: Row[] = [
      { bucket: '2026-07-29', calls: 5 },
      { bucket: '2026-07-27', calls: 3 },
    ];
    const days = ['2026-07-27', '2026-07-28', '2026-07-29'];
    expect(zeroFill(rows, days, key, empty).map((r) => r.bucket)).toEqual(days);
  });

  it('DROPS a row outside the requested range', () => {
    // A bucket past the edge of the axis means the range predicate did not do what
    // its author thought; the chart must not grow a bar for it.
    const rows: Row[] = [
      { bucket: '2026-07-27', calls: 3 },
      { bucket: '2026-08-15', calls: 99 },
    ];
    const out = zeroFill(rows, ['2026-07-27'], key, empty);
    expect(out).toEqual([{ bucket: '2026-07-27', calls: 3 }]);
  });

  it('returns all-empty for an empty result set', () => {
    expect(zeroFill([], ['2026-07-27', '2026-07-28'], key, empty)).toEqual([
      { bucket: '2026-07-27', calls: 0 },
      { bucket: '2026-07-28', calls: 0 },
    ]);
  });
});

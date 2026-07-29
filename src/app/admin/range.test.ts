/**
 * The range parser. Every boundary here is one an operator can reach by editing a URL.
 *
 * `today` is a PARAMETER, never `new Date()` -- I-20 and `todayKey()`'s rule -- which is also
 * what lets this suite pin exact dates instead of freezing a clock.
 */
import { describe, expect, it } from 'vitest';
import { MAX_RANGE_DAYS } from '@/lib/analytics/series';
import {
  DEFAULT_DAYS,
  RANGE_PRESETS,
  parseRange,
  previousPeriod,
  windowEndingOn,
} from './range';

const TODAY = '2026-07-30';

describe('windowEndingOn', () => {
  it('is inclusive at both ends, so 7 days is SEVEN columns', () => {
    // An off-by-one here puts an eighth bar on every "7 days" chart, and the chart looks
    // fine -- it is only wrong against the label.
    expect(windowEndingOn(TODAY, 7)).toEqual({ from: '2026-07-24', to: '2026-07-30' });
    expect(windowEndingOn(TODAY, 1)).toEqual({ from: TODAY, to: TODAY });
  });

  it('crosses a month boundary correctly', () => {
    expect(windowEndingOn('2026-08-02', 7)).toEqual({ from: '2026-07-27', to: '2026-08-02' });
  });

  it('clamps to retention rather than enumerating a range that was already swept', () => {
    const r = windowEndingOn(TODAY, 5000);
    expect(r.to).toBe(TODAY);
    // 400 days INCLUSIVE is today minus 399, and my first expectation said 400. An
    // off-by-one in the other direction would ask for 401 days of a 400-day retention
    // window and produce a chart with an empty left-hand column.
    expect(r.from).toBe('2025-06-26');
  });
});

describe('parseRange', () => {
  it('defaults to 30 days with no params at all', () => {
    const p = parseRange({}, TODAY);
    expect(p.days).toBe(DEFAULT_DAYS);
    expect(p.preset).toBe(30);
    expect(p.fellBack).toBe(false);
    expect(p.range).toEqual({ from: '2026-07-01', to: TODAY });
  });

  it('honours each preset', () => {
    for (const n of RANGE_PRESETS) {
      const p = parseRange({ d: String(n) }, TODAY);
      expect(p.days).toBe(n);
      expect(p.preset).toBe(n);
    }
  });

  it('honours an explicit from/to pair and reports no preset for it', () => {
    const p = parseRange({ from: '2026-07-01', to: '2026-07-31' }, TODAY);
    expect(p.range).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(p.days).toBe(31);
    // 31 days must NOT light up the 30-day preset: a control that lies about which filter
    // is active is worse than no pressed state at all.
    expect(p.preset).toBeNull();
  });

  it('falls back AND SAYS SO on an unusable range', () => {
    // An operator who hand-edits a URL is better served by a working dashboard plus a note
    // than by a 400. `fellBack` is what makes the note honest rather than silent.
    for (const params of [
      { from: '2026-07-31', to: '2026-07-01' }, // reversed
      { from: 'yesterday', to: 'today' }, // malformed
      { from: '2026-02-30', to: '2026-03-01' }, // a date that normalises, which `isUsableRange` refuses
      { from: '2020-01-01', to: '2026-07-30' }, // longer than retention
      { d: '0' },
      { d: '-5' },
      { d: '7.5' },
      { d: 'seminggu' },
      { d: String(MAX_RANGE_DAYS + 1) },
    ]) {
      const p = parseRange(params, TODAY);
      expect(p.fellBack, JSON.stringify(params)).toBe(true);
      expect(p.days).toBe(DEFAULT_DAYS);
    }
  });

  it('takes the first value of a repeated param', () => {
    // `?d=7&d=90` is a malformed request, and 7 is what the control that produced it meant.
    expect(parseRange({ d: ['7', '90'] }, TODAY).days).toBe(7);
  });

  it('prefers an explicit pair over `d`', () => {
    const p = parseRange({ d: '7', from: '2026-07-01', to: '2026-07-10' }, TODAY);
    expect(p.days).toBe(10);
  });

  it('accepts exactly the retention limit', () => {
    // The boundary itself must be usable, or the dashboard cannot show the data it keeps.
    expect(parseRange({ d: String(MAX_RANGE_DAYS) }, TODAY).fellBack).toBe(false);
  });
});

describe('previousPeriod -- equal length, immediately before', () => {
  it('is the same number of days, ending the day before `from`', () => {
    // Equal length is what makes `periodDelta` compare like with like. "The same range last
    // month" is a different number of days whenever a month boundary is involved, and a
    // delta over two denominators is the kind of wrong number that survives review.
    expect(previousPeriod({ from: '2026-07-24', to: '2026-07-30' })).toEqual({
      from: '2026-07-17',
      to: '2026-07-23',
    });
  });

  it('holds across a month boundary and for a one-day range', () => {
    expect(previousPeriod({ from: '2026-08-01', to: '2026-08-03' })).toEqual({
      from: '2026-07-29',
      to: '2026-07-31',
    });
    expect(previousPeriod({ from: TODAY, to: TODAY })).toEqual({
      from: '2026-07-29',
      to: '2026-07-29',
    });
  });

  it('returns the input unchanged for a range with no days, rather than throwing', () => {
    const bad = { from: 'x', to: 'y' };
    expect(previousPeriod(bad)).toEqual(bad);
  });
});

import { describe, expect, it } from 'vitest';

import {
  MAX_UTC_OFFSET_MINUTES,
  MIN_UTC_OFFSET_MINUTES,
  UTC_OFFSET_HEADER,
  localUtcOffsetMinutes,
  parseUtcOffset,
} from './utcoffset';
import type { UtcOffsetResult } from './utcoffset';

/**
 * The refusal reason, or `null` when the value was accepted. **A helper rather than
 * `.reason` at the call site**, because the union has no `reason` on its `'client'`
 * arm: reaching for it directly is a typecheck error, and the shape of that error
 * is precisely the guarantee the union exists to give.
 */
function reasonOf(result: UtcOffsetResult): string | null {
  return result.source === 'unknown' ? result.reason : null;
}

describe('the header name', () => {
  it('is lowercase and namespaced like the other two', () => {
    expect(UTC_OFFSET_HEADER).toBe('x-jm-utc-offset');
  });
});

describe('localUtcOffsetMinutes', () => {
  /**
   * **THE SIGN IS THE WHOLE TEST.** `getTimezoneOffset()` returns UTC minus
   * local, so Jakarta reports `-420` and this must report `+420`. A negation
   * dropped here would put every Jakarta querent fourteen hours away.
   */
  it('is minutes EAST of UTC, the opposite sign to getTimezoneOffset()', () => {
    const jakarta = { getTimezoneOffset: () => -420 } as Date;
    expect(localUtcOffsetMinutes(jakarta)).toBe(420);

    const newYork = { getTimezoneOffset: () => 300 } as Date;
    expect(localUtcOffsetMinutes(newYork)).toBe(-300);

    const utc = { getTimezoneOffset: () => 0 } as Date;
    expect(localUtcOffsetMinutes(utc)).toBe(0);
  });
});

describe('parseUtcOffset', () => {
  it('accepts a real offset', () => {
    expect(parseUtcOffset('420')).toEqual({
      offsetMinutes: 420,
      source: 'client',
      received: '420',
    });
    expect(parseUtcOffset('-300').offsetMinutes).toBe(-300);
    /* The quarter-hour zones are real and must pass. */
    expect(parseUtcOffset('345').offsetMinutes).toBe(345);
    expect(parseUtcOffset('765').offsetMinutes).toBe(765);
  });

  /**
   * **ZERO IS A MEASUREMENT, NOT AN ABSENCE.** The querent is in London in
   * winter. If this ever came back `null` the room would go timeless for a
   * whole timezone; if `absent` ever came back `0` it would go confidently
   * wrong for every other one.
   */
  it('accepts zero as a value, and it is not the absent answer', () => {
    expect(parseUtcOffset('0')).toEqual({ offsetMinutes: 0, source: 'client', received: '0' });
    expect(parseUtcOffset(null).offsetMinutes).toBeNull();
    expect(reasonOf(parseUtcOffset(undefined))).toBe('absent');
    expect(reasonOf(parseUtcOffset(''))).toBe('absent');
  });

  it('refuses anything that is not a bare integer', () => {
    for (const raw of ['+420', ' 420', '420 ', '07', '-0', '4.2', '420.0', 'x', '4e2', '0x1a']) {
      const parsed = parseUtcOffset(raw);
      expect({ raw, offset: parsed.offsetMinutes }).toEqual({ raw, offset: null });
      expect(parsed.source).toBe('unknown');
      if (parsed.source === 'unknown') expect(parsed.reason).toBe('malformed');
    }
  });

  it('refuses a value no place on earth has', () => {
    for (const raw of ['-721', '841', '1440', '-1440']) {
      const parsed = parseUtcOffset(raw);
      expect({ raw, offset: parsed.offsetMinutes }).toEqual({ raw, offset: null });
      if (parsed.source === 'unknown') expect(parsed.reason).toBe('out_of_range');
    }
    expect(parseUtcOffset(String(MIN_UTC_OFFSET_MINUTES)).offsetMinutes).toBe(-720);
    expect(parseUtcOffset(String(MAX_UTC_OFFSET_MINUTES)).offsetMinutes).toBe(840);
  });

  it('refuses a non-string without throwing', () => {
    for (const raw of [420, {}, [], true, Symbol('x')] as unknown[]) {
      expect(parseUtcOffset(raw).offsetMinutes).toBeNull();
    }
  });
});

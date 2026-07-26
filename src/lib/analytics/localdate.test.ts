import { describe, expect, it } from 'vitest';
import { parseLocalDate, utcDateString, validSessionId } from './localdate';

/** The server's clock for every table-driven case below. */
const NOW = new Date('2026-07-26T00:00:00Z');

describe('parseLocalDate', () => {
  it('accepts today and the two legitimate neighbours', () => {
    // UTC-12 to UTC+14 means a real client is never further off than one day.
    for (const s of ['2026-07-25', '2026-07-26', '2026-07-27']) {
      expect(parseLocalDate(s, NOW), s).toEqual({ date: s, source: 'client', received: s });
    }
  });

  it('THE JAKARTA CASE: 01:00 on the 26th in Jakarta is still the 26th', () => {
    /*
     * This is the whole subject of roadmap §7 and the reason the column is
     * client-supplied. Server is on the 25th at 18:00 UTC; the querent's phone
     * says the 26th, and it is right. Rejecting or recomputing this would date
     * a third of every Jakarta evening's readings to the previous day.
     */
    const server = new Date('2026-07-25T18:00:00Z');
    expect(parseLocalDate('2026-07-26', server)).toEqual({
      date: '2026-07-26',
      source: 'client',
      received: '2026-07-26',
    });
  });

  it('rejects dates further than one day out', () => {
    for (const s of ['2026-07-28', '2026-07-24', '1970-01-01', '2999-01-01']) {
      expect(parseLocalDate(s, NOW), s).toEqual({
        date: '2026-07-26',
        source: 'fallback',
        reason: 'out_of_range',
        received: s,
      });
    }
  });

  it('rejects dates that are not real, including the ones Date silently fixes', () => {
    // '2026-02-30' parses without error and normalises to March 2nd. Only the
    // round trip catches it.
    for (const s of ['2026-02-30', '2026-13-01', '26-07-26', '2026-7-6', '2026-07-26T00:00:00Z']) {
      const out = parseLocalDate(s, NOW);
      expect(out.source, s).toBe('fallback');
      expect(out.source === 'fallback' && out.reason, s).toBe('malformed');
      expect(out.date, s).toBe('2026-07-26');
    }
  });

  it('treats anything that is not a non-empty string as absent', () => {
    for (const v of [undefined, null, '', 42, {}, [], true]) {
      const out = parseLocalDate(v, NOW);
      expect(out.source, String(v)).toBe('fallback');
      expect(out.source === 'fallback' && out.reason, String(v)).toBe('absent');
      expect(out.source === 'fallback' && out.received, String(v)).toBe(null);
    }
  });

  it('always returns a real date, whatever it was given', () => {
    // readings.local_date is not null. There is no third option, so no input
    // may produce an unusable value.
    for (const v of [undefined, 'banana', '2026-02-30', '1970-01-01', '2026-07-27']) {
      expect(parseLocalDate(v, NOW).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('utcDateString', () => {
  it('is the server day, not the local one', () => {
    expect(utcDateString(new Date('2026-07-25T18:00:00Z'))).toBe('2026-07-25');
  });
});

describe('validSessionId', () => {
  it('accepts a real uuid and lowercases it', () => {
    expect(validSessionId('11111111-1111-4111-8111-111111111111')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(validSessionId('AAAAAAAA-BBBB-4CCC-9DDD-EEEEEEEEEEEE')).toBe(
      'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee',
    );
    expect(validSessionId(crypto.randomUUID())).not.toBe(null);
  });

  it('rejects everything that is not one', () => {
    for (const v of [
      '',
      'not-a-uuid',
      '11111111111141118111111111111111',
      '11111111-1111-4111-c111-111111111111', // bad variant nibble
      'x'.repeat(4096),
      null,
      42,
      {},
    ]) {
      expect(validSessionId(v), String(v)).toBe(null);
    }
  });
});

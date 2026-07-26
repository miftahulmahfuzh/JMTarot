import { describe, expect, it } from 'vitest';
import { absoluteCapSeconds, sessionMaxAgeSeconds } from './ttl';

const HOUR = 60 * 60;
const DAY = HOUR * 24;

describe('sessionMaxAgeSeconds', () => {
  it('reads a plain number of hours', () => {
    expect(sessionMaxAgeSeconds('24')).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('1')).toBe(HOUR);
    expect(sessionMaxAgeSeconds('168')).toBe(168 * HOUR);
  });

  it('defaults to 24 hours when unset or blank', () => {
    // `SESSION_TTL_HOURS=` -- set but empty -- is exactly what an .env.example
    // line looks like, and `Number('')` is 0. Without the blank check first this
    // would mint a session that has already expired, and the symptom would be
    // "sign-in works and then immediately bounces to /login".
    expect(sessionMaxAgeSeconds(undefined)).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('')).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('   ')).toBe(24 * HOUR);
  });

  it('rejects zero and negatives rather than honouring them', () => {
    expect(sessionMaxAgeSeconds('0')).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('-1')).toBe(24 * HOUR);
  });

  it('rejects anything that is not a finite integer', () => {
    expect(sessionMaxAgeSeconds('abc')).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('Infinity')).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('NaN')).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('0.5')).toBe(24 * HOUR);
    expect(sessionMaxAgeSeconds('24.5')).toBe(24 * HOUR);
  });

  it('rejects an absurd value, which is a unit confusion and not an intention', () => {
    // 100000 hours is 11 years. The likeliest way to get here is writing seconds
    // into a variable that wants hours.
    expect(sessionMaxAgeSeconds('100000')).toBe(24 * HOUR);
  });

  it('never returns NaN, zero or a negative for any input', () => {
    for (const raw of ['', ' ', 'abc', '0', '-1', 'Infinity', '-Infinity', '1e999', '0x18']) {
      const out = sessionMaxAgeSeconds(raw);
      expect(Number.isSafeInteger(out), raw).toBe(true);
      expect(out, raw).toBeGreaterThan(0);
    }
  });
});

describe('absoluteCapSeconds', () => {
  it('reads a plain number of days', () => {
    expect(absoluteCapSeconds('30')).toBe(30 * DAY);
    expect(absoluteCapSeconds('1')).toBe(DAY);
  });

  it('defaults to 30 days when unset or blank', () => {
    expect(absoluteCapSeconds(undefined)).toBe(30 * DAY);
    expect(absoluteCapSeconds('')).toBe(30 * DAY);
  });

  it('honours an explicit 0 as "no cap"', () => {
    // The ONE difference from sessionMaxAgeSeconds, and it is deliberate: 0 is
    // the documented escape hatch for a purely sliding session, so it is obeyed
    // rather than corrected. Every other unusable value still falls back, so a
    // typo cannot silently remove the only bound on a stolen cookie.
    expect(absoluteCapSeconds('0')).toBe(0);
    expect(absoluteCapSeconds(' 0 ')).toBe(0);
  });

  it('falls back rather than treating junk as "no cap"', () => {
    expect(absoluteCapSeconds('-1')).toBe(30 * DAY);
    expect(absoluteCapSeconds('abc')).toBe(30 * DAY);
    expect(absoluteCapSeconds('0.5')).toBe(30 * DAY);
    expect(absoluteCapSeconds('99999')).toBe(30 * DAY);
  });
});

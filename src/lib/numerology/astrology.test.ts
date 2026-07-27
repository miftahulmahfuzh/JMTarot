/**
 * Birth-date correspondences (VD4, roadmap §5, plan §4).
 *
 * NOT ONE `new Date()` IN THE MODULE UNDER TEST, and the last test in this file
 * is what keeps it that way. `birth_date` is a string because a Date renders in
 * the server's zone and is a day out for Jakarta — and a cusp birthday is
 * precisely where that shows up as the wrong sign.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIGNS, ZODIAC, lifePath, parseIsoDate, sunSign } from './astrology';

describe('parseIsoDate', () => {
  it('parses a well-formed date into integers', () => {
    expect(parseIsoDate('1994-07-26')).toEqual({ year: 1994, month: 7, day: 26 });
  });

  it('rejects anything that is not exactly YYYY-MM-DD', () => {
    for (const bad of ['1994-7-26', '94-07-26', '1994/07/26', '1994-07-26T00:00:00Z',
      ' 1994-07-26', '1994-07-26 ', '', 'yesterday']) {
      expect(parseIsoDate(bad), bad).toBeNull();
    }
  });

  it('rejects an out-of-range month or day', () => {
    for (const bad of ['1994-00-10', '1994-13-10', '1994-07-00', '1994-07-32',
      '1994-04-31', '1994-02-30']) {
      expect(parseIsoDate(bad), bad).toBeNull();
    }
  });

  it('rejects year 0000, which is not a year anyone was born in', () => {
    expect(parseIsoDate('0000-01-01')).toBeNull();
  });

  it('knows its leap years', () => {
    expect(parseIsoDate('2028-02-29')).not.toBeNull();   // divisible by 4
    expect(parseIsoDate('2027-02-29')).toBeNull();
    expect(parseIsoDate('2000-02-29')).not.toBeNull();   // divisible by 400
    expect(parseIsoDate('1900-02-29')).toBeNull();       // divisible by 100, not 400
  });
});

/** Shorthand: the sign for a month/day in a non-leap year. */
const at = (md: string) => sunSign(`1994-${md}`)?.sign ?? null;

describe('sun sign cusps — the whole test surface (VD4)', () => {
  // Every boundary in the table, both sides. If a row here is wrong the app
  // tells one person in twelve that they are the wrong sign, on their birthday.
  const cusps: [string, string, string, string][] = [
    ['03-20', 'pisces', '03-21', 'aries'],
    ['04-19', 'aries', '04-20', 'taurus'],
    ['05-20', 'taurus', '05-21', 'gemini'],
    ['06-20', 'gemini', '06-21', 'cancer'],
    ['07-22', 'cancer', '07-23', 'leo'],
    ['08-22', 'leo', '08-23', 'virgo'],
    ['09-22', 'virgo', '09-23', 'libra'],
    ['10-22', 'libra', '10-23', 'scorpio'],
    ['11-21', 'scorpio', '11-22', 'sagittarius'],
    ['12-21', 'sagittarius', '12-22', 'capricorn'],
    ['01-19', 'capricorn', '01-20', 'aquarius'],
    ['02-18', 'aquarius', '02-19', 'pisces'],
  ];
  for (const [lastDay, lastSign, firstDay, firstSign] of cusps) {
    it(`${lastDay} is ${lastSign} and ${firstDay} is ${firstSign}`, () => {
      expect(at(lastDay)).toBe(lastSign);
      expect(at(firstDay)).toBe(firstSign);
    });
  }

  it('Capricorn is the only sign that wraps the year', () => {
    expect(at('12-31')).toBe('capricorn');
    expect(at('01-01')).toBe('capricorn');
  });

  it('29 February is Pisces, in a leap year', () => {
    expect(sunSign('2028-02-29')?.sign).toBe('pisces');
  });

  it('assigns exactly one sign to every day of a leap year', () => {
    // 366 assertions. This is what proves there is no gap and no overlap in the
    // table, which eyeballing twelve ranges does not.
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let n = 0;
    for (const [i, count] of days.entries()) {
      for (let d = 1; d <= count; d++) {
        const iso = `2028-${String(i + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        expect(sunSign(iso), iso).not.toBeNull();
        n++;
      }
    }
    expect(n).toBe(366);
  });

  it('is null for an invalid date rather than guessing', () => {
    expect(sunSign('1994-02-30')).toBeNull();
    expect(sunSign('nope')).toBeNull();
  });
});

describe('element and modality', () => {
  it('gives four elements and three modalities across twelve signs', () => {
    expect(ZODIAC).toHaveLength(12);
    const els = ZODIAC.map((s) => SIGNS[s].element);
    const mods = ZODIAC.map((s) => SIGNS[s].modality);
    for (const e of ['fire', 'earth', 'air', 'water']) {
      expect(els.filter((x) => x === e)).toHaveLength(3);
    }
    for (const m of ['cardinal', 'fixed', 'mutable']) {
      expect(mods.filter((x) => x === m)).toHaveLength(4);
    }
  });

  it('walks fire-earth-air-water in zodiac order', () => {
    // The elements cycle every four signs and the modalities every three. That
    // is a real property of the zodiac and it catches a mistyped row instantly.
    expect(ZODIAC.map((s) => SIGNS[s].element)).toEqual(
      ['fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water',
        'fire', 'earth', 'air', 'water'],
    );
    expect(ZODIAC.map((s) => SIGNS[s].modality)).toEqual(
      ['cardinal', 'fixed', 'mutable', 'cardinal', 'fixed', 'mutable',
        'cardinal', 'fixed', 'mutable', 'cardinal', 'fixed', 'mutable'],
    );
  });

  it('Cancer is cardinal water and Leo is fixed fire', () => {
    expect(sunSign('1994-07-01')).toEqual({ sign: 'cancer', element: 'water', modality: 'cardinal' });
    expect(sunSign('1994-08-01')).toEqual({ sign: 'leo', element: 'fire', modality: 'fixed' });
  });
});

describe('life path — reduce(reduce(YYYY) + reduce(MM) + reduce(DD))', () => {
  it('1994-07-26: reduce(1994)=5, reduce(7)=7, reduce(26)=8 -> reduce(20)=2', () => {
    // 1+9+9+4 = 23 -> 5.  7.  2+6 = 8.  5+7+8 = 20 -> 2.
    expect(lifePath('1994-07-26')).toBe(2);
  });

  it('1990-05-24 is 3', () => {
    // 1+9+9+0 = 19 -> 10 -> 1.  5.  2+4 = 6.  1+5+6 = 12 -> 3.
    expect(lifePath('1990-05-24')).toBe(3);
  });

  it('preserves a master reached by the OUTER sum: 1990-01-09 is 11', () => {
    // 1990 -> 19 -> 10 -> 1.  1.  9.  1+1+9 = 11, and the sum halts there.
    expect(lifePath('1990-01-09')).toBe(11);
  });

  it('NOVEMBER CONTRIBUTES 11, NOT 2 (reconciliation §5.3)', () => {
    /*
     * The test the amendment exists for. Under the roadmap's original wording
     * reduce(11) was 2, so a November birth month could never carry a master
     * into the sum. 2000-11-09 is where the two rules visibly disagree:
     *
     *   now:  reduce(2000)=2, reduce(11)=11, reduce(9)=9 -> 22, and 22 halts.
     *   was:  reduce(2000)=2, reduce(11)=2,  reduce(9)=9 -> 13 -> 4.
     *
     * Most November dates cannot tell the two apart at all, because 11 and 2
     * are congruent mod 9 and digit reduction is a digital root. That is
     * exactly why this date and not a convenient one.
     */
    expect(lifePath('2000-11-09')).toBe(22);
    // And the half that never changed: the 29th reaches 11 by summing.
    // reduce(2000)=2, reduce(1)=1, reduce(29)=11 -> 14 -> 5.
    expect(lifePath('2000-01-29')).toBe(5);
  });

  it('is null for an invalid date', () => {
    expect(lifePath('1994-02-30')).toBeNull();
    expect(lifePath('')).toBeNull();
  });

  it('is never null for a valid date — the components are all >= 1', () => {
    for (const iso of ['0001-01-01', '2028-02-29', '9999-12-31']) {
      expect(lifePath(iso), iso).not.toBeNull();
    }
  });
});

describe('the module constructs no Date', () => {
  it('has no `new Date`, no `Date.UTC` and no `Date.parse` in its source', () => {
    // CLAUDE.md's trap, asserted at the source level because the symptom is a
    // one-day error that only appears for users west of the server's zone.
    const src = readFileSync(new URL('./astrology.ts', import.meta.url), 'utf8');
    expect(src.replace(/^\s*\*.*$/gm, '')).not.toMatch(/new Date|Date\.UTC|Date\.parse/);
  });
});

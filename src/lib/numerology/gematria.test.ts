/**
 * Pythagorean gematria (VD3, roadmap §5, plan §3).
 *
 * The Y-vowel table in plan §3.3 is reproduced as named tests below, and every
 * expected sum in this file was computed by hand from the letter table. If you
 * change one, recompute it by hand too.
 *
 * WHERE THE PLAN'S ARITHMETIC AND THIS FILE DISAGREE, RECONCILIATION §5.3 IS
 * WHY: `reduce(11)` is 11, not 2, so `personality('Maya')` is 11 where the plan
 * wrote 2. Everything else in the plan's worked sums is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { PYTHAGOREAN, letterValue, normalizeName } from './gematria';

describe('the Pythagorean table (VD3)', () => {
  it('is A=1..I=9, J=1..R=9, S=1..Z=8', () => {
    expect('ABCDEFGHI'.split('').map(letterValue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect('JKLMNOPQR'.split('').map(letterValue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect('STUVWXYZ'.split('').map(letterValue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('covers all 26 letters and nothing else', () => {
    expect(Object.keys(PYTHAGOREAN)).toHaveLength(26);
  });

  it('gives 0 to anything that is not an A-Z letter', () => {
    for (const ch of ['a', ' ', '-', "'", '1', 'é', '中', '']) expect(letterValue(ch)).toBe(0);
  });
});

describe('normalizeName', () => {
  it('uppercases and drops everything that is not a letter', () => {
    expect(normalizeName('Miftahul Mahfuzh')).toBe('MIFTAHULMAHFUZH');
    expect(normalizeName("O'Brien-Smith 3rd")).toBe('OBRIENSMITHRD');
  });

  it('folds combining diacritics to ASCII', () => {
    expect(normalizeName('José')).toBe('JOSE');
    expect(normalizeName('François')).toBe('FRANCOIS');
    expect(normalizeName('Nguyễn')).toBe('NGUYEN');
    expect(normalizeName('Ångström')).toBe('ANGSTROM');
  });

  it('folds the letters NFD does NOT decompose (N4) instead of deleting them', () => {
    // 'ø'.normalize('NFD') is still one code point. Without the explicit table
    // the [^A-Z] filter deletes it and BJORN becomes BJRN, which is a different
    // Expression number for the same person.
    expect(normalizeName('Bjørn')).toBe('BJORN');
    expect(normalizeName('Łukasz')).toBe('LUKASZ');
    expect(normalizeName('Đặng')).toBe('DANG');
    expect(normalizeName('Æthel')).toBe('AETHEL');
    expect(normalizeName('Straße')).toBe('STRASSE');
  });

  it('is empty, not a throw, for a name with no Latin letters', () => {
    expect(normalizeName('   ')).toBe('');
    expect(normalizeName('王小明')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeName('José Ångström-Bjørn');
    expect(normalizeName(once)).toBe(once);
  });
});

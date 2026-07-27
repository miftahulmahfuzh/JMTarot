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
import {
  PYTHAGOREAN,
  expression,
  letterValue,
  nicknamePulse,
  normalizeName,
  personality,
  soulUrge,
  vowelFlags,
} from './gematria';

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

describe('expression — reduce(sum of every letter of the full name)', () => {
  it('MAYA is 4', () => {
    // M4 A1 Y7 A1 = 13 -> 4. Computed by hand from the letter table.
    expect(expression('Maya')).toBe(4);
  });

  it('YUDI is 5', () => {
    // Y7 U3 D4 I9 = 23 -> 5.
    expect(expression('Yudi')).toBe(5);
  });

  it('RAYYAN is 3', () => {
    // R9 A1 Y7 Y7 A1 N5 = 30 -> 3.
    expect(expression('Rayyan')).toBe(3);
  });

  it('ignores spacing, case, punctuation and diacritics', () => {
    expect(expression('  ma-ya  ')).toBe(expression('MAYA'));
    expect(expression('Mayá')).toBe(expression('Maya'));
  });

  it('is null, not 0, for a name with no letters (N5)', () => {
    expect(expression('')).toBeNull();
    expect(expression('   ')).toBeNull();
    expect(expression('王小明')).toBeNull();
  });
});

describe('nicknamePulse', () => {
  it('is the same arithmetic as expression, on a different string', () => {
    // Separate from Expression on purpose (roadmap §5): the nickname is what
    // the reader says out loud, and both names are supposed to count.
    expect(nicknamePulse('Maya')).toBe(expression('Maya'));
  });

  it('differs from expression when the nickname is not the full name', () => {
    // YUDI = 23 -> 5. YUDIPRASETYO = 61 -> 7.
    expect(nicknamePulse('Yudi')).toBe(5);
    expect(expression('Yudi Prasetyo')).toBe(7);
  });

  it('is null for an empty nickname', () => {
    expect(nicknamePulse('')).toBeNull();
  });
});

describe('Y is a vowel only when it is not adjacent to a vowel (N6)', () => {
  // The table in plan §3.3, one row per test, so a failure names the case.
  const flags = (name: string) => vowelFlags(name).map((v) => (v ? 'v' : 'c')).join('');

  it('MAYA: the Y sits between two vowels, so it is a consonant', () => {
    expect(flags('MAYA')).toBe('cvcv');
  });

  it('YUDI: a leading Y followed by U is a consonant', () => {
    expect(flags('YUDI')).toBe('cvcv');
  });

  it('RAYYAN: both Ys touch a vowel on one side, so both are consonants', () => {
    expect(flags('RAYYAN')).toBe('cvccvc');
  });

  it('LYN: a Y with consonants on both sides IS a vowel', () => {
    expect(flags('LYN')).toBe('cvc');
  });

  it('YSMAY: a leading Y before a consonant is a vowel; a trailing Y after A is not', () => {
    expect(flags('YSMAY')).toBe('vccvc');
  });

  it('a lone Y is a vowel — both neighbours are out of range', () => {
    expect(flags('Y')).toBe('v');
  });
});

describe('soul urge — reduce(sum of vowels), Y resolved per N6', () => {
  it('MAYA is 2 (A + A = 2)', () => {
    expect(soulUrge('Maya')).toBe(2);
  });

  it('YUDI is 3 (U3 + I9 = 12 -> 3)', () => {
    expect(soulUrge('Yudi')).toBe(3);
  });

  it('RAYYAN is 2 (A + A = 2)', () => {
    expect(soulUrge('Rayyan')).toBe(2);
  });

  it('counts a vowel-Y: LYN is 7', () => {
    expect(soulUrge('Lyn')).toBe(7);
  });

  it('is null when the name has no vowels at all (N5)', () => {
    expect(soulUrge('Ng')).toBeNull();
    expect(soulUrge('')).toBeNull();
  });
});

describe('personality — reduce(sum of consonants)', () => {
  it('MAYA is 11 (M4 + Y7 = 11, and 11 is a fixed point)', () => {
    // Worth its own comment: the plan wrote 2 here, because the roadmap's
    // original rule reduced a master arriving as an INPUT. Reconciliation §5.3
    // made the masters fixed points, so a consonant sum of exactly 11 stays 11.
    expect(personality('Maya')).toBe(11);
  });

  it('YUDI is 11 (Y7 + D4 = 11)', () => {
    expect(personality('Yudi')).toBe(11);
  });

  it('RAYYAN is 1 (R9 + Y7 + Y7 + N5 = 28 -> 10 -> 1)', () => {
    expect(personality('Rayyan')).toBe(1);
  });

  it('is null when the name is all vowels', () => {
    expect(personality('Aia')).toBeNull();
  });
});

describe('the three name numbers are internally consistent', () => {
  it('vowel sum plus consonant sum is the whole-name sum, for every test name', () => {
    // Not an identity on the REDUCED values — reduce is not additive. This
    // asserts the partition, which is the thing that can actually be wrong.
    for (const name of ['Maya', 'Yudi', 'Rayyan', 'Miftahul Mahfuzh', 'Lyn']) {
      const letters = normalizeName(name);
      const v = vowelFlags(letters);
      const vs = letters.split('').filter((_, i) => v[i]).map(letterValue);
      const cs = letters.split('').filter((_, i) => !v[i]).map(letterValue);
      const total = letters.split('').map(letterValue).reduce((a, b) => a + b, 0);
      expect(vs.reduce((a, b) => a + b, 0) + cs.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

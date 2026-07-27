/**
 * Birth date -> sun sign, element, modality — and the life path number (VD4,
 * roadmap §5).
 *
 * THIS MODULE CONSTRUCTS NO `Date`, AND THAT IS THE WHOLE REASON IT PARSES BY
 * HAND. CLAUDE.md: "`local_date` and `birth_date` are `string`, not `Date`, on
 * purpose … a `Date` renders in the server's zone and is a day out for anyone in
 * Jakarta between midnight and 07:00. It looks plausible while being wrong."
 * A sun sign is exactly that shape of bug: a querent born on 23 July is a Leo,
 * and `new Date('1994-07-23').getMonth()/getDate()` on a server west of UTC
 * gives 22 July and Cancer. One person in twelve, on their own birthday, and
 * nothing on screen looks broken. `src/lib/memory/windows.ts` needs `Date.UTC`
 * because it does day arithmetic; this module does none, so it does not get one.
 * There is a source-level test asserting the absence.
 *
 * THE CUSP TABLE IS APPROXIMATE AND VD4 ALREADY RULED ON THAT. The true solar
 * ingress moves by up to a day from year to year and pinning it needs an
 * ephemeris — which is the "fabricated data presented as fact" VD4 refuses,
 * exactly like a rising sign computed from a birth time we never collected. A
 * fixed table is honest about being a table.
 *
 * WHY THE LIFE PATH IS IN THE ASTROLOGY FILE (plan N7). Roadmap §6 fixes the
 * module map at five files plus the facade and calls this one "date -> sign /
 * element / modality". Life path is also date -> number and needs the same
 * parser; one parser means one place a malformed birth date is rejected and one
 * leap-year rule. A sixth file would be off the map, and putting the parser in
 * `reduce.ts` would make the leaf depend on the branch.
 */
import type { Element } from '@/data/types';
import { type GlossNumber, reduce, reduceToGloss } from './reduce';

export type IsoDateParts = { year: number; month: number; day: number };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * `'YYYY-MM-DD'` -> integers, or null.
 *
 * Strict: no whitespace, no time component, no single-digit month. Everything
 * reaching this function came out of `profiles.birth_date`, which is a `date`
 * column Postgres renders in exactly this shape — so anything else is either a
 * hand-typed value or a bug, and guessing at it would put a wrong sign on
 * `/account` with nothing to trace it to.
 */
export function parseIsoDate(iso: string): IsoDateParts | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export const ZODIAC = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

export type ZodiacSign = (typeof ZODIAC)[number];

export type Modality = 'cardinal' | 'fixed' | 'mutable';

/**
 * `Element` is `@/data/types`'s and is NOT redeclared here.
 *
 * The card data already uses `'fire' | 'earth' | 'air' | 'water'`, and two
 * declarations of the same four-member union agree right up until they do not —
 * reconciliation R4's argument about `Locale`, applied again.
 */
export const SIGNS: Record<ZodiacSign, { element: Element; modality: Modality }> = {
  aries: { element: 'fire', modality: 'cardinal' },
  taurus: { element: 'earth', modality: 'fixed' },
  gemini: { element: 'air', modality: 'mutable' },
  cancer: { element: 'water', modality: 'cardinal' },
  leo: { element: 'fire', modality: 'fixed' },
  virgo: { element: 'earth', modality: 'mutable' },
  libra: { element: 'air', modality: 'cardinal' },
  scorpio: { element: 'water', modality: 'fixed' },
  sagittarius: { element: 'fire', modality: 'mutable' },
  capricorn: { element: 'earth', modality: 'cardinal' },
  aquarius: { element: 'air', modality: 'fixed' },
  pisces: { element: 'water', modality: 'mutable' },
};

export type SunFacts = { sign: ZodiacSign; element: Element; modality: Modality };

/**
 * `[sign, from, to]` as `month * 100 + day`.
 *
 * CAPRICORN IS ABSENT ON PURPOSE: it is the only sign that wraps the year, so
 * it is the fall-through. That is one branch instead of a special-cased
 * comparison, and it is the branch the 366-day sweep in the test file can prove
 * exhaustively — which eyeballing twelve ranges cannot.
 */
const RANGES: readonly (readonly [ZodiacSign, number, number])[] = [
  ['aries', 321, 419], ['taurus', 420, 520], ['gemini', 521, 620],
  ['cancer', 621, 722], ['leo', 723, 822], ['virgo', 823, 922],
  ['libra', 923, 1022], ['scorpio', 1023, 1121], ['sagittarius', 1122, 1221],
  ['aquarius', 120, 218], ['pisces', 219, 320],
];

export function sunSign(birthDate: string): SunFacts | null {
  const parts = parseIsoDate(birthDate);
  if (!parts) return null;
  const md = parts.month * 100 + parts.day;
  const sign = RANGES.find(([, from, to]) => md >= from && md <= to)?.[0] ?? 'capricorn';
  return { sign, ...SIGNS[sign] };
}

/**
 * `reduce(reduce(YYYY) + reduce(MM) + reduce(DD))` — roadmap §5, verbatim.
 *
 * COMPONENTS ARE REDUCED BEFORE SUMMING and the roadmap says why: it is the
 * standard method and the only one that produces master numbers at the right
 * rate. Since reconciliation §5.3, `reduce(11)` is 11, so an eleventh month
 * carries a master into the sum exactly as the 29th does — see `reduce`'s
 * header for what that amendment replaced.
 */
export function lifePath(birthDate: string): GlossNumber | null {
  const p = parseIsoDate(birthDate);
  if (!p) return null;
  return reduceToGloss(reduce(p.year) + reduce(p.month) + reduce(p.day));
}

/**
 * Pythagorean gematria: a name -> four numbers (VD3, roadmap §5).
 *
 * ONE SYSTEM, NAMED ONCE. VD3 picked Pythagorean over Chaldean so that two
 * workstreams cannot each produce a different Expression number for one person.
 * A=1..I=9, J=1..R=9, S=1..Z=8. It is a pure lookup and it handles Indonesian
 * names without transliteration, which Chaldean does not.
 *
 * NORMALIZATION IS NFD PLUS AN EXPLICIT TABLE, AND THE TABLE IS NOT OPTIONAL.
 * `String.prototype.normalize('NFD')` splits precomposed letters into a base and
 * a combining mark, so stripping U+0300..U+036F turns é into e for free. It does
 * NOTHING for ø, đ, ł, æ, œ, ð and þ, which are single code points with no
 * decomposition — so without the table below the `[^A-Z]` filter DELETES them
 * and `Bjørn` silently becomes `BJRN`, six lower in the sum and a different
 * card. `ß` needs no entry: `'ß'.toUpperCase()` is already 'SS'.
 *
 * Indonesian names need almost none of this, and that is not an argument for
 * dropping it: the app takes a free-text full name from anybody with a Google
 * account, and a name quietly losing a letter is the kind of thing nobody
 * reports and nobody notices.
 */
import { type GlossNumber, reduceToGloss } from './reduce';

/** A=1..I=9, J=1..R=9, S=1..Z=8. */
export const PYTHAGOREAN: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch, i) => [ch, (i % 9) + 1]),
  ),
);

/** The letters NFD leaves alone. See the module header. */
const FOLD: Readonly<Record<string, string>> = Object.freeze({
  Ø: 'O',
  Đ: 'D',
  Ł: 'L',
  Æ: 'AE',
  Œ: 'OE',
  Ð: 'D',
  Þ: 'TH',
  Ŋ: 'NG',
});

const COMBINING = /[̀-ͯ]/g;

export function letterValue(letter: string): number {
  return PYTHAGOREAN[letter] ?? 0;
}

/**
 * Fold to `/^[A-Z]*$/`. Idempotent. Never throws.
 *
 * The step order matters: marks are stripped BEFORE uppercasing, so the final
 * filter only ever sees base letters. Uppercasing a decomposed string can
 * recompose it in some engines, and a recomposed `É` would be deleted rather
 * than folded.
 */
export function normalizeName(raw: string): string {
  const stripped = raw.normalize('NFD').replace(COMBINING, '').toUpperCase();
  let folded = '';
  for (const ch of stripped) folded += FOLD[ch] ?? ch;
  return folded.replace(/[^A-Z]/g, '');
}

function sumOf(letters: string): number {
  let total = 0;
  for (const ch of letters) total += letterValue(ch);
  return total;
}

/**
 * Every letter of the full name, reduced.
 *
 * NULL AND NOT ZERO for a name with no Latin letters (plan N5). Zero is not a
 * numerological quality; it is "there is no number here", and the caller must
 * branch. `/account` renders nothing for a null and would render a caption for
 * a 0 that no gloss table has a line for.
 */
export function expression(fullName: string): GlossNumber | null {
  const letters = normalizeName(fullName);
  return letters === '' ? null : reduceToGloss(sumOf(letters));
}

/**
 * The nickname's own total. Deliberately not `expression` under another name.
 *
 * Roadmap §5 keeps them separate because Miftah asked for both names to count
 * and the nickname is the one the reader actually says out loud. They coincide
 * only when the two strings do.
 */
export function nicknamePulse(nickname: string): GlossNumber | null {
  const letters = normalizeName(nickname);
  return letters === '' ? null : reduceToGloss(sumOf(letters));
}

const HARD_VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/**
 * Per-position vowel/consonant, with the Y rule resolved (roadmap §5, plan N6).
 *
 * Y IS A VOWEL ONLY WHEN NEITHER NEIGHBOUR IS IN AEIOU. An out-of-range
 * neighbour — the start or the end of the string — counts as "not a vowel", so a
 * lone `Y` is a vowel and `YUDI`'s leading Y is not.
 *
 * EXPORTED, and not a private helper, because the rule is the part of this file
 * most likely to be implemented backwards and the test table reads it directly.
 * `soulUrge` and `personality` are then two filters over one decision, which is
 * also what makes them provably complementary.
 *
 * `letters` must already be normalized. Anything not in A-Z is treated as a
 * consonant, which cannot happen for a normalized string and is the safe
 * direction if it ever does.
 */
export function vowelFlags(letters: string): boolean[] {
  return letters.split('').map((ch, i) => {
    if (HARD_VOWELS.has(ch)) return true;
    if (ch !== 'Y') return false;
    const before = letters[i - 1];
    const after = letters[i + 1];
    return !HARD_VOWELS.has(before ?? '') && !HARD_VOWELS.has(after ?? '');
  });
}

function partSum(letters: string, wantVowels: boolean): number {
  const flags = vowelFlags(letters);
  let total = 0;
  for (const [i, ch] of letters.split('').entries()) {
    if (flags[i] === wantVowels) total += letterValue(ch);
  }
  return total;
}

/** Vowels only, Y resolved. Null when the name has none. */
export function soulUrge(fullName: string): GlossNumber | null {
  const sum = partSum(normalizeName(fullName), true);
  return sum === 0 ? null : reduceToGloss(sum);
}

/** Consonants only, Y resolved. Null when the name has none. */
export function personality(fullName: string): GlossNumber | null {
  const sum = partSum(normalizeName(fullName), false);
  return sum === 0 ? null : reduceToGloss(sum);
}

export type NameNumbers = {
  expression: GlossNumber | null;
  soulUrge: GlossNumber | null;
  personality: GlossNumber | null;
};

/** All three at once, so a caller normalizes the name conceptually once. */
export function nameNumbers(fullName: string): NameNumbers {
  return {
    expression: expression(fullName),
    soulUrge: soulUrge(fullName),
    personality: personality(fullName),
  };
}

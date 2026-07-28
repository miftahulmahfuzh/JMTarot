/**
 * The slug, which is a capability token and is therefore the one thing in V7
 * where a "works fine" implementation and a correct one are hard to tell apart.
 *
 * The symbol-counting test is the one that earns its keep: a `byte % 36` bias
 * produces slugs that look perfect, pass every other assertion here, and quietly
 * shorten the key length.
 */
import { describe, expect, it } from 'vitest';

import {
  containsDenied,
  isShareEntity,
  isValidSlug,
  newSlug,
  normalizeSlug,
  SHARE_ENTITIES,
  SLUG_ALPHABET,
  SLUG_DENY,
  SLUG_LENGTH,
} from './slug';

describe('the slug alphabet', () => {
  it('is Crockford base32: 32 symbols, no i/l/o/u', () => {
    expect(SLUG_ALPHABET).toHaveLength(32);
    expect(new Set(SLUG_ALPHABET).size).toBe(32);
    for (const c of 'ilou') expect(SLUG_ALPHABET).not.toContain(c);
    expect(SLUG_ALPHABET).toBe(SLUG_ALPHABET.toLowerCase());
  });

  it('divides 256 exactly, which is what makes `byte & 0x1f` unbiased', () => {
    expect(256 % SLUG_ALPHABET.length).toBe(0);
  });

  it('is twelve characters, i.e. 60 bits (see the plan §2.2)', () => {
    expect(SLUG_LENGTH).toBe(12);
    expect(SLUG_LENGTH * Math.log2(SLUG_ALPHABET.length)).toBe(60);
  });

  it('closes the entity union', () => {
    expect(SHARE_ENTITIES).toEqual(['reading', 'persona']);
    expect(isShareEntity('reading')).toBe(true);
    expect(isShareEntity('persona')).toBe(true);
    expect(isShareEntity('Reading')).toBe(false);
    expect(isShareEntity('__proto__')).toBe(false);
    expect(isShareEntity('constructor')).toBe(false);
    expect(isShareEntity(undefined)).toBe(false);
  });

  it('spells every denied substring in its own alphabet', () => {
    /*
     * A deny entry containing `i`, `l`, `o` or `u` can never match a generated
     * slug, so it would be dead weight that reads as coverage. Same class of
     * mistake as running the Malay grep over English output.
     */
    for (const bad of SLUG_DENY) {
      for (const c of bad) expect(SLUG_ALPHABET).toContain(c);
    }
  });
});

describe('newSlug', () => {
  it('draws only from the alphabet, at the declared length', () => {
    for (let i = 0; i < 200; i++) {
      const s = newSlug();
      expect(s).toHaveLength(SLUG_LENGTH);
      expect(s).toMatch(new RegExp(`^[${SLUG_ALPHABET}]{${SLUG_LENGTH}}$`));
    }
  });

  it('is uniform enough that every symbol appears over 2000 draws', () => {
    // 2000 * 12 = 24000 characters over 32 symbols = 750 expected each.
    // A byte-modulo bias would starve the tail of the alphabet; this catches it.
    const seen = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      for (const c of newSlug()) seen.set(c, (seen.get(c) ?? 0) + 1);
    }
    expect(seen.size).toBe(32);
    for (const [, n] of seen) expect(n).toBeGreaterThan(400);
  });

  it('does not repeat itself', () => {
    const n = 5000;
    expect(new Set(Array.from({ length: n }, newSlug)).size).toBe(n);
  });

  it('rerolls a slug containing a denied substring', () => {
    // The filter itself, checked positively first -- otherwise the loop below
    // passes for a `containsDenied` that always answers false.
    const denied = SLUG_DENY[0]!;
    expect(containsDenied(denied.padEnd(SLUG_LENGTH, 'a'))).toBe(true);
    expect(containsDenied('a'.repeat(SLUG_LENGTH))).toBe(false);
    for (let i = 0; i < 500; i++) expect(containsDenied(newSlug())).toBe(false);
  });
});

describe('isValidSlug / normalizeSlug', () => {
  it('accepts what it generates and nothing else', () => {
    expect(isValidSlug(newSlug())).toBe(true);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('abc')).toBe(false); // too short
    expect(isValidSlug('a'.repeat(13))).toBe(false); // too long
    expect(isValidSlug('aaaaaaaaaaa!')).toBe(false); // punctuation
    expect(isValidSlug("' or 1=1--")).toBe(false);
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug(12)).toBe(false);
  });

  it('accepts an excluded letter by folding it, rather than by rejecting it', () => {
    /*
     * `aaaaaaaaaaai` is not a slug we would ever mint, but it is exactly what a
     * person retyping one produces. Folding it to `aaaaaaaaaaa1` and looking
     * THAT up is the whole point of normalization -- and it is safe only because
     * the fold is injective over the generated set, asserted below.
     */
    expect(isValidSlug('aaaaaaaaaaai')).toBe(true);
    expect(normalizeSlug('aaaaaaaaaaai')).toBe('aaaaaaaaaaa1');
  });

  it('normalizes the confusables, and every generated slug is a fixed point', () => {
    expect(normalizeSlug('ABCD-EFGH JKMN')).toBe('abcdefghjkmn');
    expect(normalizeSlug('IL0O1U')).toBe('11001v');
    for (let i = 0; i < 200; i++) {
      const s = newSlug();
      expect(normalizeSlug(s)).toBe(s); // injectivity over the generated set
    }
  });

  it('is injective over the generated set, exhaustively over the alphabet', () => {
    /*
     * The property stated as a property rather than sampled: every symbol we can
     * emit maps to itself, so two distinct generated slugs cannot collide under
     * the fold. If a future edit adds `w -> v` "for symmetry", this fails.
     */
    for (const c of SLUG_ALPHABET) expect(normalizeSlug(c)).toBe(c);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CARDS } from '@/data/deck';
import { addressForms, ADDRESS_DENYLIST, MAX_ADDRESS_FORMS, MIN_ADDRESS_LENGTH } from './address';

/**
 * §8.3's table, all twenty rows, verbatim. **Eight of them return only the
 * nickname**, which is `[F3-2]` — an empty derived list is a CORRECT outcome and is
 * tested as one rather than treated as a gap to close.
 */
const TABLE: ReadonlyArray<{ nickname: string; expected: string[]; covers: string }> = [
  { nickname: 'Miftah', expected: ['Miftah', 'Mif', 'Tah'], covers: "C-D10's worked example" },
  { nickname: 'Jodith', expected: ['Jodith', 'Jo'], covers: 'a non-native coda cluster' },
  { nickname: 'Nina', expected: ['Nina', 'Ni', 'Na'], covers: 'two open syllables' },
  { nickname: 'Anton', expected: ['Anton', 'Ton'], covers: 'the onsetless case' },
  { nickname: 'Budi', expected: ['Budi', 'Bud'], covers: 'the denylist is why bud and not bu' },
  { nickname: 'Mifta', expected: ['Mifta', 'Mif', 'Ta'], covers: "the repo's own fixture" },
  { nickname: 'Agus', expected: ['Agus', 'Gus'], covers: 'the gus near-miss' },
  { nickname: 'Bambang', expected: ['Bambang', 'Bam'], covers: 'the denylist at the tail' },
  { nickname: 'Wulandari', expected: ['Wulandari', 'Wu', 'Wulan'], covers: 'n>=3, never the tail' },
  { nickname: 'Miftahul', expected: ['Miftahul', 'Mif', 'Mifta'], covers: 'n>=3 lands on the real one' },
  { nickname: 'Bob', expected: ['Bob'], covers: 'one syllable, an EMPTY derived list' },
  { nickname: 'Eka', expected: ['Eka', 'Ka'], covers: 'onsetless first, ka != denied kak' },
  { nickname: 'Christine', expected: ['Christine', 'Chris', 'Christi'], covers: 'non-Indonesian orthography' },
  { nickname: 'Ayu Lestari', expected: ['Ayu Lestari'], covers: 'a space, and an empty derived list' },
  { nickname: 'Dwi', expected: ['Dwi'], covers: 'one syllable, consonant onset cluster' },
  { nickname: 'Sri Rahayu', expected: ['Sri Rahayu'], covers: 'space + one syllable' },
  { nickname: 'Rizky', expected: ['Rizky', 'Riz'], covers: 'y-as-glide: no nucleus-free syllable' },
  { nickname: 'Ngurah', expected: ['Ngurah', 'Ngu', 'Rah'], covers: 'the digraph rule, onset side' },
  { nickname: '李明', expected: ['李明'], covers: 'non-Latin script' },
  { nickname: 'M', expected: ['M'], covers: 'degenerate input, and it must not throw' },
];

describe('addressForms', () => {
  it.each(TABLE)('$nickname -> $expected ($covers)', ({ nickname, expected }) => {
    expect(addressForms(nickname)).toEqual(expected);
  });

  /**
   * `[F3-2]`, and the reason it is asserted over the whole table rather than once:
   * **the full nickname is always candidate zero and is never derived, never
   * filtered, never denied.** A derivation that dropped it would call somebody
   * something they never typed.
   */
  it('always returns the nickname first, verbatim', () => {
    for (const { nickname } of TABLE) {
      expect(addressForms(nickname)[0]).toBe(nickname);
    }
  });

  it('never returns more than MAX_ADDRESS_FORMS', () => {
    for (const { nickname } of TABLE) {
      expect(addressForms(nickname).length).toBeLessThanOrEqual(MAX_ADDRESS_FORMS);
    }
  });

  /** A one-character address form is a typo, not a name (`C-D10`). */
  it('never derives a form shorter than MIN_ADDRESS_LENGTH', () => {
    for (const { nickname } of TABLE) {
      for (const derived of addressForms(nickname).slice(1)) {
        expect(derived.length).toBeGreaterThanOrEqual(MIN_ADDRESS_LENGTH);
      }
    }
  });

  it('never returns a duplicate', () => {
    for (const { nickname } of TABLE) {
      const forms = addressForms(nickname);
      expect(new Set(forms.map((f) => f.toLowerCase())).size).toBe(forms.length);
    }
  });

  /**
   * `[F3-2]` again: an empty list is a correct outcome, so the failure mode being
   * guarded here is a THROW, not a short answer.
   */
  it.each(['', '   ', '!!!', '???  ???', '😀', 'a'.repeat(200), '-', "'", '1994'])(
    'does not throw on %j',
    (raw) => {
      expect(() => addressForms(raw)).not.toThrow();
    },
  );

  it('returns nothing at all when there is no nickname', () => {
    expect(addressForms('')).toEqual([]);
    expect(addressForms('   ')).toEqual([]);
  });

  it('collapses whitespace before deriving, and candidate zero is the collapsed form', () => {
    expect(addressForms('  Ayu   Lestari ')[0]).toBe('Ayu Lestari');
  });

  it('keeps a lowercase nickname lowercase and a capitalised one capitalised', () => {
    expect(addressForms('miftah')).toEqual(['miftah', 'mif', 'tah']);
    expect(addressForms('MIFTAH')).toEqual(['MIFTAH', 'MIF', 'TAH']);
  });
});

describe('the denylist', () => {
  /**
   * `[F3-1]`: **a test may import what the module may not.** `address.ts` is a LEAF
   * with zero imports, so its card-name group is typed out; this is what proves the
   * typing-out is complete. Deriving the list inside the module would give it a
   * dependency on `@/data`, which pulls `cards.json` into anything that merely wants
   * to clip a nickname.
   */
  it('covers every word of every card name', () => {
    const missing: string[] = [];
    for (const card of CARDS) {
      for (const word of card.name.toLowerCase().split(/\s+/)) {
        if (!ADDRESS_DENYLIST.includes(word)) missing.push(`${card.name} -> ${word}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers the three readers and the app’s own vocabulary', () => {
    for (const word of ['thes', 'marg', 'adri', 'tarot', 'kartu', 'card']) {
      expect(ADDRESS_DENYLIST).toContain(word);
    }
  });

  it('is lowercase throughout, because the check is case-insensitive', () => {
    for (const word of ADDRESS_DENYLIST) expect(word).toBe(word.toLowerCase());
  });

  /**
   * The recorded near-miss (§8.2, reconciliation `[R19]`): `Agus -> Gus` is the most
   * common Indonesian clipping there is, and denying it would leave every Agus in the
   * app with nothing but their full nickname.
   */
  it('does not carry gus, deliberately', () => {
    expect(ADDRESS_DENYLIST).not.toContain('gus');
  });
});

describe('the module', () => {
  /**
   * `[F3-1]`. **PURE, A LEAF, ZERO IMPORTS**, asserted over the source because that
   * is the only thing that can see it: a type-only import would typecheck, ship, and
   * quietly make this module unreachable from the edge.
   */
  it('contains no import statement at all', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/chat/address.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\s*\(/);
    expect(src).not.toMatch(/\bfrom\s+['"]/);
  });
});

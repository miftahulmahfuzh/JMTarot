import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CARDS } from '@/data/deck';
import { READERS } from '@/data/readers';
import { catalogFor } from '@/lib/i18n/catalog';
import { makeT } from '@/lib/i18n/format';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import {
  ALL_TIME_GATE,
  passesCardGate,
  passesReaderGate,
  topCardLine,
  topReaderLine,
} from './lines';

const T: Record<Locale, ReturnType<typeof makeT>> = {
  id: makeT('id', catalogFor('id')),
  en: makeT('en', catalogFor('en')),
};

const FACTS = {
  readingCount: 9,
  topCardId: 17, // The Star
  topCardCount: 4,
  topCardReversedDominant: false,
};

describe('ALL_TIME_GATE', () => {
  it('returns false at the boundary values', () => {
    // Both conditions, and neither is redundant.
    expect(passesCardGate({ readingCount: ALL_TIME_GATE.minReadings - 1, topCardCount: 9 })).toBe(false);
    expect(passesCardGate({ readingCount: 9, topCardCount: ALL_TIME_GATE.minTopCount - 1 })).toBe(false);
    expect(passesCardGate({ readingCount: ALL_TIME_GATE.minReadings, topCardCount: ALL_TIME_GATE.minTopCount })).toBe(true);
  });

  it('fails a null top card count', () => {
    expect(passesCardGate({ readingCount: 20, topCardCount: null })).toBe(false);
  });

  it('fails a reader tie, and passes a lead of one', () => {
    // A tie is not a path opening; it is somebody browsing.
    expect(passesReaderGate(9, { readerId: 'margaret', count: 4, runnerUpCount: 4 })).toBe(false);
    expect(passesReaderGate(9, { readerId: 'margaret', count: 5, runnerUpCount: 4 })).toBe(true);
  });

  it('fails a null standing and a thin history', () => {
    expect(passesReaderGate(9, null)).toBe(false);
    expect(passesReaderGate(2, { readerId: 'margaret', count: 2, runnerUpCount: 0 })).toBe(false);
  });
});

describe('topCardLine', () => {
  it('returns null when the gate fails', () => {
    expect(topCardLine(T.id, 'id', { ...FACTS, readingCount: 1 })).toBeNull();
    expect(topCardLine(T.id, 'id', { ...FACTS, topCardCount: 1 })).toBeNull();
  });

  it('names the card in English in both locales', () => {
    for (const locale of LOCALES) {
      const line = topCardLine(T[locale], locale, FACTS);
      expect(line).toContain('The Star');
    }
  });

  it('never translates the card name', () => {
    // `## Card data`, and load-bearing here for a second reason: the thumbnail
    // beside this sentence draws the same name over the art.
    const en = topCardLine(T.en, 'en', FACTS)!;
    const id = topCardLine(T.id, 'id', FACTS)!;
    const star = CARDS[17].name;
    expect(en).toContain(star);
    expect(id).toContain(star);
    expect(id).not.toContain('Bintang');
  });

  it('differs between the upright-dominant and reversed-dominant cases', () => {
    /*
     * `cardMeaning` is a PAIR and the reversed line is a different statement, not a
     * negation. Showing the upright gloss for a card that keeps arriving upside down
     * contradicts the artwork the querent remembers.
     */
    for (const locale of LOCALES) {
      const upright = topCardLine(T[locale], locale, { ...FACTS, topCardReversedDominant: false })!;
      const reversed = topCardLine(T[locale], locale, { ...FACTS, topCardReversedDominant: true })!;
      expect(upright).not.toBe(reversed);
      expect(upright).toContain(CARDS[17].meaning[locale].upright);
      expect(reversed).toContain(CARDS[17].meaning[locale].reversed);
    }
  });

  it('reads as upright on an even split', () => {
    // A 2:2 card has not declared itself, and the upright line is the one the
    // deck's own data leads with.
    const even = topCardLine(T.id, 'id', { ...FACTS, topCardReversedDominant: false })!;
    expect(even).toContain(CARDS[17].meaning.id.upright);
  });

  it('ends in a full stop exactly once', () => {
    // The stop is added by the function, because the glosses in cards.json are
    // fragments with no terminal punctuation.
    for (const locale of LOCALES) {
      const line = topCardLine(T[locale], locale, FACTS)!;
      expect(line.endsWith('.')).toBe(true);
      expect(line.endsWith('..')).toBe(false);
    }
  });

  it('survives a card id outside the deck', () => {
    expect(topCardLine(T.id, 'id', { ...FACTS, topCardId: 99 })).toBeNull();
    expect(topCardLine(T.id, 'id', { ...FACTS, topCardId: null })).toBeNull();
  });

  it('leaves no placeholder unreplaced', () => {
    for (const locale of LOCALES) {
      expect(topCardLine(T[locale], locale, FACTS)).not.toMatch(/\{[a-z]+\}/);
    }
  });
});

describe('topReaderLine', () => {
  const standing = { readerId: 'margaret' as const, count: 5, runnerUpCount: 2 };

  it('returns null when the gate fails', () => {
    expect(topReaderLine(T.id, 'id', 9, null)).toBeNull();
    expect(topReaderLine(T.id, 'id', 1, standing)).toBeNull();
    expect(topReaderLine(T.id, 'id', 9, { ...standing, runnerUpCount: 5 })).toBeNull();
  });

  it('names the reader and their own first specialty', () => {
    const margaret = READERS.find((r) => r.id === 'margaret')!;
    for (const locale of LOCALES) {
      const out = topReaderLine(T[locale], locale, 9, standing)!;
      expect(out.line).toContain(margaret.name);
      // `specialties[locale][0]`, not a third copy of "what Margaret is for".
      expect(out.line.toLowerCase()).toContain(margaret.specialties[locale][0].toLowerCase());
    }
  });

  it('returns the closing line byte-identically to the catalog value', () => {
    /*
     * ASSERTED BECAUSE THE SENTENCE IS THE QUERENT'S OWN (requirement 3) and it is
     * the only line on the page that asks something OF them rather than describing
     * them. A well-meaning softening would be invisible without this.
     */
    for (const locale of LOCALES) {
      const out = topReaderLine(T[locale], locale, 9, standing)!;
      expect(out.closing).toBe(catalogFor(locale)['account.reader.closing']);
    }
  });

  it('keeps the closing line separate from the line', () => {
    // So the page can set it in its own italic, and so the assertion above is
    // possible at all.
    const out = topReaderLine(T.id, 'id', 9, standing)!;
    expect(out.line).not.toContain(out.closing);
  });

  it('leaves no placeholder unreplaced', () => {
    for (const locale of LOCALES) {
      const out = topReaderLine(T[locale], locale, 9, standing)!;
      expect(out.line).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('works for all three readers', () => {
    for (const reader of READERS) {
      const out = topReaderLine(T.id, 'id', 9, { readerId: reader.id, count: 5, runnerUpCount: 1 });
      expect({ reader: reader.id, ok: out !== null }).toEqual({ reader: reader.id, ok: true });
    }
  });
});

describe('lines.ts is client-importable', () => {
  /**
   * The other half of `clientBoundary.test.ts`'s exception for
   * `@/lib/persona/lines`, asserted on the SOURCE rather than trusted to the
   * filename — exactly the shape the `sanitize` and `share/slug` exceptions use.
   * The moment somebody moves a sentence of contract prose in here, the exception
   * becomes the leak it was written to prevent.
   */
  it('carries no server-only marker, no env, and no contract prose', () => {
    const raw = readFileSync('src/lib/persona/lines.ts', 'utf8');
    // Comments stripped first: this file's own header explains at length that it
    // must not carry the marker.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(src).not.toContain("import 'server-only'");
    expect(src).not.toContain('process.env');
    for (const sentinel of ['ATURAN', 'CONTENT RULES', 'Kamu menulis', 'You are writing', 'DILARANG']) {
      expect({ sentinel, present: src.includes(sentinel) }).toEqual({ sentinel, present: false });
    }
  });

  it('does not import the database or the prompt module at runtime', () => {
    const raw = readFileSync('src/lib/persona/lines.ts', 'utf8');
    // `import type` is fine -- it is erased -- and it is how `PersonaFacts` gets
    // here without dragging `prompt.ts`'s contract into the browser bundle.
    expect(raw).toMatch(/import type \{ PersonaFacts \} from '\.\/prompt'/);
    expect(raw).not.toMatch(/^import \{[^}]*\} from '\.\/prompt'/m);
    expect(raw).not.toMatch(/from '@\/lib\/db\//);
  });
});

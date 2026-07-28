import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CARDS } from '@/data/deck';
import { READERS } from '@/data/readers';
import { catalogFor } from '@/lib/i18n/catalog';
import { makeT } from '@/lib/i18n/format';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import {
  ALL_TIME_GATE,
  linkifyName,
  passesCardGate,
  passesReaderGate,
  readerPronoun,
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
      expect(topCardLine(T[locale], locale, FACTS)).not.toMatch(/\{\w+\}/);
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
      expect(out.line).not.toMatch(/\{\w+\}/);
    }
  });

  it('works for all three readers', () => {
    for (const reader of READERS) {
      const out = topReaderLine(T.id, 'id', 9, { readerId: reader.id, count: 5, runnerUpCount: 1 });
      expect({ reader: reader.id, ok: out !== null }).toEqual({ reader: reader.id, ok: true });
    }
  });

  it('uses each reader’s own pronoun and NEVER "they"', () => {
    /**
     * **THE REGRESSION THIS FILE EXISTS TO HOLD** (Miftah's ruling, 2026-07-28).
     * The English line said *"{reader} will go with you as far as they can"* — the
     * correct default for a person whose pronouns are unknown, and the wrong one for
     * three authored characters whose bios in `readers.json` have said `She`, `Her`
     * and `He` since the first release. So the page and the picker disagreed about the
     * same three people.
     *
     * Asserted per reader and as an ABSENCE, because the way `they` comes back is a
     * copy edit to one sentence that nothing else in the app reads.
     */
    const expected = { thessaly: 'she', margaret: 'she', adrian: 'he' } as const;
    for (const reader of READERS) {
      const out = topReaderLine(T.en, 'en', 9, {
        readerId: reader.id,
        count: 5,
        runnerUpCount: 1,
      })!;
      const word = expected[reader.id];
      expect({ reader: reader.id, line: out.line }).toEqual({
        reader: reader.id,
        line: `A path opened toward ${reader.name}, and what you carry there is ${reader
          .specialties.en[0]!.toLowerCase()}. ${word[0]!.toUpperCase()}${word.slice(1)} will go with you as far as ${word} can.`,
      });
      expect(out.line).not.toMatch(/\bthey\b/i);
    }
  });

  it('renders one word for both genders in Indonesian, and it is not English', () => {
    /*
     * `dia` is genderless, so the two catalog values are identical there BY DESIGN --
     * see `reader.pronoun.*`. Asserted so nobody edits one Indonesian value, sees the
     * other reader's line unchanged, and concludes the mechanism is broken. The second
     * expectation is the negative control: identical is only correct if it is
     * Indonesian, not if `en.ts` leaked in.
     */
    const [she, he] = [
      topReaderLine(T.id, 'id', 9, { readerId: 'margaret', count: 5, runnerUpCount: 1 })!,
      topReaderLine(T.id, 'id', 9, { readerId: 'adrian', count: 5, runnerUpCount: 1 })!,
    ];
    const tail = (line: string) => line.slice(line.lastIndexOf('. ') + 2);
    expect(tail(she.line)).toBe(tail(he.line));
    expect(tail(she.line)).toContain('Dia');
    expect(tail(she.line)).not.toMatch(/\b(she|he|they)\b/i);
  });
});

describe('readerPronoun', () => {
  it('is the one place `gender` meets the catalog', () => {
    expect(readerPronoun(T.en, 'female')).toBe('she');
    expect(readerPronoun(T.en, 'male')).toBe('he');
    expect(readerPronoun(T.id, 'female')).toBe('dia');
    expect(readerPronoun(T.id, 'male')).toBe('dia');
  });

  it('has a fixed gender recorded for every reader', () => {
    /*
     * THE RULING, ASSERTED AGAINST THE DATA. Thessaly female, Margaret female, Adrian
     * male. `gender` is a two-value union so a new reader cannot omit it — but it
     * could be given the wrong value, and the bios are the only other place in the
     * repo that would disagree.
     */
    expect(READERS.map((r) => [r.id, r.gender])).toEqual([
      ['thessaly', 'female'],
      ['margaret', 'female'],
      ['adrian', 'male'],
    ]);
  });

  it('agrees with the pronouns the English bios already used', () => {
    /**
     * **THE CROSS-CHECK, AND IT IS THE EVIDENCE THE RULING WAS A CORRECTION RATHER
     * THAN A CHOICE.** `bio.en` was written before `gender` existed and independently
     * of it, so a mismatch here means either the new column or three years of copy is
     * wrong — and either way somebody has to look. `bio.id` is not checked: Indonesian
     * `dia`/`-nya` carries no gender, which is the same fact `reader.pronoun.id`
     * encodes.
     */
    for (const reader of READERS) {
      const feminine = /\b(she|her)\b/i.test(reader.bio.en);
      const masculine = /\b(he|him|his)\b/i.test(reader.bio.en);
      expect({ id: reader.id, feminine, masculine }).toEqual({
        id: reader.id,
        feminine: reader.gender === 'female',
        masculine: reader.gender === 'male',
      });
    }
  });
});

describe('linkifyName', () => {
  it('splits the line so the page can wrap the name in a link', () => {
    expect(linkifyName('A path opened toward Margaret, and so on.', 'Margaret')).toEqual([
      { text: 'A path opened toward ', isName: false },
      { text: 'Margaret', isName: true },
      { text: ', and so on.', isName: false },
    ]);
  });

  it('marks every occurrence, not only the first', () => {
    /*
     * The English line carries the name once TODAY, because the second `{reader}`
     * became a pronoun. A copy edit that brings it back must produce two links rather
     * than one link and one bare name.
     */
    const out = linkifyName('Adrian, and later Adrian again.', 'Adrian');
    expect(out.filter((s) => s.isName).length).toBe(2);
    expect(out.map((s) => s.text).join('')).toBe('Adrian, and later Adrian again.');
  });

  it('emits no empty segments when the name is at either end', () => {
    expect(linkifyName('Adrian walks.', 'Adrian')).toEqual([
      { text: 'Adrian', isName: true },
      { text: ' walks.', isName: false },
    ]);
    expect(linkifyName('a path to Adrian', 'Adrian')).toEqual([
      { text: 'a path to ', isName: false },
      { text: 'Adrian', isName: true },
    ]);
  });

  it('returns the whole line unsplit for an absent or empty name', () => {
    /*
     * **THE EMPTY CASE IS THE ONE THAT MATTERS.** `''.split('')` explodes a string
     * into characters, so without the guard the page would render one `<Link>` per
     * letter. An absent name is the benign half: correct prose, no link.
     */
    expect(linkifyName('A path opened.', 'Thessaly')).toEqual([
      { text: 'A path opened.', isName: false },
    ]);
    expect(linkifyName('A path opened.', '')).toEqual([
      { text: 'A path opened.', isName: false },
    ]);
  });

  it('round-trips the line for every real reader name', () => {
    for (const reader of READERS) {
      for (const locale of LOCALES) {
        const out = topReaderLine(T[locale], locale, 9, {
          readerId: reader.id,
          count: 5,
          runnerUpCount: 1,
        })!;
        const segs = linkifyName(out.line, reader.name);
        // Nothing added, nothing lost, and the name is reachable as a link.
        expect(segs.map((s) => s.text).join('')).toBe(out.line);
        expect(segs.some((s) => s.isName)).toBe(true);
      }
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

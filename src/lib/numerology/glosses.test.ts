/**
 * The correspondence glosses (roadmap §5, plan §6).
 *
 * Two kinds of test here and they do different jobs. The completeness block
 * proves nothing is missing. THE GUARD BLOCK IS THE ONE THAT MATTERS: these
 * strings reach a PROMPT as well as a screen, so the Malay grep, the therapy
 * list and the `en` tic list all bind — and there is no smoke run over a static
 * table, so this file is the only thing checking them.
 *
 * The three word lists are IMPORTED from `@/lib/copy/vocab`, not copied.
 * Reconciliation §5 ("the shared vocabulary module") adopted that module
 * precisely because this test would otherwise have been the fourth copy.
 */
import { describe, expect, it } from 'vitest';
import type { Locale } from '@/data/types';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import { ZODIAC } from './astrology';
import {
  ELEMENT_GLOSSES,
  MODALITY_GLOSSES,
  NUMBER_GLOSSES,
  SIGN_GLOSSES,
  elementGloss,
  modalityGloss,
  numberGloss,
  signGloss,
} from './glosses';
import { MASTER_NUMBERS } from './reduce';

/**
 * `['id', 'en']` written out rather than imported from `@/lib/i18n/locale`.
 *
 * The plan's draft imported `LOCALES` from there and its own Task 15 corrects
 * it: this directory may not depend on `@/lib/i18n/**` even from a test,
 * because a test import is how a source import gets added next week.
 */
const LOCALES: readonly Locale[] = ['id', 'en'];

const ALL = [
  ...Object.values(NUMBER_GLOSSES), ...Object.values(SIGN_GLOSSES),
  ...Object.values(ELEMENT_GLOSSES), ...Object.values(MODALITY_GLOSSES),
];

describe('completeness', () => {
  it('covers 1-9 and the three masters', () => {
    for (let n = 1; n <= 9; n++) expect(NUMBER_GLOSSES[n as 1]).toBeDefined();
    for (const m of MASTER_NUMBERS) expect(NUMBER_GLOSSES[m]).toBeDefined();
    expect(Object.keys(NUMBER_GLOSSES)).toHaveLength(12);
  });

  it('covers twelve signs, four elements, three modalities', () => {
    for (const s of ZODIAC) expect(SIGN_GLOSSES[s]).toBeDefined();
    expect(Object.keys(ELEMENT_GLOSSES)).toHaveLength(4);
    expect(Object.keys(MODALITY_GLOSSES)).toHaveLength(3);
  });

  it('is 31 keys and 62 strings', () => {
    expect(ALL).toHaveLength(31);
  });

  it('has a non-empty, distinct string in both locales for every key', () => {
    for (const pair of ALL) {
      expect(pair.id.trim().length).toBeGreaterThan(0);
      expect(pair.en.trim().length).toBeGreaterThan(0);
      // Identical halves means someone pasted one into the other.
      expect(pair.id).not.toBe(pair.en);
    }
  });

  it('keeps every gloss between 6 and 20 words (N9)', () => {
    for (const pair of ALL) {
      for (const s of [pair.id, pair.en]) {
        const words = s.split(/\s+/).filter(Boolean).length;
        expect({ s, words: words >= 6 && words <= 20 }).toMatchObject({ words: true });
      }
    }
  });

  it('never addresses the querent (N9)', () => {
    // Impersonal captions. A second-person gloss reads as a fortune cookie
    // under a numeral on /account, and the prompt is what turns it into "you".
    for (const pair of ALL) {
      expect(pair.en).not.toMatch(/\byou\b|\byour\b/i);
      expect(pair.id).not.toMatch(/\bkamu\b|\bmu\b|\banda\b/i);
    }
  });

  it('the accessors return the table entries', () => {
    for (const locale of LOCALES) {
      expect(numberGloss(7, locale)).toBe(NUMBER_GLOSSES[7][locale]);
      expect(signGloss('leo', locale)).toBe(SIGN_GLOSSES.leo[locale]);
      expect(elementGloss('water', locale)).toBe(ELEMENT_GLOSSES.water[locale]);
      expect(modalityGloss('fixed', locale)).toBe(MODALITY_GLOSSES.fixed[locale]);
    }
  });
});

describe('the gloss guard', () => {
  it('has no Malay in the Indonesian half', () => {
    for (const pair of ALL) {
      for (const w of MALAY) {
        expect({ gloss: pair.id, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(pair.id) })
          .toMatchObject({ hit: false });
      }
    }
  });

  it('has no therapy, diagnosis or healing language in either locale', () => {
    for (const pair of ALL) {
      for (const w of THERAPY_ID) {
        expect({ gloss: pair.id, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(pair.id) })
          .toMatchObject({ hit: false });
      }
      for (const w of THERAPY_EN) {
        expect({ gloss: pair.en, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(pair.en) })
          .toMatchObject({ hit: false });
      }
    }
  });

  it('has none of the generic-mystic tics in the English half', () => {
    // The roadmap names this explicitly: "English numerology writing is as
    // saturated with `soul's journey` and `divine timing` as English tarot
    // writing is". These strings go into a prompt; a tic here seeds one in
    // every reading it grounds.
    for (const pair of ALL) {
      for (const tic of EN_TICS) {
        const re = new RegExp(tic.replace(/'/g, "['’]"), 'i');
        expect({ gloss: pair.en, tic, hit: re.test(pair.en) }).toMatchObject({ hit: false });
      }
    }
  });

  it('WAS WRITTEN, NOT TRANSLATED — the English never names the Indonesian image', () => {
    /*
     * W6's rule 3, applied to this file. The Indonesian half is concrete images;
     * the English half is action and consequence. This table names, per number
     * key, the English word(s) the Indonesian image would translate to. If one
     * shows up in the English gloss, that pair is a translation.
     *
     * Twelve rows because that is small enough to keep true. Signs, elements and
     * modalities are checked by eye against the recipe in `glosses.ts`'s header.
     */
    const DIVERGENCE: Record<number, string[]> = {
      1: ['step'],
      2: ['rope', 'hand', 'pull'],
      3: ['voice', 'sentence'],
      4: ['stone', 'pillar', 'fence'],
      5: ['wind', 'gap'],
      6: ['burden', 'load', 'carry', 'shoulder'],
      7: ['lamp', 'table', 'night'],
      8: ['cart', 'wheel', 'push'],
      9: ['harvest', 'field'],
      11: ['wire'],
      22: ['picture', 'building'],
      33: ['house', 'door'],
    };
    expect(Object.keys(DIVERGENCE)).toHaveLength(Object.keys(NUMBER_GLOSSES).length);
    for (const [n, words] of Object.entries(DIVERGENCE)) {
      const en = NUMBER_GLOSSES[Number(n) as 1].en;
      for (const w of words) {
        expect({ n, w, en, hit: new RegExp(`\\b${w}s?\\b`, 'i').test(en) })
          .toMatchObject({ hit: false });
      }
    }
  });

  it('is prose: no markdown, no emoji, no trailing whitespace', () => {
    // These reach a prompt whose FORMAT RULES forbid all three, and a gloss is
    // the one place the model can be handed a violation by the system itself.
    for (const pair of ALL) {
      for (const s of [pair.id, pair.en]) {
        expect(s).not.toMatch(/[*_#`]|\p{Extended_Pictographic}/u);
        expect(s).toBe(s.trim());
      }
    }
  });
});

/**
 * The callback detector (W5 plan Task 7).
 *
 * This function produces the `chain_used / chain_offered` ratio, and that ratio
 * is what decides whether the chained-reading feature is cut, kept or
 * tightened. A detector that over-reports does not just give a wrong number --
 * it gives a CONFIDENT wrong number, and the decision it feeds is
 * irreversible-ish. Hence the false-positive tests below outnumber the positive
 * ones.
 */
import { describe, expect, it } from 'vitest';
import type { Locale } from '@/data/types';
import { detectCallback } from './memory';

const base: { currentCardIds: number[]; recalledCardIds: number[]; locale: Locale } = {
  // The Moon (18) and The Tower (16) were recalled; The Sun (19) is current.
  currentCardIds: [19],
  recalledCardIds: [18, 16],
  locale: 'id',
};

const detect = (body: string, over: Partial<typeof base> = {}) =>
  detectCallback({ ...base, ...over, body });

describe('the card signal', () => {
  it('fires on a card that was recalled and is not in the current draw', () => {
    // Near-zero false positives: the base contract guarantees card names appear
    // verbatim and in English, and a reading has no reason to name a card it
    // did not draw except to refer back to when it was drawn.
    expect(detect('The Moon kembali ke percakapan ini.')).toEqual({
      fired: true,
      signal: 'card',
    });
  });

  it('does NOT fire on a card that is in the current draw', () => {
    // Naming your own card is what every reading does. If this fired, the
    // detector would report 100%.
    expect(detect('The Sun hari ini bicara soal keterbukaan.')).toEqual({
      fired: false,
      signal: null,
    });
  });

  it('does not fire on a card that was neither recalled nor drawn', () => {
    expect(detect('Death bukan bagian dari ini.').fired).toBe(false);
  });

  it('fires on the second recalled card, not only the first', () => {
    expect(detect('The Tower masih terasa.').signal).toBe('card');
  });

  it('is case-insensitive but word-bounded', () => {
    expect(detect('the moon lagi-lagi hadir.').signal).toBe('card');
    // Not inside a longer token.
    expect(detect('sebuah The Moonstone di meja.', { recalledCardIds: [18] }).signal).not.toBe(
      'card',
    );
  });

  it('prefers the card signal when both signals are present', () => {
    // The signal with the lower false-positive rate wins, so the ratio stays
    // honest rather than flattering.
    expect(detect('Kemarin The Moon sudah bilang begitu.').signal).toBe('card');
  });

  it('ignores a card that is in BOTH draws', () => {
    // A repeat card is the reason the block was offered at all. Naming it is
    // not evidence of a callback -- it is in front of the reader right now.
    expect(detect('The Moon hadir lagi hari ini.', {
      currentCardIds: [18],
      recalledCardIds: [18],
    })).toEqual({ fired: false, signal: null });
  });
});

describe('the phrase signal, Indonesian', () => {
  for (const phrase of [
    'lagi-lagi',
    'muncul lagi',
    'sekali lagi',
    'kemarin',
    'terakhir kali',
    'sebelumnya',
    'waktu itu',
    'kembali muncul',
    'bacaan lalu',
    'bacaan yang lalu',
  ]) {
    it(`fires on "${phrase}"`, () => {
      expect(detect(`Sesuatu ${phrase} terasa dekat.`), phrase).toEqual({
        fired: true,
        signal: 'phrase',
      });
    });
  }
});

describe('THE TEST THAT MATTERS: a bare `lagi` must never fire', () => {
  /*
   * In Indonesian `lagi` is also the progressive aspect marker. "dia lagi
   * mikir" is "he is thinking", not "he is thinking again". A bare `lagi`
   * pattern fires on ordinary present tense, which in a reading written in
   * casual Indonesian is most sentences -- producing a reported callback rate
   * near 90% that is entirely noise, and making the one number this feature is
   * judged on meaningless.
   *
   * Same class as the `tempoh` miss in the Malay grep: a word list that looks
   * obviously right and is quietly wrong about one entry.
   */
  for (const body of [
    'dia lagi mikir soal itu',
    'aku lagi capek banget',
    'lagi ada yang nahan langkahmu',
    'kamu lagi berdiri di persimpangan',
    'hatimu lagi ramai',
  ]) {
    it(`does not fire on "${body}"`, () => {
      expect(detect(body), body).toEqual({ fired: false, signal: null });
    });
  }

  it('still fires when a real multi-word pattern contains lagi', () => {
    // The point is not to avoid the word, it is to require the phrase.
    expect(detect('dia lagi mikir, dan lagi-lagi kartunya sama').signal).toBe('phrase');
  });
});

describe('the phrase signal, English', () => {
  const en = { locale: 'en' as Locale };

  for (const phrase of ['last time', 'yesterday', 'earlier', 'again', 'previously', 'once more']) {
    it(`fires on "${phrase}"`, () => {
      expect(detect(`Something ${phrase} is close.`, en).signal, phrase).toBe('phrase');
    });
  }

  it('does NOT fire on "against", which contains "again"', () => {
    // The English-side equivalent of the `lagi` trap, at smaller scale.
    expect(detect('It pushes against the door.', en)).toEqual({ fired: false, signal: null });
  });

  it('does not fire on the Indonesian lexicon when the locale is English', () => {
    // A reading is written in one language. Checking both lexicons would let
    // an English word that happens to appear in Indonesian text fire, and vice
    // versa.
    expect(detect('Kemarin sudah lewat.', en).signal).not.toBe('phrase');
  });

  it('does not fire on the English lexicon when the locale is Indonesian', () => {
    expect(detect('Sesuatu yesterday terasa dekat.').signal).not.toBe('phrase');
  });
});

describe('edge cases', () => {
  it('does not fire on an empty body', () => {
    expect(detect('')).toEqual({ fired: false, signal: null });
  });

  it('does not fire when nothing was recalled and no phrase appears', () => {
    expect(detect('Bacaan biasa saja.', { recalledCardIds: [] }).fired).toBe(false);
  });

  it('survives a recalled card id that is not in the deck', () => {
    // A row written before a deck change must degrade, not throw, inside an
    // after() that still has a reading row to finish writing.
    expect(() => detect('apa pun', { recalledCardIds: [99] })).not.toThrow();
    expect(detect('apa pun', { recalledCardIds: [99] }).fired).toBe(false);
  });
});

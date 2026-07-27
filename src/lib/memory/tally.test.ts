/**
 * V3 Task 5. The anti-tally check, and above all its FALSE-POSITIVE corpus.
 *
 * The PASS block is the half that matters. A pattern that fires on correct
 * output reports a confident wrong answer -- exactly as a bare `lagi` reported a
 * ~90% callback rate that was entirely noise -- and a check that fails on
 * correct behaviour is a check people learn to switch off.
 */
import { describe, expect, it } from 'vitest';
import { tallyFailures, tallyProblems } from './tally';

const fails = (text: string, locale: 'id' | 'en', windowPhrase?: string) =>
  tallyFailures(text, { locale, windowPhrase }).map((h) => h.pattern);

describe('FAIL — the shapes that are a tally', () => {
  it.each([
    'The Empress muncul tiga kali minggu ini',
    'dua kali The Moon',
    'The Star datang 3 kali',
    'The Moon (2×)',
    'dua-duanya soal menunggu',
    'berapa kali kartunya datang',
    'jumlahnya jelas condong ke The Empress',
  ])('id: %s', (text) => {
    expect(fails(text, 'id').length).toBeGreaterThan(0);
  });

  it.each([
    'The Empress showed up three times',
    'twice it was The Moon',
    'both times the same card',
    'came up four',
    'the count is clear',
    'all three times it was The Tower',
  ])('en: %s', (text) => {
    expect(fails(text, 'en').length).toBeGreaterThan(0);
  });
});

describe('PASS — correct output the check must not touch', () => {
  it.each([
    'Dua kartu itu berdiri berdampingan',
    'bagus sekali',
    'kartunya kembali berkali-kali',
    'The Hermit menunggu di belakang keduanya',
    'The Empress berdiri di depan The Chariot, dan The Hierophant menunggu di belakang keduanya',
  ])('id: %s', (text) => {
    expect(fails(text, 'id')).toEqual([]);
  });

  it.each([
    'Those two cards stand together',
    'once you decide, the week turns',
    'The Star keeps returning',
    'a run of days shaped the same way',
    'You can count on The Empress to be there before The Chariot moves',
  ])('en: %s', (text) => {
    expect(fails(text, 'en')).toEqual([]);
  });
});

describe('the window phrase is stripped before matching', () => {
  /*
   * The reason the option exists, written as the first two tests. `d13` is a
   * SPELLED-OUT number and `d666` contains DIGITS, the prompt instructs the
   * model to say the phrase, and both windows are reachable -- `d13` is on
   * VERDICT_LADDER. Without the strip a naive `/\d/` fails a correct line.
   */
  it('d13 / id: clean, and clean WITHOUT the strip too — the plan was wrong here', () => {
    /*
     * §7 says this case FAILs without the option. IT DOES NOT, and the reason
     * is worth keeping: `Tiga belas hari terakhir` is a spelled-out number bolted
     * to `hari`, not to `kali`, and every Indonesian FAIL pattern is anchored to
     * `kali` precisely so that a number word in ordinary prose is not a tally.
     * So the strip is load-bearing for `d666` (digits) in BOTH locales and is
     * belt-and-braces for `d13`.
     *
     * Recorded rather than quietly deleted, because the next person to widen the
     * Indonesian list to bare number words will reintroduce the failure this
     * assertion is currently proving does not exist.
     */
    const line = 'Tiga belas hari terakhir The Moon terus kembali';
    expect(fails(line, 'id', 'Tiga belas hari terakhir')).toEqual([]);
    expect(fails(line, 'id')).toEqual([]);
  });

  it('d666 / id: clean with the phrase, digit FAIL without it', () => {
    const line = '666 hari terakhir kartunya berputar di sekitar The Moon';
    expect(fails(line, 'id', '666 hari terakhir')).toEqual([]);
    expect(fails(line, 'id')).toContain('a digit');
  });

  it('d666 / en: the English catalog needs the same strip', () => {
    const line = 'The last 666 days have kept giving you The Moon';
    expect(fails(line, 'en', 'The last 666 days')).toEqual([]);
    expect(fails(line, 'en')).toContain('a digit');
  });

  it('d13 / en: "The last thirteen days" is not a FAIL either way', () => {
    // `thirteen` is not bolted to `times`, so it never reached the FAIL tier --
    // asserted so the asymmetry with the Indonesian catalog is visible.
    const line = 'The last thirteen days have circled The Moon';
    expect(fails(line, 'en', 'The last thirteen days')).toEqual([]);
    expect(fails(line, 'en')).toEqual([]);
  });

  it('strips every occurrence, case-insensitively', () => {
    const line = 'minggu ini, dan lagi MINGGU INI, kartunya sama';
    expect(fails(line, 'id', 'Minggu ini')).toEqual([]);
  });

  it('is a no-op when no phrase is passed, which is the day summary’s case', () => {
    expect(fails('The Moon kembali menutup harinya', 'id')).toEqual([]);
  });
});

describe('the WARN tier', () => {
  it('warns on "sekali" without failing on it', () => {
    const hits = tallyProblems('bagus sekali', { locale: 'id' });
    expect(hits.filter((h) => h.tier === 'warn').length).toBe(1);
    expect(hits.filter((h) => h.tier === 'fail')).toEqual([]);
  });

  it('warns on "once" without failing on it', () => {
    const hits = tallyProblems('once you decide, the week turns', { locale: 'en' });
    expect(hits.some((h) => h.tier === 'warn')).toBe(true);
    expect(hits.some((h) => h.tier === 'fail')).toBe(false);
  });

  it('leaves a caller filtering on fail unaffected by any warn', () => {
    expect(fails('kartunya kembali berkali-kali, dan bagus sekali', 'id')).toEqual([]);
  });

  it('warns on the soft repetitions a smoke run found the list missing', () => {
    // `berulang-ulang` came back from the Indonesian day summary and matched
    // nothing, because only `berkali-kali` had been written down.
    const hits = tallyProblems('The Moon menyinari hari ini berulang-ulang', { locale: 'id' });
    expect(hits.map((h) => h.tier)).toEqual(['warn']);
    expect(tallyProblems('it came back again and again', { locale: 'en' }).map((h) => h.tier)).toEqual(
      ['warn'],
    );
  });
});

describe('the locale halves are separate', () => {
  it('does not run the Indonesian patterns over English', () => {
    // `dua-duanya` in English text is not a thing, and running the id list over
    // `en` would be the theatre W6 rule 4 forbids for the Malay grep.
    expect(fails('the pair holds', 'en')).toEqual([]);
  });

  it('still runs the digit rule in both', () => {
    expect(fails('The Moon 2', 'id')).toContain('a digit');
    expect(fails('The Moon 2', 'en')).toContain('a digit');
  });
});

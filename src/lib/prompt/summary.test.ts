/**
 * The frequency verdict prompt (W5 plan Task 3).
 *
 * The day-summary half of this file is tested in Task 8.
 */
import { describe, expect, it } from 'vitest';
import type { Locale, ReaderId } from '@/data/types';
import type { CardCount, FrequencyResult } from '@/lib/memory/frequency';
import { windowPhrase } from '@/lib/memory/windows';
import { readerPrompt } from './readers';
import {
  angleIndexFor,
  buildDaySummaryPrompt,
  buildFrequencyPrompt,
  FREQUENCY_ANGLES,
  FREQUENCY_MAX_WORDS,
  SUMMARY_MAX_WORDS,
  type DayReading,
} from './summary';

function card(cardId: number, count: number, reversedCount = 0): CardCount {
  return { cardId, count, reversedCount, lastSeen: '2026-07-25' };
}

function result(over: Partial<FrequencyResult> = {}): FrequencyResult {
  return {
    window: 'week',
    from: '2026-07-20',
    to: '2026-07-26',
    readings: 7,
    // 8 is Strength, 12 is The Hanged Man -- the plan's own worked example.
    ranked: [card(8, 5, 2), card(12, 3)],
    fingerprint: '00000000' + 'a'.repeat(56),
    ...over,
  };
}

describe('the frequency prompt', () => {
  it('names both cards verbatim, in English, in the user turn', () => {
    const p = buildFrequencyPrompt({ result: result(), locale: 'id' });
    expect(p.user).toContain('Strength');
    expect(p.user).toContain('The Hanged Man');
  });

  it('carries the counts and the reversal counts', () => {
    const p = buildFrequencyPrompt({ result: result(), locale: 'id' });
    expect(p.user).toContain('muncul 5 kali (2 terbalik)');
    expect(p.user).toContain('muncul 3 kali (0 terbalik)');
  });

  it('carries the reading total, which is the denominator of the claim', () => {
    expect(buildFrequencyPrompt({ result: result(), locale: 'id' }).user).toContain(
      'Bacaan dalam rentang ini: 7',
    );
  });

  it('puts the window phrase from the catalog in both turns', () => {
    // The system prompt tells the model to name the stretch in words rather
    // than dates, and hands it the exact phrase to use.
    const p = buildFrequencyPrompt({ result: result(), locale: 'id' });
    expect(p.system).toContain(windowPhrase('week', 'id'));
    expect(p.system).toContain('Minggu ini');
    expect(p.user).toContain('Minggu ini');
  });

  it('uses the English catalog phrase for the English prompt', () => {
    const p = buildFrequencyPrompt({ result: result(), locale: 'en' });
    expect(p.system).toContain('This week');
    expect(p.system).not.toContain('Minggu ini');
  });

  it('states the word ceiling the model has to count against', () => {
    const p = buildFrequencyPrompt({ result: result(), locale: 'id' });
    expect(p.system).toContain(`maksimal ${FREQUENCY_MAX_WORDS} kata`);
    expect(buildFrequencyPrompt({ result: result(), locale: 'en' }).system).toContain(
      `${FREQUENCY_MAX_WORDS} words at most`,
    );
  });

  it('EMITS NO DELIMITER AT ALL (§7)', () => {
    /*
     * The one memory prompt with zero injection surface -- card ids, counts and
     * dates, and no querent text of any kind. A `<riwayat>`-style tag here
     * would be the only unexplained delimiter in the codebase and would imply a
     * threat that is not present. This test is what stops someone adding one
     * out of habit.
     */
    for (const locale of ['id', 'en'] as const) {
      const p = buildFrequencyPrompt({ result: result(), locale });
      expect(p.system, locale).not.toContain('<');
      expect(p.user, locale).not.toContain('<');
    }
  });

  it('forbids interpreting, advising, greeting and asking back', () => {
    // This is not a reading, and a model handed two card names will write one
    // unless told four times not to.
    const p = buildFrequencyPrompt({ result: result(), locale: 'id' });
    expect(p.system).toContain('Ini bukan bacaan');
    expect(p.system).toContain('jangan menasihati');
    expect(p.system).toContain('jangan bertanya balik');
  });

  it('inherits the format rules but NOT the reading contract', () => {
    const p = buildFrequencyPrompt({ result: result(), locale: 'id' });
    // Format rules present...
    expect(p.system).toContain('DILARANG memakai markdown');
    expect(p.system).toContain('bukan bahasa Melayu');
    // ...and the "you are a tarot reader writing one reading" framing absent.
    expect(p.system).not.toContain('Kamu adalah pembaca tarot');
  });

  it('is house voice: it names no reader', () => {
    // M6. It sits on the reader picker, before a reader has been chosen.
    const p = buildFrequencyPrompt({ result: result(), locale: 'id' });
    for (const name of ['Thessaly', 'Margaret', 'Adrian']) {
      expect(p.system, name).not.toContain(name);
    }
  });

  it('caps output well above the word ceiling, as a runaway guard', () => {
    expect(buildFrequencyPrompt({ result: result(), locale: 'id' }).maxTokens).toBe(120);
  });
});

describe('the angle rotation', () => {
  it('is stable for a given fingerprint', () => {
    // Same facts -> same angle -> same line, which is what keeps the cache
    // honest: a cached row and a fresh generation agree.
    const fp = 'deadbeef' + '0'.repeat(56);
    expect(angleIndexFor(fp, 'id')).toBe(angleIndexFor(fp, 'id'));
  });

  it('always lands inside the array', () => {
    for (const fp of ['00000000', 'ffffffff', '7fffffff', '80000000', '12345678']) {
      const i = angleIndexFor(fp + '0'.repeat(56), 'id');
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(FREQUENCY_ANGLES.id.length);
    }
  });

  it('differs across at least two of five sample fingerprints', () => {
    // The plan's own acceptance bar. If the rotation did not bite -- a constant
    // index, or a modulus against a one-element array -- this is what catches
    // it, and the feature would otherwise read identically the fourth time.
    const samples = ['00000000', '00000001', '00000002', '00000003', '00000004'];
    const angles = new Set(samples.map((s) => angleIndexFor(s + '0'.repeat(56), 'id')));
    expect(angles.size).toBeGreaterThanOrEqual(2);
  });

  it('actually reaches every angle across enough fingerprints', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50; i += 1) {
      seen.add(angleIndexFor(i.toString(16).padStart(8, '0') + '0'.repeat(56), 'id'));
    }
    expect(seen.size).toBe(FREQUENCY_ANGLES.id.length);
  });

  it('puts the chosen angle into the system prompt', () => {
    const r = result({ fingerprint: '00000003' + '0'.repeat(56) });
    const p = buildFrequencyPrompt({ result: r, locale: 'id' });
    expect(p.system).toContain(FREQUENCY_ANGLES.id[angleIndexFor(r.fingerprint, 'id')]);
  });

  it('offers one angle with no metaphor at all', () => {
    // Four images and no plain option makes the feature read as relentlessly
    // poetic, which is its own kind of tiring.
    expect(FREQUENCY_ANGLES.id).toContain('Sebut saja jumlahnya apa adanya, tanpa perumpamaan.');
    expect(FREQUENCY_ANGLES.en).toContain('Just name the counts plainly, with no image at all.');
  });

  it('has the same number of angles in both locales', () => {
    // The index is computed from the fingerprint and the locale's array length;
    // different lengths would mean the two locales rotate out of step, which is
    // not wrong but is a surprise nobody needs.
    expect(FREQUENCY_ANGLES.en).toHaveLength(FREQUENCY_ANGLES.id.length);
  });
});

describe('the per-day reader summary prompt', () => {
  const day: DayReading[] = [
    {
      id: 'a',
      readerId: 'thessaly',
      serviceId: 'daily',
      cards: [{ cardId: 18, reversed: true }], // The Moon
      gist: 'kabar yang setengah belum layak dipercaya',
      verdict: null,
    },
    {
      id: 'b',
      readerId: 'margaret',
      serviceId: 'spread3',
      cards: [
        { cardId: 16, reversed: false }, // The Tower
        { cardId: 12, reversed: false }, // The Hanged Man
        { cardId: 17, reversed: false }, // The Star
      ],
      gist: 'tambalan lama sudah tidak menahan apa-apa',
      verdict: null,
    },
    {
      id: 'c',
      readerId: 'adrian',
      serviceId: 'yesno',
      cards: [{ cardId: 18, reversed: false }], // The Moon again
      gist: 'yang ditunda ternyata sudah diputuskan diam-diam',
      verdict: 'Ya',
    },
  ];

  const build = (readerId: ReaderId, locale: Locale = 'id', readings = day) =>
    buildDaySummaryPrompt({ readerId, locale, localDate: '2026-07-26', readings });

  it('produces SIX DISTINCT system prompts across three readers and two locales', () => {
    /*
     * Three readers summarising identically would prove the readers are
     * interchangeable, which is the opposite of the point -- M12 summarises the
     * whole day regardless of who gave each reading precisely so that switching
     * readers gives three different tellings of one day.
     */
    const all = (['thessaly', 'margaret', 'adrian'] as ReaderId[]).flatMap((r) =>
      (['id', 'en'] as Locale[]).map((l) => build(r, l).system),
    );
    expect(new Set(all).size).toBe(6);
  });

  it('reuses the reader’s own persona block verbatim', () => {
    // The IDENTICAL voice, not a second description of it. Two descriptions of
    // one persona drift the moment either is edited, and the reading would
    // sound like Margaret while the greeting above it sounds like an
    // impression of her.
    expect(build('margaret').system).toContain(readerPrompt('margaret', 'id'));
  });

  it('carries one worked example per reader', () => {
    // The example does more work than the description -- the readers.ts lesson.
    expect(build('thessaly').system).toContain('CONTOH:');
    expect(build('adrian', 'en').system).toContain('EXAMPLE:');
  });

  it('gives the three readers visibly different direction', () => {
    expect(build('thessaly').system).toContain('seperti orang yang mencatat');
    expect(build('margaret').system).toContain('satu gambar yang cukup luas');
    expect(build('adrian').system).toContain('kayak nanya kabar temen');
  });

  it('states the length ceiling and that this is not a reading', () => {
    expect(build('thessaly').system).toContain(`maksimal ${SUMMARY_MAX_WORDS} kata`);
    expect(build('thessaly').system).toContain('Ini sapaan, bukan bacaan');
    expect(build('thessaly', 'en').system).toContain(`${SUMMARY_MAX_WORDS} words at most`);
  });

  it('tells the reader not to claim another reader’s reading', () => {
    // M12's cross-reader summary only works with this clause; without it,
    // Adrian claims Margaret's spread.
    expect(build('adrian').system).toContain('tanpa mengaku kamu yang membacanya');
    expect(build('adrian', 'en').system).toContain('without claiming you gave it');
  });

  it('inherits the format rules but NOT the reading contract', () => {
    const { system } = build('thessaly');
    expect(system).toContain('DILARANG memakai markdown');
    expect(system).not.toContain('Kamu adalah pembaca tarot');
  });

  it('does NOT carry the Lotus block (reconciliation R16)', () => {
    // W3 recommended reading prompts only and W5 had the call; W3 was right.
    // The prompt already carries the persona and the day's real readings, and
    // one more attractor in a 45-word output is how three readers converge.
    expect(build('thessaly').system).not.toContain('<penanya>');
  });
});

describe('the <riwayat-hari-ini> block', () => {
  const day: DayReading[] = [
    {
      id: 'a',
      readerId: 'thessaly',
      serviceId: 'daily',
      cards: [{ cardId: 18, reversed: true }],
      gist: 'kabar yang setengah belum layak dipercaya',
      verdict: null,
    },
    {
      id: 'c',
      readerId: 'adrian',
      serviceId: 'yesno',
      cards: [{ cardId: 18, reversed: false }],
      gist: 'yang ditunda ternyata sudah diputuskan diam-diam',
      verdict: 'Ya',
    },
  ];

  const build = (locale: Locale = 'id', readings = day) =>
    buildDaySummaryPrompt({ readerId: 'thessaly', locale, localDate: '2026-07-26', readings });

  it('is in the USER turn only', () => {
    const p = build();
    expect(p.user).toContain('<riwayat-hari-ini>');
    // The system prompt names the tag -- it has to, to say what it is -- but
    // carries none of its CONTENT.
    expect(p.system).not.toContain('kabar yang setengah belum layak dipercaya');
    expect(p.user).toContain('kabar yang setengah belum layak dipercaya');
  });

  it('names the service, the reader, the cards, the verdict and the gist', () => {
    const { user } = build();
    expect(user).toContain('Kartu Harian (Thessaly): The Moon (terbalik)');
    expect(user).toContain('(Adrian)');
    expect(user).toContain('jawaban: Ya');
    expect(user).toContain('inti: yang ditunda');
  });

  it('COMPUTES THE REPEATED-CARD LINE IN CODE', () => {
    /*
     * The prompt calls this "the thing most worth naming", so it is the one
     * signal the output turns on. Making the model re-derive it by comparing
     * three card lists is work it can get wrong.
     */
    expect(build().user).toContain('BERULANG HARI INI: The Moon (2 kali)');
    expect(build('en').user).toContain('REPEATED TODAY: The Moon (2×)');
  });

  it('omits the repeated line when nothing repeats', () => {
    const noRepeat = [day[0]];
    expect(build('id', noRepeat).user).not.toContain('BERULANG');
    expect(build('en', noRepeat).user).not.toContain('REPEATED');
  });

  it('counts a card repeated within one spread', () => {
    // Not possible with the current deck rules, but the counter must not
    // silently disagree with itself if that ever changes.
    const twice: DayReading[] = [
      { ...day[0], cards: [{ cardId: 5, reversed: false }, { cardId: 5, reversed: true }] },
    ];
    expect(build('id', twice).user).toContain('The Hierophant (2 kali)');
  });

  it('renders the day from local_date, with the year', () => {
    expect(build().user).toContain('26 Juli 2026');
    expect(build('en').user).toContain('26 July 2026');
  });

  it('states the reading count', () => {
    expect(build().user).toContain('Bacaan hari ini: 2');
    expect(build('en').user).toContain('Readings today: 2');
  });

  it('handles a reading whose gist extraction failed', () => {
    const noGist: DayReading[] = [{ ...day[0], gist: null }];
    const { user } = build('id', noGist);
    expect(user).toContain('The Moon');
    expect(user).not.toContain('inti:');
  });

  it('caps output well above the word ceiling, as a runaway guard', () => {
    expect(build().maxTokens).toBe(220);
  });
});

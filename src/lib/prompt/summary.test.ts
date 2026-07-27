/**
 * The frequency verdict prompt and the per-day reader summary.
 *
 * REWRITTEN AT V3 AROUND ONE INVARIANT: neither user turn contains a digit, and
 * the frequency one contains no number in any form. That is VD2's mechanical
 * enforcement, and everything else in this file is a second line of defence
 * behind it.
 */
import { describe, expect, it } from 'vitest';
import type { Locale, ReaderId } from '@/data/types';
import type { CardCount, FrequencyResult } from '@/lib/memory/frequency';
import { tallyFailures } from '@/lib/memory/tally';
import { windowPhrase } from '@/lib/memory/windows';
import { readerPrompt } from './readers';
import { MARGARET_MULTIPLIER } from './budget';
import {
  angleIndexFor,
  buildDaySummaryPrompt,
  buildFrequencyPrompt,
  dayShapeOf,
  echoToday,
  frequencyFacts,
  FREQUENCY_ANGLES,
  FREQUENCY_MAX_WORDS,
  SUMMARY_MAX_WORDS,
  summaryMaxWords,
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
    // Their shadow is arcanaFor(20) = Judgement, and none of the three is
    // The Moon, which FORMAT_RULES names as an example of a card name.
    ranked: [card(8, 5, 2), card(12, 3)],
    fingerprint: '00000000' + 'a'.repeat(56),
    ...over,
  };
}

/** The builder returns null only for an ungated result; every fixture is gated. */
const build = (over: Partial<FrequencyResult> = {}, locale: Locale = 'id') =>
  buildFrequencyPrompt({ result: result(over), locale })!;

describe('the frequency prompt', () => {
  it('THE USER TURN CONTAINS NO DIGIT AT ALL', () => {
    /*
     * The single most important assertion in this file, and the reason the
     * counts, the reversal counts, the `Bacaan dalam rentang ini: N`
     * denominator, the `1.`/`2.` numbering and the raw date bounds were all
     * deleted from §8.3's user turn.
     *
     * It is what makes the smoke script's check exact rather than approximate:
     * a digit in the OUTPUT was invented by the model, never copied from the
     * input. An instruction not to recite a count is a preference; not having
     * the count is a fact.
     */
    for (const locale of ['id', 'en'] as const) {
      expect(build({}, locale).user, locale).not.toMatch(/\d/);
    }
  });

  it('is digit-free for d666 too, once the window phrase is stripped', () => {
    // `666 hari terakhir` / `The last 666 days` is the one place a digit
    // legitimately reaches the prompt: the model is INSTRUCTED to say the
    // phrase. `tally.ts` strips it for the same reason.
    for (const locale of ['id', 'en'] as const) {
      const p = build({ window: 'd666' }, locale);
      const phrase = windowPhrase('d666', locale);
      expect(p.user, locale).toContain(phrase);
      expect(p.user.split(phrase).join(''), locale).not.toMatch(/\d/);
    }
  });

  it('names all three cards in the user turn', () => {
    const p = build();
    expect(p.user).toContain('Strength');
    expect(p.user).toContain('The Hanged Man');
    expect(p.user).toContain('Judgement'); // arcanaFor(8 + 12) = CARDS[20]
  });

  it('THE SYSTEM PROMPT NAMES NONE OF THEM — they are content, not rules (M10)', () => {
    for (const locale of ['id', 'en'] as const) {
      const p = build({}, locale);
      for (const name of ['Strength', 'The Hanged Man', 'Judgement']) {
        expect(p.system, `${locale}/${name}`).not.toContain(name);
      }
    }
  });

  it('carries the pulse as a written line and the distance as one word', () => {
    const p = build();
    // reduce(5 + 3) = 8, and 5:3 is a ratio of 1.67 -> `clear` -> `jelas`.
    expect(p.user).toContain('Denyut: ');
    expect(p.user).toContain('Jarak: jelas');
    expect(build({}, 'en').user).toContain('Distance: clear');
  });

  it('NEVER CARRIES THE COUNTS, THE REVERSALS OR THE DENOMINATOR', () => {
    const p = build();
    expect(p.user).not.toContain('muncul');
    expect(p.user).not.toContain('terbalik');
    expect(p.user).not.toContain('Bacaan dalam rentang ini');
    expect(build({}, 'en').user).not.toContain('Readings in it');
  });

  it('drops the raw date bounds from the user turn', () => {
    // The prompt says "in words, not dates". Leaving the dates in is asking a
    // model not to use what you gave it -- the counts argument, one notch
    // weaker, and it is also half of the no-digit invariant above.
    const p = build();
    expect(p.user).not.toContain('2026-07-20');
    expect(p.user).toContain('Minggu ini');
  });

  it('forbids the tally in both locales, in as many words', () => {
    expect(build().system).toContain('DILARANG MENYEBUT JUMLAH');
    expect(build({}, 'en').system).toContain('DO NOT SAY HOW OFTEN ANYTHING HAPPENED');
  });

  it('RESTATES THE PROHIBITION AFTER THE ANGLE', () => {
    /*
     * §4.4's third technique, pinned: restate the ceiling -- and here the
     * prohibition -- AFTER the thing that invites elaboration. The tally is what
     * this prompt falls back to when it is squeezed, so the last thing the model
     * reads before the format rules is "no counts, no numbers".
     */
    for (const [locale, needle] of [
      ['id', 'tanpa angka'],
      ['en', 'no counts, no numbers'],
    ] as const) {
      const r = result();
      const p = build({}, locale);
      const angle = FREQUENCY_ANGLES[locale][angleIndexFor(r.fingerprint, locale)];
      expect(p.system.lastIndexOf(needle), locale).toBeGreaterThan(p.system.indexOf(angle));
    }
  });

  it('puts the window phrase from the catalog in both turns', () => {
    const p = build();
    expect(p.system).toContain(windowPhrase('week', 'id'));
    expect(p.system).toContain('Minggu ini');
    expect(p.user).toContain('Minggu ini');
  });

  it('uses the English catalog phrase for the English prompt', () => {
    const p = build({}, 'en');
    expect(p.system).toContain('This week');
    expect(p.system).not.toContain('Minggu ini');
  });

  it('states the word ceiling the model has to count against, as 32', () => {
    expect(FREQUENCY_MAX_WORDS).toBe(32);
    expect(build().system).toContain(`maksimal ${FREQUENCY_MAX_WORDS} kata`);
    expect(build({}, 'en').system).toContain(`${FREQUENCY_MAX_WORDS} words at most`);
  });

  it('loosens the sentence count to 1-2 without deleting it', () => {
    expect(build().system).toContain('Tulis 1 sampai 2 kalimat');
    expect(build({}, 'en').system).toContain('Write 1 to 2 sentences');
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
      const p = build({}, locale);
      expect(p.system, locale).not.toContain('<');
      expect(p.user, locale).not.toContain('<');
    }
  });

  it('forbids interpreting, advising, greeting and asking back', () => {
    const p = build();
    expect(p.system).toContain('Ini bukan bacaan');
    expect(p.system).toContain('jangan menasihati');
    expect(p.system).toContain('jangan bertanya balik');
  });

  it('inherits the format rules but NOT the reading contract', () => {
    const p = build();
    expect(p.system).toContain('DILARANG memakai markdown');
    expect(p.system).toContain('bukan bahasa Melayu');
    expect(p.system).not.toContain('Kamu adalah pembaca tarot');
  });

  it('is house voice: it names no reader', () => {
    // M6. It sits on the reader picker, before a reader has been chosen.
    const p = build();
    for (const name of ['Thessaly', 'Margaret', 'Adrian']) {
      expect(p.system, name).not.toContain(name);
    }
  });

  it('caps output well above the word ceiling, as a runaway guard', () => {
    expect(build().maxTokens).toBe(120);
  });

  it('declines rather than throwing on a result the gate would have rejected', () => {
    expect(buildFrequencyPrompt({ result: result({ ranked: [card(8, 5)] }), locale: 'id' })).toBeNull();
    expect(buildFrequencyPrompt({ result: result({ ranked: [] }), locale: 'id' })).toBeNull();
  });
});

describe('the Fool collision', () => {
  /*
   * `arcanaFor(a + b)` lands on one of the pair exactly when The Fool is in it,
   * because `x + 0 ≡ x (mod 22)`. One pair in twenty-two, so the branch is real
   * and rare -- and without it that pair would get a prompt demanding three card
   * names when only two exist. `shadow.test.ts` proves the "exactly when".
   */
  const collided = (locale: Locale = 'id') =>
    buildFrequencyPrompt({
      result: result({ ranked: [card(0, 5), card(3, 3)] }),
      locale,
    })!;

  it('puts the collision paragraph in the system prompt', () => {
    expect(collided().system).toContain('kartu yang berdiri di belakang ternyata kartu kedua itu sendiri');
    expect(collided('en').system).toContain('turns out to be the second one itself');
  });

  it('asks for TWO card names rather than three', () => {
    expect(collided().system).toContain('sebut dua nama kartu saja');
    expect(collided('en').system).toContain('name only two cards');
  });

  it('omits the third-card line from the user turn', () => {
    expect(collided().user).not.toContain('Kartu yang berdiri di belakang keduanya');
    expect(collided('en').user).not.toContain('The card standing behind them');
    // ...and still names the two that were drawn.
    expect(collided().user).toContain('The Fool');
    expect(collided().user).toContain('The Empress');
  });

  it('names the FIRST card when the runner-up is The Fool', () => {
    const p = buildFrequencyPrompt({
      result: result({ ranked: [card(3, 5), card(0, 3)] }),
      locale: 'id',
    })!;
    expect(p.system).toContain('kartu pertama itu sendiri');
  });

  it('says nothing about a collision on an ordinary pair', () => {
    expect(build().system).not.toContain('itu sendiri');
    expect(build({}, 'en').system).not.toContain('itself');
  });

  it('KEEPS THE SYSTEM PROMPT FREE OF CARD NAMES even on the collision branch', () => {
    /*
     * §8.1 writes this paragraph with the card's own name and with `The Fool`
     * spelled out. Both would be the only card names in a prompt that is
     * otherwise pure rules, against M10 and against the test above. Positions
     * carry the instruction exactly as well -- the model already has both names
     * in the user turn.
     */
    for (const locale of ['id', 'en'] as const) {
      expect(collided(locale).system, locale).not.toContain('The Fool');
      expect(collided(locale).system, locale).not.toContain('The Empress');
    }
  });
});

describe('the angle rotation', () => {
  it('is stable for a given fingerprint', () => {
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
    const p = build({ fingerprint: r.fingerprint });
    expect(p.system).toContain(FREQUENCY_ANGLES.id[angleIndexFor(r.fingerprint, 'id')]);
  });

  it('still offers one angle with no image at all, and it NO LONGER ORDERS THE TALLY', () => {
    /*
     * The old plain option was `Sebut saja jumlahnya apa adanya` /
     * `Just name the counts plainly` -- one page load in five got a prompt that
     * INSTRUCTED the recitation this release exists to delete. The option stays,
     * because four metaphors and no plain one reads as relentlessly poetic; the
     * string does not.
     */
    expect(FREQUENCY_ANGLES.id).toContain(
      'Tanpa perumpamaan. Sebut ketiga kartunya dan namai polanya apa adanya.',
    );
    expect(FREQUENCY_ANGLES.en).toContain(
      'No image at all. Name the three cards and say plainly what the pattern is.',
    );
    for (const locale of ['id', 'en'] as const) {
      for (const a of FREQUENCY_ANGLES[locale]) {
        expect(a.toLowerCase(), a).not.toContain('jumlah');
        expect(a.toLowerCase(), a).not.toContain('count');
      }
    }
  });

  it('NO ANGLE IS ITSELF A TALLY', () => {
    // The prompt must not contain the thing the prompt forbids.
    for (const locale of ['id', 'en'] as const) {
      for (const a of FREQUENCY_ANGLES[locale]) {
        expect(a, a).not.toMatch(/\d/);
        expect(tallyFailures(a, { locale }), a).toEqual([]);
      }
    }
  });

  it('uses DISJOINT IMAGES across the two locales (W6 rule 3)', () => {
    // A reviewer must be able to tell a translation in five seconds. If the
    // English angle 1 is about a room, it was translated.
    expect(FREQUENCY_ANGLES.id[1]).toContain('ruangan');
    expect(FREQUENCY_ANGLES.en[1].toLowerCase()).not.toContain('room');
    expect(FREQUENCY_ANGLES.en[1]).toContain('price');
    expect(FREQUENCY_ANGLES.id[1].toLowerCase()).not.toContain('harga');
  });

  it('has the same number of angles in both locales', () => {
    expect(FREQUENCY_ANGLES.en).toHaveLength(FREQUENCY_ANGLES.id.length);
    expect(FREQUENCY_ANGLES.id).toHaveLength(5);
  });
});

describe('frequencyFacts', () => {
  it('reports the angle, the phrase and the whole mechanic', () => {
    const f = frequencyFacts(result(), 'id');
    expect(f.phrase).toBe('Minggu ini');
    expect(f.topName).toBe('Strength');
    expect(f.secondName).toBe('The Hanged Man');
    expect(f.mechanic).toMatchObject({
      shadowName: 'Judgement',
      shadowCollision: null,
      dominance: 'clear',
      pulseNumber: 8,
    });
  });

  it('is null-safe on a result the gate would have rejected', () => {
    expect(frequencyFacts(result({ ranked: [] }), 'id').mechanic).toBeNull();
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

  const summary = (readerId: ReaderId, locale: Locale = 'id', readings = day) =>
    buildDaySummaryPrompt({ readerId, locale, localDate: '2026-07-26', readings });

  it('produces SIX DISTINCT system prompts across three readers and two locales', () => {
    const all = (['thessaly', 'margaret', 'adrian'] as ReaderId[]).flatMap((r) =>
      (['id', 'en'] as Locale[]).map((l) => summary(r, l).system),
    );
    expect(new Set(all).size).toBe(6);
  });

  it('reuses the reader’s own persona block verbatim', () => {
    expect(summary('margaret').system).toContain(readerPrompt('margaret', 'id'));
  });

  it('carries one worked example per reader', () => {
    expect(summary('thessaly').system).toContain('CONTOH:');
    expect(summary('adrian', 'en').system).toContain('EXAMPLE:');
  });

  it('gives the three readers visibly different direction', () => {
    expect(summary('thessaly').system).toContain('seperti orang yang mencatat');
    expect(summary('margaret').system).toContain('satu gambar yang cukup luas');
    expect(summary('adrian').system).toContain('kayak nanya kabar temen');
  });

  it('NO WORKED EXAMPLE RECITES A TALLY, IN EITHER LOCALE', () => {
    /*
     * The guard that stops the tally walking back in through the examples,
     * which is how it got here: four of the six used to open with one, and this
     * file's own header says the example outweighs the description.
     */
    for (const locale of ['id', 'en'] as const) {
      for (const reader of ['thessaly', 'margaret', 'adrian'] as const) {
        const system = summary(reader, locale).system;
        const example = system.slice(system.indexOf(locale === 'id' ? 'CONTOH:' : 'EXAMPLE:'));
        const block = example.slice(0, example.indexOf('\n\n') === -1 ? undefined : example.indexOf('\n\n'));
        expect(tallyFailures(block, { locale }), `${locale}/${reader}: ${block}`).toEqual([]);
        expect(block, `${locale}/${reader}`).not.toMatch(/\d/);
      }
    }
  });

  it('the English examples name DIFFERENT CARDS from their Indonesian counterparts', () => {
    // W6 rule 3, made mechanical. If the English Thessaly example is about
    // The Hanged Man, it was translated.
    expect(summary('thessaly', 'id').system).toContain('The Hanged Man');
    expect(summary('thessaly', 'en').system).not.toContain('The Hanged Man');
    expect(summary('thessaly', 'en').system).toContain('The Tower');
    expect(summary('adrian', 'id').system).toContain('The Moon nongol lagi');
    expect(summary('adrian', 'en').system).toContain('The Devil showed up again');
  });

  it('states the length ceiling as 50, and that this is not a reading', () => {
    expect(SUMMARY_MAX_WORDS).toBe(50);
    expect(summary('thessaly').system).toContain('maksimal 50 kata');
    expect(summary('thessaly').system).toContain('Ini sapaan, bukan bacaan');
    expect(summary('thessaly', 'en').system).toContain('50 words at most');
  });

  it('GIVES MARGARET 65, WHICH IS VD19’s MULTIPLIER AND NOT A SECOND HAND-SET NUMBER', () => {
    expect(summaryMaxWords('margaret')).toBe(Math.round(SUMMARY_MAX_WORDS * MARGARET_MULTIPLIER));
    expect(summaryMaxWords('margaret')).toBe(65);
    expect(summaryMaxWords('thessaly')).toBe(50);
    expect(summaryMaxWords('adrian')).toBe(50);
    expect(summary('margaret').system).toContain('maksimal 65 kata');
    expect(summary('margaret', 'en').system).toContain('65 words at most');
  });

  it('forbids the count in the task text, and restates it LAST', () => {
    const id = summary('thessaly').system;
    expect(id).toContain('DILARANG MENYEBUT JUMLAH');
    expect(id.lastIndexOf('tanpa angka, tanpa jumlah')).toBeGreaterThan(
      id.indexOf('DILARANG MENYEBUT JUMLAH'),
    );
    const en = summary('thessaly', 'en').system;
    expect(en).toContain('DO NOT SAY HOW MANY');
    expect(en.lastIndexOf('no counts, no numbers')).toBeGreaterThan(en.indexOf('DO NOT SAY HOW MANY'));
  });

  it('tells the reader not to claim another reader’s reading', () => {
    expect(summary('adrian').system).toContain('tanpa mengaku kamu yang membacanya');
    expect(summary('adrian', 'en').system).toContain('without claiming you gave it');
  });

  it('inherits the format rules but NOT the reading contract', () => {
    const { system } = summary('thessaly');
    expect(system).toContain('DILARANG memakai markdown');
    expect(system).not.toContain('Kamu adalah pembaca tarot');
  });

  it('does NOT carry the Lotus block (reconciliation R16)', () => {
    expect(summary('thessaly').system).not.toContain('<penanya>');
  });
});

describe('the day’s derived values', () => {
  it('ranks echoes by occurrences then id, and RENDERS NO COUNT', () => {
    const readings: DayReading[] = [
      { id: 'a', readerId: 'thessaly', serviceId: 'daily', cards: [{ cardId: 18, reversed: false }], gist: null, verdict: null },
      { id: 'b', readerId: 'thessaly', serviceId: 'daily', cards: [{ cardId: 18, reversed: false }], gist: null, verdict: null },
      { id: 'c', readerId: 'thessaly', serviceId: 'daily', cards: [{ cardId: 18, reversed: false }], gist: null, verdict: null },
      { id: 'd', readerId: 'thessaly', serviceId: 'daily', cards: [{ cardId: 16, reversed: false }], gist: null, verdict: null },
      { id: 'e', readerId: 'thessaly', serviceId: 'daily', cards: [{ cardId: 16, reversed: false }], gist: null, verdict: null },
    ];
    // The Moon (3) outranks The Tower (2); the ordering survives, the count does not.
    expect(echoToday(readings)).toEqual([18, 16]);
  });

  it('counts a card repeated within one spread', () => {
    const twice: DayReading[] = [
      {
        id: 'a',
        readerId: 'thessaly',
        serviceId: 'daily',
        cards: [{ cardId: 5, reversed: false }, { cardId: 5, reversed: true }],
        gist: null,
        verdict: null,
      },
    ];
    expect(echoToday(twice)).toEqual([5]);
  });

  it('buckets the shape of the day', () => {
    expect(dayShapeOf(1)).toBe('single');
    expect(dayShapeOf(2)).toBe('few');
    expect(dayShapeOf(3)).toBe('few');
    expect(dayShapeOf(4)).toBe('crowded');
    expect(dayShapeOf(12)).toBe('crowded');
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

  it('COMPUTES THE ECHO LINE IN CODE, WITH NO COUNT ON IT', () => {
    expect(build().user).toContain('BERGEMA HARI INI: The Moon');
    expect(build('en').user).toContain('ECHO TODAY: The Moon');
    // The absence is asserted explicitly, not implied by the new presence: the
    // old line was `BERULANG HARI INI: The Moon (2 kali)` / `The Moon (2×)`.
    expect(build().user).not.toContain('(2 kali)');
    expect(build('en').user).not.toContain('(2×)');
    expect(build().user).not.toContain('BERULANG');
    expect(build('en').user).not.toContain('REPEATED');
  });

  it('omits the echo line when nothing repeats', () => {
    const noRepeat = [day[0]];
    expect(build('id', noRepeat).user).not.toContain('BERGEMA');
    expect(build('en', noRepeat).user).not.toContain('ECHO');
  });

  it('carries the day’s shadow when it does not collide', () => {
    // 18 + 18 = 36; 36 % 22 = 14, Temperance, which nobody drew.
    expect(build().user).toContain('BAYANGAN HARI INI: Temperance');
    expect(build('en').user).toContain('SHADOW TODAY: Temperance');
  });

  it('OMITS the shadow line when it collides with a card actually drawn', () => {
    // A one-card day always collides, because `arcanaFor(id)` is that card.
    const single: DayReading[] = [{ ...day[0], cards: [{ cardId: 7, reversed: false }] }];
    expect(build('id', single).user).not.toContain('BAYANGAN');
    expect(build('en', single).user).not.toContain('SHADOW TODAY');

    // And a multi-card collision: 4 + 9 + 13 = 26, 26 % 22 = 4, and The Emperor
    // is on the table. Any spread whose other ids sum to a multiple of 22 does
    // this, which is why the rule is checked rather than assumed to be rare.
    const drawn: DayReading[] = [
      {
        ...day[0],
        cards: [
          { cardId: 4, reversed: false },
          { cardId: 9, reversed: false },
          { cardId: 13, reversed: false },
        ],
      },
    ];
    expect(build('id', drawn).user).not.toContain('BAYANGAN');
  });

  it('replaces the reading count with the SHAPE of the day', () => {
    expect(build().user).not.toContain('Bacaan hari ini');
    expect(build('en').user).not.toContain('Readings today');
    expect(build().user).toContain('Bentuk hari: beruntun');
    expect(build('en').user).toContain('Shape of the day: a run');
  });

  it('uses "- " rather than 1. 2. 3., which is a digit on a line of its own', () => {
    expect(build().user).toContain('- Kartu Harian');
    expect(build().user).not.toMatch(/^1\. /m);
    expect(build().user).not.toMatch(/^2\. /m);
  });

  it('renders the day from local_date, with the year', () => {
    expect(build().user).toContain('26 Juli 2026');
    expect(build('en').user).toContain('26 July 2026');
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

/**
 * The frequency verdict prompt (W5 plan Task 3).
 *
 * The day-summary half of this file is tested in Task 8.
 */
import { describe, expect, it } from 'vitest';
import type { CardCount, FrequencyResult } from '@/lib/memory/frequency';
import { windowPhrase } from '@/lib/memory/windows';
import {
  angleIndexFor,
  buildFrequencyPrompt,
  FREQUENCY_ANGLES,
  FREQUENCY_MAX_WORDS,
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

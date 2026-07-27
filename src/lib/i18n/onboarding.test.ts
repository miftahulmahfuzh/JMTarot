import { describe, expect, it } from 'vitest';

import { ONBOARDING_QUESTION_KEYS } from '@/data/onboarding';
import { catalogFor } from './catalog';
import { LOCALES, type Locale } from './locale';
import type { MessageKey } from './locales/id';

/**
 * The onboarding copy's own guarantees, ported from `src/app/onboarding/copy.test.ts`
 * when W6 folded that staging post into the catalog.
 *
 * THESE GUARD AN INTERFACE AND A SET OF PROMISES, NOT PROSE QUALITY. Every one of
 * them now runs against BOTH locales, which is the point of the move: the reason
 * `worst_thing` must not enumerate examples has nothing to do with which language
 * the enumeration is in, and the English list was the one at risk of being written
 * by somebody who had not read reconciliation §7.4.
 */

const step = (locale: Locale, key: 'worst_thing' | 'best_thing' | 'most_loved') => {
  const c = catalogFor(locale);
  return [
    c[`onboarding.q.${key}.title`],
    c[`onboarding.q.${key}.framing`],
    c[`onboarding.q.${key}.hint`],
  ].join(' ');
};

describe('the onboarding copy', () => {
  it('has a title, a framing line and a hint for every one of the six, in both locales', () => {
    for (const locale of LOCALES) {
      const c = catalogFor(locale);
      for (const key of ONBOARDING_QUESTION_KEYS) {
        for (const part of ['title', 'framing', 'hint'] as const) {
          const full = `onboarding.q.${key}.${part}` as MessageKey;
          expect(c, full).toHaveProperty(full);
          expect(c[full].length, `${locale} ${full}`).toBeGreaterThan(0);
        }
      }
    }
  });

  /**
   * Reconciliation §7.4, at Miftah's explicit direction. Roadmap §8 described this
   * question as naming these; it must not. A list of extremes turns an open
   * question into a menu and primes the worst item on it. This test exists so that
   * restoring the list as a "missing requirement" fails rather than ships — in
   * either language.
   */
  it('never enumerates the worst_thing examples', () => {
    const FORBIDDEN: Record<Locale, string[]> = {
      id: [
        'pemerkosaan', 'perkosa', 'bunuh diri', 'pembunuhan',
        'kekerasan dalam rumah tangga', 'kdrt', 'perselingkuhan',
      ],
      en: [
        'rape', 'suicide', 'murder', 'domestic violence', 'domestic abuse',
        'overdose', 'assault',
      ],
    };
    for (const locale of LOCALES) {
      const text = step(locale, 'worst_thing').toLowerCase();
      for (const word of FORBIDDEN[locale]) {
        expect(text, `${locale}: ${word}`).not.toContain(word);
      }
    }
  });

  it('grants permission to decline before the field is focused', () => {
    // The FRAMING line, not the hint: the framing renders above the input, so it
    // is the only one that arrives before the cursor does.
    expect(catalogFor('id')['onboarding.q.worst_thing.framing']).toContain(
      'tidak perlu menceritakannya',
    );
    expect(catalogFor('en')['onboarding.q.worst_thing.framing']).toContain(
      'do not have to tell it here',
    );
  });

  it('names the encryption on the one step that earns it, and only there', () => {
    const LOCKED: Record<Locale, string> = { id: 'terkunci', en: 'kept locked' };
    for (const locale of LOCALES) {
      const c = catalogFor(locale);
      expect(c['onboarding.q.worst_thing.hint']).toContain(LOCKED[locale]);
      expect(c['onboarding.q.best_thing.hint']).not.toContain(LOCKED[locale]);
    }
  });

  it('promises in copy what lotusSafetyCheck enforces in code', () => {
    // A promise the user can read is a promise the code has to keep. The
    // proper-name rejection in `lotusSafetyCheck()` is what keeps this one, which
    // is why reconciliation §7.5 calls that check load-bearing.
    expect(catalogFor('id')['onboarding.q.most_loved.hint']).toContain('Namanya tidak akan');
    expect(catalogFor('en')['onboarding.q.most_loved.hint']).toContain(
      'name will never appear',
    );
  });

  /**
   * The Lotus name is the one onboarding key W6 was told not to exercise judgement
   * on: it is a proper noun and W3's file named both forms in advance.
   */
  it('keeps the Lotus name as the proper noun each locale was given', () => {
    expect(catalogFor('id')['onboarding.lotusName']).toBe('Teratai Batin');
    expect(catalogFor('en')['onboarding.lotusName']).toBe('Inner Heavenly Lotus');
  });

  /**
   * No therapy register, in either locale — roadmap §8's rule binds the copy that
   * ASKS the question as well as the prompt that reads the answer. The English list
   * is longer because English tarot and wellness writing is saturated with this
   * vocabulary and it is ambient in a way the Indonesian is not.
   */
  it('carries no therapy register', () => {
    const FORBIDDEN: Record<Locale, string[]> = {
      id: ['trauma', 'terapi', 'penyembuhan', 'diagnosa', 'gangguan mental'],
      en: [
        'trauma', 'therapy', 'therapist', 'healing', 'heal', 'diagnose',
        'inner child', 'shadow work', 'hold space', 'nervous system',
        'mental health', 'process your feelings',
      ],
    };
    for (const locale of LOCALES) {
      const c = catalogFor(locale);
      for (const [key, value] of Object.entries(c)) {
        if (!key.startsWith('onboarding.')) continue;
        const lower = value.toLowerCase();
        for (const word of FORBIDDEN[locale]) {
          expect({ [`${locale} ${key}`]: lower.includes(word) }).toEqual({
            [`${locale} ${key}`]: false,
          });
        }
      }
    }
  });
});

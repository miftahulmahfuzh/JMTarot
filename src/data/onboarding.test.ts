import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_QUESTION_KEYS,
  ONBOARDING_VERSION,
  ONBOARDING_MAX_ANSWER_CHARS,
  isFreeText,
  isOnboarded,
  nextUnansweredKey,
  normaliseAnswer,
} from './onboarding';

describe('onboarding catalog', () => {
  it('has the six keys in asking order', () => {
    expect(ONBOARDING_QUESTION_KEYS).toEqual([
      'best_thing',
      'worst_thing',
      'most_loved',
      'introversion',
      'color',
      'willow_wish',
    ]);
  });

  it('knows which questions are free text', () => {
    expect(ONBOARDING_QUESTION_KEYS.filter(isFreeText)).toEqual([
      'best_thing',
      'worst_thing',
      'most_loved',
      'willow_wish',
    ]);
  });

  it('mirrors profiles.onboarding_version', () => {
    expect(ONBOARDING_VERSION).toBe(1);
  });
});

describe('isOnboarded', () => {
  it('is false with no profile', () => expect(isOnboarded(null)).toBe(false));

  it('is false for a profile with facts but no completed_at', () => {
    expect(
      isOnboarded({
        fullName: 'A',
        nickname: 'B',
        birthDate: '1994-01-01',
        onboardingVersion: 1,
        completedAt: null,
      }),
    ).toBe(false);
  });

  it('is true only once completed_at is set', () => {
    expect(
      isOnboarded({
        fullName: 'A',
        nickname: 'B',
        birthDate: '1994-01-01',
        onboardingVersion: 1,
        completedAt: '2026-07-26T00:00:00Z',
      }),
    ).toBe(true);
  });
});

describe('nextUnansweredKey', () => {
  it('resumes at the first key with no row', () => {
    expect(nextUnansweredKey(['best_thing', 'worst_thing'])).toBe('most_loved');
  });

  it('is null when all six are recorded, skipped or not', () => {
    expect(nextUnansweredKey([...ONBOARDING_QUESTION_KEYS])).toBeNull();
  });

  it('resumes at the first HOLE, not after the last row', () => {
    // The resume point is derived, so an out-of-order answer set -- which a
    // user gets by going back and answering something they skipped -- must not
    // read as "everything up to the highest index is done".
    expect(nextUnansweredKey(['best_thing', 'most_loved'])).toBe('worst_thing');
  });
});

describe('normaliseAnswer', () => {
  it('treats whitespace-only free text as a skip, not an empty string', () => {
    expect(normaliseAnswer('worst_thing', { text: '   ' })).toEqual({
      key: 'worst_thing',
      text: null,
      choice: null,
      skipped: true,
    });
  });

  it('rejects free text over the cap rather than truncating it', () => {
    expect(() =>
      normaliseAnswer('best_thing', { text: 'a'.repeat(ONBOARDING_MAX_ANSWER_CHARS + 1) }),
    ).toThrow();
  });

  it('rounds the introversion scale to a step of 5 and clamps it', () => {
    expect(normaliseAnswer('introversion', { choice: '37' }).choice).toBe('35');
    expect(normaliseAnswer('introversion', { choice: '250' }).choice).toBe('100');
  });

  it('rejects a colour outside the closed set', () => {
    expect(() => normaliseAnswer('color', { choice: 'merah' })).toThrow();
  });

  it('keeps an answered free-text answer, trimmed', () => {
    expect(normaliseAnswer('best_thing', { text: '  tahun pertama merantau  ' })).toEqual({
      key: 'best_thing',
      text: 'tahun pertama merantau',
      choice: null,
      skipped: false,
    });
  });

  it('honours an explicit skip even when text arrived with it', () => {
    // The client should not send both. If it does, the skip wins: the opposite
    // would store text the user asked not to keep.
    expect(normaliseAnswer('most_loved', { text: 'ibu saya', skipped: true })).toEqual({
      key: 'most_loved',
      text: null,
      choice: null,
      skipped: true,
    });
  });

  it('records a skipped closed question as skipped, with no choice', () => {
    expect(normaliseAnswer('color', { skipped: true })).toEqual({
      key: 'color',
      text: null,
      choice: null,
      skipped: true,
    });
    expect(normaliseAnswer('introversion', { skipped: true }).choice).toBeNull();
  });

  it('rejects a missing value on a closed question that was not skipped', () => {
    // L5: a slider defaulting to centre makes "no answer" and "dead centre"
    // indistinguishable, which would be a silent lie in traits.
    expect(() => normaliseAnswer('introversion', {})).toThrow();
    expect(() => normaliseAnswer('color', {})).toThrow();
  });

  it('rejects a non-numeric introversion value', () => {
    expect(() => normaliseAnswer('introversion', { choice: 'tengah' })).toThrow();
  });

  it('never puts free text on a closed question', () => {
    expect(() => normaliseAnswer('color', { choice: 'black', text: 'hitam sekali' })).toThrow();
  });

  it('treats any whitespace-only free text as a skip', () => {
    // Tabs and newlines too, not just spaces -- a textarea produces them and
    // `.trim()` is what makes all three the same fact.
    //
    // CONTROL CHARACTERS ARE NOT TESTED HERE ON PURPOSE. `.trim()` does not
    // strip them, and stripping them is `sanitizeAnswer()`'s job in
    // `@/lib/prompt/sanitize` -- which this module may not import, because
    // `isOnboarded` has to stay reachable from the edge runtime. The route
    // pipeline is what guarantees the order (sanitize, then normalise); the
    // test for that lives beside the sanitizer.
    for (const blank of ['   ', '\t', '\n\n', ' \t\n ']) {
      expect(normaliseAnswer('willow_wish', { text: blank }).skipped).toBe(true);
    }
  });
});

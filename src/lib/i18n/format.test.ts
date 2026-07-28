import { describe, expect, it } from 'vitest';

import { tFor } from './catalog';
import { formatDate, formatTime, makeT, type Catalog } from './format';

describe('interpolation', () => {
  const t = tFor('id');

  it('substitutes a named placeholder', () => {
    expect(t('nav.back.reader', { name: 'Margaret' })).toBe('← Margaret');
  });

  it('substitutes several, and accepts numbers', () => {
    expect(t('draw.card.aria.picked', { slot: 2, name: 'The Moon' })).toBe(
      'Kartu 2: The Moon, ketuk untuk lihat kartunya',
    );
  });

  /*
   * A forgotten param must leave the placeholder VISIBLE. `Kartu {slot}: The
   * Moon` names what was forgotten; `Kartu undefined: The Moon` says only that
   * something is wrong.
   */
  it('leaves a missing param as its placeholder rather than printing undefined', () => {
    // @ts-expect-error - the point of the test is the runtime behaviour when the
    // compile-time requirement is bypassed, which is what a cast or a dynamic
    // key does in real code.
    expect(t('draw.card.aria.picked', { name: 'The Moon' })).toBe(
      'Kartu {slot}: The Moon, ketuk untuk lihat kartunya',
    );
  });

  it('ignores an unused param', () => {
    expect(t('draw.reset', { name: 'nobody' })).toBe('Kocok ulang');
  });

  it('does not re-scan its own substitution', () => {
    const messages = { 'x.y': 'a {v} b' } as unknown as Catalog;
    const custom = makeT('id', messages);
    // @ts-expect-error - a synthetic catalog, which is the only way to test this
    expect(custom('x.y', { v: '{v}' })).toBe('a {v} b');
  });
});

describe('unknown keys (I3)', () => {
  it('returns the key, never the other locale', () => {
    const t = tFor('en');
    // @ts-expect-error - a dynamic or cast key is exactly the bypass I3 exists for
    expect(t('reading.error.doesNotExist')).toBe('reading.error.doesNotExist');
  });
});

describe('plural', () => {
  /*
   * CLDR gives `id` only the `other` category, so `.one` is never selected at any
   * count. That is I6, and this test is what stops someone editing an Indonesian
   * `.one`, seeing nothing change, and concluding the mechanism is broken.
   */
  it('always selects `other` for Indonesian', () => {
    const t = tFor('id');
    for (const n of [0, 1, 2, 3, 11, 100]) {
      expect(t.plural('picker.service.cardCount', n)).toBe(`${n} kartu`);
    }
  });

  it('selects one and other correctly for English', () => {
    const t = tFor('en');
    expect(t.plural('picker.service.cardCount', 1)).toBe('1 card');
    expect(t.plural('picker.service.cardCount', 3)).toBe('3 cards');
    expect(t.plural('picker.service.cardCount', 0)).toBe('0 cards');
  });

  it('injects {count} pre-formatted, without the caller passing it', () => {
    // 1000 is not a real card count; the point is that the number goes through
    // Intl.NumberFormat, which is `1.000` in id-ID and `1,000` in en-GB.
    expect(tFor('id').plural('picker.service.cardCount', 1000)).toBe('1.000 kartu');
    expect(tFor('en').plural('picker.service.cardCount', 1000)).toBe('1,000 cards');
  });

  it('passes extra params through alongside count', () => {
    expect(tFor('en').plural('draw.counter', 1, { picked: 1, total: 3 })).toBe('1 / 3 card');
    expect(tFor('id').plural('draw.counter', 2, { picked: 2, total: 3 })).toBe('2 / 3 kartu');
  });

});

/**
 * The one place a hand-written count check is CORRECT.
 *
 * `Intl.PluralRules` answers "does the noun inflect", and for `id` the answer is
 * always no — so a `.one`/`.other` family would render `Ketuk 1 kartu` at every
 * count. Indonesian spells that number out, so the distinction here is
 * `.single`/`.many` chosen by `cardCount === 1`, and these assertions are what
 * stops someone folding it back into `plural()` for tidiness.
 */
describe('draw.hint.tap is not a plural family', () => {
  it('keeps the spelled-out Indonesian one', () => {
    expect(tFor('id')('draw.hint.tap.single')).toBe('Ketuk satu kartu, atau tarik ke atas.');
    expect(tFor('id')('draw.hint.tap.many', { count: 3 })).toBe(
      'Ketuk 3 kartu, atau tarik ke atas.',
    );
  });

  it('gets the English article out of the same split', () => {
    expect(tFor('en')('draw.hint.tap.single')).toBe('Tap a card, or drag it upward.');
    expect(tFor('en')('draw.hint.tap.many', { count: 3 })).toBe(
      'Tap 3 cards, or drag them upward.',
    );
  });

  it('declares no `.one`, so the plural tests do not claim it', () => {
    for (const locale of ['id', 'en'] as const) {
      // The key would exist if anyone "simplified" this back into a family.
      // @ts-expect-error - asserting the key is absent from the union
      expect(tFor(locale)('draw.hint.tap.one')).toBe('draw.hint.tap.one');
    }
  });
});

describe('locale', () => {
  it('is readable off the function, so nothing has to drill it', () => {
    expect(tFor('id').locale).toBe('id');
    expect(tFor('en').locale).toBe('en');
  });
});

describe('formatDate', () => {
  it('spells the month in both locales', () => {
    const d = new Date(2026, 6, 26); // local time, deliberately: see the doc comment
    expect(formatDate(d, 'id')).toBe('26 Juli 2026');
    expect(formatDate(d, 'en')).toBe('26 July 2026');
  });

  it('is day-first in English, so en-GB vs en-US never has to be decided', () => {
    expect(formatDate(new Date(2026, 0, 7), 'en')).toBe('7 January 2026');
  });
});

/**
 * ASSERTED ON `.includes` AND ON SHAPE, NEVER ON A GOLDEN STRING.
 *
 * ICU output moves between Node versions and between ICU data builds -- the
 * narrow no-break space before `PM` has already changed once in Node's history.
 * A golden string here is a test that fails on a runtime upgrade for no reason,
 * and the fix somebody reaches for is deleting the assertion.
 *
 * The time is built with a LOCAL-time `Date` on purpose: this helper renders in
 * the runner's own zone, which is the whole thing that distinguishes it from
 * `formatLocalDate`, so constructing from UTC would make the expected hour
 * depend on where the test runs.
 */
describe('formatTime', () => {
  const evening = new Date(2026, 6, 26, 19, 40);

  it('renders the hour and the minute in both locales', () => {
    for (const locale of ['id', 'en'] as const) {
      const out = formatTime(evening, locale);
      expect({ locale, out }).toMatchObject({ locale, out: expect.stringMatching(/\d/) });
      expect(out).toContain('40');
    }
  });

  it('pads the minute but not the hour', () => {
    // '2-digit' minute, 'numeric' hour -- 09.05 would be wrong, 9.05 is right.
    expect(formatTime(new Date(2026, 6, 26, 9, 5), 'id')).toContain('05');
    expect(formatTime(new Date(2026, 6, 26, 9, 5), 'id')).not.toContain('09');
  });

  /**
   * BOTH LOCALES ARE 24-HOUR AND ONLY THE SEPARATOR DIFFERS, because
   * `intlTag('en')` is `en-GB` and its default hour cycle is h23. V6's plan
   * predicted `7:40 PM`, which is what `en-US` would give.
   *
   * Asserted rather than merely noted, because it is the same decision
   * `formatDate` records: English here is day-first and spelled-month so that
   * `en-GB` versus `en-US` never has to be settled for a date the user reads, and
   * a meridiem would reopen that question for a time they read.
   */
  it('is a 24-hour clock in both locales, differing only in the separator', () => {
    const id = formatTime(evening, 'id');
    const en = formatTime(evening, 'en');

    expect(id).toContain('19');
    expect(id).toContain('.');
    expect(en).toContain('19');
    expect(en).toContain(':');
    expect(id).not.toBe(en);
  });

  it('carries no meridiem in either locale, so en-GB vs en-US stays undecided', () => {
    for (const locale of ['id', 'en'] as const) {
      for (const hour of [0, 9, 12, 19, 23]) {
        const out = formatTime(new Date(2026, 6, 26, hour, 0), locale);
        expect({ locale, hour, out }).toEqual({
          locale,
          hour,
          out: expect.not.stringMatching(/[AP]\.?M\.?/i),
        });
      }
    }
  });

  it('renders midnight and noon without collapsing them', () => {
    const midnight = formatTime(new Date(2026, 6, 26, 0, 0), 'en');
    const noon = formatTime(new Date(2026, 6, 26, 12, 0), 'en');
    expect(midnight).not.toBe(noon);
    expect(midnight).toContain('0');
    expect(noon).toContain('12');
  });
});

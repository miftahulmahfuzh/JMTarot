import { describe, expect, it } from 'vitest';

import { catalogFor } from './catalog';
import { LOCALES } from './locale';
import en from './locales/en';
import id from './locales/id';
import type { MessageKey } from './locales/id';

/**
 * The five things the type lock cannot tell you.
 *
 * `Record<MessageKey, string>` proves both catalogs have the same KEYS. It proves
 * nothing about the VALUES, and every failure below is a values failure that
 * compiles cleanly.
 */

const KEYS = Object.keys(id) as MessageKey[];

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogs', () => {
  it('have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
  });

  it('agree on placeholders, key by key', () => {
    for (const k of KEYS) {
      // Wrapped in an object so a failure names the key rather than printing two
      // bare arrays and leaving you to find which of 116 disagreed.
      expect({ [k]: placeholders(en[k]) }).toEqual({ [k]: placeholders(id[k]) });
    }
  });

  /**
   * THE USEFUL ONE. It catches the commonest real failure: a key pasted into
   * `en.ts` with its Indonesian value to make the typecheck go green, intending
   * to come back to it. Nobody comes back.
   */
  it('has no English value left identical to the Indonesian one', () => {
    /*
     * Same on purpose, each for a stated reason:
     *   - the brand and the eyebrow are not translated at all (§7.13)
     *   - language names are written in their own language in both catalogs,
     *     which is the only convention that works for a user who cannot read
     *     the locale they are currently in. V4's SHORT TAGS (`locale.code.*`,
     *     the `ID · EN` toggle inside the account menu) are the same rule at a
     *     different length: a language's own two-letter tag is written the same
     *     way whoever is reading it, and `ID`/`EN` are ISO codes besides.
     *   - the four placeholder-only values have no prose to differ in. They are
     *     keyed anyway so a locale can add words around them ("{name}, the
     *     card") without a code change.
     */
    const SAME_ON_PURPOSE = new Set<MessageKey>([
      'app.title',
      'common.majorArcana',
      'locale.name.id',
      'locale.name.en',
      'locale.code.id',
      'locale.code.en',
      'card.alt.upright',
      'picker.reader.portraitAlt',
      'nav.back.reader',
      'onboarding.progress',
    ]);

    for (const k of KEYS) {
      if (SAME_ON_PURPOSE.has(k)) continue;
      expect(`${k}: ${en[k]}`).not.toBe(`${k}: ${id[k]}`);
    }
  });

  it('declares Indonesian plural families identically (CLDR gives id no `one`)', () => {
    for (const k of KEYS) {
      if (!k.endsWith('.one')) continue;
      const other = k.replace(/\.one$/, '.other') as MessageKey;
      expect(id[k]).toBe(id[other]);
    }
  });

  it('declares both categories for every plural family', () => {
    for (const catalog of [id, en]) {
      for (const k of Object.keys(catalog)) {
        if (!k.endsWith('.one')) continue;
        expect(catalog).toHaveProperty(k.replace(/\.one$/, '.other'));
      }
    }
  });

  /**
   * Not in the plan, and added because §7.9 names it as a real trap: the leading
   * blank line and the square brackets are what make the mid-stream notice read
   * as a system message rather than as the reader suddenly saying something
   * strange. A translator who drops them breaks that, and nothing else would
   * notice.
   */
  it('keeps the bracketed system-message framing on the mid-stream notice', () => {
    for (const locale of LOCALES) {
      expect(catalogFor(locale)['reading.error.midStream']).toMatch(/^\n\n\[.+\]$/);
    }
  });

  it('has no empty values', () => {
    for (const catalog of [id, en]) {
      for (const [k, v] of Object.entries(catalog)) expect({ [k]: v.trim() }).not.toEqual({ [k]: '' });
    }
  });

  /**
   * Indonesian is Indonesian, not Malay (CLAUDE.md). The eleven-word grep in
   * `npm run smoke -- --all` covers GENERATED readings; this covers the catalog,
   * which the smoke script never sees.
   */
  it('has no Malay in the Indonesian catalog', () => {
    const MALAY = [
      'kerjaya', 'hala tuju', 'sembang', 'awak', 'tempoh', 'boleh jadi',
      'kereta', 'pejabat', 'bilik', 'cuba', 'tetapi begitu',
    ];
    for (const k of KEYS) {
      const lower = id[k].toLowerCase();
      for (const word of MALAY) {
        expect({ [k]: lower.includes(word) }).toEqual({ [k]: false });
      }
    }
  });
});

describe('catalogFor', () => {
  it('returns a distinct catalog per locale', () => {
    expect(catalogFor('id')).toBe(id);
    expect(catalogFor('en')).toBe(en);
  });
});

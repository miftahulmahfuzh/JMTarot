import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  intlTag,
  isLocale,
  LOCALES,
  negotiate,
  negotiateOrNull,
} from './locale';

describe('negotiate', () => {
  it('prefers the highest-q known tag', () => {
    expect(negotiate('fr-FR,fr;q=0.9,en-GB;q=0.8,id;q=0.7')).toBe('en');
  });

  it('treats an absent q as 1, which outranks an explicit 0.9', () => {
    expect(negotiate('en,id;q=0.9')).toBe('en');
    expect(negotiate('id,en;q=0.9')).toBe('id');
  });

  it('matches on the primary subtag', () => {
    expect(negotiate('en-US')).toBe('en');
    expect(negotiate('id-ID')).toBe('id');
  });

  /*
   * ISO 639-1 called Indonesian `in` until 1989. Some Android browsers still
   * send it, and this is exactly the kind of thing that fails silently for one
   * class of device: an Indonesian user gets the Indonesian default anyway, so
   * nobody notices until the default changes.
   */
  it('accepts the deprecated Indonesian code some Android browsers still send', () => {
    expect(negotiate('in-ID')).toBe('id');
    expect(negotiate('in')).toBe('id');
  });

  it('falls back to the default for unknown or absent headers', () => {
    expect(negotiate('fr,de;q=0.9')).toBe('id');
    expect(negotiate(null)).toBe('id');
    expect(negotiate('')).toBe('id');
    expect(negotiate('   ')).toBe('id');
  });

  it('is not fooled by a malformed q', () => {
    expect(negotiate('en;q=banana,id;q=0.1')).toBe('id');
  });

  it('ignores a q outside 0..1 rather than ranking it first', () => {
    expect(negotiate('en;q=7,id;q=0.1')).toBe('id');
  });

  it('skips q=0, which means "not acceptable"', () => {
    expect(negotiate('en;q=0,id;q=0.1')).toBe('id');
    expect(negotiate('en;q=0')).toBe('id');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(negotiate('  EN-GB ;Q=0.8 , ID;q=0.7')).toBe('en');
  });

  it('ignores the wildcard rather than treating it as a match', () => {
    // `*` means "anything else is fine", which is what DEFAULT_LOCALE already is.
    expect(negotiate('*')).toBe('id');
    expect(negotiate('en;q=0.2,*;q=0.9')).toBe('en');
  });
});

describe('isLocale', () => {
  it('accepts exactly the two locales', () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
  });

  /*
   * This is what stands between a stray 'en-US' in a cookie and I3 rendering
   * raw message keys at the user.
   */
  it('rejects region tags and casing variants', () => {
    for (const v of ['en-US', 'ID', 'EN', 'id ', '', null, undefined, 0, {}, ['id']])
      expect(isLocale(v)).toBe(false);
  });
});

describe('intlTag', () => {
  it('maps to the BCP-47 tags I7 fixed', () => {
    expect(intlTag('id')).toBe('id-ID');
    expect(intlTag('en')).toBe('en-GB');
  });
});

describe('DEFAULT_LOCALE', () => {
  it('is Indonesian, the source language', () => {
    expect(DEFAULT_LOCALE).toBe('id');
  });
});

/**
 * V2 split `negotiate` into this plus a one-line wrapper. The distinction is
 * invisible to every W6 caller and load-bearing for `resolveForSignIn`, which
 * writes `users.locale_source` — so it needs its own assertions rather than
 * riding on `negotiate`'s.
 */
describe('negotiateOrNull', () => {
  it('agrees with negotiate whenever the header names a locale we have', () => {
    for (const header of ['en', 'id', 'en-GB,en;q=0.9,id;q=0.8', 'in-ID', 'fr,id;q=0.5']) {
      expect(negotiateOrNull(header)).toBe(negotiate(header));
    }
  });

  /*
   * THE POINT OF THE FUNCTION. `negotiate` cannot tell these two apart from a
   * header that asked for Indonesian, and one of them is a decision while the
   * other is the absence of one.
   */
  it('returns null where negotiate returns the default it invented', () => {
    expect(negotiateOrNull(null)).toBeNull();
    expect(negotiateOrNull(undefined)).toBeNull();
    expect(negotiateOrNull('')).toBeNull();
    expect(negotiateOrNull('fr-FR,de;q=0.8')).toBeNull();
    expect(negotiateOrNull('*')).toBeNull();
    expect(negotiateOrNull('zz')).toBeNull();

    // ...all of which negotiate() reports as Indonesian, correctly, for its own
    // callers. That is the conflation this function exists to undo.
    expect(negotiate('fr-FR,de;q=0.8')).toBe('id');
  });
});

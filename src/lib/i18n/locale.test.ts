import { describe, expect, it } from 'vitest';

import { effectiveLocaleSource } from './locale';

/**
 * A NEW FILE RATHER THAN A SECTION IN `negotiate.test.ts`.
 *
 * That file covers `locale.ts`'s other half — the `Accept-Language` parser, which
 * has enough edge cases to deserve a file of its own and already has one. This is
 * a different concern with one function in it, and the two would only ever be run
 * or read together by accident.
 */
describe('effectiveLocaleSource', () => {
  /*
   * T16, AND THE ONLY ASSERTION HERE WITH A CONSEQUENCE.
   *
   * Every `users` row created before v0.3.0 has NULL in this column. Reading NULL
   * as `'default'` would license the sign-in path to stamp the negotiated locale
   * over it — and those users have been using the app in whatever it gave them
   * for a release, and may well have pressed the toggle. `'chosen'` is the
   * conservative reading and the only safe one.
   *
   * The helper exists so that nobody reads the column raw and gets this wrong;
   * `null ?? 'default'` is what a reasonable person writes without it.
   */
  it('reads NULL and undefined as chosen, never as default', () => {
    expect(effectiveLocaleSource(null)).toBe('chosen');
    expect(effectiveLocaleSource(undefined)).toBe('chosen');
  });

  it('round-trips the three real values', () => {
    expect(effectiveLocaleSource('default')).toBe('default');
    expect(effectiveLocaleSource('negotiated')).toBe('negotiated');
    expect(effectiveLocaleSource('chosen')).toBe('chosen');
  });

  /*
   * Anything unrecognised takes the SAME conservative branch as NULL, not a
   * throw: this reads a database column, and a value that got in there somehow is
   * not a reason to fail a sign-in. Falling to `'chosen'` means the worst case is
   * that a locale is never re-stamped, which is invisible; falling to `'default'`
   * would mean silently overwriting a choice.
   */
  it('reads anything unrecognised as chosen too', () => {
    expect(effectiveLocaleSource('')).toBe('chosen');
    expect(effectiveLocaleSource('DEFAULT')).toBe('chosen');
    expect(effectiveLocaleSource('negotiated ')).toBe('chosen');
    expect(effectiveLocaleSource('id')).toBe('chosen');
  });
});

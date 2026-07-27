import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCALE_COOKIE,
  localeFromHeaders,
  resolveForMiddleware,
  resolveForSignIn,
} from './resolve';

/**
 * A request with whatever the chain reads: a query string, a cookie, a header.
 *
 * A real `NextRequest` rather than a hand-rolled stub, because two of the three
 * reads go through `nextUrl.searchParams` and `cookies.get()`, and a stub that
 * got either shape wrong would pass here and fail in production.
 */
function req(
  url: string,
  opts: { cookie?: string; acceptLanguage?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.acceptLanguage) headers.set('accept-language', opts.acceptLanguage);
  if (opts.cookie) headers.set('cookie', `${LOCALE_COOKIE}=${opts.cookie}`);
  return new NextRequest(new URL(url, 'http://localhost:3001'), { headers });
}

const NODE_ENV = process.env.NODE_ENV;
afterEach(() => {
  // @ts-expect-error - NODE_ENV is readonly in the Next types; this is the test seam
  process.env.NODE_ENV = NODE_ENV;
});

describe('resolveForMiddleware', () => {
  it('prefers the session claim over the cookie (D6: profile beats cookie)', () => {
    expect(resolveForMiddleware(req('/', { cookie: 'id' }), 'en')).toBe('en');
  });

  it('falls back to the cookie when there is no session', () => {
    expect(resolveForMiddleware(req('/', { cookie: 'en' }), null)).toBe('en');
  });

  it('falls back to Accept-Language when there is no cookie', () => {
    expect(resolveForMiddleware(req('/', { acceptLanguage: 'en-GB,en;q=0.9' }), null)).toBe('en');
  });

  it('falls back to the default with nothing at all', () => {
    expect(resolveForMiddleware(req('/'), null)).toBe('id');
  });

  it('ignores a cookie that is not a locale', () => {
    // The exact value that would otherwise reach catalogFor() and render raw keys.
    expect(resolveForMiddleware(req('/', { cookie: 'en-US' }), null)).toBe('id');
    expect(
      resolveForMiddleware(req('/', { cookie: 'EN', acceptLanguage: 'en' }), null),
    ).toBe('en');
  });

  describe('the ?lang= override (I12)', () => {
    it('wins over everything in development', () => {
      // @ts-expect-error - test seam
      process.env.NODE_ENV = 'development';
      expect(resolveForMiddleware(req('/?lang=en', { cookie: 'id' }), 'id')).toBe('en');
      expect(resolveForMiddleware(req('/?lang=id', { cookie: 'en' }), 'en')).toBe('id');
    });

    /*
     * A production locale in a query string is a cache-poisoning shape and it
     * would also quietly contradict D6. This is the test that keeps it out.
     */
    it('is ignored in production', () => {
      // @ts-expect-error - test seam
      process.env.NODE_ENV = 'production';
      expect(resolveForMiddleware(req('/?lang=en'), null)).toBe('id');
      expect(resolveForMiddleware(req('/?lang=en', { cookie: 'id' }), null)).toBe('id');
    });

    it('ignores a junk value even in development', () => {
      // @ts-expect-error - test seam
      process.env.NODE_ENV = 'development';
      expect(resolveForMiddleware(req('/?lang=fr'), null)).toBe('id');
      expect(resolveForMiddleware(req('/?lang='), null)).toBe('id');
    });
  });
});

describe('localeFromHeaders', () => {
  it('reads the header first', () => {
    expect(localeFromHeaders('en', 'id')).toBe('en');
  });

  /*
   * Not redundant: `manifest.ts` sits outside the middleware matcher, so the
   * header is absent there by design and the cookie is all it has (I13).
   */
  it('falls back to the cookie when the header is absent', () => {
    expect(localeFromHeaders(null, 'en')).toBe('en');
    expect(localeFromHeaders(undefined, 'en')).toBe('en');
  });

  it('falls back to the default, and rejects near-misses', () => {
    expect(localeFromHeaders(null, null)).toBe('id');
    expect(localeFromHeaders('en-GB', 'ID')).toBe('id');
  });
});

/**
 * VD11 / T17. What locale a brand-new `users` row gets stamped with, and whether
 * that stamp counts as a decision.
 *
 * PURE, so all four rungs are testable without a request. The one thing this
 * cannot test is whether `headers()` and `cookies()` actually resolve inside
 * @auth/core's jwt callback — that is §6.1's link 5 and Task 17 measures it
 * against a real sign-in.
 */
describe('resolveForSignIn', () => {
  it('prefers the forwarded header over everything else', () => {
    expect(resolveForSignIn('en', 'id', 'id')).toEqual({ locale: 'en', source: 'negotiated' });
  });

  it('prefers the cookie over Accept-Language', () => {
    expect(resolveForSignIn(null, 'en', 'id')).toEqual({ locale: 'en', source: 'negotiated' });
  });

  /*
   * A BAD HEADER FALLS THROUGH TO THE COOKIE, it does not fall to the default.
   * Middleware sets `x-jmt-locale` itself so a malformed value should be
   * impossible — but this reads an untrusted request either way, and skipping the
   * remaining rungs on a junk value would throw away two good signals.
   */
  it('falls through a junk header to the cookie, and a junk cookie to the language', () => {
    expect(resolveForSignIn('en-GB', 'en', 'id')).toEqual({ locale: 'en', source: 'negotiated' });
    expect(resolveForSignIn('', 'ID', 'en-GB,en;q=0.9')).toEqual({
      locale: 'en',
      source: 'negotiated',
    });
  });

  it('negotiates from Accept-Language when it is the only signal', () => {
    expect(resolveForSignIn(null, null, 'en-GB,en;q=0.9')).toEqual({
      locale: 'en',
      source: 'negotiated',
    });
    expect(resolveForSignIn(null, null, 'id-ID')).toEqual({ locale: 'id', source: 'negotiated' });
  });

  /*
   * T17, AND THIS IS THE ASSERTION THE COLUMN EXISTS FOR.
   *
   * `negotiate(null)` returns `'id'`, and stamping that as `'negotiated'` would
   * record a negotiation that never happened — which destroys the column's only
   * purpose, which is telling a default apart from a decision. The enum has three
   * values rather than two precisely so this case has somewhere honest to go.
   */
  it('reports `default` when there was no signal at all', () => {
    expect(resolveForSignIn(null, null, null)).toEqual({ locale: 'id', source: 'default' });
    expect(resolveForSignIn(undefined, undefined, undefined)).toEqual({
      locale: 'id',
      source: 'default',
    });
    expect(resolveForSignIn('', '', '')).toEqual({ locale: 'id', source: 'default' });
  });

  /*
   * An UNPARSEABLE Accept-Language is not a negotiation either. `negotiate('zz')`
   * finds no known tag and returns the default, which is the same answer it gives
   * for no header at all — so the source must be the same too, or two identical
   * outcomes get two different provenances.
   */
  it('reports `default` when Accept-Language names no locale we have', () => {
    expect(resolveForSignIn(null, null, 'zz')).toEqual({ locale: 'id', source: 'default' });
    expect(resolveForSignIn(null, null, 'fr-FR,de;q=0.8')).toEqual({
      locale: 'id',
      source: 'default',
    });
    expect(resolveForSignIn(null, null, '*')).toEqual({ locale: 'id', source: 'default' });
  });

  /*
   * But an Accept-Language that names Indonesian IS a negotiation, even though the
   * resulting locale is identical to the default. The value of the column is the
   * provenance, not the locale.
   */
  it('reports `negotiated` for an explicit id, which is the case a two-value enum loses', () => {
    expect(resolveForSignIn(null, null, 'id')).toEqual({ locale: 'id', source: 'negotiated' });
    expect(resolveForSignIn(null, 'id', null)).toEqual({ locale: 'id', source: 'negotiated' });
  });
});

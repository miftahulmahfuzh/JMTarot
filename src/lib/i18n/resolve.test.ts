import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { LOCALE_COOKIE, localeFromHeaders, resolveForMiddleware } from './resolve';

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

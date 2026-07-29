import { describe, expect, it } from 'vitest';

import {
  contentRewrite,
  isContentPath,
  isPublicContentPath,
  localePath,
  stripLocalePrefix,
} from './prefix';

/**
 * The prefix parser and builder (S2, roadmap S-D1/S-D2).
 *
 * **THE PARSER IS NOT THE FENCE.** `stripLocalePrefix('/en/history')` returns
 * `{ locale: 'en', path: '/history' }` on purpose — it is a syntactic parse and
 * nothing else. What refuses to serve the gated app under `/en/` is
 * `isContentPath`, tested in the next describe, and `contentRewrite`, which is
 * the only function `middleware.ts` calls. Somebody reading only this block will
 * conclude the stripper guards the app; it does not, and that misreading is how
 * the worst failure available in this release would ship.
 */
describe('stripLocalePrefix', () => {
  it('strips the English prefix and returns the bare path', () => {
    expect(stripLocalePrefix('/en/gallery')).toEqual({ locale: 'en', path: '/gallery' });
    expect(stripLocalePrefix('/en/arcana/the-moon')).toEqual({
      locale: 'en',
      path: '/arcana/the-moon',
    });
  });

  it('reports no prefix on a bare path', () => {
    expect(stripLocalePrefix('/gallery')).toEqual({ locale: null, path: '/gallery' });
    expect(stripLocalePrefix('/')).toEqual({ locale: null, path: '/' });
  });

  /*
   * `/en` and `/en/` are the English HOME, so the remainder is `/` and not the
   * empty string. An empty string would make `isContentPath('')` false and turn
   * the English landing page into a 302 to /login, which is the exact bug this
   * release exists to remove.
   */
  it('treats a bare prefix as the root', () => {
    expect(stripLocalePrefix('/en')).toEqual({ locale: 'en', path: '/' });
    expect(stripLocalePrefix('/en/')).toEqual({ locale: 'en', path: '/' });
  });

  /*
   * INDONESIAN IS RECOGNISED THOUGH IT IS NEVER SERVED PREFIXED. The parser has
   * to see `/id/` for `contentRewrite` to be able to 301 it to the bare address;
   * refusing to parse it would make `/id/gallery` a 404 instead, which throws
   * away an inbound link for a path people will guess precisely because `/en/`
   * exists. The POLICY that `id` has one address lives in `LOCALE_SEGMENT`.
   */
  it('recognises the Indonesian segment too', () => {
    expect(stripLocalePrefix('/id/gallery')).toEqual({ locale: 'id', path: '/gallery' });
    expect(stripLocalePrefix('/id')).toEqual({ locale: 'id', path: '/' });
  });

  it('needs a whole segment, not a prefix of one', () => {
    expect(stripLocalePrefix('/english')).toEqual({ locale: null, path: '/english' });
    expect(stripLocalePrefix('/ender')).toEqual({ locale: null, path: '/ender' });
    expect(stripLocalePrefix('/identity')).toEqual({ locale: null, path: '/identity' });
  });

  /*
   * CASE-SENSITIVE, because URLs are. A case-insensitive strip would be the one
   * way `/EN/history` could become `/history`, and normalising case here would
   * also invent a second address for every page.
   */
  it('is case-sensitive', () => {
    expect(stripLocalePrefix('/EN/gallery')).toEqual({ locale: null, path: '/EN/gallery' });
    expect(stripLocalePrefix('/En/gallery')).toEqual({ locale: null, path: '/En/gallery' });
  });

  /*
   * ONE PASS, NEVER A LOOP. `/en/en/gallery` yields `/en/gallery`, which is not a
   * content path, so `contentRewrite` passes it through and the gate 404s it. A
   * recursive strip would serve one page at unboundedly many addresses.
   */
  it('strips exactly one segment', () => {
    expect(stripLocalePrefix('/en/en/gallery')).toEqual({ locale: 'en', path: '/en/gallery' });
    expect(stripLocalePrefix('/en/id')).toEqual({ locale: 'en', path: '/id' });
  });

  it('keeps a trailing slash rather than normalising it here', () => {
    // `isContentPath` normalises and `contentRewrite` 301s. Doing it in two
    // places would mean two answers to "what is the canonical address".
    expect(stripLocalePrefix('/en/gallery/')).toEqual({ locale: 'en', path: '/gallery/' });
    expect(stripLocalePrefix('/gallery/')).toEqual({ locale: null, path: '/gallery/' });
  });

  /*
   * IT TAKES A PATHNAME, AND A MISUSE FAILS CLOSED. `request.nextUrl.pathname`
   * never contains `?`, but this function is exported, so somebody will hand it a
   * full path one day. The query rides along into `path`, `isContentPath` then
   * rejects it, and the request passes through to the gate — wrong, and safe.
   */
  it('fails closed when handed a query string', () => {
    expect(stripLocalePrefix('/en/gallery?lang=id')).toEqual({
      locale: 'en',
      path: '/gallery?lang=id',
    });
  });
});

describe('localePath', () => {
  it('adds the segment for English and nothing for Indonesian', () => {
    expect(localePath('en', '/gallery')).toBe('/en/gallery');
    expect(localePath('id', '/gallery')).toBe('/gallery');
    expect(localePath('en', '/arcana/the-moon')).toBe('/en/arcana/the-moon');
  });

  it('maps the root to `/en` and `/`', () => {
    // `/en/` would be a second address for one page. `contentRewrite` 301s it.
    expect(localePath('en', '/')).toBe('/en');
    expect(localePath('id', '/')).toBe('/');
  });

  /*
   * THROWS ON AN ALREADY-PREFIXED PATH, rather than producing `/en/en/gallery`.
   * Every caller has a bare path in hand (a server page knows its own route), so
   * a prefixed argument is a programming error — and the output would be a
   * canonical tag pointing at a page that does not exist, which is the worst
   * class of SEO bug because it de-indexes the correct page.
   */
  it('refuses a path that already carries a prefix', () => {
    expect(() => localePath('en', '/en/gallery')).toThrow(/already-prefixed/);
    expect(() => localePath('id', '/id/gallery')).toThrow(/already-prefixed/);
  });
});

/**
 * The route table (roadmap §3.1, S-D3). BARE paths only — never a prefixed one.
 *
 * `/cards/…` IS FORBIDDEN AND IS NOT AN OVERSIGHT: `public/cards/` already
 * serves 22 `.webp` files there and `middleware.ts`'s matcher excludes `cards/`
 * twice over, so a page route under it would be un-gated, would never receive
 * `x-jmt-locale`, and would race a static file. S-D3 has the full argument.
 */
describe('isContentPath', () => {
  const CONTENT = [
    '/',
    '/gallery',
    '/blog',
    '/blog/how-to-read-tarot',
    '/arcana',
    '/arcana/the-moon',
    '/arcana/wheel-of-fortune',
  ];

  it.each(CONTENT)('accepts %s', (path) => {
    expect(isContentPath(path)).toBe(true);
  });

  /*
   * `/arcana` WITH NO SLUG IS CONTENT THOUGH IT IS A 404 (§3.1: "deliberately",
   * because `/gallery` is the index and two indexes of one collection compete).
   * It is here so that a crawler which truncates `/arcana/the-moon` gets a clean
   * 404 from Next's own routing rather than a 302 to `/login` — a 302 on a path
   * a crawler constructed from an indexable one is the bug this release exists
   * to remove. Same for a `/blog/<slug>` that does not exist: S6's `notFound()`
   * answers, and the gate never sees it.
   */
  it('accepts /arcana so that its 404 is a 404 and not a login redirect', () => {
    expect(isContentPath('/arcana')).toBe(true);
    expect(isContentPath('/blog/nothing-was-ever-written-here')).toBe(true);
  });

  it('tolerates exactly one trailing slash', () => {
    expect(isContentPath('/gallery/')).toBe(true);
    expect(isContentPath('/arcana/the-moon/')).toBe(true);
  });

  /*
   * ── THE NEGATIVE CONTROLS. §6.1 names the first three by hand. ─────────────
   * A widened prefix is how this predicate would make the app public, so every
   * near-miss is written down.
   */
  it.each([
    '/gallerywhatever',
    '/galleries',
    '/blogroll',
    '/arcanas',
    '/arcana-the-moon',
    '/history',
    '/account',
    '/onboarding',
    '/login',
    '/terms',
    '/privacy',
    '/thessaly',
    '/thessaly/daily',
    '/api/events',
    '/api/reading',
    '/s/abcdefghjkmn',
    '/arcana/the-moon/extra',
    '/blog/a/b',
    '/cards/18_moon.webp',
    '/en/history',
    '/en/gallery',
    '/id/gallery',
    '//gallery',
    '/gallery?lang=en',
  ])('rejects %s', (path) => {
    expect(isContentPath(path)).toBe(false);
  });

  /*
   * `/en/gallery` AND `/id/gallery` ARE REJECTED, and that is not a bug — this
   * predicate answers about BARE paths. `contentRewrite` strips first and then
   * asks. A version of this function that accepted prefixed paths would let
   * `isPublic('/en/history')` through the moment somebody "unified" the two.
   */
  it('answers about bare paths only, so a caller must strip first', () => {
    expect(isContentPath(stripLocalePrefix('/en/gallery').path)).toBe(true);
    expect(isContentPath(stripLocalePrefix('/en/history').path)).toBe(false);
  });
});

/**
 * ── THE MOST SECURITY-RELEVANT LINE IN THIS MODULE ──────────────────────────
 *
 * `isPublicContentPath` is what S1's `isPublic()` may call. It differs from
 * `isContentPath` by exactly one path — `/` — and the reason is S-D5:
 *
 *   `isPublic()` SHORT-CIRCUITS `decide()` BEFORE THE ONBOARDING CHECK. Putting
 *   `/` in it would stop redirecting a signed-in, half-onboarded querent to
 *   `/onboarding` and would land them on the reader picker, which assumes a
 *   completed profile. S-D5 says "DO NOT ADD `'/'` TO `isPublic()`" in capitals,
 *   and a predicate that quietly includes it is that change arriving through the
 *   back door with a green suite.
 *
 * `/` is instead handled by a dedicated clause in `decide()` (S1's, S-D5) that
 * sits AFTER the onboarding arm. The test below makes the difference a fact
 * rather than an accident.
 */
describe('isPublicContentPath', () => {
  it('differs from isContentPath by exactly the root', () => {
    const corpus = [
      '/',
      '/gallery',
      '/blog',
      '/blog/x',
      '/arcana',
      '/arcana/the-moon',
      '/history',
      '/en/gallery',
      '/gallerywhatever',
    ];
    const differ = corpus.filter((p) => isContentPath(p) !== isPublicContentPath(p));
    expect(differ).toEqual(['/']);
  });

  it('is false for the root and true for the rest of the tree', () => {
    expect(isPublicContentPath('/')).toBe(false);
    expect(isPublicContentPath('/gallery')).toBe(true);
    expect(isPublicContentPath('/arcana/the-moon')).toBe(true);
  });
});

/**
 * The one function `src/middleware.ts` calls (S-D2).
 *
 * PURE, AND IT TAKES A PATHNAME AND A BOOLEAN — no `NextRequest`, no
 * `searchParams`, no headers. That is how §4.3 is satisfied BY CONSTRUCTION:
 * `?lang=en` cannot reach this function, so on a content route it cannot fight
 * the prefix, in development or in production. The dev override is still alive
 * for the nine app routes, where `resolveForMiddleware` reads it.
 */
describe('contentRewrite', () => {
  describe('a bare content path pins the default locale (§4.1)', () => {
    /*
     * **THE URL IS THE ONLY INPUT.** No cookie, no session claim, no
     * `Accept-Language`. A visitor whose browser says `en-GB` landing on
     * `/gallery` gets Indonesian and is NOT redirected: auto-redirecting a
     * crawler by `Accept-Language` is how sites hide half their content from an
     * index, and a page whose language depends on the visitor's cookie can be
     * neither canonicalised nor cached at the edge.
     */
    it('answers `bare` with id for every content path', () => {
      expect(contentRewrite('/gallery', false)).toEqual({ kind: 'bare', locale: 'id' });
      expect(contentRewrite('/arcana/the-moon', false)).toEqual({ kind: 'bare', locale: 'id' });
      expect(contentRewrite('/blog', false)).toEqual({ kind: 'bare', locale: 'id' });
    });
  });

  describe('a prefixed content path is rewritten to the bare route (S-D2)', () => {
    it('rewrites and pins en', () => {
      expect(contentRewrite('/en/gallery', false)).toEqual({
        kind: 'rewrite',
        locale: 'en',
        path: '/gallery',
      });
      expect(contentRewrite('/en/arcana/the-moon', true)).toEqual({
        kind: 'rewrite',
        locale: 'en',
        path: '/arcana/the-moon',
      });
    });

    /*
     * `/en` IS THE ENGLISH HOME and rewrites to `/`. §3.1 lists the route as
     * `/en/`; `/en/` 301s here to `/en`, so §11.2's `curl -L` loop passes and
     * the sitemap and the canonical name exactly one address.
     */
    it('rewrites /en to the root', () => {
      expect(contentRewrite('/en', false)).toEqual({ kind: 'rewrite', locale: 'en', path: '/' });
    });
  });

  describe('non-canonical content addresses 301 (one issuer, both locales)', () => {
    it('sends /id/… to the bare path, because Indonesian has one address', () => {
      expect(contentRewrite('/id/gallery', false)).toEqual({ kind: 'redirect', to: '/gallery' });
      expect(contentRewrite('/id/arcana/the-moon', false)).toEqual({
        kind: 'redirect',
        to: '/arcana/the-moon',
      });
      expect(contentRewrite('/id', false)).toEqual({ kind: 'redirect', to: '/' });
      expect(contentRewrite('/id/', false)).toEqual({ kind: 'redirect', to: '/' });
    });

    /*
     * A TRAILING SLASH IS NOT A SECOND ADDRESS, and we issue the redirect for
     * the bare form too rather than leaving it to Next's `trailingSlash: false`
     * 308. Two issuers for one condition is how the two locales end up behaving
     * differently — 200 on one side, 308 on the other — for no reason anybody
     * can find later.
     */
    it('normalises a trailing slash in both locales', () => {
      expect(contentRewrite('/gallery/', false)).toEqual({ kind: 'redirect', to: '/gallery' });
      expect(contentRewrite('/en/gallery/', false)).toEqual({
        kind: 'redirect',
        to: '/en/gallery',
      });
      expect(contentRewrite('/en/', false)).toEqual({ kind: 'redirect', to: '/en' });
    });
  });

  describe('everything else is D6, untouched', () => {
    it.each([
      '/thessaly',
      '/thessaly/daily',
      '/history',
      '/history/abc',
      '/account',
      '/onboarding',
      '/login',
      '/terms',
      '/privacy',
      '/api/events',
      '/s/abcdefghjkmn',
      '/gallerywhatever',
      '/blogroll',
    ])('passes %s through', (path) => {
      expect(contentRewrite(path, false)).toEqual({ kind: 'passthrough' });
      expect(contentRewrite(path, true)).toEqual({ kind: 'passthrough' });
    });

    /*
     * ── THE WORST OUTCOME AVAILABLE IN THIS RELEASE, FENCED ─────────────────
     *
     * A prefixed NON-content path is not stripped, not rewritten and not
     * redirected. `/en/history` reaches `decide()` verbatim, matches nothing,
     * and 302s to `/login` for a stranger or 404s for a signed-in user. Nothing
     * links it, it is in no sitemap and in no `hreflang` set.
     *
     * If any of these ever returned `rewrite`, the whole gated application
     * would be reachable under `/en/` — and it would look like a working
     * feature.
     */
    it.each([
      '/en/history',
      '/en/history/abc',
      '/en/account',
      '/en/onboarding',
      '/en/login',
      '/en/terms',
      '/en/api/events',
      '/en/api/reading',
      '/en/thessaly',
      '/en/thessaly/daily',
      '/en/s/abcdefghjkmn',
      '/en/en/gallery',
      '/EN/gallery',
      '/id/history',
      '/id/account',
    ])('never lets %s become a served route', (path) => {
      expect(contentRewrite(path, false)).toEqual({ kind: 'passthrough' });
      expect(contentRewrite(path, true)).toEqual({ kind: 'passthrough' });
    });
  });

  /**
   * ── `/` IS THE ONE PATH WHERE THE SESSION IS READ, AND IT IS FORCED ────────
   *
   * S-D5 makes `/` dual-render: a static landing signed out, the reader picker
   * signed in, byte-for-byte as today. Pinning `id` there unconditionally would
   * hand a signed-in English querent an Indonesian reader picker — D6 broken on
   * the busiest screen in the app, by the workstream that promised not to touch
   * it.
   *
   * So the pin applies to `/` only when there is no session. The consequence,
   * stated because it is the thing that will look wrong later: `/` cannot be
   * CDN-cached, because it already varies by session for reasons that are
   * S-D5's, not S2's.
   */
  describe('the root, and the only place a session is consulted', () => {
    it('pins id for a stranger', () => {
      expect(contentRewrite('/', false)).toEqual({ kind: 'bare', locale: 'id' });
    });

    it('leaves a signed-in visitor on the D6 chain', () => {
      expect(contentRewrite('/', true)).toEqual({ kind: 'passthrough' });
    });

    /*
     * NEGATIVE CONTROL, in the shape `/s/[slug]`'s contract test uses for
     * `viewerLocale`: the session must change the answer for `/` and for
     * NOTHING ELSE. Without this, a plausible future edit ("skip the pin for
     * signed-in users, they have a preference") silently turns every content
     * page into a session-varying, uncacheable response.
     */
    it('gives the identical answer for every other path, signed in or out', () => {
      for (const path of [
        '/gallery',
        '/gallery/',
        '/blog',
        '/blog/x',
        '/arcana',
        '/arcana/the-moon',
        '/en',
        '/en/',
        '/en/gallery',
        '/id/gallery',
        '/history',
        '/en/history',
      ]) {
        expect({ [path]: contentRewrite(path, true) }).toEqual({
          [path]: contentRewrite(path, false),
        });
      }
    });
  });

  /**
   * ── NO REDIRECT LOOP, PROVED RATHER THAN REASONED ─────────────────────────
   *
   * A 301 whose target 301s again is a loop the browser shows as
   * ERR_TOO_MANY_REDIRECTS and the crawler shows as nothing at all. Every
   * redirect target here must settle in at most one further step.
   */
  it('settles every address in at most two steps', () => {
    const starts = [
      '/',
      '/gallery',
      '/gallery/',
      '/en',
      '/en/',
      '/en/gallery',
      '/en/gallery/',
      '/id',
      '/id/',
      '/id/gallery',
      '/id/gallery/',
      '/arcana/the-moon/',
      '/en/arcana/the-moon/',
    ];
    for (const start of starts) {
      let path = start;
      let steps = 0;
      let decision = contentRewrite(path, false);
      while (decision.kind === 'redirect') {
        path = decision.to;
        steps += 1;
        expect({ [start]: steps }).not.toEqual({ [start]: 3 });
        decision = contentRewrite(path, false);
      }
      expect({ [start]: decision.kind }).not.toEqual({ [start]: 'redirect' });
    }
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * S2's contracts, asserted against the source.
 *
 * ── WHY SOURCE-LEVEL ────────────────────────────────────────────────────────
 *
 * `src/middleware.ts` is `auth(handler)` from a real NextAuth instance; running
 * it in Vitest means a `NextRequest`, a decodable JWE and an `AUTH_SECRET`, and
 * all of the DECISIONS it makes are already pure and exhaustively covered in
 * `prefix.test.ts`. What is left is a handful of properties about how those
 * decisions are WIRED, each of which fails silently in production and cannot
 * fail loudly anywhere else. Same shape as `localeSwitch.test.ts` and
 * `page.contract.test.ts`.
 */

const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** Source with comments removed. See `localeSwitch.test.ts` for why this is needed. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('the rewrite mutates what a server component sees (S-D2)', () => {
  const mw = code('middleware.ts');

  /**
   * **THE SILENT FAILURE THIS RELEASE IS MOST LIKELY TO SHIP.**
   *
   * `NextResponse.rewrite(url)` renders the right route and forwards no
   * `x-jmt-locale`, so `getLocale()` falls through to the `jmt_locale` cookie:
   * `/en/gallery` comes out English for whoever has an `en` cookie and
   * Indonesian for everyone else, under a canonical tag that says English.
   * `middleware.ts` already carried this warning for `NextResponse.next()`.
   */
  it('passes `request: { headers }` to rewrite, not only to next', () => {
    expect(mw).toMatch(
      /NextResponse\.rewrite\(\s*url\s*,\s*\{\s*request:\s*\{\s*headers\s*\}\s*\}\s*\)/,
    );
    expect(mw).toMatch(/NextResponse\.next\(\s*\{\s*request:\s*\{\s*headers\s*\}\s*\}\s*\)/);
  });

  it('sets the locale header on the forwarded headers before either', () => {
    const setAt = mw.indexOf('headers.set(LOCALE_HEADER');
    const rewriteAt = mw.indexOf('NextResponse.rewrite');
    expect(setAt).toBeGreaterThan(-1);
    expect(rewriteAt).toBeGreaterThan(setAt);
  });
});

describe('the prefix is resolved before the chain and before the gate (contract G1)', () => {
  const mw = code('middleware.ts');

  /**
   * ORDER IS THE WHOLE CONTRACT. `contentRewrite` must run before
   * `resolveForMiddleware`, or a content page's language comes from the
   * visitor's cookie (§4.1 broken, and the page is uncacheable). And it must run
   * before `decide`, or S1's `isPublic()` is asked about `/en/gallery` and
   * S-D5's `/` clause never fires for the English landing.
   */
  it('calls contentRewrite first', () => {
    const contentAt = mw.indexOf('contentRewrite(');
    const resolveAt = mw.indexOf('resolveForMiddleware(');
    const decideAt = mw.indexOf('decide({');
    expect(contentAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(contentAt);
    expect(decideAt).toBeGreaterThan(contentAt);
  });

  it('never consults the D6 chain on a content path', () => {
    // The chain is reachable only from the `passthrough` arm.
    expect(mw).toMatch(/content\.kind === 'passthrough'\s*\?\s*resolveForMiddleware\(/);
  });

  it('hands `decide` the stripped path', () => {
    expect(mw).toMatch(/pathname:\s*content\.kind === 'rewrite' \? content\.path : pathname/);
  });

  /**
   * A 301 must not be gated. It is safe because `contentRewrite` only redirects
   * to a PUBLIC content path -- no gated route is reachable through it -- and it
   * must be, because a redirect that first 302s to `/login` is a redirect chain
   * a crawler abandons.
   */
  it('returns the 301 before the gate, as a 301 and not a 307', () => {
    const redirectAt = mw.indexOf("content.kind === 'redirect'");
    const decideAt = mw.indexOf('decide({');
    expect(redirectAt).toBeGreaterThan(-1);
    expect(decideAt).toBeGreaterThan(redirectAt);
    expect(mw).toMatch(/NextResponse\.redirect\(url,\s*301\)/);
  });
});

describe('no content response sets a cookie (S-D10)', () => {
  const mw = code('middleware.ts');

  /**
   * Two reasons, both in `middleware.ts`'s own comment: `/privacy` §4.4 is
   * honest only because a public page sets nothing, and a `Set-Cookie` makes the
   * response uncacheable at the edge on exactly the pages whose TTFB a crawler
   * measures.
   */
  it('guards the locale cookie on passthrough AND on /s/', () => {
    expect(mw).toMatch(/content\.kind === 'passthrough' &&\s*!pathname\.startsWith\('\/s\/'\) &&/);
  });

  /**
   * **R22, AND IT CLOSES A PRE-EXISTING HOLE RATHER THAN ADDING A RULE.**
   * `/api/events` is in `isPublic()` and INSIDE the matcher, so before this the
   * beacon fired from `/s/` collected the very cookie that page had refused to
   * set — V7's "a third party must leave with nothing in their jar" was narrower
   * than it read, and `/privacy` §4.4 disagreed with the wire. Asserted on the
   * source because the failure is one absent line and is invisible in behaviour
   * until somebody reads a `Set-Cookie` off a beacon response.
   */
  it('guards the locale cookie on the analytics beacon too', () => {
    expect(mw).toMatch(/pathname !== EVENTS_BEACON/);
    expect(mw).toMatch(/const EVENTS_BEACON = '\/api\/events'/);
  });

  /**
   * `/api/locale` MUST keep writing it — writing it is that route's whole
   * purpose — so the guard is deliberately not "every public path". A test for
   * the absence, because the tempting generalisation is to reuse `isPublic()`.
   */
  it('does not extend the guard to /api/locale', () => {
    expect(mw).not.toContain("'/api/locale'");
  });

  it('has exactly one place that writes the locale cookie', () => {
    expect(mw.match(/response\.cookies\.set\(LOCALE_COOKIE/g)).toHaveLength(1);
  });

  /**
   * ── THE COOKIES S2 DOES NOT WRITE AND STILL HAS TO REMOVE ───────────────────
   *
   * **`auth()` APPENDS `authjs.csrf-token` AND `authjs.callback-url` AFTER OUR
   * HANDLER RETURNS** (`next-auth/lib/index.js`: `new Response(response?.body,
   * response)` then `headers.append('set-cookie', …)` per cookie its internal
   * session request produced). So a content response left this file with an empty
   * jar and reached the visitor with two cookies in it, and BOTH halves of S-D10
   * were broken: the privacy claim `/privacy` §4.4 makes, and — the half that
   * looked fine — the cache, because a `Set-Cookie` makes a response uncacheable
   * at the edge whatever `Cache-Control` says. `next.config.ts`'s `s-maxage` was
   * measured, correct and inert.
   *
   * The outer wrapper is the only position downstream of that append. Asserted at
   * source level because there is no unit-testable seam: the wrapper's input is a
   * real `auth()` handler, and the behaviour is verified with `curl` (zero
   * `set-cookie` on `/`, `/en`, `/gallery`, `/blog` and the 301; all three still
   * on `/login`).
   */
  it('strips every cookie auth() appends to a content response', () => {
    expect(mw).toMatch(/export default async function middleware\(/);
    expect(mw).toMatch(/response\.headers\.delete\('set-cookie'\)/);
    // The marker must not be observable on the wire.
    expect(mw).toMatch(/response\.headers\.delete\(STRIP_COOKIES\)/);
    expect(mw).toMatch(/const STRIP_COOKIES = 'x-jmt-strip-cookies'/);
  });

  /**
   * **`content.kind !== 'passthrough'` IS THE WHOLE FENCE, AND WIDENING IT BREAKS
   * TWO THINGS AT ONCE.** A signed-in visitor on `/` takes the `passthrough` arm
   * (S-D5: the root is the app for them), so stripping there would drop both the
   * `jmt_locale` sync D6 depends on AND the sliding session cookie, on the busiest
   * screen in the app. `/login` and `/api/auth/*` are `passthrough` too, which is
   * what keeps the csrf token available to the sign-in POST.
   */
  it('marks only a content response, and never a passthrough one', () => {
    const marks = mw.match(/headers\.set\(STRIP_COOKIES/g) ?? [];
    expect(marks).toHaveLength(2); // the 301 arm, and the bare/rewrite arm
    expect(mw).toMatch(/content\.kind !== 'passthrough'\) response\.headers\.set\(STRIP_COOKIES/);
  });

  /**
   * R7. `wallpapers/` must stay in the negative lookahead. Adding
   * `/wallpapers` to `isPublic()` instead returns 200 and leaves middleware
   * running, so the cookie write fires on a ~550KB static response and makes it
   * edge-uncacheable — S-D10 broken on the response where the CDN matters most.
   */
  it('excludes the wallpaper assets from the matcher, not from the gate', () => {
    expect(mw).toContain('wallpapers/');
    expect(code('lib/auth/gate.ts')).not.toContain('wallpapers');
  });
});

/* ------------------------------------------------------------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC)
  .map((path) => ({ path: path.slice(SRC.length + 1), source: readFileSync(path, 'utf8') }))
  .filter((f) => !/\.test\.tsx?$/.test(f.path));

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('nothing hand-writes the prefix', () => {
  /** The two modules allowed to know what the segment looks like. */
  const OWNERS = ['lib/i18n/prefix.ts', 'lib/seo/alternates.ts'];

  it('found the files, so this is not vacuously passing', () => {
    expect(FILES.length).toBeGreaterThan(50);
    for (const owner of OWNERS) {
      expect(FILES.map((f) => f.path)).toContain(owner);
    }
  });

  /**
   * **ONE HELPER EMITS EVERY LOCALE-AWARE URL (S-D15).** Forty-four pages
   * hand-writing `/en/…` is forty-four chances to emit a non-reciprocal
   * `hreflang` pair, which Google discards silently -- the whole tag set stops
   * working and nothing reports it. It is also how CLAUDE.md's rule ("anything
   * reaching for `router.push('/en/...')` is wrong") gets broken inside the app,
   * where D6 still holds.
   */
  it('has no `/en` string literal outside prefix.ts and alternates.ts', () => {
    for (const file of FILES) {
      if (OWNERS.includes(file.path)) continue;
      const hits = [...stripComments(file.source).matchAll(/(['"`])\/en(\/|\1)/g)].map(
        (m) => m[0],
      );
      expect({ [file.path]: hits }).toEqual({ [file.path]: [] });
    }
  });
});

describe('the content-page language control is a server-rendered link (§4.2)', () => {
  const link = code('components/ContentLocaleLink.tsx');

  /**
   * **`next/link` MUST NEVER CROSS THE `/en/` BOUNDARY, AND CRAWLABILITY IS NOT
   * THE REASON** -- `next/link` renders a real `<a href>`. The reason is that a
   * client-side navigation from `/gallery` to `/en/gallery` resolves, AFTER
   * middleware's rewrite, to the same route under the same root layout, so Next
   * does not re-render the layout: `<html lang>` keeps its old value and
   * `LocaleProvider` keeps its old catalog, and the page comes out
   * half-translated with nothing failing anywhere. A full document load is the
   * mechanism and a plain anchor is what performs one.
   */
  it('renders a plain anchor and imports no router', () => {
    expect(link).toMatch(/<a\s/);
    expect(link).not.toContain('next/link');
    expect(link).not.toContain('next/navigation');
  });

  /**
   * A `'use client'` here would ship a hydration bundle to render two anchors on
   * the pages whose TTFB a crawler measures, and `usePathname()` returns the
   * PRE-rewrite path, so the sibling URL would come out `/en/en/gallery`.
   */
  it('is a server component that takes the bare path as a prop', () => {
    expect(link).not.toMatch(/^\s*(['"])use client\1/m);
    expect(link).not.toContain('usePathname');
    expect(link).toMatch(/\{\s*path\s*\}:\s*\{\s*path:\s*string\s*\}/);
    expect(link).toContain('localePath(');
  });

  /**
   * S-D6 and §6.5's catalog row: `events.ts` and the catalogs have ONE owner in
   * v0.4.0 and it is S1, so the cheapest seam S2 can offer is needing nothing.
   * `locale.name.*` and `locale.switch.aria` already exist in both catalogs.
   */
  it('adds no catalog key', () => {
    const keys = [...link.matchAll(/t\(`?'?(locale\.[a-z.]+)/g)].map((m) => m[1]);
    expect(keys).toContain('locale.switch.aria');
    // The interpolated one, `locale.name.${option}`, is asserted by the render
    // path in `localeSwitch.test.ts`'s catalog check for the same two keys.
    expect(link).toContain('locale.name.');
  });

  /** R17: one mount, in S1's shell, so `path` is named once per page. */
  it('is mounted by PublicShell and by nothing else', () => {
    const mounts = FILES.filter(
      (f) => f.path !== 'components/ContentLocaleLink.tsx',
    ).filter((f) => stripComments(f.source).includes('ContentLocaleLink'));
    expect(mounts.map((f) => f.path)).toEqual(['components/PublicShell.tsx']);
  });
});

describe('no client component computes a locale URL', () => {
  const CLIENT = FILES.filter((f) =>
    /^\s*(['"])use client\1/m.test(f.source.split('import')[0]),
  );

  it('found the client components, so this is not vacuously passing', () => {
    expect(CLIENT.length).toBeGreaterThan(8);
  });

  /**
   * **`usePathname()` RETURNS THE PRE-REWRITE PATH, AND THAT IS THE TRAP.** On
   * `/en/gallery` the browser URL stays `/en/gallery` while the rendered route is
   * `/gallery`, so a client component computing a sibling URL from
   * `usePathname()` would build `/en/en/gallery` -- and would disagree with the
   * server about it, which is a hydration mismatch as well as a wrong link.
   *
   * The only correct source of the bare path is the server page, which knows its
   * own route. So `@/lib/i18n/prefix` is server-side only by convention, and this
   * is the convention. (The module itself is pure and client-SAFE; the fence is
   * about correctness, not about bundling.)
   */
  it('lets no client component import @/lib/i18n/prefix', () => {
    for (const file of CLIENT) {
      const imports = [...file.source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(
        (m) => m[1],
      );
      expect({ [file.path]: imports.filter((s) => s.endsWith('/i18n/prefix')) }).toEqual({
        [file.path]: [],
      });
    }
  });
});

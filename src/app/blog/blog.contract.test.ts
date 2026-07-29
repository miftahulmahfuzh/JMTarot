import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The `/blog` subtree, fenced by reading its own source.
 *
 * `/s/[slug]`'s `page.contract.test.ts` is the precedent and the reason it exists at all:
 * *"a client component reaching for a session context renders correct HTML on the server
 * and throws during hydration, so `curl` reports 200 with the reading in the body and the
 * page is dead in a browser."* A source-level fence is crude and it is the check that
 * actually catches somebody adding `currentUser()` at 11pm — which no unit test of a
 * server component can see and which `curl` reports as a success.
 */

const ROOT = join(process.cwd(), 'src/app/blog');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT).map((path) => ({
  path: path.slice(join(process.cwd(), 'src').length + 1),
  source: readFileSync(path, 'utf8'),
}));

/** Comments stripped: a rule that fires on the prose describing the rule gets deleted. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the /blog subtree', () => {
  it('found the files, so nothing below passes vacuously', () => {
    expect(FILES.map((f) => f.path).sort()).toEqual([
      'app/blog/[slug]/not-found.tsx',
      'app/blog/[slug]/page.tsx',
      'app/blog/page.tsx',
    ]);
  });

  it('never reads a session, in any form', () => {
    /*
     * S-D10 and the `/s/` lesson. There is no session on this route, and a page whose
     * output varies by session is a page whose cache key varies by session.
     */
    for (const { path, source } of FILES) {
      for (const forbidden of [
        'currentUser',
        'requireUser',
        'ViewerProvider',
        'useViewer',
        '@/lib/auth',
        'next-auth',
        'auth()',
      ]) {
        expect({ path, forbidden, present: code(source).includes(forbidden) }).toEqual({
          path,
          forbidden,
          present: false,
        });
      }
    }
  });

  it('never reads or writes a cookie (S-D10)', () => {
    /*
     * **`cookies()` IS THE ONE WORTH SPELLING OUT.** The root layout calls `getLocale()`,
     * which reads the cookie as a fallback, and that is accepted (roadmap §10, S-D10). What
     * must not happen is a CONTENT PAGE consulting the jar itself: on a content route the
     * URL wins and is the only input (§4.1), or the page cannot be cached at the edge and
     * cannot be canonicalised. `await getT()` is the sanctioned door.
     */
    for (const { path, source } of FILES) {
      for (const forbidden of ['cookies(', 'Set-Cookie', 'setCookie']) {
        expect({ path, forbidden, present: code(source).includes(forbidden) }).toEqual({
          path,
          forbidden,
          present: false,
        });
      }
    }
  });

  it('never touches the database, a model, or the share subsystem', () => {
    /*
     * The database clause is roadmap §10 made mechanical: three routes already return 500
     * on a database outage instead of 204, and v0.4.0 must not add a fourth. There is no
     * database on this path AT ALL, which makes it true by construction rather than by a
     * try/catch. `@/lib/share` mints 60-bit capability URLs for private artifacts and would
     * manufacture a `noindex` duplicate of a page this release exists to get indexed
     * (S-D8).
     */
    for (const { path, source } of FILES) {
      for (const forbidden of [
        '@/lib/db',
        '@/lib/prompt',
        '@/lib/llm',
        '@/lib/translate',
        '@/lib/share',
        '@/lib/memory',
        '@/lib/persona',
        '/api/share',
      ]) {
        expect({ path, forbidden, present: code(source).includes(forbidden) }).toEqual({
          path,
          forbidden,
          present: false,
        });
      }
    }
  });

  it('uses no dangerouslySetInnerHTML, including for JSON-LD', () => {
    // Roadmap §5 rule 3 and §10. `JsonLd.tsx`'s measured escape is what makes the script
    // tag possible without one — see its header, and reconciliation R1.
    for (const { path, source } of FILES) {
      expect({ path, present: source.includes('dangerouslySetInnerHTML') }).toEqual({
        path,
        present: false,
      });
    }
  });

  it('declares at most one h1 per page and never inside the prose', () => {
    for (const { path, source } of FILES) {
      const count = (code(source).match(/<h1/g) ?? []).length;
      expect({ path, atMostOne: count <= 1 }).toEqual({ path, atMostOne: true });
    }
  });

  it('closes the slug space and bounds its own duration', () => {
    const article = FILES.find((f) => f.path.endsWith('blog/[slug]/page.tsx'))!.source;
    expect(article).toContain('generateStaticParams');
    expect(article).toContain('dynamicParams = false');
    /*
     * `POST /api/locale`'s lesson: Hobby's default is ten seconds and a route that declares
     * neither `runtime` nor `maxDuration` is the route that gets truncated cold. Nothing
     * here is slow; declaring is free, and "very likely enough" is the reasoning that trap
     * punished.
     */
    for (const { path, source } of FILES) {
      if (path.endsWith('not-found.tsx')) continue;
      expect({ path, declared: source.includes('maxDuration') }).toEqual({
        path,
        declared: true,
      });
    }
  });

  it('emits a canonical and hreflang through the ONE helper (S-D15)', () => {
    /*
     * Pages hand-writing three `<link rel="alternate">` tags is a chance per page at a
     * non-reciprocal pair, which Google discards SILENTLY — the whole tag set stops working
     * and nothing reports it.
     */
    for (const { path, source } of FILES) {
      if (!source.includes('generateMetadata')) continue;
      expect({ path, uses: source.includes('contentAlternates') }).toEqual({ path, uses: true });
      expect({ path, handwritten: /rel=["']alternate["']/.test(source) }).toEqual({
        path,
        handwritten: false,
      });
    }
  });

  it('passes the ARTICLE its own locale set, never LOCALES (R2)', () => {
    /*
     * The index legitimately passes `LOCALES`: it is chrome served by one route file that
     * middleware rewrites, so neither address can 404. An ARTICLE must pass
     * `entry.locales`, because an `hreflang` naming a language it was never written in
     * points at a 404 and takes the reciprocal tag with it. Both articles ship in both
     * locales today, which is exactly when somebody simplifies this and nothing fails
     * until the next partial release.
     */
    const article = FILES.find((f) => f.path.endsWith('blog/[slug]/page.tsx'))!.source;
    expect(code(article)).toContain('locales: entry.locales');
    expect(code(article)).not.toContain('locales: LOCALES');
  });

  it('renders the entertainment-only disclaimer on both pages (§8.3)', () => {
    for (const { path, source } of FILES) {
      if (path.endsWith('not-found.tsx')) continue;
      expect({ path, disclaimer: source.includes('common.disclaimer') }).toEqual({
        path,
        disclaimer: true,
      });
    }
  });

  it('sets no noindex, and does not let /s/`s rule spread here (S-D12)', () => {
    for (const { path, source } of FILES) {
      expect({ path, noindex: /index:\s*false|noindex/.test(code(source)) }).toEqual({
        path,
        noindex: false,
      });
    }
  });

  it('filters the index list by locale rather than labelling it', () => {
    // The reciprocity rule at the list level: an `id`-only article listed on `/en/blog` is
    // a link to a 404 in the one place a crawler follows every link on the page.
    const index = FILES.find((f) => f.path.endsWith('blog/page.tsx'))!.source;
    expect(code(index)).toContain('locales.includes(locale)');
  });

  it('builds every internal href through localePath, never by hand', () => {
    /*
     * The `/en` literal is fenced to `@/lib/i18n/prefix` and `alternates.ts` across the
     * codebase; here the failure mode is subtler — a bare `/blog` href on the `/en/blog`
     * page silently drops an English reader into the Indonesian tree, and a client-side
     * `next/link` across that boundary resolves under the same root layout and renders the
     * page half-translated (S2 F9).
     */
    for (const { path, source } of FILES) {
      expect({ path, uses: code(source).includes('localePath') }).toEqual({ path, uses: true });
      expect({ path, literal: /['"`]\/en\//.test(code(source)) }).toEqual({
        path,
        literal: false,
      });
    }
  });

  it('mounts PublicPageViewed rather than hardcoding a referrer_kind', () => {
    /*
     * `referrer_kind` IS THE PROP v0.4.0 IS MEASURED BY — `external` on a page in the
     * sitemap is an organic arrival and `internal` is somebody already here. Both
     * `Landing.tsx` and `/arcana/[slug]` shipped it as the literal `'direct'`, because
     * `TrackView` takes its props from a server component where `document.referrer` does
     * not exist. A constant is worse than a missing prop: it reads as data.
     */
    for (const { path, source } of FILES) {
      if (path.endsWith('not-found.tsx')) continue;
      expect({ path, mounted: source.includes('PublicPageViewed') }).toEqual({
        path,
        mounted: true,
      });
      expect({ path, literal: /referrer_kind/.test(code(source)) }).toEqual({
        path,
        literal: false,
      });
    }
  });

  it('gives the not-found page a path that HAS a document', () => {
    /*
     * `PublicShell` hands its `path` to `ContentLocaleLink`, and `contentAlternates()`
     * THROWS on a path with no document — correct behaviour that would turn this 404 into
     * a 500 if the missing article's own address were passed. `/blog` always exists.
     */
    const nf = FILES.find((f) => f.path.endsWith('not-found.tsx'))!.source;
    expect(code(nf)).toContain('path="/blog"');
    expect(code(nf)).not.toContain('${slug}');
  });
});

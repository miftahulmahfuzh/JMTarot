import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'src', 'app', 'arcana');
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
/*
 * Comments stripped FOR THE NEGATIVE ASSERTIONS. The page's header says at length
 * that `currentUser()` must never be called here, so `not.toContain('currentUser')`
 * against the raw source fails on the sentence forbidding it.
 * `queries/contract.test.ts` records the lesson: a rule that fires on prose
 * describing the rule is a rule people delete.
 */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const SUBTREE = readdirSync(join(DIR, '[slug]'))
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
  .map((f) => ({ f, code: strip(read(join('[slug]', f))) }));

const PAGE = read(join('[slug]', 'page.tsx'));
const CODE = strip(PAGE);

describe('the public arcana page', () => {
  it('reads the files, so nothing below passes vacuously', () => {
    expect(PAGE).toContain('export default async function ArcanaPage');
    expect(CODE).toContain('loreFor');
    expect(SUBTREE.length).toBeGreaterThanOrEqual(3);
  });

  it('NEVER touches the session, across the whole subtree', () => {
    for (const { f, code } of SUBTREE) {
      for (const banned of [
        'currentUser', 'requireUser', 'ViewerProvider', 'useViewer',
        'cookies()', "from '@/lib/auth/", 'getServerSession', 'auth(',
      ]) {
        expect({ f, banned, hit: code.includes(banned) }).toMatchObject({ hit: false });
      }
    }
  });

  it('NEVER reads the database, and therefore cannot 500 on an outage', () => {
    // Roadmap §10's non-negotiable. Three routes already 500 instead of 204 when
    // the database is down; this must not be the fourth, and the way to guarantee
    // that is to have no database on the path rather than a try/catch around one.
    for (const { f, code } of SUBTREE) {
      for (const banned of ["from '@/lib/db", 'drizzle', 'queries/']) {
        expect({ f, banned, hit: code.includes(banned) }).toMatchObject({ hit: false });
      }
    }
  });

  it('NEVER generates anything (S-D7, VD7)', () => {
    for (const { f, code } of SUBTREE) {
      for (const banned of [
        "from '@/lib/llm", "from '@/lib/prompt", "from '@/lib/translate",
        "from '@/lib/persona", '/api/translate', 'translateOrCached',
      ]) {
        expect({ f, banned, hit: code.includes(banned) }).toMatchObject({ hit: false });
      }
    }
  });

  it('NEVER sets a cookie and never mints a share link', () => {
    // S-D10: a Set-Cookie makes the response uncacheable at the edge, and these
    // are the pages whose TTFB a crawler measures. S-D8: `/api/share` mints a
    // 60-bit capability URL for a PRIVATE artifact, requires a session, and would
    // manufacture a `noindex` DUPLICATE of a page we are trying to get indexed.
    for (const { f, code } of SUBTREE) {
      expect({ f, hit: /Set-Cookie|cookies\(\)\.set/i.test(code) }).toMatchObject({ hit: false });
      expect({ f, hit: code.includes('/api/share') }).toMatchObject({ hit: false });
      expect({ f, hit: code.includes("from '@/lib/share") }).toMatchObject({ hit: false });
    }
  });

  it('NEVER uses dangerouslySetInnerHTML anywhere in the subtree', () => {
    // The JSON-LD block is `JsonLd`, which renders a plain text child and lives in
    // `src/components/`. R1 measured the premise the exception was asked for and
    // found it false in both directions; the rule stands unamended.
    for (const { f, code } of SUBTREE) {
      expect({ f, hit: code.includes('dangerouslySetInnerHTML') }).toMatchObject({ hit: false });
    }
  });

  it('emits exactly one <h1> and no heading used for styling', () => {
    const h1s = [...CODE.matchAll(/<h1[\s>]/g)].length;
    expect(h1s).toBe(1);
    // Every other heading in the file is h2 or h3; `Prose` emits only those two.
    expect(CODE).not.toMatch(/<h4|<h5|<h6/);
  });

  it('renders cardMeaning for BOTH orientations, adjacent to the authored prose', () => {
    /*
     * **THE ONLY ENFORCEMENT AVAILABLE FOR ROADMAP §7's HARD CONSTRAINT.** There
     * is no test for semantic agreement between a one-line gloss and four
     * paragraphs, so the page puts them on one screen and a contradiction becomes
     * a reading defect a reviewer meets. Deleting these two lines as "duplication
     * of the lore" is the change this assertion exists to fail.
     */
    expect(CODE).toContain('cardMeaning({ card, reversed: false }');
    expect(CODE).toContain('cardMeaning({ card, reversed: true }');
  });

  it('takes the yes/no verdict from effectiveYesNo, never from the document', () => {
    // `doc.yesno` exists to be ASSERTED against the engine in the lint. The words
    // on screen come from the engine plus the catalog, so they are the same words
    // the app prints after a real yes/no reading, by construction.
    expect(CODE).toContain('effectiveYesNo({ card, reversed: false })');
    expect(CODE).toContain('effectiveYesNo({ card, reversed: true })');
  });

  it('builds canonical and hreflang through the ONE helper (S-D15)', () => {
    expect(CODE).toContain('contentAlternates(');
    // Forty-four pages hand-writing three alternate tags is forty-four chances at
    // a non-reciprocal pair, which Google discards silently.
    expect(CODE).not.toContain('rel="alternate"');
    expect(CODE).not.toContain('hreflang');
    // And no hand-built locale prefix anywhere in the subtree.
    for (const { f, code } of SUBTREE) {
      expect({ f, hit: /['"`]\/en\//.test(code) }).toMatchObject({ hit: false });
    }
  });

  it('passes the locales that ACTUALLY EXIST to the alternates helper (R2)', () => {
    /*
     * **NEVER `LOCALES`.** A `hreflang` pair naming a URL that 404s is
     * non-reciprocal and Google discards the whole set, silently. Today every card
     * has both documents -- which is exactly the state in which somebody
     * "simplifies" this and nothing fails.
     */
    expect(CODE).toContain('localesFor(slug)');
    expect(CODE).not.toMatch(/locales:\s*LOCALES/);
  });

  it('asks for NO robots directive, and adds no x-robots-tag (S-D12)', () => {
    // The default is indexable and that is the point of the release. The trap runs
    // the other way: a broadly-matching header entry silently noindexing the site.
    expect(CODE).not.toContain('noindex');
    expect(CODE).not.toContain('x-robots-tag');
  });

  it('carries the entertainment-only disclaimer (§8.3)', () => {
    expect(CODE).toContain("t('common.disclaimer.long')");
  });

  it('is a 404 at the routing layer for anything outside the twenty-two', () => {
    expect(CODE).toContain('export const dynamicParams = false');
    expect(CODE).toContain('generateStaticParams');
    expect(CODE).toContain('notFound()');
  });

  it('makes `/arcana` a REAL 404 rather than a login redirect (R6)', () => {
    /*
     * **THE ROADMAP CONTRADICTED ITSELF AND RECONCILIATION R6 SETTLED IT.** §3.1
     * wanted a 404; §6.1's negative-control list wanted `/arcana` non-public --
     * and a non-public path inside the matcher is a **302 to `/login`**, which
     * Google reads as a soft 404 on the parent of twenty-two indexed URLs.
     *
     * S4's plan asserted the ABSENCE of this file, because Next 404s an absent
     * route anyway. **That assertion is inverted, not deleted**: R6 answered S1's
     * objection ("widening the allowlist for a path with no page is how isPublic
     * stops being readable") by giving the path a page, so the file existing is
     * the record of the ruling and the absence would read as the ruling being
     * undone.
     */
    const index = join(DIR, 'page.tsx');
    expect(existsSync(index)).toBe(true);
    const code = strip(readFileSync(index, 'utf8'));
    expect(code).toContain('notFound()');
    // It renders nothing at all: no shell, no metadata, no session.
    expect(code).not.toContain('PublicShell');
    expect(code).not.toContain('currentUser');
  });

  it('mounts S1’s share control and hands it the canonical as a PROP', () => {
    /*
     * `siteOrigin()`'s chain reads three variables with no `NEXT_PUBLIC_` prefix,
     * so in a browser bundle it collapses to `http://localhost:3001` and the
     * querent shares a link to their own laptop. And `window.location.href`
     * carries whatever query string a campaign appended, which is not the
     * canonical. The server page already computed the canonical for
     * `<link rel="canonical">`; it passes the same string down.
     *
     * S4 wrote no share control of its own: `PublicShare` is S1's, in the
     * single-definition register, and a second one would be two answers to
     * "what does sharing a public page do".
     */
    expect(CODE).toContain('<PublicShare');
    expect(CODE).toContain('url={canonical}');
    expect(CODE).not.toContain('window.location');
  });

  it('has no client component of its own in the subtree', () => {
    // Everything below this page is either a server component or one of S1's
    // three analytics clients (`TrackView`, `TrackLink`, `PublicShare`), each of
    // which needs no session. A `'use client'` file HERE would be S4 shipping a
    // hydration bundle to the page a stranger reads over mobile data.
    for (const { f, code } of SUBTREE) {
      expect({ f, hit: /^\s*(['"])use client\1/m.test(code) }).toMatchObject({ hit: false });
    }
  });
});

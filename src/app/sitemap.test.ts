import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_URL_SLUGS } from '@/data/deck';

/**
 * **THE BLOG READ IS STUBBED TO `[]`, AND THAT IS TWO ASSERTIONS FOR ONE MOCK.**
 * v0.5.0 / A6, §10.2.
 *
 * The exact-set case below is the fifty NON-BLOG URLs, which come from pure leaves and
 * are unaffected by any database — so this file stays in the `unit` project, with no
 * Docker, exactly as `sitemap.ts` stays a leaf in every sense except one named import.
 *
 * **And the stub IS A6-29's degraded shape.** *"A database failure costs the sitemap its
 * blog rows and never the file"* — the crawler's entry point to fifty-six indexable
 * pages must not 500 to protect the listing of two articles. Every assertion here runs
 * against exactly the output an outage produces, which is the only way that promise is
 * ever exercised. The blog ROWS get an integration case over a seeded fixture.
 */
vi.mock('@/lib/db/client', () => ({ db: {} }));
vi.mock('@/lib/db/queries/blog', () => ({ publishedSitemapRows: async () => [] }));

const sitemapModule = await import('./sitemap');
const sitemap = sitemapModule.default;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
});

const urls = async () => (await sitemap()).map((e) => e.url);

describe('sitemap.xml', () => {
  /**
   * **THE EXACT SET, NOT A SUPERSET.** S3, S4 and S6 each add one line to
   * `SITEMAP_PATHS` and one line here, in the same commit. A `toContain` here
   * would let a workstream add a path without noticing it also has to exist, and
   * a sitemap naming a 404 is an error Search Console reports against the whole
   * file rather than against the row.
   */
  it('lists exactly the FIFTY non-blog routes, with the blog read degraded to []', async () => {
    expect(await urls()).toEqual([
      'https://www.jmtarot.site/',
      'https://www.jmtarot.site/en',
      // R4: one address each, both languages, no `/en/` twin. See the next test.
      'https://www.jmtarot.site/terms',
      'https://www.jmtarot.site/privacy',
      // S3, in the commit that added the page. ONE `SITEMAP_PATHS` entry yields
      // both, because S2 owns the locale expansion.
      'https://www.jmtarot.site/gallery',
      'https://www.jmtarot.site/en/gallery',
      /*
       * S6 added `/blog`; it is one route file that middleware rewrites, so both
       * addresses come out of one entry and neither can 404.
       *
       * **THE FOUR ARTICLE URLs ARE ABSENT HERE AND THAT IS THE POINT** (A6-29). They
       * used to come from `blogEntries()`, a committed registry; they now come from a
       * query, stubbed to `[]` above. **What this case therefore asserts is that a
       * database outage costs the sitemap its two articles and NOTHING ELSE** — the
       * fifty URLs below still ship, which is the whole reason the catch is there. The
       * article rows are asserted in `sitemap.integration.test.ts`.
       */
      'https://www.jmtarot.site/blog',
      'https://www.jmtarot.site/en/blog',
      /*
       * S4's forty-four, spread rather than transcribed. **THE ONE HAND-WRITTEN
       * SLUG TABLE IN THIS REPOSITORY IS IN `urlSlug.test.ts`** and a second copy
       * here would be twenty-two more chances to typo a permanent address --
       * while adding nothing, because the interesting assertion is the COUNT and
       * the ORDER, both of which this expresses.
       */
      ...CARD_URL_SLUGS.flatMap((slug) => [
        `https://www.jmtarot.site/arcana/${slug}`,
        `https://www.jmtarot.site/en/arcana/${slug}`,
      ]),
    ]);
  });

  it('EXCLUDES /s/, /api/, /login and every gated route -- permanently', async () => {
    /*
     * `/s/` is `noindex, nofollow, noarchive` and a 60-bit slug in a sitemap
     * would be publishing the capability itself. `/api/` holds no documents and
     * `/api/events` would have a crawler writing analytics rows.
     *
     * `/login` is excluded for a THIRD reason worth writing down: it is
     * `robots: { index: false }`, and a sitemap entry for a noindex page is a
     * contradiction Google reports as an error.
     *
     * **`/terms` AND `/privacy` USED TO BE IN THIS LIST AND ARE NOT ANY MORE**
     * (R4). Their `noindex` came off in the same commit that added them above:
     * the recorded reason was "an indexed legal page for an app behind auth is
     * noise", and the app stops being behind auth in this release.
     */
    for (const forbidden of [
      '/s/',
      '/api',
      '/history',
      '/account',
      '/onboarding',
      '/login',
      '/thessaly',
      '/margaret',
      '/adrian',
    ]) {
      expect((await urls()).filter((u) => u.includes(forbidden))).toEqual([]);
    }
  });

  it('emits NO article row when the blog read fails, and never throws (A6-29)', async () => {
    /*
     * **THE DEGRADED SHAPE, ASSERTED RATHER THAN PROMISED.** This inverts the rule the
     * PAGES follow (A6-24, where a driver error propagates because a 404 on an
     * indexable URL is a de-indexing event), and the asymmetry is deliberate: a page is
     * one URL, and `sitemap.xml` is the crawler's entry point to fifty-six. A 500 here
     * costs the crawl of `/`, `/en`, `/terms`, `/privacy`, `/gallery` x2 and 44 lore
     * pages **to protect the listing of two articles.**
     *
     * The mock at the top of this file returns `[]` rather than throwing, which is what
     * the catch produces; the integration suite is where a THROWN read is exercised
     * against a real handle.
     */
    expect((await urls()).filter((u) => /\/blog\/./.test(u))).toEqual([]);
    /*
     * **FIFTY-TWO, NOT THE FIFTY R39 QUOTES.** The reconciliation says *"a sitemap that
     * 500s costs the crawl of 54 URLs"* and *"50 of which come from pure leaves"*, and
     * the arithmetic is one entry out: `/` + `/en`, `/terms`, `/privacy`, `/gallery` x2,
     * `/blog` x2 and 44 lore pages is **52** pure-leaf URLs, and the two articles in two
     * locales bring the full file to 56. The ruling is unaffected -- the point was
     * always the ratio -- but the number is quoted in three places and this is the one
     * that is measured.
     */
    expect((await urls()).length).toBe(52);
  });

  it('pairs a LOCALIZED entry with a RECIPROCAL hreflang set including x-default', async () => {
    /*
     * S-D15. Google discards a non-reciprocal `hreflang` set SILENTLY -- the
     * whole set stops working and nothing reports it. Asserted here rather than
     * only in S2's helper because the sitemap is the one place the full graph is
     * visible at once.
     */
    const localized = (await sitemap()).filter((e) => e.alternates?.languages);
    expect(localized.length).toBeGreaterThan(0);
    for (const e of localized) {
      const langs = e.alternates!.languages!;
      expect(Object.keys(langs).sort()).toEqual(['en', 'id', 'x-default']);
      // x-default is the Indonesian URL: `id` is the default and the source
      // language (`## Localization`), and x-default is what a visitor whose
      // language we do not serve should land on.
      expect(langs['x-default']).toBe(langs.id);
      // Reciprocity: both rows of the pair are themselves in the sitemap, so
      // each names the other and neither points at a URL we do not publish.
      expect(await urls()).toContain(langs.id);
      expect(await urls()).toContain(langs.en);
    }
  });

  it('gives an UNLOCALIZED entry no alternates at all (R2)', async () => {
    /*
     * **THE HALF THAT IS EASY TO GET WRONG.** `/terms` and `/privacy` are not
     * content routes: `/en/terms` is not served, so a `hreflang` naming it would
     * point at a 404 and Google would discard THE WHOLE SET -- including the
     * homepage pair above, since a discarded set is discarded per page but the
     * habit is what spreads. One address serving both languages by D6's chain
     * gets no alternates, which is the honest markup for it.
     *
     * A one-entry `languages` map is the tempting middle ground and is worse: it
     * is noise a validator flags, and it is the shape somebody later "completes"
     * by adding the `/en/` URL that does not exist.
     */
    const legal = (await sitemap()).filter((e) => /\/(terms|privacy)$/.test(e.url));
    expect(legal).toHaveLength(2);
    for (const e of legal) expect(e.alternates).toBeUndefined();
    /*
     * And no `/en/` twin was emitted FOR THEM. **This assertion used to be
     * `urls().filter(u => u.includes('/en/'))` against the whole file**, which
     * passed only because the sole localized path was `/`, whose English address
     * is `/en` with no trailing slash. S4's twenty-two `/en/arcana/<slug>` URLs
     * are correct and made it fail -- so it is narrowed to the two paths the test
     * is actually about, rather than relaxed.
     */
    expect((await urls()).filter((u) => /\/en\/(terms|privacy)$/.test(u))).toEqual([]);
  });

  it('is byte-stable across calls', async () => {
    /*
     * `lastModified: new Date()` is the obvious line and it makes every fetch of
     * the sitemap report every page as changed just now, which is a spam signal
     * and destroys the field's only use. A COMMITTED constant is the honest
     * answer: it changes when the content changes, in a diff.
     */
    /*
     * **NOW TWO READS RATHER THAN TWO ARRAY WALKS**, which is why it is awaited. The
     * stability of the blog half comes from `ORDER BY date_published DESC, slug ASC` in
     * SQL and from `LOCALES` ordering the derived set — never from a scan's order — and
     * the integration suite asserts it against real rows.
     */
    expect(JSON.stringify(await sitemap())).toBe(JSON.stringify(await sitemap()));
  });

  it('stays a LEAF in every sense but ONE NAMED IMPORT (S-D11, A6-28, R39)', () => {
    /*
     * This is the highest-traffic, most-cacheable response on the domain and it
     * must not acquire `server-only`, the Drizzle schema or the message catalog.
     * `@/data/**`, `@/lib/seo/origin` and `@/lib/i18n/{locale,prefix}` are
     * permitted -- every one of them is a pure leaf. (Written without the glob: a
     * `*` followed by a slash inside a block comment ends the comment, which cost a
     * parse error here once.)
     *
     * **A-D15 MADE THIS FILE'S CONTENTS A QUERY RESULT WHILE THIS TEST FORBADE
     * `@/lib/db`**, and reconciliation R39 calls that the roadmap's largest single
     * omission. The two halves of the LEAF rule are separable and only one bends:
     *
     *   - *"must not acquire the catalog, the auth stack or the share subsystem"* --
     *     FULLY INTACT, and every one of them is still asserted absent below.
     *   - *"must never 500"* -- preserved by a narrow catch rather than by an
     *     absence (A6-29).
     *
     * So the ban on `@/lib/db` becomes an ALLOWLIST OF TWO SPECIFIERS, named by path
     * exactly as `queries/contract.test.ts` excludes `client.ts` by name rather than
     * loosening the rule. **A SECOND database import fails**, and that is the
     * property worth having: the next person who needs one row from another table
     * has to argue for it here.
     */
    const source = readFileSync(join(process.cwd(), 'src/app/sitemap.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of [
      'server-only',
      '@/lib/db/schema',
      '@/lib/db/queries/admin',
      '@/lib/auth',
      '@/lib/share',
      '@/lib/i18n/catalog',
      '@/lib/i18n/t',
      'next/headers',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    const PERMITTED_DB = ["from '@/lib/db/queries/blog'", "from '@/lib/db/client'"];
    const dbImports = [...code.matchAll(/from '(@\/lib\/db[^']*)'/g)].map((m) => `from '${m[1]}'`);
    expect(dbImports.filter((i) => !PERMITTED_DB.includes(i))).toEqual([]);
    expect(code).toContain("from '@/lib/seo/origin'"); // not vacuous
    expect(code).toContain("from '@/lib/db/queries/blog'"); // nor is the exception
  });

  it('lists no admin URL (v0.5.0 / A1, A-D3)', async () => {
    /*
     * A sitemap entry for a gated page is a sitemap full of 302s, and for THIS
     * subtree it is also publication of a surface whose whole property is that
     * nobody knows it is there. The `EXCLUDES` test above is an exact-set check
     * over today's routes; this one is the substring fence that survives A4, A5
     * and A6 each adding a page.
     */
    for (const url of await urls()) {
      expect(url).not.toContain('/admin');
    }
  });
});

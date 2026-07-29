import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CARD_URL_SLUGS } from '@/data/deck';
import sitemap from './sitemap';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
});

const urls = () => sitemap().map((e) => e.url);

describe('sitemap.xml', () => {
  /**
   * **THE EXACT SET, NOT A SUPERSET.** S3, S4 and S6 each add one line to
   * `SITEMAP_PATHS` and one line here, in the same commit. A `toContain` here
   * would let a workstream add a path without noticing it also has to exist, and
   * a sitemap naming a 404 is an error Search Console reports against the whole
   * file rather than against the row.
   */
  it('lists exactly the routes that exist today', () => {
    expect(urls()).toEqual([
      'https://www.jmtarot.site/',
      'https://www.jmtarot.site/en',
      // R4: one address each, both languages, no `/en/` twin. See the next test.
      'https://www.jmtarot.site/terms',
      'https://www.jmtarot.site/privacy',
      // S3, in the commit that added the page. ONE `SITEMAP_PATHS` entry yields
      // both, because S2 owns the locale expansion.
      'https://www.jmtarot.site/gallery',
      'https://www.jmtarot.site/en/gallery',
      // S6 adds /blog, /en/blog and the articles.
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

  it('EXCLUDES /s/, /api/, /login and every gated route -- permanently', () => {
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
      expect(urls().filter((u) => u.includes(forbidden))).toEqual([]);
    }
  });

  it('pairs a LOCALIZED entry with a RECIPROCAL hreflang set including x-default', () => {
    /*
     * S-D15. Google discards a non-reciprocal `hreflang` set SILENTLY -- the
     * whole set stops working and nothing reports it. Asserted here rather than
     * only in S2's helper because the sitemap is the one place the full graph is
     * visible at once.
     */
    const localized = sitemap().filter((e) => e.alternates?.languages);
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
      expect(urls()).toContain(langs.id);
      expect(urls()).toContain(langs.en);
    }
  });

  it('gives an UNLOCALIZED entry no alternates at all (R2)', () => {
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
    const legal = sitemap().filter((e) => /\/(terms|privacy)$/.test(e.url));
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
    expect(urls().filter((u) => /\/en\/(terms|privacy)$/.test(u))).toEqual([]);
  });

  it('is byte-stable across calls', () => {
    /*
     * `lastModified: new Date()` is the obvious line and it makes every fetch of
     * the sitemap report every page as changed just now, which is a spam signal
     * and destroys the field's only use. A COMMITTED constant is the honest
     * answer: it changes when the content changes, in a diff.
     */
    expect(JSON.stringify(sitemap())).toBe(JSON.stringify(sitemap()));
  });

  it('stays a LEAF (S-D11)', () => {
    /*
     * This is the highest-traffic, most-cacheable response on the domain and it
     * must not acquire `server-only`, the Drizzle schema or the message catalog.
     * `@/data/**`, `@/lib/seo/origin` and `@/lib/i18n/{locale,prefix}` are
     * permitted -- every one of them is a pure leaf -- and the `index.ts` of each
     * `src/content` registry will be, because §5 requires those registries to
     * hold no prose. (Written without the glob: a `*` followed by a slash inside
     * a block comment ends the comment, which cost a parse error here once.)
     */
    const source = readFileSync(join(process.cwd(), 'src/app/sitemap.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of [
      'server-only',
      '@/lib/db',
      '@/lib/auth',
      '@/lib/share',
      '@/lib/i18n/catalog',
      '@/lib/i18n/t',
      'next/headers',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    expect(code).toContain("from '@/lib/seo/origin'"); // not vacuous
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { para, s } from '@/content/blocks';
import type { Block } from '@/content/types';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import { publishedSitemapRows } from '@/lib/db/queries/blog';
import type { Tx } from '@/lib/db/types';
import type { Locale } from '@/lib/i18n/locale';
import { sitemapLanguages } from '@/lib/seo/alternates';

/**
 * **THE BLOG HALF OF `sitemap.test.ts`, WHICH MOVED HERE BECAUSE IT NEEDS ROWS.**
 * v0.5.0 / A6, §10.2, task 16.
 *
 * The unit file keeps the exact set of fifty-two non-blog URLs with the blog read
 * stubbed to `[]` — which is also A6-29's degraded shape, so that mock earns two
 * assertions. What it cannot check is the part A-D15 made dangerous: **that publishing
 * and unpublishing move the sitemap's rows, its `hreflang` sets and its per-URL
 * `lastModified` in the same request, from one source.**
 *
 * ── `sitemap()` ITSELF IS NOT CALLED HERE, AND THAT IS DELIBERATE ──────────
 *
 * It imports `@/lib/db/client`, which is `server-only` and reads `DATABASE_URL` — the
 * app's connection, not the harness's. Calling it would either need a second mock (in
 * which case the rows are fake again) or would write nothing and read the DEV database
 * from the test suite. So this drives `publishedSitemapRows` against the rolled-back
 * handle and then feeds `sitemapLanguages()` exactly what `sitemap.ts` feeds it. **The
 * one thing that is asserted rather than exercised is the twelve-line `blogPaths()`
 * mapping**, and `sitemap.test.ts`'s LEAF case reads that file's source.
 */

const body: Block[] = [para(s('Satu kalimat.'))];
const ORIGIN = 'https://www.jmtarot.site';

async function seed(
  tx: Tx,
  slug: string,
  locales: { locale: Locale; status: string }[],
  datePublished = '2026-07-29',
): Promise<void> {
  const [post] = await tx
    .insert(blogPosts)
    .values({ slug, datePublished })
    .returning({ id: blogPosts.id });
  for (const l of locales) {
    await tx.insert(blogPostLocales).values({
      postId: post.id,
      locale: l.locale,
      status: l.status,
      title: `${slug} ${l.locale}`,
      description: `deskripsi ${slug}`,
      body,
    });
  }
}

afterAll(closeTestDb);

describe('the blog rows in the sitemap', () => {
  it('emits both addresses and a per-locale lastModified for a bilingual article', async () => {
    /*
     * **§10.3, AND IT DISCHARGES A LOSS `sitemap.ts` RECORDED ON PURPOSE.** The old note
     * read: *"`lastModified` STAYS `CONTENT_UPDATED_AT` … worth revisiting the day an
     * article is edited without a release."* A6 is that day.
     */
    await withRollback(async (tx) => {
      await seed(tx, 'apa-itu-tarot', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'published' },
      ]);
      const [row] = await publishedSitemapRows(tx);
      expect(row.locales).toEqual(['id', 'en']);
      expect(Object.keys(row.lastModifiedFor).sort()).toEqual(['en', 'id']);

      const langs = sitemapLanguages(ORIGIN, `/blog/${row.slug}`, row.locales);
      expect(Object.keys(langs).sort()).toEqual(['en', 'id', 'x-default']);
      expect(langs['x-default']).toBe(langs.id);
      expect(langs.id).toBe(`${ORIGIN}/blog/apa-itu-tarot`);
      expect(langs.en).toBe(`${ORIGIN}/en/blog/apa-itu-tarot`);
    });
  });

  it('drops the `en` URL and the whole hreflang set when `en` is unpublished (A-D15)', async () => {
    /*
     * **A ONE-LOCALE PATH GETS `null` RATHER THAN A ONE-ENTRY SET**, which is
     * `entriesFor`'s rule: *"a `hreflang` naming only the page you are already on is
     * noise a validator flags, and it is the shape somebody later completes by adding
     * an `en` URL that does not exist."* Here the derived set has length 1, so
     * `sitemap.ts` emits no `alternates` at all.
     */
    await withRollback(async (tx) => {
      await seed(tx, 'apa-itu-tarot', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'unpublished' },
      ]);
      const [row] = await publishedSitemapRows(tx);
      expect(row.locales).toEqual(['id']);
      expect(row.locales.length > 1).toBe(false);
    });
  });

  it('removes the article ENTIRELY when the last locale is unpublished', async () => {
    // §8.2's last row: absent from the sitemap, not present-with-no-alternates.
    await withRollback(async (tx) => {
      await seed(tx, 'apa-itu-tarot', [{ locale: 'id', status: 'unpublished' }]);
      expect(await publishedSitemapRows(tx)).toEqual([]);
    });
  });

  it('shows a draft in NO sitemap row (the negative control A-D15 asks for)', async () => {
    await withRollback(async (tx) => {
      await seed(tx, 'sebuah-draf', [{ locale: 'id', status: 'draft' }]);
      expect(await publishedSitemapRows(tx)).toEqual([]);
    });
  });

  it('is byte-stable across two reads, which is now two QUERIES', async () => {
    /*
     * `sitemap.test.ts`'s rule, at the half that acquired a database. A row order that
     * came from a scan would fail this intermittently and churn a crawl for nothing;
     * `ORDER BY date_published DESC, slug ASC` and the `LOCALES`-ordered derived set are
     * what make it deterministic.
     */
    await withRollback(async (tx) => {
      await seed(tx, 'what-tarot-is', [{ locale: 'id', status: 'published' }]);
      await seed(tx, 'how-to-read-tarot', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'published' },
      ]);
      await seed(tx, 'lebih-lama', [{ locale: 'id', status: 'published' }], '2026-01-01');
      const a = await publishedSitemapRows(tx);
      const b = await publishedSitemapRows(tx);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.map((r) => r.slug)).toEqual(['how-to-read-tarot', 'what-tarot-is', 'lebih-lama']);
    });
  });

  it('gives every emitted URL a reciprocal set, or none at all', async () => {
    /*
     * The graph-level assertion `sitemap.test.ts` makes over the whole file, applied to
     * the rows that now come from a query. **Google discards a non-reciprocal set
     * silently** — the whole set, not the broken edge — so this is the property that
     * fails invisibly if the derived locale set and the emitted URLs ever disagree.
     */
    await withRollback(async (tx) => {
      await seed(tx, 'dua', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'published' },
      ]);
      await seed(tx, 'satu', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'draft' },
      ]);
      const rows = await publishedSitemapRows(tx);
      const emitted = new Set(
        rows.flatMap((r) =>
          r.locales.map((l) =>
            l === 'id' ? `${ORIGIN}/blog/${r.slug}` : `${ORIGIN}/${l}/blog/${r.slug}`,
          ),
        ),
      );
      for (const r of rows) {
        if (r.locales.length < 2) continue;
        const langs = sitemapLanguages(ORIGIN, `/blog/${r.slug}`, r.locales);
        for (const [tag, url] of Object.entries(langs)) {
          expect({ slug: r.slug, tag, published: emitted.has(url) }).toEqual({
            slug: r.slug,
            tag,
            published: true,
          });
        }
      }
      expect(emitted.size).toBe(3);
    });
  });
});

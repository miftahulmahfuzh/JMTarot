import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { para, s } from '@/content/blocks';
import type { Block } from '@/content/types';
import { isReachable, type BlogStatus } from '@/lib/content/blogStatus';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import {
  loadArticle,
  publishedArticles,
  publishedLocales,
  publishedSitemapRows,
  publishedSlugs,
} from './blog';

/**
 * The public reads, against a real Postgres.
 *
 * **THE ONE THING THIS FILE IS FOR: A DRAFT, AN UNPUBLISHED ROW AND A
 * PUBLISHED-WITH-EMPTY-BODY ROW ARE INVISIBLE TO ALL FIVE FUNCTIONS.** A6-6 puts the
 * predicate in a `WHERE` clause rather than in TypeScript *because a caller that
 * forgets the filter is exactly the shape that ships* -- and the only instrument that
 * can see a forgotten `WHERE` is a database.
 *
 * The second is A6-7 / R42, which is the release's most dangerous interaction:
 * **`en` published with `id` not published must be NOT FOUND in both trees**, or
 * `contentAlternates()` throws and a URL in the sitemap 500s.
 */

const body: Block[] = [para(s('Satu kalimat yang cukup panjang untuk dihitung.'))];

async function seed(
  tx: Tx,
  slug: string,
  datePublished: string | null,
  locales: { locale: Locale; status: BlogStatus; body?: Block[]; title?: string }[],
): Promise<string> {
  const [post] = await tx.insert(blogPosts).values({ slug, datePublished }).returning({ id: blogPosts.id });
  for (const l of locales) {
    await tx.insert(blogPostLocales).values({
      postId: post.id,
      locale: l.locale,
      status: l.status,
      title: l.title ?? `${slug} ${l.locale}`,
      description: `deskripsi ${slug} ${l.locale}`,
      body: l.body ?? body,
    });
  }
  return post.id;
}

afterAll(closeTestDb);

describe('published-only, in SQL (A6-6)', () => {
  it('hides a draft, an unpublished row and a published EMPTY body from all five reads', async () => {
    await withRollback(async (tx) => {
      await seed(tx, 'sebuah-draf', null, [{ locale: 'id', status: 'draft' }]);
      await seed(tx, 'sudah-ditarik', '2026-01-01', [{ locale: 'id', status: 'unpublished' }]);
      /*
       * **THE THIRD IS THE ONE A TYPESCRIPT FILTER WOULD MISS.** A-D15: *"a published
       * `en` with no body, or a body that fails the lint, must be unreachable -- the
       * `locales` set is derived from published rows THAT HAVE A BODY, never from an
       * intent field."* zod refuses an empty body on save, so this row can only exist
       * through `db:studio` -- which is precisely the path the SQL predicate defends.
       */
      await seed(tx, 'kosong', '2026-01-01', [{ locale: 'id', status: 'published', body: [] }]);

      expect(await publishedArticles(tx, 'id')).toEqual([]);
      expect(await publishedLocales(tx, 'sebuah-draf')).toEqual([]);
      expect(await publishedLocales(tx, 'sudah-ditarik')).toEqual([]);
      expect(await publishedLocales(tx, 'kosong')).toEqual([]);
      expect(await loadArticle(tx, 'sebuah-draf', 'id')).toBeNull();
      expect(await loadArticle(tx, 'sudah-ditarik', 'id')).toBeNull();
      expect(await loadArticle(tx, 'kosong', 'id')).toBeNull();
      expect(await publishedSitemapRows(tx)).toEqual([]);
      expect(await publishedSlugs(tx)).toEqual([]);
    });
  });

  it('does not raise on a body that is not an array at all', async () => {
    // `jsonb_array_length` RAISES on a non-array, and a 500 on `/blog` for one
    // hand-edited row is worse than that row being invisible. `jsonb_typeof` guards it.
    await withRollback(async (tx) => {
      const [post] = await tx
        .insert(blogPosts)
        .values({ slug: 'rusak' })
        .returning({ id: blogPosts.id });
      await tx.insert(blogPostLocales).values({
        postId: post.id,
        locale: 'id',
        status: 'published',
        title: 't',
        description: 'd',
        body: { kind: 'not-an-array' } as unknown as Block[],
      });
      expect(await publishedArticles(tx, 'id')).toEqual([]);
    });
  });

  it('returns a published article, with its facts', async () => {
    await withRollback(async (tx) => {
      await seed(tx, 'apa-itu-tarot', '2026-07-29', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'published' },
      ]);
      const loaded = await loadArticle(tx, 'apa-itu-tarot', 'en');
      expect(loaded).not.toBeNull();
      expect(loaded!.doc.slug).toBe('apa-itu-tarot');
      expect(loaded!.doc.locale).toBe('en');
      expect(loaded!.facts.datePublished).toBe('2026-07-29');
      expect(loaded!.facts.locales).toEqual(['id', 'en']);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(loaded!.facts.dateModified)).toBe(true);
    });
  });
});

describe('A6-7 / R42 — publishing `en` first must not reach a page', () => {
  it('is NOT FOUND in both trees when `id` is not published', async () => {
    /*
     * **`contentAlternates()` THROWS WITHOUT AN `id` DOCUMENT** -- deliberately, per
     * R2 of v0.4.0, because a wrong canonical de-indexes the correct page -- so the
     * symptom of getting this wrong is a 500 on a URL that is in the sitemap.
     * `canTransition` refuses the transition; this is the SECOND defence, and it is
     * the one that holds when the state is reached another way. This test writes the
     * rows directly, which is exactly that other way.
     */
    await withRollback(async (tx) => {
      await seed(tx, 'inggris-duluan', '2026-07-29', [
        { locale: 'id', status: 'draft' },
        { locale: 'en', status: 'published' },
      ]);
      expect(await loadArticle(tx, 'inggris-duluan', 'en')).toBeNull();
      expect(await loadArticle(tx, 'inggris-duluan', 'id')).toBeNull();
      expect(await publishedLocales(tx, 'inggris-duluan')).toEqual([]);
      expect(await publishedArticles(tx, 'en')).toEqual([]);
      expect(await publishedSitemapRows(tx)).toEqual([]);
    });
  });

  it('A6-22 — unpublishing `id` takes the `en` URL with it, by derivation', async () => {
    await withRollback(async (tx) => {
      const postId = await seed(tx, 'dua-bahasa', '2026-07-29', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'published' },
      ]);
      expect(await publishedLocales(tx, 'dua-bahasa')).toEqual(['id', 'en']);

      await tx
        .update(blogPostLocales)
        .set({ status: 'unpublished' })
        .where(and(eq(blogPostLocales.postId, postId), eq(blogPostLocales.locale, 'id')));

      /*
       * The `en` ROW still says `published`, and that is correct: it records what
       * the admin asked for, and re-publishing `id` restores it without a second
       * decision. Cascading the write instead is V7's *"two kinds of stop sharing"*
       * problem. The derivation is the safe direction because the derived answer is
       * LESS public rather than more.
       */
      expect(await publishedLocales(tx, 'dua-bahasa')).toEqual([]);
      expect(await loadArticle(tx, 'dua-bahasa', 'en')).toBeNull();
      expect(await publishedArticles(tx, 'en')).toEqual([]);
    });
  });
});

describe('unpublishing one locale leaves the other alone', () => {
  it('removes `en` from every derived set and keeps `id` serving', async () => {
    await withRollback(async (tx) => {
      await seed(tx, 'satu-bahasa-saja', '2026-07-29', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'unpublished' },
      ]);
      expect(await publishedLocales(tx, 'satu-bahasa-saja')).toEqual(['id']);
      expect(await loadArticle(tx, 'satu-bahasa-saja', 'en')).toBeNull();
      expect((await loadArticle(tx, 'satu-bahasa-saja', 'id'))!.facts.locales).toEqual(['id']);
      expect((await publishedArticles(tx, 'en')).map((a) => a.slug)).toEqual([]);
      expect((await publishedArticles(tx, 'id')).map((a) => a.slug)).toEqual(['satu-bahasa-saja']);
      const rows = await publishedSitemapRows(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].locales).toEqual(['id']);
      expect(Object.keys(rows[0].lastModifiedFor)).toEqual(['id']);
    });
  });
});

describe('the SQL predicate and `isReachable()` agree on every combination', () => {
  /**
   * **TWO SPELLINGS OF ONE PREDICATE, TAKEN KNOWINGLY, AND THIS IS THE FENCE.**
   * `queries/blog.ts` must filter in `WHERE` (A6-6); the admin editor must explain
   * the state without issuing a second query per row. `blogStatus.isReachable()` is
   * the second spelling and this case is what stops the two drifting.
   */
  it('matches for every (locale, status, idStatus)', async () => {
    const statuses: BlogStatus[] = ['draft', 'published', 'unpublished'];
    await withRollback(async (tx) => {
      for (const idStatus of statuses) {
        for (const enStatus of statuses) {
          const slug = `matriks-${idStatus}-${enStatus}`;
          await seed(tx, slug, '2026-07-29', [
            { locale: 'id', status: idStatus },
            { locale: 'en', status: enStatus },
          ]);
          const live = await publishedLocales(tx, slug);
          for (const locale of LOCALES) {
            const status = locale === 'id' ? idStatus : enStatus;
            expect(
              { locale, idStatus, enStatus, sql: live.includes(locale) },
              `${locale} id=${idStatus} en=${enStatus}`,
            ).toEqual({
              locale,
              idStatus,
              enStatus,
              sql: isReachable(locale, status, idStatus),
            });
          }
        }
      }
    });
  });
});

describe('ordering is in SQL, and the tie-break is not cosmetic', () => {
  it('orders newest first, then by slug, on a shared publication date', async () => {
    /*
     * Both launch articles published on the same day, and `Array.prototype.sort` is
     * only stable within one engine's implementation of one array -- **a sitemap
     * whose row order changes between builds churns a crawl for nothing.**
     */
    await withRollback(async (tx) => {
      await seed(tx, 'what-tarot-is', '2026-07-29', [{ locale: 'id', status: 'published' }]);
      await seed(tx, 'how-to-read-tarot', '2026-07-29', [{ locale: 'id', status: 'published' }]);
      await seed(tx, 'lebih-lama', '2026-01-01', [{ locale: 'id', status: 'published' }]);
      expect((await publishedArticles(tx, 'id')).map((a) => a.slug)).toEqual([
        'how-to-read-tarot',
        'what-tarot-is',
        'lebih-lama',
      ]);
      expect((await publishedSitemapRows(tx)).map((r) => r.slug)).toEqual([
        'how-to-read-tarot',
        'what-tarot-is',
        'lebih-lama',
      ]);
    });
  });

  it('gives the sitemap a per-locale lastModified (§10.3)', async () => {
    await withRollback(async (tx) => {
      await seed(tx, 'dua-tanggal', '2026-07-29', [
        { locale: 'id', status: 'published' },
        { locale: 'en', status: 'published' },
      ]);
      const [row] = await publishedSitemapRows(tx);
      expect(row.locales).toEqual(['id', 'en']);
      for (const l of row.locales) {
        expect(/^\d{4}-\d{2}-\d{2}$/.test(row.lastModifiedFor[l]!), l).toBe(true);
      }
    });
  });
});

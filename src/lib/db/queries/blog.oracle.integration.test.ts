import { afterAll, describe, expect, it } from 'vitest';
import { BLOG_ARTICLES } from '@/content/blog';
import { blogPostingNode } from '@/lib/seo/blog';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { loadArticle } from './blog';

/**
 * **§13.3 LAYER 2: THE IMPORT ORACLE, THROUGH A REAL DATABASE.**
 * v0.5.0 / A6, task 11's acceptance, and it expires with the registry (R46).
 *
 * Layer 1 (`src/lib/content/blog.import.test.ts`) proves the TRANSFORM is lossless with
 * no database on its path. Layer 3 is `curl` before and after, which is the real
 * byte-identity check and the cheap one. **This is the middle one: a row written the way
 * `scripts/blog-import.ts` writes it, read back through `loadArticle`, deep-equal to the
 * committed document — and `blogPostingNode` built from each, deep-equal to the other.**
 * That one comparison covers `headline`, `description`, `datePublished`, `dateModified`,
 * `wordCount` and the `#hero` `ImageObject` at once.
 *
 * ── THE FINDING THIS FILE EXISTS TO RECORD: `jsonb` REORDERS KEYS ──────────
 *
 * The obvious form of this check is the one layer 1 uses — hash
 * `[title, description, hero, body]` and compare against the four committed twelve-hex
 * strings. **Run against a ROW it fails on all four, including three that were never
 * touched.** `jsonb` is not text: Postgres parses it, **normalises object key order**
 * (by key length, then bytewise), drops duplicate keys and canonicalises numbers. So
 * `JSON.stringify(row.body)` is a different STRING from `JSON.stringify(doc.body)` while
 * being the same VALUE.
 *
 * That is why §13.3 layer 1 is a unit test over the transform and layer 2 is
 * `toEqual` — **deep equality, never a hash.** Recorded because the hash is the obvious
 * thing to reach for here, it fails, and the conclusion somebody draws from a failing
 * oracle is that the migration was lossy. It was not: **layer 3 diffed the rendered HTML
 * of all six blog URLs before and after the rewire and found them byte-identical**,
 * which is the only claim that matters — `Prose` reads fields by name and key order is
 * not a fact about a document.
 *
 * **A future check over `body` must not be a hash either.** If one is ever wanted, it
 * has to canonicalise key order first, and at that point it is a slower `toEqual`.
 */

afterAll(closeTestDb);

/** Exactly what `scripts/blog-import.ts` writes, minus the guard and the reporting. */
async function importInto(tx: Tx): Promise<void> {
  for (const entry of BLOG_ARTICLES) {
    const [post] = await tx
      .insert(blogPosts)
      .values({ slug: entry.slug, datePublished: entry.datePublished })
      .returning({ id: blogPosts.id });
    for (const locale of entry.locales) {
      const doc = entry.docs[locale]!;
      await tx.insert(blogPostLocales).values({
        postId: post.id,
        locale,
        status: 'published',
        title: doc.title,
        description: doc.description,
        heroCardSlug: doc.hero?.cardUrlSlug ?? null,
        heroAlt: doc.hero?.alt ?? null,
        body: doc.body,
        updatedAt: new Date(`${entry.revisions[locale]!.dateModified}T00:00:00.000Z`),
      });
    }
  }
}

describe('the imported rows are the committed documents', () => {
  it('round-trips every document to DEEP EQUALITY through `loadArticle`', async () => {
    await withRollback(async (tx) => {
      await importInto(tx);
      for (const entry of BLOG_ARTICLES) {
        for (const locale of entry.locales) {
          const loaded = await loadArticle(tx, entry.slug, locale);
          expect(loaded, `${entry.slug}.${locale}`).not.toBeNull();
          /*
           * **`toEqual`, NOT A HASH.** See the header: `jsonb` normalises key order, so
           * the four committed `bodyHash` values cannot match a row and their failing
           * would mean nothing. Deep equality is the property `Prose` actually depends
           * on — it reads fields by name.
           */
          expect(loaded!.doc, `${entry.slug}.${locale}`).toEqual(entry.docs[locale]!);
        }
      }
    });
  });

  it('carries the COMMITTED dates, not the clock (A6-33)', async () => {
    /*
     * An import that let the defaults fire would move `BlogPosting.dateModified` on four
     * indexed pages to the day we migrated, and `sitemap.xml`'s `lastModified` with it —
     * **announcing to every crawler that four articles changed when not one word did.**
     */
    await withRollback(async (tx) => {
      await importInto(tx);
      for (const entry of BLOG_ARTICLES) {
        const loaded = await loadArticle(tx, entry.slug, 'id');
        expect(loaded!.facts).toEqual({
          slug: entry.slug,
          datePublished: '2026-07-29',
          dateModified: '2026-07-29',
          locales: entry.locales,
        });
      }
    });
  });

  it('builds a `BlogPosting` node from the row identical to the registry’s', async () => {
    /*
     * One comparison covering `headline`, `description`, `datePublished`, `dateModified`,
     * `wordCount`, `inLanguage`, `isPartOf`, `author`, `publisher` and the `#hero`
     * `ImageObject` — including that the image URL carries **no `?v=`**, because in
     * structured data a query string is part of the image's identity and a version there
     * orphans 22 indexed images on every art regeneration.
     */
    const ORIGIN = 'https://www.jmtarot.site';
    await withRollback(async (tx) => {
      await importInto(tx);
      for (const entry of BLOG_ARTICLES) {
        for (const locale of entry.locales) {
          const loaded = await loadArticle(tx, entry.slug, locale);
          const canonical =
            locale === 'id'
              ? `${ORIGIN}/blog/${entry.slug}`
              : `${ORIGIN}/${locale}/blog/${entry.slug}`;

          const fromRow = blogPostingNode({
            origin: ORIGIN,
            doc: loaded!.doc,
            article: loaded!.facts,
            locale,
            canonical,
          });
          const fromRegistry = blogPostingNode({
            origin: ORIGIN,
            doc: entry.docs[locale]!,
            article: {
              slug: entry.slug,
              datePublished: entry.datePublished,
              dateModified: entry.revisions[locale]!.dateModified,
              locales: entry.locales,
            },
            locale,
            canonical,
          });
          expect(fromRow, `${entry.slug}.${locale}`).toEqual(fromRegistry);
          expect(JSON.stringify(fromRow)).not.toContain('?v=');
        }
      }
    });
  });

  it('is visible in exactly both locales, in both trees', async () => {
    await withRollback(async (tx) => {
      await importInto(tx);
      for (const entry of BLOG_ARTICLES) {
        const loaded = await loadArticle(tx, entry.slug, 'en');
        expect(loaded!.facts.locales, entry.slug).toEqual(['id', 'en']);
      }
    });
  });
});

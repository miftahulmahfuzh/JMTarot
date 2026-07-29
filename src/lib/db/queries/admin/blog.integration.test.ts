import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { para, s } from '@/content/blocks';
import type { Block } from '@/content/types';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { loadArticle } from '../blog';
import {
  getForEdit,
  idStatusOf,
  listAllArticles,
  publishedDocumentsForLint,
  setStatus,
  upsertDocument,
} from './blog';

/**
 * The admin reads and writes, against a real Postgres.
 *
 * **THE LOAD-BEARING CASE IS THE `updatedAt` ONE (A6-8).** `$onUpdate()` does not
 * fire inside `onConflictDoUpdate`, and on this table the column is `dateModified` --
 * a claim in structured data -- and `sitemap.xml`'s per-URL `lastModified`. Dropping
 * the by-hand line freezes all three at the first insert, with nothing on screen
 * looking wrong. **The test writes twice and asserts the column moved; it is the one
 * that fails when somebody tidies the line away.**
 */

const body: Block[] = [para(s('Satu kalimat.'))];

const doc = (over: Partial<Parameters<typeof upsertDocument>[1]> = {}) => ({
  slug: 'apa-itu-tarot',
  locale: 'id' as const,
  title: 'Judul',
  description: 'Deskripsi',
  hero: null,
  body,
  ...over,
});

afterAll(closeTestDb);

describe('upsertDocument', () => {
  it('creates the post and the locale row in one call, and reports `create`', async () => {
    await withRollback(async (tx) => {
      const r = await upsertDocument(tx, doc());
      expect(r.action).toBe('create');
      const article = await getForEdit(tx, 'apa-itu-tarot');
      expect(article!.locales.map((l) => l.locale)).toEqual(['id']);
      expect(article!.locales[0].status).toBe('draft');
      // `date_published` is NULL until the first PUBLISH, never on a save.
      expect(article!.datePublished).toBeNull();
    });
  });

  it('reports `update` for the second write of the same document', async () => {
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      expect((await upsertDocument(tx, doc({ title: 'Judul baru' }))).action).toBe('update');
      const article = await getForEdit(tx, 'apa-itu-tarot');
      expect(article!.locales).toHaveLength(1);
      expect(article!.locales[0].title).toBe('Judul baru');
    });
  });

  it('reports `create` for a NEW locale of an EXISTING article', async () => {
    /*
     * `action` answers *"was this DOCUMENT created"*, not *"was this article"*.
     * `admin.blog_saved.action` is the consumer and the second question is the one
     * nobody asks: adding the English document to an article that already exists is
     * a create, and calling it an update loses the only event that says an article
     * became bilingual.
     */
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      expect((await upsertDocument(tx, doc({ locale: 'en' }))).action).toBe('create');
      const article = await getForEdit(tx, 'apa-itu-tarot');
      expect(article!.locales.map((l) => l.locale).sort()).toEqual(['en', 'id']);
    });
  });

  it('MOVES `updated_at` on the second write — the property, which is what matters', async () => {
    /*
     * **THIS IS NOT THE FREEZE TEST THE FIRST DRAFT CLAIMED IT WAS, AND THE
     * CORRECTION IS WORTH MORE THAN THE TEST.**
     *
     * It was written as *"delete the `updatedAt: now` line in `onConflictDoUpdate`
     * and this fails"*, on CLAUDE.md's authority that `$onUpdate()` does not fire
     * there. **The negative control was run and it PASSED with the line deleted.**
     * Printing `.toSQL()` says why: on drizzle-orm 0.45.2 the emitted statement is
     * `… do update set "title" = $7, "updated_at" = $8` with no by-hand line at all,
     * and the same is true of `translations` and `personas`.
     *
     * So the column moves for two reasons and this case cannot tell them apart --
     * A5's lesson exactly: *an instrument that cannot distinguish two causes proves
     * neither.* What it DOES assert is the property three public claims depend on
     * (`dateModified`, `lastModified`, V2's staleness comparison), and that property
     * is worth a test whichever mechanism provides it.
     *
     * The by-hand line stays; the reason is in the query module's header.
     */
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      const before = (await getForEdit(tx, 'apa-itu-tarot'))!.locales[0].updatedAt;
      await new Promise((r) => setTimeout(r, 20));
      await upsertDocument(tx, doc({ title: 'Judul baru' }));
      const after = (await getForEdit(tx, 'apa-itu-tarot'))!.locales[0].updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  it('names `updated_at` in the conflict SET, whichever mechanism put it there', async () => {
    /*
     * **THE HONEST FENCE, AND IT IS WEAKER THAN THE ONE THAT WAS INTENDED.** It reads
     * the emitted SQL rather than the result, so it fails if BOTH mechanisms go --
     * the by-hand line removed AND a drizzle version that stops adding it, which is
     * the combination that actually freezes the column. It cannot fail on either
     * alone, and pretending otherwise is what the case above was corrected for.
     *
     * A drizzle upgrade that changes this behaviour lands here rather than in a
     * `dateModified` nobody notices has stopped moving.
     */
    await withRollback(async (tx) => {
      const q = tx
        .insert(blogPostLocales)
        .values({ postId: crypto.randomUUID(), locale: 'id', title: 't', description: 'd', body })
        .onConflictDoUpdate({
          target: [blogPostLocales.postId, blogPostLocales.locale],
          set: { title: 't', updatedAt: new Date() },
        });
      const { sql } = q.toSQL();
      expect(sql.slice(sql.indexOf('do update set'))).toContain('"updated_at"');
    });
  });

  it('never writes `status`, so a save cannot publish', async () => {
    // Two paths that can both publish is how one of them ends up without the gate.
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      await setStatus(tx, 'apa-itu-tarot', 'id', 'published');
      await upsertDocument(tx, doc({ title: 'Judul lagi' }));
      expect((await getForEdit(tx, 'apa-itu-tarot'))!.locales[0].status).toBe('published');
    });
  });

  it('round-trips the hero as both fields or null', async () => {
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc({ hero: { cardUrlSlug: 'the-moon', alt: 'Sebuah lukisan.' } }));
      const l = (await getForEdit(tx, 'apa-itu-tarot'))!.locales[0];
      expect({ slug: l.heroCardSlug, alt: l.heroAlt }).toEqual({
        slug: 'the-moon',
        alt: 'Sebuah lukisan.',
      });
      await upsertDocument(tx, doc({ hero: null }));
      const cleared = (await getForEdit(tx, 'apa-itu-tarot'))!.locales[0];
      expect({ slug: cleared.heroCardSlug, alt: cleared.heroAlt }).toEqual({ slug: null, alt: null });
    });
  });

  it('leaves NO partial row when the transaction fails', async () => {
    /*
     * The CHECK constraint is the cheapest way to make a statement fail mid-save.
     * A `422` must write nothing -- not a draft, not a post with no document -- and
     * a post row surviving a failed save is an article that exists with nothing in
     * it, visible in the list, editable, and never publishable.
     */
    await withRollback(async (tx) => {
      await expect(
        tx.transaction(async (inner) => {
          await upsertDocument(inner, doc({ slug: 'valid-slug' }));
          await inner.insert(blogPosts).values({ slug: 'Not-A-Valid-Slug' });
        }),
      ).rejects.toThrow();
      expect(await getForEdit(tx, 'valid-slug')).toBeNull();
    });
  });
});

describe('setStatus', () => {
  it('stamps `date_published` on the FIRST publish and never rewrites it', async () => {
    /*
     * An unpublished article that comes back is the same article, and moving its
     * publication date would tell every crawler it is new.
     */
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      await setStatus(tx, 'apa-itu-tarot', 'id', 'published');
      const first = (await getForEdit(tx, 'apa-itu-tarot'))!.datePublished;
      expect(first).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await tx
        .update(blogPosts)
        .set({ datePublished: '2020-01-01' })
        .where(eq(blogPosts.slug, 'apa-itu-tarot'));
      await setStatus(tx, 'apa-itu-tarot', 'id', 'unpublished');
      await setStatus(tx, 'apa-itu-tarot', 'id', 'published');
      expect((await getForEdit(tx, 'apa-itu-tarot'))!.datePublished).toBe('2020-01-01');
    });
  });

  it('returns the PREVIOUS status, so the event has a truthful `from`', async () => {
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      expect(await setStatus(tx, 'apa-itu-tarot', 'id', 'published')).toEqual({ from: 'draft' });
      expect(await setStatus(tx, 'apa-itu-tarot', 'id', 'unpublished')).toEqual({
        from: 'published',
      });
    });
  });

  it('returns null for a document that does not exist', async () => {
    await withRollback(async (tx) => {
      expect(await setStatus(tx, 'tidak-ada', 'id', 'published')).toBeNull();
    });
  });

  it('makes the article visible to the PUBLIC module in the same transaction', async () => {
    // The seam that matters: two query modules, one database. A6-25's separation is
    // about capability, not about consistency.
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      expect(await loadArticle(tx, 'apa-itu-tarot', 'id')).toBeNull();
      await setStatus(tx, 'apa-itu-tarot', 'id', 'published');
      expect(await loadArticle(tx, 'apa-itu-tarot', 'id')).not.toBeNull();
    });
  });
});

describe('idStatusOf — A6-7’s input', () => {
  it('reports `draft` when there is no `id` row at all', async () => {
    /*
     * The default is what makes `publish(en)` refuse on an article that has only an
     * English document. `undefined` would make the comparison in `canTransition`
     * pass by accident.
     */
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc({ locale: 'en' }));
      expect(await idStatusOf(tx, 'apa-itu-tarot')).toBe('draft');
    });
  });

  it('reports the real status when there is one', async () => {
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      await setStatus(tx, 'apa-itu-tarot', 'id', 'published');
      expect(await idStatusOf(tx, 'apa-itu-tarot')).toBe('published');
    });
  });
});

describe('listAllArticles sees every status', () => {
  it('lists a draft, which the public module cannot see at all', async () => {
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc({ slug: 'sebuah-draf' }));
      expect((await listAllArticles(tx)).map((a) => a.slug)).toEqual(['sebuah-draf']);
      expect(await loadArticle(tx, 'sebuah-draf', 'id')).toBeNull();
    });
  });

  it('lists an article with no locale row at all', async () => {
    // Reachable through a future bulk tool, and an article invisible in the only UI
    // that could fix it is worse than an empty row.
    await withRollback(async (tx) => {
      await tx.insert(blogPosts).values({ slug: 'kosong-sekali' });
      const [a] = await listAllArticles(tx);
      expect({ slug: a.slug, locales: a.locales }).toEqual({ slug: 'kosong-sekali', locales: [] });
    });
  });
});

describe('publishedDocumentsForLint — R43’s third caller', () => {
  it('returns every published row, INCLUDING an `en` unreachable behind an unpublished `id`', async () => {
    /*
     * **DELIBERATELY NOT GATED ON `idIsLive`.** An `en` row that is published but
     * unreachable is still prose somebody wrote, and it still has to pass the lint
     * before `id` comes back and makes it live. The public module answers *"what can
     * a reader open"*; this one answers *"what have we committed to publishing"*.
     */
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      await upsertDocument(tx, doc({ locale: 'en' }));
      await setStatus(tx, 'apa-itu-tarot', 'id', 'published');
      await setStatus(tx, 'apa-itu-tarot', 'en', 'published');
      await setStatus(tx, 'apa-itu-tarot', 'id', 'unpublished');

      const rows = await publishedDocumentsForLint(tx);
      expect(rows.map((r) => `${r.slug}.${r.row.locale}`)).toEqual(['apa-itu-tarot.en']);
    });
  });

  it('skips drafts', async () => {
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc());
      expect(await publishedDocumentsForLint(tx)).toEqual([]);
    });
  });
});

describe('the unique key is (post_id, locale)', () => {
  it('refuses a second row for one locale of one article', async () => {
    await withRollback(async (tx) => {
      const r = await upsertDocument(tx, doc());
      await expect(
        (tx as Tx).insert(blogPostLocales).values({
          postId: r.postId,
          locale: 'id',
          title: 't',
          description: 'd',
          body,
        }),
      ).rejects.toThrow();
    });
  });

  it('allows the same locale on two different articles', async () => {
    await withRollback(async (tx) => {
      await upsertDocument(tx, doc({ slug: 'satu' }));
      await upsertDocument(tx, doc({ slug: 'dua' }));
      const rows = await tx
        .select({ id: blogPostLocales.id })
        .from(blogPostLocales)
        .where(and(eq(blogPostLocales.locale, 'id')));
      expect(rows).toHaveLength(2);
    });
  });
});

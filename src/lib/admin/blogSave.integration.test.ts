import { afterAll, describe, expect, it } from 'vitest';
import { cardRef, h2, link, para, s } from '@/content/blocks';
import type { Block } from '@/content/types';
import { heroAltFor } from '@/lib/content/heroAlt';
import { listAllArticles, setStatus, upsertDocument } from '@/lib/db/queries/admin/blog';
import { loadArticle } from '@/lib/db/queries/blog';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Db, Tx } from '@/lib/db/types';
import { changeStatus, saveDocument } from './blogSave';

/**
 * Tasks 9 and 10's acceptance, executed.
 *
 * **THE ROUTE IS NOT EXERCISED, AND A5's `reveal.integration.test.ts` RECORDS WHY:**
 * a handler imports `next/server` and the `server-only` singleton, and *"an ordering
 * asserted only by grep is the weakest instrument available"*. Every decision worth
 * asserting lives in `blogSave.ts`, which takes its handle first — so a rolled-back
 * transaction can drive it and the claim *"and stores nothing"* becomes checkable
 * rather than promised.
 *
 * `Tx` satisfies `Db` for `.transaction()`, which nests as a savepoint. That is the
 * same composition `upsertDocument`'s own suite relies on.
 */

const asDb = (tx: Tx) => tx as unknown as Db;

const body: Block[] = [
  h2('mulai', 'Mulai dari sini'),
  para(s('Ambil satu kartu dan katakan apa yang kamu lihat di dalamnya.')),
];

const doc = (over: Record<string, unknown> = {}) => ({
  slug: 'apa-itu-tarot',
  locale: 'id',
  title: 'Apa itu tarot',
  description:
    'Panduan singkat untuk siapa pun yang baru memegang setumpuk kartu dan ingin tahu harus mulai dari mana.',
  hero: null,
  body,
  ...over,
});

afterAll(closeTestDb);

describe('saveDocument — the three gates, and a refusal writes NOTHING', () => {
  it('accepts a clean document and reports `create`', async () => {
    await withRollback(async (tx) => {
      const r = await saveDocument(asDb(tx), 'create', doc());
      expect(r.kind).toBe('ok');
      expect((await listAllArticles(tx)).map((a) => a.slug)).toEqual(['apa-itu-tarot']);
    });
  });

  it('refuses `tempoh` in the `id` half — and stores nothing', async () => {
    /*
     * Task 9's acceptance, verbatim. **"Stores nothing" is the half a route test
     * cannot make**: not a draft, not a `blog_posts` row with no document under it.
     * A-D14: *a stored `Block[]` the renderer cannot render is a 500 on a public page,
     * and the row would already be committed.*
     */
    await withRollback(async (tx) => {
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({ body: [...body, para(s('Tunggu tempoh yang cukup sebelum menarik lagi.'))] }),
      );
      expect(r.kind).toBe('invalid');
      expect(r.kind === 'invalid' && r.violations.map((v) => v.rule)).toContain('malay');
      expect(await listAllArticles(tx)).toEqual([]);
    });
  });

  it('ACCEPTS the same word in the `en` half — running Malay against English is theatre', async () => {
    /*
     * A6-2 and `## Localization` rule 4. This is the case that fails if somebody
     * "simplifies" the lint to one word list for both locales, and it is the one that
     * would refuse correct English prose forever with nobody able to say why.
     */
    await withRollback(async (tx) => {
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({
          locale: 'en',
          title: 'What tarot is',
          description:
            'A short guide for anyone holding a deck for the first time and wondering where on earth to begin.',
          body: [h2('start', 'Start here'), para(s('Tempoh and kerana are not English words.'))],
        }),
      );
      expect(r.kind).toBe('ok');
    });
  });

  it('refuses a `/en/` link path on save, not at render (A6-20)', async () => {
    await withRollback(async (tx) => {
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({ body: [...body, para(s('Lihat '), link('/en/gallery', 'galeri'))] }),
      );
      expect(r.kind === 'invalid' && r.violations.map((v) => v.rule)).toContain('bare-path');
      expect(await listAllArticles(tx)).toEqual([]);
    });
  });

  it('refuses a `cardRef` slug that resolves to no card', async () => {
    /*
     * The RESOLUTION half, which lives outside `lint.ts` because `cardByUrlSlug` is
     * in `@/data/deck` and widening the lint to reach card data is how it ends up
     * failing on `cards.json` keywords and getting switched off (A6-3).
     */
    await withRollback(async (tx) => {
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({ body: [...body, cardRef('the-mooon', 'The Moon')] }),
      );
      expect(r.kind).toBe('invalid');
      expect(r.kind === 'invalid' && r.violations[0].detail).toBe('the-mooon');
      expect(await listAllArticles(tx)).toEqual([]);
    });
  });

  it('refuses a link to a gated route, which passed the SHAPE check', async () => {
    // `/history` is a well-formed bare path. A link to it in public prose is a 302 to
    // `/login` inside an article, which a crawler reads as the article linking to a
    // login form.
    await withRollback(async (tx) => {
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({ body: [...body, para(s('Lihat '), link('/history', 'jejak'))] }),
      );
      expect(r.kind).toBe('invalid');
    });
  });

  it('refuses a sixth block kind through zod, and stores nothing', async () => {
    await withRollback(async (tx) => {
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({ body: [{ kind: 'callout', text: 'x' }] }),
      );
      expect(r.kind).toBe('invalid');
      expect(await listAllArticles(tx)).toEqual([]);
    });
  });

  it('SAVES over a warning — the class that refuses a publish, not a save (A6-17)', async () => {
    /*
     * **THE PRODUCT JUDGEMENT, EXECUTED.** A 200-word draft with a short description
     * must be savable, or the author writes the whole thing elsewhere and pastes it
     * in at the end, unreviewed — the failure the gate exists to prevent, arrived at
     * by the gate.
     */
    await withRollback(async (tx) => {
      const r = await saveDocument(asDb(tx), 'create', doc({ description: 'pendek' }));
      expect(r.kind).toBe('ok');
      expect(r.kind === 'ok' && r.violations.map((v) => v.cls)).toEqual(['warning']);
      expect((await listAllArticles(tx)).length).toBe(1);
    });
  });

  it('reports `exists` on a second create and `not-found` on an update of nothing', async () => {
    await withRollback(async (tx) => {
      await saveDocument(asDb(tx), 'create', doc());
      expect((await saveDocument(asDb(tx), 'create', doc())).kind).toBe('exists');
      expect((await saveDocument(asDb(tx), 'update', doc({ slug: 'lain' }))).kind).toBe('not-found');
    });
  });

  it('asks the LAUNCH rules of a launch slug and not of anything else (R44)', async () => {
    /*
     * The same short document is refused under `what-tarot-is` — which owes the three
     * orientation anchors and 1100 words — and accepted under any other slug. **That
     * asymmetry is R44**, and merging the two rule sets is what makes the editor
     * refuse every article anybody writes next.
     */
    await withRollback(async (tx) => {
      expect((await saveDocument(asDb(tx), 'create', doc({ slug: 'what-tarot-is' }))).kind).toBe(
        'invalid',
      );
      expect((await saveDocument(asDb(tx), 'create', doc({ slug: 'kartu-the-moon' }))).kind).toBe(
        'ok',
      );
    });
  });
});

describe('changeStatus — the state machine, over real rows', () => {
  async function seedDraft(tx: Tx, locale: 'id' | 'en' = 'id') {
    await upsertDocument(tx, {
      slug: 'apa-itu-tarot',
      locale,
      title: 'Apa itu tarot',
      description:
        'Panduan singkat untuk siapa pun yang baru memegang setumpuk kartu dan ingin tahu harus mulai dari mana.',
      hero: null,
      body,
    });
  }

  it('publishes an `id` draft and makes it visible to the public module', async () => {
    await withRollback(async (tx) => {
      await seedDraft(tx);
      const r = await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'published');
      expect(r.kind === 'ok' && { from: r.from, to: r.to, noop: r.noop }).toEqual({
        from: 'draft',
        to: 'published',
        noop: false,
      });
      expect(await loadArticle(tx, 'apa-itu-tarot', 'id')).not.toBeNull();
    });
  });

  it('REFUSES `publish(en)` before `id`, with a named reason (A6-7, R42)', async () => {
    /*
     * **THE RELEASE'S MOST DANGEROUS INTERACTION, AS A REFUSAL.**
     * `contentAlternates()` throws without an `id` document, so the state this
     * prevents is a 500 on a URL in the sitemap. A-D15 reasoned only about
     * unpublishing and missed this direction entirely.
     */
    await withRollback(async (tx) => {
      await seedDraft(tx, 'en');
      const r = await changeStatus(asDb(tx), 'apa-itu-tarot', 'en', 'published');
      expect(r).toEqual({ kind: 'refused', reason: 'id-not-published' });
    });
  });

  it('allows `publish(en)` once `id` is published', async () => {
    await withRollback(async (tx) => {
      await seedDraft(tx, 'id');
      await seedDraft(tx, 'en');
      await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'published');
      expect((await changeStatus(asDb(tx), 'apa-itu-tarot', 'en', 'published')).kind).toBe('ok');
    });
  });

  it('refuses `published → draft`, so a public URL cannot be relabelled private (A6-21)', async () => {
    await withRollback(async (tx) => {
      await seedDraft(tx);
      await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'published');
      expect(await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'draft')).toEqual({
        kind: 'refused',
        reason: 'no-path-back-to-draft',
      });
    });
  });

  it('treats `X → X` as a no-op — a 200 that writes nothing and fires no event', async () => {
    await withRollback(async (tx) => {
      await seedDraft(tx);
      await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'published');
      const before = (await listAllArticles(tx))[0].locales[0].updatedAt;
      const r = await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'published');
      expect(r.kind === 'ok' && r.noop).toBe(true);
      expect((await listAllArticles(tx))[0].locales[0].updatedAt.getTime()).toBe(before.getTime());
    });
  });

  it('refuses a publish over a WARNING, and the same document unpublishes freely', async () => {
    /*
     * The two halves of A6-17 in one case. A 900-word document with a short
     * description is savable and not publishable; and once it IS published, pulling
     * it must never be refused — **the article that most needs pulling is the one
     * with something wrong in it.**
     */
    await withRollback(async (tx) => {
      await upsertDocument(tx, {
        slug: 'apa-itu-tarot',
        locale: 'id',
        title: 'Apa itu tarot',
        description: 'pendek',
        hero: null,
        body,
      });
      const refusal = await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'published');
      expect(refusal.kind).toBe('invalid');
      expect(refusal.kind === 'invalid' && refusal.violations.map((v) => v.rule)).toEqual([
        'description-band',
      ]);

      await setStatus(tx, 'apa-itu-tarot', 'id', 'published');
      expect((await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'unpublished')).kind).toBe('ok');
    });
  });

  it('answers `not-found` for an unknown slug, an unknown locale and an unknown status', async () => {
    // Every refusal in this tree is byte-identical so that "does this exist" is
    // unanswerable from the outside.
    await withRollback(async (tx) => {
      await seedDraft(tx);
      expect((await changeStatus(asDb(tx), 'tidak-ada', 'id', 'published')).kind).toBe('not-found');
      expect((await changeStatus(asDb(tx), 'apa-itu-tarot', 'ms', 'published')).kind).toBe(
        'not-found',
      );
      expect((await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'archived')).kind).toBe(
        'not-found',
      );
    });
  });
});


/**
 * §7. **THE HERO `alt` IS DERIVED, AND EVERY CASE ABOVE THIS POINT USES `hero: null`** —
 * which is why nothing caught the four launch articles shipping the bare card name.
 *
 * The claim that needs a database is the one about the column: `hero_pair_ck` asserts
 * `hero_card_slug IS NULL = hero_alt IS NULL`, and *"deriving on write keeps the column
 * populated with no migration"* is a statement about a constraint, not about a function.
 */
describe('§7 — the hero alt is derived on write, and the CHECK constraint holds', () => {
  it('stores the card’s own `LoreDoc.imageAlt` for the document’s locale', async () => {
    await withRollback(async (tx) => {
      const r = await saveDocument(asDb(tx), 'create', doc({ hero: { cardUrlSlug: 'the-moon' } }));
      expect(r.kind).toBe('ok');

      const loaded = await loadArticleRow(tx);
      expect(loaded.heroCardSlug).toBe('the-moon');
      // Not a transcription of the expected words: the SAME read the app makes.
      expect(loaded.heroAlt).toBe(heroAltFor('the-moon', 'id'));
      expect((loaded.heroAlt ?? '').length).toBeGreaterThanOrEqual(60);
    });
  });

  it('follows the LOCALE, so `en` gets the English painting description', async () => {
    /*
     * The English lore documents are REWRITTEN rather than translated (§8.2), so these are
     * two different sentences about one painting and the row must hold the right one. This
     * is also why `hero.alt` left the translation segment walk: translating the Indonesian
     * one would mint a third.
     */
    await withRollback(async (tx) => {
      await saveDocument(asDb(tx), 'create', doc({ hero: { cardUrlSlug: 'the-moon' } }));
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({ locale: 'en', title: 'What tarot is', description:
          'A short guide for anyone holding a deck for the first time and wondering where on earth to begin with it.',
          hero: { cardUrlSlug: 'the-moon' } }),
      );
      expect(r.kind).toBe('ok');

      const rows = await listAllArticles(tx);
      const byLocale = new Map(
        (rows.find((a) => a.slug === 'apa-itu-tarot')?.locales ?? []).map((l) => [l.locale, l]),
      );
      expect(byLocale.get('id')!.heroAlt).toBe(heroAltFor('the-moon', 'id'));
      expect(byLocale.get('en')!.heroAlt).toBe(heroAltFor('the-moon', 'en'));
      expect(byLocale.get('id')!.heroAlt).not.toBe(byLocale.get('en')!.heroAlt);
    });
  });

  it('leaves BOTH columns null when there is no hero, satisfying `hero_pair_ck`', async () => {
    await withRollback(async (tx) => {
      expect((await saveDocument(asDb(tx), 'create', doc({ hero: null }))).kind).toBe('ok');
      const loaded = await loadArticleRow(tx);
      expect([loaded.heroCardSlug, loaded.heroAlt]).toEqual([null, null]);
    });
  });

  it('refuses a submitted `alt` outright rather than storing it', async () => {
    /*
     * `.strict()` on `heroSchema`. zod's default would STRIP the key silently and the
     * derivation would then overwrite it — so an old editor build would appear to work.
     * **A 422 is what says the field is gone.** And *stores nothing* is the half only a
     * database can check.
     */
    await withRollback(async (tx) => {
      const r = await saveDocument(
        asDb(tx),
        'create',
        doc({ hero: { cardUrlSlug: 'the-moon', alt: 'Sesuatu yang ditulis tangan.' } }),
      );
      expect(r.kind).toBe('invalid');
      expect(await listAllArticles(tx)).toEqual([]);
    });
  });

  it('refuses error-class when the card has no lore document, and writes nothing', async () => {
    /*
     * Unreachable today — all 22 cards have one — and the branch exists because
     * identical-today is when somebody simplifies one of two lists (R2). The alternative
     * degradations are both worse: `''` lies to a screen reader on a normal-looking page,
     * and the card name is the defect being fixed.
     *
     * `the-mooon` is refused by `resolveViolations` first, which is the belt to this brace;
     * what this asserts is that the outcome is a refusal with NOTHING stored either way.
     */
    await withRollback(async (tx) => {
      const r = await saveDocument(asDb(tx), 'create', doc({ hero: { cardUrlSlug: 'the-mooon' } }));
      expect(r.kind).toBe('invalid');
      expect(await listAllArticles(tx)).toEqual([]);
    });
  });

  it('lets a legacy row with a bad stored alt still be published', async () => {
    /*
     * The four launch rows are exactly this case: `scripts/blog-import.ts` wrote the card
     * name as `alt` and set `status: 'published'` directly, bypassing the gate. `hero-pair`
     * is what would refuse them now, so `changeStatus` lints the DERIVED value — refusing
     * to publish because of a defect this change already fixed on the write path would be
     * the gate punishing somebody for the old bug.
     */
    await withRollback(async (tx) => {
      await upsertDocument(tx, {
        slug: 'apa-itu-tarot',
        locale: 'id',
        title: 'Apa itu tarot',
        description:
          'Panduan singkat untuk siapa pun yang baru memegang setumpuk kartu dan ingin tahu harus mulai dari mana.',
        // The v0.4.0 shape: the bare card name, nine characters, opening with the name.
        hero: { cardUrlSlug: 'the-moon', alt: 'The Moon' },
        body,
      });
      const r = await changeStatus(asDb(tx), 'apa-itu-tarot', 'id', 'published');
      expect(r).toMatchObject({ kind: 'ok', to: 'published' });
      expect(r.kind === 'ok' && r.violations).toEqual([]);
    });
  });
});

/** The one `(slug, locale)` row these cases write, read back off the database. */
async function loadArticleRow(tx: Tx) {
  const all = await listAllArticles(tx);
  const article = all.find((a) => a.slug === 'apa-itu-tarot');
  expect(article, 'the row this case just wrote').toBeDefined();
  const row = article!.locales.find((l) => l.locale === 'id');
  expect(row, 'the id locale row').toBeDefined();
  return row!;
}

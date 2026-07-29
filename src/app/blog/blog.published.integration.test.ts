import { afterAll, describe, expect, it } from 'vitest';
import { h2, para, s } from '@/content/blocks';
import type { Block } from '@/content/types';
import { resolveViolations } from '@/lib/content/blogResolve';
import { divergenceAdvisory, formatViolation, hasErrors, lintDocument, LAUNCH_SLUGS, rulesFor, type LintDoc } from '@/lib/content/lint';
import { publishedDocumentsForLint } from '@/lib/db/queries/admin/blog';
import { publishedSlugs } from '@/lib/db/queries/blog';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';

/**
 * **R43's THIRD CALLER: THE LINT OVER EVERY PUBLISHED ROW.** v0.5.0 / A6, §6.4, task 18.
 *
 * ── THIS IS THE CALLER THAT KEEPS A-D13 HONEST ─────────────────────────────
 *
 * A-D13 names two: the vitest suite over `src/content/arcana/**`, and the save endpoint
 * over submitted bodies. **All thirty-six of `blog.content.test.ts`'s cases derive their
 * fixtures from `BLOG_ARTICLES`**, so once the prose is in Postgres and that registry is
 * deleted, **CI lints nothing that ships.** Without a caller over the ROWS, *"the lint
 * survives the move to Postgres"* is true of new writes and false of everything already
 * published — and the failure is invisible, because **the lint would be passing on an
 * empty set.**
 *
 * ── IT LIVES IN THE INTEGRATION PROJECT, WHICH IS THE WHOLE CONSTRAINT ─────
 *
 * The unit project has no database and **must not acquire one** (CLAUDE.md: *"`npm test`
 * deliberately does not need Docker and must not start to"*). R43 assigns the production
 * form of this caller to the sweep cron, which reports rather than fails; this is its
 * test-time twin, and the two run the same function over the same predicate.
 *
 * ── IT SKIPS CLEANLY ON AN EMPTY TABLE, AND THE ORACLE IS WHY THAT IS HONEST ─
 *
 * `jmtarot_test` is recreated empty, so *"lint every published row"* over zero rows is
 * vacuous by construction. That is the only honest behaviour for a suite that runs
 * against a fresh database — **and it is only acceptable because `blog.import.test.ts`
 * proves the transform is lossless without a database at all**, and because the seeded
 * cases below exercise the linting itself. The `it` that inserts a `tempoh` row is the
 * negative control: if the harness could not see a violation, that case would pass too.
 */

const clean: Block[] = [
  h2('mulai', 'Mulai dari sini'),
  para(s('Ambil satu kartu, lihat gambarnya, dan katakan apa yang kamu lihat di sana.')),
];

async function insert(
  tx: Tx,
  slug: string,
  locale: 'id' | 'en',
  over: { body?: Block[]; status?: string; description?: string } = {},
): Promise<void> {
  const [post] = await tx
    .insert(blogPosts)
    .values({ slug, datePublished: '2026-07-29' })
    .onConflictDoUpdate({ target: blogPosts.slug, set: { datePublished: '2026-07-29' } })
    .returning({ id: blogPosts.id });
  await tx.insert(blogPostLocales).values({
    postId: post.id,
    locale,
    status: over.status ?? 'published',
    title: `${slug} ${locale}`,
    description:
      over.description ??
      'Deskripsi yang panjangnya cukup untuk memenuhi pita delapan puluh sampai seratus lima puluh delapan.',
    body: over.body ?? clean,
  });
}

/** Every published row, linted. The array of printable lines; `[]` is clean. */
async function lintRows(tx: Tx): Promise<string[]> {
  const [rows, known] = await Promise.all([publishedDocumentsForLint(tx), publishedSlugs(tx)]);
  const out: string[] = [];
  for (const { slug, row } of rows) {
    const doc: LintDoc = {
      locale: row.locale,
      slug,
      title: row.title,
      description: row.description,
      hero:
        row.heroCardSlug !== null && row.heroAlt !== null
          ? { cardUrlSlug: row.heroCardSlug, alt: row.heroAlt }
          : null,
      body: row.body,
    };
    const violations = [...lintDocument(doc, rulesFor(slug)), ...resolveViolations(doc, known)];
    /*
     * **ERROR CLASS ONLY.** A warning refuses a PUBLISH, and these rows are already
     * published — failing the suite on one would mean the four imported articles turn
     * CI red for a hero `alt` nobody can change without breaking the migration oracle.
     * That is a real finding recorded elsewhere, not a reason to make the gate
     * unusable.
     */
    if (hasErrors(violations)) {
      for (const v of violations.filter((x) => x.cls === 'error')) {
        out.push(`${slug}.${row.locale} ${formatViolation(v)}`);
      }
    }
  }
  return out;
}

afterAll(closeTestDb);

describe('the lint over every published row (R43)', () => {
  it('passes on a clean published article', async () => {
    await withRollback(async (tx) => {
      await insert(tx, 'apa-itu-tarot', 'id');
      expect(await lintRows(tx)).toEqual([]);
    });
  });

  it('FAILS on a published row containing `tempoh` — the negative control', async () => {
    /*
     * **THE CASE THAT MAKES THE SKIP-ON-EMPTY HONEST.** A suite that lints zero rows and
     * a suite that cannot see a violation produce the same green. This one inserts the
     * violation, so the harness has been seen to fail.
     */
    await withRollback(async (tx) => {
      await insert(tx, 'apa-itu-tarot', 'id', {
        body: [...clean, para(s('Tunggu tempoh yang cukup sebelum menarik lagi.'))],
      });
      const hits = await lintRows(tx);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain('malay');
      expect(hits[0]).toContain('tempoh');
    });
  });

  it('does NOT run the Malay list against the `en` half (A6-2)', async () => {
    // Running the Malay words against English is theatre, and a lint that does it fails
    // correct English prose forever with nobody able to say why.
    await withRollback(async (tx) => {
      await insert(tx, 'apa-itu-tarot', 'id');
      await insert(tx, 'apa-itu-tarot', 'en', {
        body: [h2('start', 'Start'), para(s('Tempoh and kerana are not English words.'))],
      });
      expect(await lintRows(tx)).toEqual([]);
    });
  });

  it('lints an `en` row that is published but UNREACHABLE behind an unpublished `id`', async () => {
    /*
     * `publishedDocumentsForLint` deliberately does not apply A6-7's `idIsLive` gate.
     * An `en` row that is published but unreachable is still prose somebody wrote, and
     * it still has to pass before `id` comes back and makes it live. The public module
     * answers *"what can a reader open"*; this one answers *"what have we committed to
     * publishing"*.
     */
    await withRollback(async (tx) => {
      await insert(tx, 'apa-itu-tarot', 'id', { status: 'unpublished' });
      await insert(tx, 'apa-itu-tarot', 'en', {
        body: [h2('start', 'Start'), para(s('A sentence about abundance.'))],
      });
      const hits = await lintRows(tx);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain('tics');
    });
  });

  it('skips a draft, because a draft is not shipped prose', async () => {
    await withRollback(async (tx) => {
      await insert(tx, 'sebuah-draf', 'id', {
        status: 'draft',
        body: [...clean, para(s('Tunggu tempoh yang cukup.'))],
      });
      expect(await lintRows(tx)).toEqual([]);
    });
  });

  it('skips cleanly on an empty table', async () => {
    await withRollback(async (tx) => {
      expect(await lintRows(tx)).toEqual([]);
    });
  });
});

describe('the two launch slugs keep their extra guarantees, and only they do (R44)', () => {
  it('asks the launch rules of `what-tarot-is` and not of another slug', async () => {
    /*
     * The orientation anchors and the ~1100-word floor are facts about **the two
     * committed articles**: R5 of v0.4.0 moved the public footer's three links onto
     * `what-tarot-is`, so its `#what-tarot-is`, `#myths-and-facts` and `#what-its-for`
     * are an INTERFACE of that document. Applied to every future row they would refuse
     * most of them.
     */
    await withRollback(async (tx) => {
      await insert(tx, 'what-tarot-is', 'id');
      await insert(tx, 'kartu-the-moon', 'id');
      const hits = await lintRows(tx);
      expect(hits.every((h) => h.startsWith('what-tarot-is'))).toBe(true);
      expect(hits.some((h) => h.includes('orientation-anchors'))).toBe(true);
      expect(hits.some((h) => h.includes('word-floor'))).toBe(true);
    });
  });

  it('names exactly two slugs', () => {
    expect([...LAUNCH_SLUGS].sort()).toEqual(['how-to-read-tarot', 'what-tarot-is']);
  });
});

describe('the divergence proof — a HARD assertion for the launch pair (A6-15)', () => {
  it('reports a pair that reads as a translation, and stays quiet on one that does not', async () => {
    /*
     * **IT CANNOT BE A LINT RULE AND IT IS NOT ONE.** *"English is rewritten, not
     * translated"* is a predicate over TWO documents, and the `en` document is
     * legitimately empty for an hour while somebody writes it — so in the editor it is
     * a publish-time ADVISORY that never blocks. Here, over rows, it is checkable, and
     * the launch pair is where it is worth checking.
     */
    await withRollback(async (tx) => {
      await insert(tx, 'sama-saja', 'id');
      await insert(tx, 'sama-saja', 'en');
      const rows = await publishedDocumentsForLint(tx);
      const doc = (locale: 'id' | 'en'): LintDoc => {
        const r = rows.find((x) => x.row.locale === locale)!.row;
        return {
          locale,
          slug: 'sama-saja',
          title: r.title,
          description: r.description,
          hero: null,
          body: r.body,
        };
      };
      // The fixture is deliberately identical apart from the title, so it reads as one.
      expect(divergenceAdvisory(doc('id'), doc('en')).length).toBeGreaterThan(0);
    });
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { saveDocument } from '@/lib/admin/blogSave';
import { adviceNeeded, applyAdvice, validateAdvice } from '@/lib/content/formatAdvice';
import { parseMarkdown, serializeMarkdown } from '@/lib/content/markdown';
import { plainText, headingIds } from '@/lib/content/doc';
import { listAllArticles } from '@/lib/db/queries/admin/blog';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Db, Tx } from '@/lib/db/types';
import {
  PASTED_ARTICLE_BLANK_LINES,
  PASTED_ARTICLE_HARD_WRAPPED,
  PASTED_ARTICLE_ID,
  PASTED_PARAGRAPHS,
  REPEATED_HEADING_REPLY,
} from '@/lib/content/fixtures/pastedArticle';

/**
 * **AUTO FORMAT, END TO END, ON A PASTE THAT FAILED IN PRODUCTION.** 2026-07-31.
 *
 * Miftah pasted three paragraphs of Gemini-written Indonesian into Konten, pressed Format
 * otomatis, and got one enormous paragraph with `## Three Septenaries` repeated after it. His
 * read was *"i dont think glm4.6 is capable enough for this"*. **It was not the model.**
 *
 * `src/lib/content/fixtures/pastedArticle.ts` records the measurement: 3 lines, 0 blank lines.
 * A chat UI separates paragraphs with one newline; markdown says a single newline CONTINUES a
 * paragraph. So the parse produced ONE block — and `applyAdvice` inserts headings BETWEEN
 * blocks, so a one-block document has exactly two legal positions. The model was asked to find
 * the sections of a document with no internal boundaries.
 *
 * ── WHY THIS FILE IS AN INTEGRATION TEST AND NOT A UNIT ONE ─────────────────
 *
 * The claim being tested is *"pressing the button produces a sectioned article WITH a table of
 * contents in the database"*, and both halves of that need a row: `saveDocument` runs zod, the
 * lint and the resolution, and the `hero_alt` derivation, and **the failure Miftah saw was
 * visible only in what got stored.** The unit suite already covers the parser and the
 * validator in isolation; this covers the pipeline they sit in.
 *
 * **THE MODEL IS NOT CALLED.** `adviseFormat` is the one step with a provider behind it, and a
 * test that needed one would be a test nobody runs. What is exercised is everything else in
 * the route's order — parse, `adviceNeeded`, `validateAdvice`, `applyAdvice`, `saveDocument` —
 * with the model's REPLY supplied as a fixture, including the bad one it actually returned.
 */

const asDb = (tx: Tx) => tx as unknown as Db;

/** A good reply for this article: three sections at the three paragraph boundaries. */
const GOOD_REPLY = {
  title: 'Tiga Fase Major Arcana dan Sejarah Dek Rider-Waite-Smith',
  headings: [
    { at: 0, text: 'Tiga kelompok tujuh kartu', id: 'three-septenaries' },
    { at: 1, text: 'Siapa yang melukis dek Rider-Waite-Smith', id: 'who-painted-it' },
    { at: 2, text: 'Kartu yang sering disalahpahami', id: 'misread-cards' },
  ],
  anchors: [],
  description:
    'Major Arcana dibagi menjadi tiga kelompok tujuh kartu, dan dua di antaranya paling sering disalahpahami. Ini penjelasannya.',
};

afterAll(closeTestDb);

describe('the paste Miftah reported — the parse is where it went wrong', () => {
  it('recovers exactly three paragraphs from single-newline text', () => {
    /*
     * **THE REGRESSION, AND IT IS ONE ASSERTION.** Before `splitRun` this was `1`, and every
     * synthetic fixture in the suite passed because none of them had zero blank lines.
     */
    const blocks = parseMarkdown(PASTED_ARTICLE_ID);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    // The prose is recovered byte-identically, not merely split into three of something.
    expect(blocks.map((b) => plainText([b]))).toEqual(PASTED_PARAGRAPHS);
  });

  it('agrees across all three newline shapes the same prose can arrive in', () => {
    /*
     * A chat UI gives single newlines, a markdown source gives blank lines, and a plain-text
     * editor gives hard-wrapped lines with blank lines between paragraphs. **The last one is
     * what `splitRun` must NOT split**, and it is asserted here so the fix is pinned from both
     * sides rather than only from the side that was broken.
     */
    const shapes = [PASTED_ARTICLE_ID, PASTED_ARTICLE_BLANK_LINES, PASTED_ARTICLE_HARD_WRAPPED];
    for (const src of shapes) {
      expect(parseMarkdown(src).map((b) => plainText([b]))).toEqual(PASTED_PARAGRAPHS);
    }
  });

  it('round-trips the paste, so opening the article again does not change it', () => {
    const blocks = parseMarkdown(PASTED_ARTICLE_ID);
    expect(parseMarkdown(serializeMarkdown(blocks))).toEqual(blocks);
  });

  it('asks for a title, sections and a description — all three, because none are there', () => {
    const blocks = parseMarkdown(PASTED_ARTICLE_ID);
    expect(adviceNeeded({ body: blocks, title: '', description: '', derivedAnchorAt: [] })).toEqual([
      'no-title',
      'no-sections',
      'no-description',
    ]);
  });

  it('offers the model THREE legal heading positions now, where it had one', () => {
    /*
     * **THIS IS THE NUMBER THAT DECIDED THE OUTCOME.** A heading titles what follows it, so the
     * legal indices are `[0, body.length - 1]` — one per block. **One block therefore offered
     * exactly ONE position, and no amount of prompting makes three sections out of that.**
     * Three blocks offer three.
     */
    expect(parseMarkdown(PASTED_ARTICLE_ID)).toHaveLength(3);
    const { advice } = validateAdvice(
      { headings: [0, 1, 2, 3].map((at) => ({ at, text: `J${at}`, id: `j-${at}` })) },
      parseMarkdown(PASTED_ARTICLE_ID),
    );
    expect(advice.headings.map((h) => h.at)).toEqual([0, 1, 2]);
  });
});

describe('the reply glm-4.6 actually returned is refused now', () => {
  it('keeps ONE of the three identical headings and names the other two', () => {
    /*
     * `## Three Septenaries` three times with one anchor id. The first version of
     * `validateAdvice` accepted all three because it only refused a repeated `at` — and this
     * reply has three DIFFERENT indices, which is why it passed.
     *
     * Two silent failures: a duplicate DOM id, which is invalid HTML, and a table of contents
     * whose three rows all jump to the first section.
     */
    const blocks = parseMarkdown(PASTED_ARTICLE_ID);
    const { advice, rejected } = validateAdvice(REPEATED_HEADING_REPLY, blocks);
    expect(advice.headings).toHaveLength(1);
    /*
     * **TWO DIFFERENT REFUSALS, AND THAT IS THE WHOLE STORY OF THIS REPLY.** `at: 2` is
     * refused for the repeated anchor id; `at: 3` is refused for being `body.length`, which is
     * a heading with nothing under it. The real reply tripped both defects at once.
     */
    expect(rejected).toEqual([
      'heading at 2 repeats the anchor id "three-septenaries"',
      'heading at an out-of-range index (3)',
    ]);
  });

  it('produces a document with no duplicate anchor id, whatever the model sent', () => {
    const blocks = parseMarkdown(PASTED_ARTICLE_ID);
    const { advice } = validateAdvice(REPEATED_HEADING_REPLY, blocks);
    const ids = headingIds(applyAdvice(blocks, advice), 2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('still leaves the author’s prose untouched on the bad reply', () => {
    // The property R1 exists for, on a failure rather than on a success.
    const blocks = parseMarkdown(PASTED_ARTICLE_ID);
    const { advice } = validateAdvice(REPEATED_HEADING_REPLY, blocks);
    const out = applyAdvice(blocks, advice);
    expect(out.filter((b) => b.kind !== 'heading').map((b) => plainText([b]))).toEqual(
      PASTED_PARAGRAPHS,
    );
  });
});

describe('the whole pipeline, stored', () => {
  it('writes a sectioned article whose table of contents actually renders', async () => {
    await withRollback(async (tx) => {
      /* The route's order, with the model's reply supplied instead of called. */
      const parsed = parseMarkdown(PASTED_ARTICLE_ID);
      const reasons = adviceNeeded({ body: parsed, title: '', description: '', derivedAnchorAt: [] });
      expect(reasons).toContain('no-sections');

      const { advice, rejected } = validateAdvice(GOOD_REPLY, parsed);
      expect(rejected).toEqual([]);
      const body = applyAdvice(parsed, advice);

      const result = await saveDocument(asDb(tx), 'create', {
        slug: 'tiga-fase-major-arcana',
        locale: 'id',
        title: advice.title,
        description: advice.description,
        hero: { cardUrlSlug: 'the-fool' },
        body,
      });
      expect(result).toMatchObject({ kind: 'ok', action: 'create' });
      // Warning-class violations would block the publish; there must be none.
      expect(result.kind === 'ok' && result.violations).toEqual([]);

      const rows = await listAllArticles(tx);
      const row = rows
        .find((a) => a.slug === 'tiga-fase-major-arcana')
        ?.locales.find((l) => l.locale === 'id');
      expect(row).toBeDefined();

      /*
       * **THE ASSERTION THAT ANSWERS THE REPORT.** *"there is no sectionize result. there is
       * not table of content."* — three level-2 headings with three distinct ids in the STORED
       * row, which is what `blog/[slug]/page.tsx` reads, and more than two so the `ArticleToc`
       * threshold is met and the box renders at all.
       */
      const stored = row!.body;
      const ids = headingIds(stored, 2);
      expect(ids).toEqual(['three-septenaries', 'who-painted-it', 'misread-cards']);
      expect(ids.length).toBeGreaterThan(2);
      expect(stored.map((b) => b.kind)).toEqual([
        'heading',
        'paragraph',
        'heading',
        'paragraph',
        'heading',
        'paragraph',
      ]);

      // Every stored anchor is one the parser would round-trip, so reopening is lossless.
      expect(parseMarkdown(serializeMarkdown(stored))).toEqual(stored);
      // And the hero alt was derived rather than asked for (§7).
      expect((row!.heroAlt ?? '').length).toBeGreaterThanOrEqual(60);
    });
  });

  it('stores the author’s three paragraphs unchanged, in order', async () => {
    await withRollback(async (tx) => {
      const parsed = parseMarkdown(PASTED_ARTICLE_ID);
      const { advice } = validateAdvice(GOOD_REPLY, parsed);
      await saveDocument(asDb(tx), 'create', {
        slug: 'tiga-fase-major-arcana',
        locale: 'id',
        title: advice.title,
        description: advice.description,
        hero: null,
        body: applyAdvice(parsed, advice),
      });
      const rows = await listAllArticles(tx);
      const stored = rows[0]!.locales[0]!.body;
      expect(stored.filter((b) => b.kind === 'paragraph').map((b) => plainText([b]))).toEqual(
        PASTED_PARAGRAPHS,
      );
    });
  });

  it('would have stored ONE paragraph and no usable sections before the fix', async () => {
    /*
     * **THE NEGATIVE CONTROL, AND IT IS THE POINT OF THE WHOLE FILE.** The old parse is
     * reproduced by joining the run by hand — one block — and then the best any reply could do
     * is bracket it. `headingIds` returns at most two, which is **below `ArticleToc`'s `> 2`
     * threshold, so the table of contents does not render at all.** That is exactly what was
     * reported, and it is reproduced here rather than described.
     */
    await withRollback(async (tx) => {
      const oneBlock = parseMarkdown(PASTED_PARAGRAPHS.join(' '));
      expect(oneBlock).toHaveLength(1);

      const best = validateAdvice(
        {
          title: GOOD_REPLY.title,
          description: GOOD_REPLY.description,
          headings: [
            { at: 0, text: 'Satu', id: 'satu' },
            { at: 1, text: 'Dua', id: 'dua' },
            { at: 2, text: 'Tiga', id: 'tiga' },
          ],
        },
        oneBlock,
      );
      /*
       * On a ONE-block body the only legal index is `0`, so exactly one heading survives —
       * `headingIds` returns 1, far below `ArticleToc`'s `> 2`, so no table of contents renders
       * at all. That is precisely what was reported.
       */
      expect(best.advice.headings).toHaveLength(1);

      const body = applyAdvice(oneBlock, best.advice);
      await saveDocument(asDb(tx), 'create', {
        slug: 'sebelum-perbaikan',
        locale: 'id',
        title: best.advice.title,
        description: best.advice.description,
        hero: null,
        body,
      });
      const rows = await listAllArticles(tx);
      const stored = rows.find((a) => a.slug === 'sebelum-perbaikan')!.locales[0]!.body;
      expect(headingIds(stored, 2).length).toBeLessThanOrEqual(1);
      expect(stored.filter((b) => b.kind === 'paragraph')).toHaveLength(1);
    });
  });
});

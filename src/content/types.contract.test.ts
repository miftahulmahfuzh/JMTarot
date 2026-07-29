import { describe, expect, it } from 'vitest';
import type { Block, BlogDoc, Inline } from './types';
import * as BLOCKS from './blocks';
import { bullets, cardRef, em, h2, h3, link, para, s, steps, strong } from './blocks';

/**
 * S6's contract against S4's `src/content/types.ts`.
 *
 * **S4 OWNS THAT FILE AND S6 IMPORTS IT** (roadmap §5; `docs/plans/2026-07-28-blog.md`
 * §D1; reconciliation R16). Two workstreams defining one block union is the "seven
 * agents inventing `user_id`" failure the v0.2.0 roadmap names, so this file asserts
 * and never defines.
 *
 * **THESE ARE TYPE ASSERTIONS WEARING A RUNTIME TEST.** The `satisfies` clauses are
 * what fail -- at `npm run typecheck` and inside `npm test` -- if a variant loses a
 * field or a widening is reverted. The runtime expectations exist so Vitest reports a
 * pass rather than an empty suite, and so a reader can see what the shapes are.
 *
 * `types.test.ts` beside this file is S4's and asserts the lore half. Two files, two
 * owners, one union.
 */
describe('the content block union covers what a blog article needs', () => {
  it('accepts every block variant S6 authors with', () => {
    const blocks = [
      { kind: 'heading', level: 2, id: 'what-tarot-is', text: 'Apa itu tarot' },
      { kind: 'heading', level: 3, id: 'contoh', text: 'Contoh' },
      { kind: 'paragraph', text: [{ kind: 'text', text: 'Satu kalimat.' }] },
      {
        kind: 'paragraph',
        text: [
          { kind: 'strong', text: 'Mitos:' },
          { kind: 'text', text: ' tarot meramal. Lihat ' },
          { kind: 'link', path: '/arcana/the-moon', text: 'The Moon' },
          { kind: 'text', text: '.' },
          { kind: 'em', text: ' Begitu saja.' },
        ],
      },
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'Satu' }]] },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'Pertama' }]] },
      { kind: 'cardRef', slug: 'the-moon', text: 'Yang belum jelas.' },
    ] satisfies Block[];

    expect(blocks.length).toBe(7);
  });

  it("still accepts S4's plain-string shapes, unchanged", () => {
    /*
     * THE WIDENING IS A UNION, NOT A MIGRATION, and this is the assertion that says
     * so. Forty-four lore documents write `text: 'one sentence.'` and `items:
     * ['a', 'b']`, and they were not edited when `Phrasing` landed. If this case
     * ever fails, somebody narrowed `Phrasing` to `Inline[]` and forty-four
     * documents are about to be rewritten for no reader-visible gain.
     */
    const blocks = [
      { kind: 'heading', level: 2, text: 'Tegak' },
      { kind: 'paragraph', text: 'Satu kalimat biasa.' },
      { kind: 'list', items: ['satu', 'dua'] },
      { kind: 'quote', text: 'Dikutip.', source: 'Somebody, 1910' },
      { kind: 'cardRef', slug: 'the-moon', text: 'The Moon' },
    ] satisfies Block[];

    expect(blocks.length).toBe(5);
  });

  it('has no sixth kind: `callout` was asked for and REFUSED (R16)', () => {
    /*
     * S6 named this the ask to refuse first and reconciliation refused it. The two
     * asides in the launch article are paragraphs and read correctly as one. This
     * case is here because the failure mode of a refused ask is somebody granting it
     * quietly six months later -- `Prose.tsx`'s `never` default is the compile-time
     * half and this is the readable half.
     */
    const kinds: Block['kind'][] = ['heading', 'paragraph', 'list', 'quote', 'cardRef'];
    // @ts-expect-error -- there is no `callout` kind, and that is the assertion.
    const refused: Block['kind'] = 'callout';
    expect([kinds.length, refused]).toEqual([5, 'callout']);
  });

  it('accepts a BlogDoc with a title, a description and a hero', () => {
    const doc = {
      slug: 'how-to-read-tarot',
      locale: 'id',
      title: 'Cara Membaca Kartu Tarot',
      description: 'Panduan pemula.',
      hero: { cardUrlSlug: 'the-hermit', alt: 'The Hermit' },
      body: [{ kind: 'paragraph', text: [{ kind: 'text', text: 'x' }] }],
    } satisfies BlogDoc;

    // `hero` must be nullable: an article need not be about a card.
    const bare = { ...doc, hero: null } satisfies BlogDoc;
    expect([doc.slug, bare.hero]).toEqual(['how-to-read-tarot', null]);
  });

  it('keeps an internal link as a BARE PATH, never a locale-prefixed one', () => {
    /*
     * The whole reason `Inline.link` carries `path` and not `href`. Content is
     * locale-invariant on hrefs; `Prose.tsx` prefixes with S2's `localePath()`. A
     * content module that hard-codes `/en/arcana/...` duplicates that helper and
     * breaks the day the prefix scheme changes.
     */
    const inline = { kind: 'link', path: '/arcana/the-moon', text: 'The Moon' } satisfies Inline;
    expect(inline.path.startsWith('/en/')).toBe(false);
  });
});

describe('the authoring helpers build the union S4 declared', () => {
  it('builds each block variant', () => {
    const blocks: Block[] = [
      h2('what-tarot-is', 'Apa itu tarot'),
      h3('contoh', 'Contoh'),
      para(s('Satu '), strong('kalimat'), s(' saja.')),
      bullets([s('a')], [s('b')]),
      steps([s('1')], [s('2')]),
      cardRef('the-moon', 'Yang belum jelas.'),
    ];
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'heading',
      'paragraph',
      'list',
      'list',
      'cardRef',
    ]);
    expect((blocks[3] as { ordered?: boolean }).ordered).toBe(false);
    expect((blocks[4] as { ordered?: boolean }).ordered).toBe(true);
  });

  it('builds inline spans', () => {
    expect([s('a'), em('b'), strong('c'), link('/gallery', 'd')].map((x) => x.kind)).toEqual([
      'text',
      'em',
      'strong',
      'link',
    ]);
  });

  it('offers no `quote` and no `note` helper, and neither is an omission', () => {
    /*
     * `quote` REQUIRES a `source` (S4's field, conceded in full by S6's amendment)
     * and no article quotes anything, so a helper with an invented signature would be
     * the second definition of a block S4 already spells out. `note` would have built
     * the `callout` R16 refused. Both absences are decisions; this asserts them so
     * neither comes back as "the helpers were incomplete".
     */
    const exported = Object.keys(BLOCKS);
    expect(exported).not.toContain('quote');
    expect(exported).not.toContain('note');
    expect(exported.sort()).toEqual(
      ['bullets', 'cardRef', 'em', 'h2', 'h3', 'link', 'para', 's', 'steps', 'strong'].sort(),
    );
  });
});

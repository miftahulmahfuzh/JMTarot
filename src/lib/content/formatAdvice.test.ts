import { describe, expect, it } from 'vitest';
import { bullets, h2, para, s } from '@/content/blocks';
import type { Block } from '@/content/types';
import {
  adviceNeeded,
  applyAdvice,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  validateAdvice,
  type FormatAdvice,
} from './formatAdvice';

/** A non-empty title, so every case below is about the field it names and not about `no-title`. */
const TITLED = 'Trivia Tarot yang Jarang Diceritakan';

/**
 * `docs/plans/2026-07-31-blog-markdown-editor-design.md` §5.1.
 *
 * **THE MODEL'S REPLY IS UNTRUSTED INPUT AND THIS IS THE ONLY THING BETWEEN IT AND A
 * STORED DOCUMENT.** Every case here is a reply a model could plausibly produce, and the
 * property that makes the design safe is that rejecting ALL of it is a correct outcome —
 * `parseMarkdown`'s output is already valid, so the advice is additive.
 */

const BODY: Block[] = [
  para(s('Tarot bukan ramalan masa depan, dan itu jawaban paling pendek yang masih jujur.')),
  para(s('Setumpuk lengkap berisi 78 kartu, dan 22 di antaranya disebut Major Arcana.')),
  bullets([s('satu')], [s('dua')]),
];

const GOOD_DESCRIPTION =
  'Penjelasan tarot untuk yang belum pernah menyentuhnya: apa isinya, dari mana asalnya, dan apa yang bisa kamu dapat.';

const empty = (): FormatAdvice => ({ headings: [], anchors: [], description: '', title: '' });

describe('adviceNeeded — the predicate that keeps the common press free', () => {
  it('asks nothing when the paste is already sectioned and described', () => {
    /*
     * **§5.3 IS THE WHOLE POINT: a paste out of Gemini or ChatGPT is already `##`-sectioned.**
     * If this ever returns a reason on that shape, the steady state stops being one model
     * call per article and `admin.blog_saved.model_called` is the instrument that says so.
     */
    const sectioned = [h2('what-tarot-is', 'Tarot itu apa'), ...BODY, h2('myths', 'Mitos')];
    expect(adviceNeeded({ body: sectioned, title: TITLED, description: GOOD_DESCRIPTION, derivedAnchorAt: [] })).toEqual([]);
  });

  it('asks for sections on a wall of text', () => {
    expect(adviceNeeded({ body: BODY, title: TITLED, description: GOOD_DESCRIPTION, derivedAnchorAt: [] })).toEqual(['no-sections']);
  });

  it('treats ONE heading as no outline', () => {
    // The public page's own table of contents does not render below three anchors
    // (`blog/[slug]/page.tsx`), so one heading is not a sectioned article.
    const one = [h2('a-b', 'Satu'), ...BODY];
    expect(adviceNeeded({ body: one, title: TITLED, description: GOOD_DESCRIPTION, derivedAnchorAt: [] })).toEqual(['no-sections']);
  });

  it('ignores level-3 headings when counting sections', () => {
    // `<h3>` is a subsection. Two of them under no `<h2>` is still an unsectioned article.
    const threes: Block[] = [
      { kind: 'heading', level: 3, id: 'a', text: 'Satu' },
      { kind: 'heading', level: 3, id: 'b', text: 'Dua' },
      ...BODY,
    ];
    expect(adviceNeeded({ body: threes, title: TITLED, description: GOOD_DESCRIPTION, derivedAnchorAt: [] })).toContain('no-sections');
  });

  it('asks for a description that is absent or outside the lint’s band', () => {
    const sectioned = [h2('a-b', 'Satu'), h2('c-d', 'Dua'), ...BODY];
    expect(adviceNeeded({ body: sectioned, title: TITLED, description: '', derivedAnchorAt: [] })).toEqual(['no-description']);
    expect(adviceNeeded({ body: sectioned, title: TITLED, description: 'x'.repeat(DESCRIPTION_MIN - 1), derivedAnchorAt: [] })).toEqual(['no-description']);
    expect(adviceNeeded({ body: sectioned, title: TITLED, description: 'x'.repeat(DESCRIPTION_MAX + 1), derivedAnchorAt: [] })).toEqual(['no-description']);
    expect(adviceNeeded({ body: sectioned, title: TITLED, description: 'x'.repeat(DESCRIPTION_MIN), derivedAnchorAt: [] })).toEqual([]);
    expect(adviceNeeded({ body: sectioned, title: TITLED, description: 'x'.repeat(DESCRIPTION_MAX), derivedAnchorAt: [] })).toEqual([]);
  });

  it('asks for anchors when an id was derived rather than chosen', () => {
    /*
     * The four committed articles are `h2('what-tarot-is', 'Tarot itu apa')` — English ids
     * on Indonesian headings, which `slugify` cannot produce and a human chose. An anchor is
     * a permanent address, so a derived one is worth one model call to improve.
     */
    const sectioned = [h2('a-b', 'Satu'), h2('c-d', 'Dua'), ...BODY];
    expect(adviceNeeded({ body: sectioned, title: TITLED, description: GOOD_DESCRIPTION, derivedAnchorAt: [0] })).toEqual(['derived-anchors']);
  });

  it('can ask for all three at once', () => {
    expect(adviceNeeded({ body: BODY, title: TITLED, description: '', derivedAnchorAt: [0] })).toEqual([
      'no-sections',
      'no-description',
      'derived-anchors',
    ]);
  });
});

describe('adviceNeeded — the title', () => {
  const sectioned = [h2('a-b', 'Satu'), h2('c-d', 'Dua'), ...BODY];

  it('asks for a title when the field is empty, and that is the common case', () => {
    /*
     * **THE STATE AN OPERATOR IS ACTUALLY IN.** They ask Gemini for an article and paste the
     * body; the title is a separate question nobody thought to copy. Code cannot answer it —
     * a title is a reading of the whole article, and the first heading names section one.
     */
    expect(adviceNeeded({ body: sectioned, title: '', description: GOOD_DESCRIPTION, derivedAnchorAt: [] })).toEqual([
      'no-title',
    ]);
    expect(adviceNeeded({ body: sectioned, title: '   ', description: GOOD_DESCRIPTION, derivedAnchorAt: [] })).toEqual([
      'no-title',
    ]);
  });

  it('never asks when a title is there, however odd or long it is', () => {
    // A typed title is an editorial decision. The reason list is what stops the model being
    // invited to revisit it -- V8's `user-edit` failure, in a new place.
    for (const t of [TITLED, 'x', 'x'.repeat(300), 'JUDUL SEMENTARA jangan lupa ganti']) {
      expect(
        adviceNeeded({ body: sectioned, title: t, description: GOOD_DESCRIPTION, derivedAnchorAt: [] }),
        t.slice(0, 20),
      ).toEqual([]);
    }
  });

  it('comes first in the reason list, so the prompt reads in field order', () => {
    expect(adviceNeeded({ body: BODY, title: '', description: '', derivedAnchorAt: [0] })).toEqual([
      'no-title',
      'no-sections',
      'no-description',
      'derived-anchors',
    ]);
  });
});

describe('validateAdvice — the title', () => {
  const t = (title: unknown) => validateAdvice({ title }, BODY);

  it('accepts a plain one-line title', () => {
    expect(t(TITLED).advice.title).toBe(TITLED);
    expect(t(`  ${TITLED}  `).advice.title).toBe(TITLED);
  });

  it('accepts up to the LINT’s boundary rather than the prompt’s target', () => {
    /*
     * The prompt asks for under 70 characters; `TITLE_MAX` is `lint.ts`'s `title-length`
     * boundary. **Refusing at the target would reject a title that is merely long**, which the
     * operator can shorten — and the point is to remove the blank field, not to be fussy.
     */
    expect(t('x'.repeat(TITLE_MAX)).advice.title).toHaveLength(TITLE_MAX);
    expect(t('x'.repeat(TITLE_MAX + 1)).advice.title).toBe('');
    expect(t('x'.repeat(TITLE_MAX + 1)).rejected[0]).toContain(`over ${TITLE_MAX}`);
  });

  it('refuses markdown, a newline, and a non-string', () => {
    /*
     * A newline matters more here than anywhere else: this string is the `<h1>` AND the
     * `<title>` tag, and a break renders as a space in one and as nothing in the other — so
     * the two would disagree about a string `blog.content.test.ts` reads.
     */
    expect(t('## Judul').advice.title).toBe('');
    expect(t('**Judul**').advice.title).toBe('');
    expect(t('- Judul').advice.title).toBe('');
    expect(t('Judul\nkedua').advice.title).toBe('');
    expect(t(42).advice.title).toBe('');
    expect(t(null).advice.title).toBe('');
  });

  it('is empty rather than absent when the model returns nothing', () => {
    // The route treats `''` as "no advice" and keeps whatever the operator typed, so an empty
    // string has to be the shape rather than `undefined`.
    expect(validateAdvice({}, BODY).advice.title).toBe('');
    expect(t('').advice.title).toBe('');
    expect(t('   ').advice.title).toBe('');
  });

  it('does not stop the other fields being accepted when it is refused', () => {
    const out = validateAdvice(
      { title: '## bad', description: GOOD_DESCRIPTION, headings: [{ at: 0, text: 'Baik', id: 'baik' }] },
      BODY,
    );
    expect(out.advice.title).toBe('');
    expect(out.advice.description).toBe(GOOD_DESCRIPTION);
    expect(out.advice.headings).toHaveLength(1);
    expect(out.rejected).toEqual(['title carries markdown']);
  });
});

describe('validateAdvice — it refuses shape, and never throws', () => {
  it('accepts a well-formed reply', () => {
    const { advice, rejected } = validateAdvice(
      {
        headings: [{ at: 0, text: 'Tarot itu apa', id: 'what-tarot-is' }],
        anchors: [],
        description: GOOD_DESCRIPTION,
      },
      BODY,
    );
    expect(rejected).toEqual([]);
    expect(advice.headings).toEqual([{ at: 0, text: 'Tarot itu apa', id: 'what-tarot-is' }]);
    expect(advice.description).toBe(GOOD_DESCRIPTION);
  });

  it('degrades to NO advice on a reply that is not an object', () => {
    /*
     * **THE ASYMMETRY THAT MAKES THIS SAFE.** No advice leaves the parsed document exactly
     * as `parseMarkdown` produced it, which is already valid — so total rejection is a
     * correct outcome rather than a broken one.
     */
    for (const raw of [null, undefined, 'a string', 42, []]) {
      const { advice } = validateAdvice(raw, BODY);
      expect(advice).toEqual(empty());
    }
    expect(validateAdvice(null, BODY).rejected).toEqual(['the reply was not an object']);
  });

  it('never throws on any of the shapes a model gets wrong', () => {
    const shapes: unknown[] = [
      {},
      { headings: 'not an array' },
      { headings: [null, 3, 'x'] },
      { anchors: [{}] },
      { description: 42 },
      { headings: [{ at: '0', text: 'x', id: 'y' }] },
      { headings: [{ at: 1.5, text: 'x', id: 'y' }] },
      { headings: [{ at: NaN, text: 'x', id: 'y' }] },
    ];
    for (const raw of shapes) {
      expect(() => validateAdvice(raw, BODY), JSON.stringify(raw)).not.toThrow();
    }
  });

  it('refuses an out-of-range heading index, and `body.length` is IN range', () => {
    // A heading appended after the last block is legitimate; one past that names nothing.
    const at = (n: number) =>
      validateAdvice({ headings: [{ at: n, text: 'Judul', id: 'judul-x' }] }, BODY).advice.headings
        .length;
    expect(at(0)).toBe(1);
    expect(at(BODY.length)).toBe(1);
    expect(at(BODY.length + 1)).toBe(0);
    expect(at(-1)).toBe(0);
  });

  it('refuses a heading that is a sentence, empty, or markdown', () => {
    const bad = (text: string) =>
      validateAdvice({ headings: [{ at: 0, text, id: 'ok-id' }] }, BODY).advice.headings.length;
    expect(bad('')).toBe(0);
    expect(bad('   ')).toBe(0);
    expect(bad('x'.repeat(91))).toBe(0);
    expect(bad('## Judul')).toBe(0);
    expect(bad('**Judul**')).toBe(0);
    expect(bad('- Judul')).toBe(0);
    expect(bad('1. Judul')).toBe(0);
    expect(bad('> Judul')).toBe(0);
    expect(bad('a | b')).toBe(0);
    expect(bad('Judul yang wajar')).toBe(1);
  });

  it('refuses a malformed anchor id, because an id is a permanent address', () => {
    for (const id of ['Tarot', 'tarot itu apa', 'tarot_itu', '-tarot', 'tarot-', '', 'tarot--itu']) {
      const out = validateAdvice({ headings: [{ at: 0, text: 'Judul', id }] }, BODY);
      expect(out.advice.headings, id).toEqual([]);
      expect(out.rejected.join(' '), id).toMatch(/anchor id/);
    }
  });

  it('refuses a SECOND heading at one index rather than ordering them', () => {
    /*
     * Both are plausible and the resulting order would be the model's array order, which is
     * not a decision it was asked to make. One per position, and the second is named.
     */
    const out = validateAdvice(
      {
        headings: [
          { at: 1, text: 'Pertama', id: 'pertama' },
          { at: 1, text: 'Kedua', id: 'kedua' },
        ],
      },
      BODY,
    );
    expect(out.advice.headings).toEqual([{ at: 1, text: 'Pertama', id: 'pertama' }]);
    expect(out.rejected).toEqual(['a second heading at index 1']);
  });

  it('caps the number of headings it will accept', () => {
    /*
     * **THE BODY HAS TO BE BIG FOR THE CAP TO BE THE THING THAT FIRES**, and the first draft
     * of this case got that wrong in a way worth keeping: it built 20 headings over a
     * 3-block body with `at: i % 4`, so the one-heading-per-index rule rejected them first
     * and the cap never ran. Twenty sections over a long article is the shape a model
     * actually over-produces on.
     */
    const long: Block[] = Array.from({ length: 24 }, (_, i) =>
      para(s(`Paragraf nomor ${i} yang cukup panjang untuk terlihat seperti prosa sungguhan.`)),
    );
    const many = Array.from({ length: 20 }, (_, i) => ({
      at: i,
      text: `Judul ${i}`,
      id: `judul-${i}`,
    }));
    const out = validateAdvice({ headings: many }, long);
    expect(out.advice.headings).toHaveLength(12);
    expect(out.rejected).toEqual(['more than 12 headings']);
  });

  it('refuses an anchor that names a paragraph rather than a heading', () => {
    /*
     * `heading.id` is the only place the union has for an anchor, so an index naming a
     * paragraph is discarded rather than coerced — `validateChoice`'s refuse-rather-than-
     * reinterpret. `BODY[0]` is a paragraph and `BODY[2]` is a list.
     */
    const out = validateAdvice({ anchors: [{ at: 0, id: 'x-y' }, { at: 2, id: 'a-b' }] }, BODY);
    expect(out.advice.anchors).toEqual([]);
    expect(out.rejected).toEqual([
      'anchor at 0 names a paragraph, not a heading',
      'anchor at 2 names a list, not a heading',
    ]);
  });

  it('accepts an anchor that names a heading', () => {
    const withHeading: Block[] = [h2('a-b', 'Satu'), ...BODY];
    const out = validateAdvice({ anchors: [{ at: 0, id: 'what-tarot-is' }] }, withHeading);
    expect(out.advice.anchors).toEqual([{ at: 0, id: 'what-tarot-is' }]);
  });

  it('refuses `body.length` for an ANCHOR, unlike for a heading', () => {
    // An insertion point may be one past the end; a reference to an existing block may not.
    const out = validateAdvice({ anchors: [{ at: BODY.length, id: 'x-y' }] }, BODY);
    expect(out.advice.anchors).toEqual([]);
  });

  it('refuses a description outside the band the lint judges by', () => {
    /*
     * Accepting outside it would be pointless: the save carries a `description-band`
     * warning and the publish gate refuses it. A model that writes 40 characters has not
     * written a meta description.
     */
    const d = (text: string) => validateAdvice({ description: text }, BODY).advice.description;
    expect(d('x'.repeat(DESCRIPTION_MIN - 1))).toBe('');
    expect(d('x'.repeat(DESCRIPTION_MAX + 1))).toBe('');
    expect(d('x'.repeat(DESCRIPTION_MIN))).toHaveLength(DESCRIPTION_MIN);
    expect(d('x'.repeat(DESCRIPTION_MAX))).toHaveLength(DESCRIPTION_MAX);
  });

  it('refuses a description carrying markdown or a newline', () => {
    const pad = (t: string) => t + 'x'.repeat(DESCRIPTION_MIN - t.length);
    expect(validateAdvice({ description: pad('**tebal** ') }, BODY).advice.description).toBe('');
    expect(validateAdvice({ description: pad('# Judul ') }, BODY).advice.description).toBe('');
    const twoLines = 'x'.repeat(50) + '\n' + 'y'.repeat(50);
    expect(validateAdvice({ description: twoLines }, BODY).advice.description).toBe('');
  });

  it('keeps the good entries when only some are bad', () => {
    // A partial reply is the common failure, and discarding all of it would cost the
    // operator work the model did correctly.
    const out = validateAdvice(
      {
        headings: [
          { at: 0, text: 'Baik', id: 'baik' },
          { at: 99, text: 'Buruk', id: 'buruk' },
        ],
        description: 'terlalu pendek',
      },
      BODY,
    );
    expect(out.advice.headings).toEqual([{ at: 0, text: 'Baik', id: 'baik' }]);
    expect(out.advice.description).toBe('');
    expect(out.rejected).toHaveLength(2);
  });

  it('trims rather than refusing whitespace around good values', () => {
    const out = validateAdvice(
      { headings: [{ at: 0, text: '  Judul  ', id: ' judul-x ' }], description: `  ${GOOD_DESCRIPTION}  ` },
      BODY,
    );
    expect(out.advice.headings).toEqual([{ at: 0, text: 'Judul', id: 'judul-x' }]);
    expect(out.advice.description).toBe(GOOD_DESCRIPTION);
  });
});

describe('applyAdvice — code owns every word of prose', () => {
  it('inserts a heading BEFORE the named block', () => {
    const out = applyAdvice(BODY, {
      headings: [{ at: 1, text: 'Bagian dua', id: 'bagian-dua' }],
      anchors: [],
      description: '',
      title: '',
    });
    expect(out).toHaveLength(BODY.length + 1);
    expect(out[1]).toEqual({ kind: 'heading', level: 2, id: 'bagian-dua', text: 'Bagian dua' });
    expect(out[2]).toEqual(BODY[1]);
  });

  it('applies MULTIPLE insertions without shifting each other', () => {
    /*
     * **THE OFF-BY-ONE THAT WOULD PUT A HEADING INSIDE THE PARAGRAPH IT INTRODUCES.**
     * Applying low-to-high shifts every later index by one, and the result looks plausible
     * in a preview — which is why the direction is stated in the function rather than
     * discovered here.
     */
    const out = applyAdvice(BODY, {
      headings: [
        { at: 0, text: 'Satu', id: 'satu' },
        { at: 1, text: 'Dua', id: 'dua' },
        { at: 3, text: 'Tiga', id: 'tiga' },
      ],
      anchors: [],
      description: '',
      title: '',
    });
    expect(out.map((b) => (b.kind === 'heading' ? b.text : b.kind))).toEqual([
      'Satu',
      'paragraph',
      'Dua',
      'paragraph',
      'list',
      'Tiga',
    ]);
  });

  it('appends at `body.length`', () => {
    const out = applyAdvice(BODY, {
      headings: [{ at: BODY.length, text: 'Akhir', id: 'akhir' }],
      anchors: [],
      description: '',
      title: '',
    });
    expect(out.at(-1)).toEqual({ kind: 'heading', level: 2, id: 'akhir', text: 'Akhir' });
  });

  it('rewrites a heading’s id and nothing else about it', () => {
    const withHeading: Block[] = [h2('tarot-itu-apa', 'Tarot itu apa'), ...BODY];
    const out = applyAdvice(withHeading, {
      headings: [],
      anchors: [{ at: 0, id: 'what-tarot-is' }],
      description: '',
      title: '',
    });
    expect(out[0]).toEqual({ kind: 'heading', level: 2, id: 'what-tarot-is', text: 'Tarot itu apa' });
  });

  it('leaves a non-heading alone even if an anchor names it', () => {
    // Re-checked rather than trusted: the function is exported and a second caller is a
    // matter of time.
    const out = applyAdvice(BODY, { headings: [], anchors: [{ at: 0, id: 'x-y' }], description: '', title: '' });
    expect(out).toEqual(BODY);
  });

  it('never touches the author’s prose', () => {
    /*
     * **THE PROPERTY R1 EXISTS FOR.** Whatever the advice says, every block that came out of
     * `parseMarkdown` is still in the result, byte-identical and in order. The model adds
     * headings; it cannot edit a paragraph, because the reply has no field that could.
     */
    const out = applyAdvice(BODY, {
      headings: [
        { at: 0, text: 'Satu', id: 'satu' },
        { at: 2, text: 'Dua', id: 'dua' },
      ],
      anchors: [{ at: 0, id: 'ignored' }],
      description: GOOD_DESCRIPTION,
      title: '',
    });
    expect(out.filter((b) => b.kind !== 'heading')).toEqual(BODY);
  });

  it('is the identity for empty advice', () => {
    expect(applyAdvice(BODY, empty())).toEqual(BODY);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(BODY);
    applyAdvice(BODY, { headings: [{ at: 0, text: 'X', id: 'x-y' }], anchors: [], description: '', title: '' });
    expect(BODY).toEqual(before);
  });
});

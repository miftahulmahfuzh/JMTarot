import { describe, expect, it } from 'vitest';
import { bullets, cardRef, h2, h3, link, para, s, steps, strong } from '@/content/blocks';
import type { Block } from '@/content/types';
import {
  headingIds,
  linkKind,
  linkPaths,
  phrasingText,
  plainText,
  readingMinutes,
  wordCount,
} from './doc';

const BODY = [
  h2('what-tarot-is', 'Apa itu tarot'),
  para(s('Tarot adalah '), strong('setumpuk kartu'), s(' bergambar.')),
  bullets([s('Mitos pertama.')], [s('Mitos kedua.')]),
  cardRef('the-moon', 'Yang belum jelas.'),
  para(s('Lihat '), link('/gallery', 'galeri'), s('.')),
];

/** S4's plain-string shapes, which the same functions must still flatten. */
const LORE: Block[] = [
  { kind: 'heading', level: 2, text: 'Tegak' },
  { kind: 'paragraph', text: 'Satu kalimat biasa.' },
  { kind: 'list', items: ['satu', 'dua'] },
  { kind: 'quote', text: 'Dikutip.', source: 'Waite, 1910' },
];

describe('plainText', () => {
  it('flattens every block that carries words, headings and card captions included', () => {
    const text = plainText(BODY);
    for (const fragment of [
      'Apa itu tarot',
      'Tarot adalah setumpuk kartu bergambar.',
      'Mitos pertama.',
      'Yang belum jelas.',
      'Lihat galeri.',
    ]) {
      expect({ fragment, present: text.includes(fragment) }).toEqual({ fragment, present: true });
    }
  });

  it("flattens S4's plain-string blocks too, source included", () => {
    const text = plainText(LORE);
    for (const fragment of ['Tegak', 'Satu kalimat biasa.', 'satu', 'dua', 'Dikutip.', 'Waite, 1910']) {
      expect({ fragment, present: text.includes(fragment) }).toEqual({ fragment, present: true });
    }
  });

  it('joins spans with NO inserted whitespace, so the copy lint sees what a reader sees', () => {
    /*
     * THE LOAD-BEARING HALF, and the reason reconciliation R16 granted `Inline[]` at
     * all. If `plainText` glued spans with a space, the lint would never see
     * `setumpukkartu` and the adjacency test in `blog.content.test.ts` would be
     * checking a string the renderer does not produce.
     */
    expect(plainText([para(s('a'), strong('b'), s('c'))])).toContain('abc');
    expect(phrasingText([s('a'), strong('b')])).toBe('ab');
    expect(phrasingText('a')).toBe('a');
  });

  it('separates BLOCKS with a newline, so a word cannot form across a boundary', () => {
    expect(plainText([para(s('satu')), para(s('dua'))])).toBe('satu\ndua');
  });
});

describe('wordCount and readingMinutes', () => {
  it('counts words, not spans', () => {
    expect(wordCount([para(s('satu '), strong('dua'), s(' tiga'))])).toBe(3);
  });

  it('rounds to whole minutes at 200 words per minute and never returns zero', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(1500)).toBe(8);
  });
});

describe('headingIds', () => {
  it('returns level-2 ids in document order', () => {
    expect(headingIds([...BODY, h2('next', 'Selanjutnya')], 2)).toEqual(['what-tarot-is', 'next']);
  });

  it('returns level-3 ids separately', () => {
    expect(headingIds([h2('a', 'A'), h3('b', 'B')], 3)).toEqual(['b']);
  });

  it('skips a heading with no id rather than emitting undefined', () => {
    /*
     * `heading.id` is OPTIONAL because the forty-four lore documents anchor with
     * `LORE_ANCHORS` and carry none. A heading with no id must be absent from this
     * list, not present as `undefined` -- the table of contents renders from it and
     * `<a href="#undefined">` is a dead link that looks like a live one.
     */
    expect(headingIds(LORE, 2)).toEqual([]);
  });

  it('returns an empty array rather than throwing on a document with no headings', () => {
    expect(headingIds([para(s('x'))], 2)).toEqual([]);
  });
});

describe('linkPaths', () => {
  it('finds inline links in paragraphs and in list items', () => {
    expect(
      linkPaths([para(s('a'), link('/gallery', 'g')), bullets([link('#next', 'n')])]),
    ).toEqual(['/gallery', '#next']);
  });

  it('does not report a cardRef as an inline link', () => {
    // A `cardRef` is a block with its own slug field, checked against `cardByUrlSlug`
    // rather than against the bare-path rule. Two checks, two shapes.
    expect(linkPaths([cardRef('the-moon', 'x')])).toEqual([]);
  });

  it('is empty on plain-string blocks rather than throwing', () => {
    expect(linkPaths(LORE)).toEqual([]);
  });
});

describe('linkKind', () => {
  it('classifies every path a content module may link to, and nothing else', () => {
    expect(linkKind('/arcana/the-moon')).toBe('arcana');
    expect(linkKind('/gallery')).toBe('gallery');
    expect(linkKind('/blog')).toBe('blog');
    expect(linkKind('/blog/how-to-read-tarot')).toBe('blog');
    expect(linkKind('#myths-and-facts')).toBe('anchor');
    expect(linkKind('/')).toBe('app');
    expect(linkKind('/thessaly')).toBe('app');
  });

  it('does not match a path that merely starts with the same letters', () => {
    // The `isPublic()` lesson: a prefix is not a match. `/galleryish` is not the gallery.
    expect(linkKind('/galleryish')).toBe('app');
    expect(linkKind('/blogroll')).toBe('app');
  });
});

describe('steps and bullets differ in the data, not only in the CSS', () => {
  it('marks an ordered list ordered', () => {
    // `<ol>` against `<ul>` is semantics: five numbered steps rendered as bullets is a
    // numbered procedure lying about being unnumbered (R16's wording).
    expect((steps([s('1')]) as { ordered?: boolean }).ordered).toBe(true);
    expect((bullets([s('a')]) as { ordered?: boolean }).ordered).toBe(false);
  });
});

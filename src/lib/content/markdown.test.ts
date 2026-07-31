import { describe, expect, it } from 'vitest';
import type { Block } from '@/content/types';
import { bullets, cardRef, em, h2, h3, link, para, s, steps, strong } from '@/content/blocks';
import { whatTarotIsId } from '@/content/blog/what-tarot-is.id';
import { whatTarotIsEn } from '@/content/blog/what-tarot-is.en';
import { howToReadTarotId } from '@/content/blog/how-to-read-tarot.id';
import { howToReadTarotEn } from '@/content/blog/how-to-read-tarot.en';
import { plainText } from './doc';
import { spansSeparate } from './lint';
import {
  normalizeBlocks,
  parseMarkdown,
  parseSpans,
  serializeMarkdown,
  serializeSpans,
  slugify,
} from './markdown';

/**
 * `docs/plans/2026-07-31-blog-markdown-editor-design.md` §4.
 *
 * **THE FIRST DESCRIBE BLOCK IS THE ONE THAT LICENSES DELETING `BlockEditor.tsx`.**
 * §4.2's ordering rule is a ruling, not a preference: 880 lines of form controls come out
 * only once `parseMarkdown ∘ serializeMarkdown` is identity over every document that
 * exists. Everything after it is the grammar, one case per row of the design's table,
 * plus the two holes the first draft of the module shipped.
 */

const ARTICLES = [
  ['what-tarot-is.id', whatTarotIsId],
  ['what-tarot-is.en', whatTarotIsEn],
  ['how-to-read-tarot.id', howToReadTarotId],
  ['how-to-read-tarot.en', howToReadTarotEn],
] as const;

/** `parse(serialize(b))` deep-equals `normalizeBlocks(b)`. The property, once. */
const roundTrips = (blocks: readonly Block[]) =>
  expect(parseMarkdown(serializeMarkdown(blocks))).toEqual(normalizeBlocks(blocks));

describe('§4.2 -- the round trip over every document that exists', () => {
  it.each(ARTICLES)('survives %s byte for byte', (_name, doc) => {
    /*
     * **THE FOUR COMMITTED ARTICLES ARE THE FIXTURES, AND THEY ARE NOT A TOY SET.**
     * Measured: 33 and 55 phrasing runs each, every span kind (40/68 `text`, 6/8 `link`,
     * 11/26 `strong`, 1/8 `em`), one `cardRef` each, `bullets` and `steps`, and
     * heading ids that are ENGLISH against Indonesian headings so `{#id}` is exercised on
     * every heading rather than on a contrived one.
     *
     * They also contain **zero bare-string paragraphs and zero newlines inside a span**,
     * which is why `normalizeBlocks` is the identity here and the assertion is exact
     * rather than up-to-normalisation.
     */
    roundTrips(doc.body);
  });

  it('is exact rather than up-to-normalisation on these four', () => {
    // If this ever fails, the previous case's guarantee has quietly weakened to
    // "equal after we changed it", and the deletion argument weakens with it.
    for (const [name, doc] of ARTICLES) {
      expect({ [name]: normalizeBlocks(doc.body) }).toEqual({ [name]: doc.body });
    }
  });

  it('is not vacuous -- the fixtures really do use the whole vocabulary', () => {
    const kinds = new Set<string>();
    const spanKinds = new Set<string>();
    for (const [, doc] of ARTICLES) {
      for (const b of doc.body) {
        kinds.add(b.kind);
        const runs = b.kind === 'paragraph' ? [b.text] : b.kind === 'list' ? b.items : [];
        for (const run of runs) {
          if (typeof run !== 'string') for (const sp of run) spanKinds.add(sp.kind);
        }
      }
    }
    expect([...kinds].sort()).toEqual(['cardRef', 'heading', 'list', 'paragraph']);
    expect([...spanKinds].sort()).toEqual(['em', 'link', 'strong', 'text']);
    // `quote` appears in NO article and has no `blocks.ts` helper -- `types.contract.test.ts`
    // asserts that absence deliberately -- so its round trip is covered by a fixture below.
    expect(kinds.has('quote')).toBe(false);
  });
});

describe('§4.1 -- the grammar, one case per row', () => {
  it('heading level 2 and 3, with a derived id', () => {
    expect(parseMarkdown('## Tarot itu apa')).toEqual([
      { kind: 'heading', level: 2, id: 'tarot-itu-apa', text: 'Tarot itu apa' },
    ]);
    expect(parseMarkdown('### Satu hal terakhir')).toEqual([
      { kind: 'heading', level: 3, id: 'satu-hal-terakhir', text: 'Satu hal terakhir' },
    ]);
  });

  it('heading with an explicit `{#id}`, which WINS over the derived one', () => {
    /*
     * The case the four committed articles are made of: `h2('what-tarot-is', 'Tarot itu
     * apa')`. `slugify` would give `tarot-itu-apa`, and an anchor is an INTERFACE --
     * `/blog/x#myths-and-facts` is linked from elsewhere and both locales share one set.
     */
    expect(parseMarkdown('## Tarot itu apa {#what-tarot-is}')).toEqual([
      { kind: 'heading', level: 2, id: 'what-tarot-is', text: 'Tarot itu apa' },
    ]);
  });

  it('emits `{#id}` only when it is NOT what slugify would derive', () => {
    // So the textarea stays clean for a heading whose anchor is its own words, and the
    // suffix is visible exactly where the author needs to see it.
    expect(serializeMarkdown([h2('tarot-itu-apa', 'Tarot itu apa')])).toBe('## Tarot itu apa\n');
    expect(serializeMarkdown([h2('what-tarot-is', 'Tarot itu apa')])).toBe(
      '## Tarot itu apa {#what-tarot-is}\n',
    );
    expect(serializeMarkdown([h3('x-y', 'Satu hal')])).toBe('### Satu hal {#x-y}\n');
  });

  it('never leaves a heading id empty', () => {
    // A heading with no id is a section missing from its own table of contents, with
    // nothing on screen looking wrong. `blog/[slug]/page.tsx` skips it in the TOC.
    for (const src of ['## Tarot itu apa', '## Tarot itu apa {#x}', '### A']) {
      const [block] = parseMarkdown(src);
      expect(block.kind === 'heading' && block.id).toBeTruthy();
    }
  });

  it('unordered and ordered lists, with `ordered` written explicitly', () => {
    expect(parseMarkdown('- satu\n- dua')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'satu' }], [{ kind: 'text', text: 'dua' }]],
      },
    ]);
    expect(parseMarkdown('1. satu\n2. dua')).toEqual([
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: 'satu' }], [{ kind: 'text', text: 'dua' }]],
      },
    ]);
  });

  it('renumbers an ordered list on the way out and does not care on the way in', () => {
    // `<ol>` is semantics rather than styling, and the numbers a reader sees come from
    // the browser. A paste numbered `1. 1. 1.` is still five steps in order.
    expect(parseMarkdown('1. a\n1. b\n1. c')).toEqual(parseMarkdown('1. a\n2. b\n3. c'));
    expect(serializeMarkdown([steps([s('a')], [s('b')])])).toBe('1. a\n2. b\n');
  });

  it('accepts a `*` bullet and never emits one', () => {
    expect(parseMarkdown('* satu')).toEqual(parseMarkdown('- satu'));
    expect(serializeMarkdown([bullets([s('satu')])])).toBe('- satu\n');
  });

  it('a quote, with and without its attribution', () => {
    expect(parseMarkdown('> Kartu tidak bicara.\n> — Somebody')).toEqual([
      { kind: 'quote', text: 'Kartu tidak bicara.', source: 'Somebody' },
    ]);
    expect(parseMarkdown('> Kartu tidak bicara.')).toEqual([
      { kind: 'quote', text: 'Kartu tidak bicara.', source: '' },
    ]);
    roundTrips([{ kind: 'quote', text: 'Kartu tidak bicara.', source: 'Somebody' }]);
    roundTrips([{ kind: 'quote', text: 'Kartu tidak bicara.', source: '' }]);
  });

  it('never invents a `source` it was not given', () => {
    /*
     * R1's line, in the smallest place it appears. `source` is required by the union and
     * refused empty by zod's `.min(1)` and by the lint -- three layers -- and this is the
     * one that must not guess. A plausible attribution would be this file writing prose.
     */
    const [block] = parseMarkdown('> Sesuatu tanpa sumber.');
    expect(block.kind === 'quote' && block.source).toBe('');
  });

  it('the four span kinds, both ways', () => {
    expect(parseSpans('biasa **kuat** *miring* [tautan](/gallery)')).toEqual([
      { kind: 'text', text: 'biasa ' },
      { kind: 'strong', text: 'kuat' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'miring' },
      { kind: 'text', text: ' ' },
      { kind: 'link', path: '/gallery', text: 'tautan' },
    ]);
    expect(serializeSpans([s('biasa '), strong('kuat'), s(' '), em('miring')])).toBe(
      'biasa **kuat** *miring*',
    );
  });

  it('reads `_em_` and writes `*em*`', () => {
    // The one place the OTHER direction is deliberately not identity: formatting
    // normalises, and forcing it to round-trip would mean storing the author's spelling.
    expect(parseSpans('_miring_')).toEqual([{ kind: 'em', text: 'miring' }]);
    expect(serializeSpans([em('miring')])).toBe('*miring*');
  });

  it('always returns at least one span', () => {
    expect(parseSpans('')).toEqual([{ kind: 'text', text: '' }]);
  });
});

describe('`cardRef` is recognised exactly, and the near-miss is the point', () => {
  it('a paragraph that is ONLY an /arcana/ link becomes a cardRef', () => {
    expect(parseMarkdown('[The Fool, nomor nol](/arcana/the-fool)')).toEqual([
      { kind: 'cardRef', slug: 'the-fool', text: 'The Fool, nomor nol' },
    ]);
    roundTrips([cardRef('the-fool', 'The Fool, nomor nol')]);
  });

  it('a paragraph with an /arcana/ link PLUS text stays a paragraph', () => {
    /*
     * **THE TEMPTING HEURISTIC IS "CONTAINS AN /arcana/ LINK", AND IT WOULD SWALLOW THE
     * SIX SUCH LINKS INSIDE THE LAUNCH ARTICLES' PROSE** -- `link('/arcana/wheel-of-fortune',
     * 'Wheel of Fortune')` sits mid-sentence inside a bullet about myths. Turning that
     * into a `cardRef` block would tear the sentence in half.
     */
    expect(parseMarkdown('Tidak ada. [Wheel of Fortune](/arcana/wheel-of-fortune) bisa berarti')).toEqual([
      {
        kind: 'paragraph',
        text: [
          { kind: 'text', text: 'Tidak ada. ' },
          { kind: 'link', path: '/arcana/wheel-of-fortune', text: 'Wheel of Fortune' },
          { kind: 'text', text: ' bisa berarti' },
        ],
      },
    ]);
  });

  it('a lone link that is NOT /arcana/ stays a paragraph', () => {
    expect(parseMarkdown('[galeri](/gallery)')).toEqual([
      { kind: 'paragraph', text: [{ kind: 'link', path: '/gallery', text: 'galeri' }] },
    ]);
  });

  it('refuses a malformed card slug, leaving a paragraph', () => {
    // `resolveViolations` answers *does this name a real card*; this only answers *is
    // this shaped like one*. An uppercase or trailing-hyphen slug is not.
    for (const path of ['/arcana/The-Fool', '/arcana/the--fool', '/arcana/the-fool/x', '/arcana/']) {
      const [block] = parseMarkdown(`[x](${path})`);
      expect({ path, kind: block.kind }).toEqual({ path, kind: 'paragraph' });
    }
  });
});

describe('the two holes the first draft shipped', () => {
  it('a `text` span containing two asterisks is not read as emphasis', () => {
    // `2 * 3 * 4` -- a regex `\*([^*]+)\*` reads `* 3 *` as an `em` span.
    roundTrips([para(s('Hitung 2 * 3 * 4 dulu.'))]);
    expect(parseMarkdown(serializeMarkdown([para(s('Hitung 2 * 3 * 4 dulu.'))]))).toEqual([
      { kind: 'paragraph', text: [{ kind: 'text', text: 'Hitung 2 * 3 * 4 dulu.' }] },
    ]);
  });

  it('a `text` span containing brackets and underscores survives', () => {
    roundTrips([para(s('Lihat [1] dan snake_case dan *bintang*.'))]);
  });

  it('a paragraph beginning with a block opener stays a paragraph', () => {
    /*
     * **THE BLOCK CHANGES KIND AND THE ONLY WITNESS IS A PREVIEW NOBODY IS LOOKING AT**,
     * because this fires when somebody opens a stored article to fix a typo.
     */
    for (const text of [
      '- lima kesalahan yang paling sering',
      '* bukan daftar',
      '## bukan judul',
      '### juga bukan',
      '1. tarik satu kartu',
      '> bukan kutipan',
    ]) {
      const out = parseMarkdown(serializeMarkdown([para(s(text))]));
      expect({ text, out }).toEqual({
        text,
        out: [{ kind: 'paragraph', text: [{ kind: 'text', text }] }],
      });
    }
  });

  it('an unclosed delimiter is literal text, never a refusal', () => {
    expect(parseSpans('2 * 3')).toEqual([{ kind: 'text', text: '2 * 3' }]);
    expect(parseSpans('a [b c')).toEqual([{ kind: 'text', text: 'a [b c' }]);
    expect(parseSpans('**kuat')).toEqual([{ kind: 'text', text: '**kuat' }]);
    expect(parseSpans('[x](/y')).toEqual([{ kind: 'text', text: '[x](/y' }]);
  });
});

describe('normalisation is renderer-invisible, which is what makes it acceptable', () => {
  const stored: Block[] = [
    { kind: 'paragraph', text: 'sebuah paragraf biasa' },
    { kind: 'list', ordered: false, items: ['satu', 'dua'] },
  ];

  it('promotes a bare-string phrasing to `Inline[]`', () => {
    // The forty-four lore documents use the bare string and are right to. Markdown cannot
    // tell the two apart, because they serialize to the same characters -- so the parser
    // emits `Inline[]` and a stored bare string is promoted the first time through.
    expect(parseMarkdown(serializeMarkdown(stored))).toEqual(normalizeBlocks(stored));
    expect(normalizeBlocks(stored)).not.toEqual(stored);
  });

  it('changes no linted string', () => {
    /*
     * **THE GUARANTEE R16 GRANTED `Inline[]` ON.** `plainText()` joins spans with the
     * EMPTY STRING, so the string the copy lint reads is byte-identical to the one the
     * reader reads -- and it must be byte-identical across the promotion too, or the
     * Malay grep and the tic lists are reading a different document after an edit.
     */
    expect(plainText(normalizeBlocks(stored))).toBe(plainText(stored));
    for (const [, doc] of ARTICLES) {
      expect(plainText(parseMarkdown(serializeMarkdown(doc.body)))).toBe(plainText(doc.body));
    }
  });

  it('is idempotent', () => {
    expect(normalizeBlocks(normalizeBlocks(stored))).toEqual(normalizeBlocks(stored));
  });
});

describe('the parse never throws and never drops a line', () => {
  it('survives the shapes a paste actually arrives in', () => {
    const pastes = [
      '',
      '\n\n\n',
      'satu baris tanpa apa-apa',
      'Windows\r\nline\r\nendings',
      '#### terlalu dalam',
      '##',
      '- \n- \n',
      '> \n',
      '   spasi di depan',
      '**',
      'teks\n\n\n\nteks',
    ];
    for (const p of pastes) expect(() => parseMarkdown(p), JSON.stringify(p)).not.toThrow();
  });

  it('normalises CRLF so no `\\r` reaches a stored span', () => {
    /*
     * A `\r` in a `text` span sits in the stored JSON while rendering as nothing, so
     * `plainText()` and the rendered page would disagree about a string the copy lint
     * reads. The block editor stripped newlines on the way into a span for the same
     * reason; here they are normalised before anything is split.
     */
    const blocks = parseMarkdown('## Judul\r\n\r\nSatu\r\ndua.\r\n');
    expect(JSON.stringify(blocks)).not.toMatch(/\\r/);
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, id: 'judul', text: 'Judul' },
      { kind: 'paragraph', text: [{ kind: 'text', text: 'Satu dua.' }] },
    ]);
  });

  it('joins a hard-wrapped paragraph into one block', () => {
    // A paste out of a plain-text editor arrives wrapped at eighty columns. Eight
    // paragraphs where the author wrote one is a visible defect on the public page.
    expect(parseMarkdown('Satu kalimat\nyang dibungkus\ndi tiga baris.')).toEqual([
      { kind: 'paragraph', text: [{ kind: 'text', text: 'Satu kalimat yang dibungkus di tiga baris.' }] },
    ]);
  });

  it('keeps a heading that follows a paragraph with no blank line between them', () => {
    expect(parseMarkdown('Paragraf.\n## Judul')).toEqual([
      { kind: 'paragraph', text: [{ kind: 'text', text: 'Paragraf.' }] },
      { kind: 'heading', level: 2, id: 'judul', text: 'Judul' },
    ]);
  });

  it('treats a level-4 heading as a paragraph rather than dropping it', () => {
    // `level` is 2 or 3 and NEVER 1 -- the page owns its single `<h1>`. A `####` is not
    // in the union, and the honest outcome is prose the author can see and fix.
    const [block] = parseMarkdown('#### terlalu dalam');
    expect(block.kind).toBe('paragraph');
  });
});

describe('the span-adjacency trap cannot be produced by a parse', () => {
  it('never emits two adjacent spans that would render as one word', () => {
    /*
     * A6-31's middle-dot strip exists because an HTML form field shows a trailing space no
     * more than it trims one. **In markdown the space is in the text**, so the parse
     * cannot produce a glued pair -- and this asserts it over the four real documents
     * rather than over a fixture, using the lint's own predicate.
     */
    for (const [name, doc] of ARTICLES) {
      const parsed = parseMarkdown(serializeMarkdown(doc.body));
      const glued: string[] = [];
      for (const b of parsed) {
        const runs = b.kind === 'paragraph' ? [b.text] : b.kind === 'list' ? b.items : [];
        for (const run of runs) {
          if (typeof run === 'string') continue;
          for (let i = 0; i + 1 < run.length; i++) {
            if (!spansSeparate(run[i].text, run[i + 1].text)) {
              glued.push(`${run[i].text.slice(-12)}|${run[i + 1].text.slice(0, 12)}`);
            }
          }
        }
      }
      expect({ [name]: glued }).toEqual({ [name]: [] });
    }
  });
});

describe('slugify', () => {
  it('is lowercase hyphens, capped at 60', () => {
    expect(slugify('Tarot itu apa')).toBe('tarot-itu-apa');
    expect(slugify('Major Arcana & Minor Arcana')).toBe('major-arcana-minor-arcana');
    expect(slugify('  Leading and trailing  ')).toBe('leading-and-trailing');
    expect(slugify('a'.repeat(90)).length).toBe(60);
  });

  it('matches the id the block editor derived, so no stored anchor moves', () => {
    // The function is lifted verbatim out of `BlockEditor.tsx`. If it drifted, opening a
    // stored article would silently re-derive anchors that are public addresses.
    expect(slugify('Mitos dan fakta')).toBe('mitos-dan-fakta');
  });
});

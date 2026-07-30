import { describe, expect, it } from 'vitest';
import { BLOG_ARTICLES } from '@/content/blog';
import { bullets, cardRef, h2, h3, link, para, s, steps, strong } from '@/content/blocks';
import type { Block } from '@/content/types';
import {
  applySegments,
  buildBlogTranslationPrompt,
  extractSegments,
  namesInDocument,
  parseSegments,
  verifyBlogTranslation,
} from './blogTranslate';
import type { LintDoc } from './lint';

/**
 * **THE ROUND TRIP IS THE WHOLE TEST FILE.** Everything else here is a corollary.
 *
 * `applySegments(doc, extractSegments(doc))` must deep-equal `doc` for every shape the
 * union can take — because that identity is what makes *"the model cannot break the
 * document"* a fact rather than a hope. If the two walks ever disagree about ORDER, a
 * translated article comes back with paragraph nine under heading eight, which reads as
 * prose and is wrong everywhere.
 */

const doc = (over: Partial<LintDoc> = {}): LintDoc => ({
  locale: 'id',
  slug: 'apa-itu-tarot',
  title: 'Apa itu tarot',
  description: 'Deskripsi yang cukup panjang untuk memenuhi pita delapan puluh karakter dengan mudah.',
  hero: null,
  body: [para(s('Satu kalimat.'))],
  ...over,
});

/** One of everything the union can express, including both `Phrasing` arms. */
const EVERY_SHAPE: Block[] = [
  h2('mulai', 'Mulai dari sini'),
  h3('lanjut', 'Lanjut'),
  para(s('Teks biasa dengan '), strong('penekanan'), s(' di tengah.')),
  { kind: 'paragraph', text: 'Paragraf sebagai satu string.' },
  para(s('Lihat '), link('/gallery', 'galeri'), s('.')),
  bullets([s('Butir satu')], [s('Butir '), strong('dua')]),
  steps([s('Langkah satu')], [s('Langkah dua')]),
  { kind: 'quote', text: 'Sebuah kutipan.', source: 'Seseorang' },
  cardRef('the-moon', 'The Moon'),
];

describe('the round trip is the identity', () => {
  it('rebuilds a document of every shape unchanged', () => {
    const d = doc({ body: EVERY_SHAPE, hero: { cardUrlSlug: 'the-moon', alt: 'Sebuah lukisan.' } });
    expect(applySegments(d, extractSegments(d))).toEqual(d);
  });

  it('rebuilds both committed articles unchanged, in both locales', () => {
    /*
     * The hand-written fixture above is the author's idea of the union; these four are
     * the prose that is live in production, and they are what the button will actually
     * be pointed at.
     */
    for (const entry of BLOG_ARTICLES) {
      for (const locale of entry.locales) {
        const b = entry.docs[locale]!;
        const d: LintDoc = {
          locale,
          slug: entry.slug,
          title: b.title,
          description: b.description,
          hero: b.hero,
          body: b.body,
        };
        expect(applySegments(d, extractSegments(d)), `${entry.slug}.${locale}`).toEqual(d);
      }
    }
  });

  it('collects every human-readable string and NOTHING else', () => {
    const d = doc({ body: EVERY_SHAPE, hero: { cardUrlSlug: 'the-moon', alt: 'Sebuah lukisan.' } });
    const segs = extractSegments(d);
    // Titles, description, hero alt, headings, spans, quote text + source, cardRef text.
    expect(segs).toContain('Mulai dari sini');
    expect(segs).toContain('Seseorang');
    expect(segs).toContain('Sebuah lukisan.');
    expect(segs).toContain('Paragraf sebagai satu string.');
    /*
     * **AND NOT ONE ADDRESS OR ANCHOR.** These are the four things a translated document
     * must carry through byte-identical: an anchor is an interface, and a path or a slug
     * is an address. A model that never sees them cannot change them.
     */
    for (const structural of ['mulai', 'lanjut', '/gallery', 'the-moon']) {
      expect(segs, structural).not.toContain(structural);
    }
  });
});

describe('applySegments replaces text and cannot touch structure', () => {
  it('keeps every id, path and slug when every string changes', () => {
    const d = doc({ body: EVERY_SHAPE, hero: { cardUrlSlug: 'the-moon', alt: 'x' } });
    const out = applySegments(
      d,
      extractSegments(d).map((_, i) => `SEG${i}`),
    );
    const ids = out.body.flatMap((b) => (b.kind === 'heading' ? [b.id] : []));
    expect(ids).toEqual(['mulai', 'lanjut']);
    expect(out.hero!.cardUrlSlug).toBe('the-moon');
    expect(out.body.flatMap((b) => (b.kind === 'cardRef' ? [b.slug] : []))).toEqual(['the-moon']);
    const paths = out.body.flatMap((b) =>
      b.kind === 'paragraph' && typeof b.text !== 'string'
        ? b.text.flatMap((x) => (x.kind === 'link' ? [x.path] : []))
        : [],
    );
    expect(paths).toEqual(['/gallery']);
    // The block kinds and their order, unchanged.
    expect(out.body.map((b) => b.kind)).toEqual(d.body.map((b) => b.kind));
    expect(out.body.every((b) => b.kind !== 'list' || b.items.length >= 1)).toBe(true);
  });

  it('keeps the plain-string arm a plain string, and the span arm spans', () => {
    // Coercing one into the other would change `plainText()`'s output and, through it,
    // what the copy lint reads.
    const d = doc({ body: EVERY_SHAPE });
    const out = applySegments(d, extractSegments(d));
    for (const [i, b] of out.body.entries()) {
      const o = d.body[i];
      if (b.kind === 'paragraph' && o.kind === 'paragraph') {
        expect(typeof b.text).toBe(typeof o.text);
      }
    }
  });

  it('THROWS on a count mismatch rather than merging what it has', () => {
    /*
     * A merge that tolerated a short list would leave half a document in the source
     * language — **worse than a refusal, because it looks finished.**
     */
    const d = doc({ body: EVERY_SHAPE });
    const segs = extractSegments(d);
    expect(() => applySegments(d, segs.slice(0, -1))).toThrow(/count mismatch/);
    expect(() => applySegments(d, [...segs, 'extra'])).toThrow(/count mismatch/);
  });
});

describe('parseSegments', () => {
  it('reads `N| text` back in declared-number order', () => {
    const r = parseSegments('1| satu\n2| dua\n3| tiga', 3);
    expect(r).toEqual({ ok: true, texts: ['satu', 'dua', 'tiga'] });
  });

  it('is POSITIONAL BY NUMBER, so a shuffled reply still lands correctly', () => {
    expect(parseSegments('2| dua\n1| satu', 2)).toEqual({ ok: true, texts: ['satu', 'dua'] });
  });

  it('refuses a DROPPED segment rather than shifting everything after it', () => {
    /*
     * An order-based parse would put segment 3's text into slot 2 and leave the document
     * one short at the end — paragraph nine under heading eight, which reads as prose.
     * Reading the number makes a drop a HOLE, and a hole is a count mismatch.
     */
    const r = parseSegments('1| satu\n3| tiga', 3);
    expect(r).toEqual({ ok: false, reason: 'count', got: 2, expected: 3 });
  });

  it('ignores commentary the model wrapped around the list', () => {
    const r = parseSegments('Tentu! Ini terjemahannya:\n\n1| satu\n2| dua\n\nSemoga membantu.', 2);
    expect(r).toEqual({ ok: true, texts: ['satu', 'dua'] });
  });

  it('reports `unparseable` when nothing matched at all', () => {
    expect(parseSegments('I cannot help with that.', 3)).toMatchObject({ reason: 'unparseable' });
  });

  it('eats ONE separator space and keeps every other one', () => {
    /*
     * **`blocks.ts`'s trap in a new costume.** `s('Lihat ')`'s trailing space is
     * load-bearing — dropping it renders `Lihatgaleri` — so a `.trim()` here would glue
     * spans together across a translation, silently, in a document that then fails the
     * `span-adjacency` lint the admin has to debug.
     */
    const r = parseSegments('1|  dua spasi di depan \n2|lihat ', 2);
    expect(r).toEqual({ ok: true, texts: [' dua spasi di depan ', 'lihat '] });
  });

  it('ignores a number outside the range and a duplicate', () => {
    expect(parseSegments('1| satu\n9| sembilan\n1| lagi\n2| dua', 2)).toEqual({
      ok: true,
      texts: ['satu', 'dua'],
    });
  });
});

describe('verifyBlogTranslation', () => {
  it('is quiet on a clean translation', () => {
    expect(
      verifyBlogTranslation({
        source: ['Kartu The Moon bicara soal kabut.'],
        translated: ['The Moon speaks about fog.'],
      }),
    ).toEqual([]);
  });

  it('catches a card name the model translated — the MECHANICAL half', () => {
    /*
     * V2's finding, stated in capitals in its own header: **the prompt rule alone
     * produced "Pulan" for The Moon.** Checked per segment rather than over the whole
     * document, so a name lost from paragraph forty is not hidden by the same name
     * surviving in paragraph two.
     */
    const v = verifyBlogTranslation({
      source: ['Kartu The Moon bicara soal kabut.'],
      translated: ['Kartu Pulan bicara soal kabut.'],
    });
    expect(v).toEqual([{ kind: 'card_name', detail: 'The Moon' }]);
  });

  it('catches an emptied segment', () => {
    const v = verifyBlogTranslation({ source: ['Satu kalimat.'], translated: ['  '] });
    expect(v).toEqual([{ kind: 'empty', detail: 'segmen 1' }]);
  });

  it('flags a long segment returned verbatim, and lets a short one alone', () => {
    /*
     * A segment that comes back identical is USUALLY correct — a proper noun, a number,
     * `tarocchi` — and occasionally the model giving up on one line. Counting them is how
     * the admin notices the second case; refusing on them would refuse the first, which
     * is why this is reported and never blocking.
     */
    const long = 'Kalimat yang cukup panjang untuk dihitung sebagai prosa.';
    expect(verifyBlogTranslation({ source: [long], translated: [long] })).toEqual([
      { kind: 'untranslated', detail: 'segmen 1' },
    ]);
    expect(verifyBlogTranslation({ source: ['tarocchi'], translated: ['tarocchi'] })).toEqual([]);
  });
});

describe('the prompt', () => {
  it('states the exact count and fences the material', () => {
    const p = buildBlogTranslationPrompt({
      segments: ['satu', 'dua', 'tiga'],
      from: 'id',
      to: 'en',
      names: ['The Moon'],
    });
    expect(p.system).toContain('3');
    expect(p.user).toContain('<terjemahan>');
    expect(p.user).toContain('1| satu');
    expect(p.user).toContain('3| tiga');
    // The names block is what makes the mechanical check PASS rather than merely detect.
    expect(p.system).toContain('The Moon');
    expect(p.maxTokens).toBeGreaterThan(0);
  });

  it('puts the material in the USER turn and the rules in the SYSTEM turn (M10)', () => {
    const p = buildBlogTranslationPrompt({ segments: ['satu'], from: 'id', to: 'en', names: [] });
    expect(p.system).not.toContain('<terjemahan>');
    expect(p.user).not.toContain('ATURAN');
  });

  it('carries the copy constraints the lint will enforce afterwards', () => {
    // Cheaper to ask than to refuse: every one of these is an error-class lint rule, and
    // a model told about them up front usually obeys.
    const p = buildBlogTranslationPrompt({ segments: ['satu'], from: 'id', to: 'en', names: [] });
    for (const rule of ['abundance', 'sacred', 'let me know', 'terapi']) {
      expect(p.system.toLowerCase(), rule).toContain(rule.toLowerCase());
    }
  });
});

describe('namesInDocument', () => {
  it('collects every distinct name across segments', () => {
    const names = namesInDocument(['Kartu The Moon.', 'Lalu The Moon lagi, dan Death.']);
    expect(names.sort()).toEqual(['Death', 'The Moon']);
  });
});

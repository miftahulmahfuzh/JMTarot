import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS, CARD_URL_SLUGS, cardById, cardUrlSlug, effectiveYesNo } from '@/data/deck';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import type { Block, LoreDoc } from '@/content/types';
import { ARCANA_LORE, LORE_SLUGS, loreFor } from './index';

/**
 * The copy lint over the lore documents (roadmap §11.4). **The release's only
 * quality gate on forty-four permanent documents a stranger reads first.**
 *
 * ── IT IS THE TYPED SIBLING OF `src/content/copy.test.ts`, NOT A DUPLICATE ────
 *
 * S1's file walks `src/content/**` with a regex over string literals, because it
 * landed before `LoreDoc` existed and had to bind before there was any content --
 * its own header says so and names walking the typed union as "S4's improvement to
 * make". This is that improvement, and **both stay**: S1's catches a stray file
 * that never reaches the registry, this one catches a field. The overlap is two
 * word lists run twice over the same strings, which costs milliseconds.
 *
 * ── THE LISTS ARE IMPORTED, NEVER COPIED ─────────────────────────────────────
 *
 * `src/lib/copy/vocab.ts`, the same module `glosses.test.ts` and S1's lint read. A
 * fifth copy of the Malay list is the failure that file's header was written to
 * prevent.
 *
 * ── THE MATCHER IS WORD-BOUNDARY AWARE, AND `sobat` IS WHY ───────────────────
 *
 * `THERAPY_ID` contains `obat`, and `sobat` ("mate") is ordinary casual
 * Indonesian. A bare `includes()` fails a correct sentence, and the fix somebody
 * reaches for when a lint fails correct prose is deleting the lint --
 * `tally.ts`'s two-tier design and `queries/contract.test.ts` both record the
 * lesson. `EN_TICS` entries additionally allow either apostrophe, because
 * `soul's journey` carries one and the source uses the typographic form.
 *
 * ── AND THE TRAP THAT WILL OTHERWISE GET THIS FILE DELETED ───────────────────
 *
 * **`EN_TICS` CONTAINS `abundance`, WHICH IS THE EMPRESS'S OWN ENGLISH KEYWORD IN
 * `cards.json`.** That is not a conflict to resolve with an exemption: the chip is
 * DATA, this lint scans `src/content/**`, and The Empress's lore simply has to say
 * what abundance IS instead of naming it -- which is the concrete register this
 * content is supposed to be in anyway. `sacred` (The Hierophant), `heal`/`healing`
 * (Temperance, The Star) and `shadow work` (The Devil, The Moon) are the same
 * shape and none of them is exempted either. **Anyone who "improves" this to scan
 * the RENDERED page fails on data S4 does not own** (`tools/generate_cards.py`
 * generates `cards.json`), concludes the lint is broken, and switches it off.
 */

/** Every authored string in one document, flattened, with its field path. */
function textsOf(doc: LoreDoc): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  const push = (field: string, text: string) => out.push({ field, text });
  const blocks = (field: string, bs: readonly Block[]) => {
    bs.forEach((b, i) => {
      const at = `${field}[${i}]`;
      if (b.kind === 'heading' || b.kind === 'paragraph') push(at, b.text);
      else if (b.kind === 'list') b.items.forEach((x, j) => push(`${at}.items[${j}]`, x));
      else if (b.kind === 'quote') {
        push(`${at}.text`, b.text);
        push(`${at}.source`, b.source);
      } else push(`${at}.text`, b.text);
    });
  };
  push('title', doc.title);
  push('description', doc.description);
  push('h1', doc.h1);
  push('standfirst', doc.standfirst);
  push('imageAlt', doc.imageAlt);
  push('yesno.note', doc.yesno.note);
  blocks('upright', doc.upright);
  blocks('reversed', doc.reversed);
  blocks('lore', doc.lore);
  blocks('inSpread', doc.inSpread);
  doc.questions.forEach((qa, i) => {
    push(`questions[${i}].q`, qa.q);
    push(`questions[${i}].a`, qa.a);
  });
  return out;
}

const ALL = LORE_SLUGS.flatMap((slug) =>
  (['id', 'en'] as const).map((locale) => ({ slug, locale, doc: loreFor(slug, locale)! })),
);

const INTERPRETATION = (doc: LoreDoc) =>
  textsOf(doc).filter((t) => t.field.startsWith('upright') || t.field.startsWith('reversed'));

/**
 * Collect every hit as a printable line, and assert the ARRAY is empty.
 *
 * **THE ASSERTION SHAPE IS THE POINT, AND THE FIRST DRAFT GOT IT WRONG.** Written
 * as `expect({ slug, field, word, hit }).toMatchObject({ hit: false })`, a real
 * failure prints only `hit: true` -- vitest omits the three MATCHING properties,
 * which are precisely the three that say which card, which field and which word.
 * Found by breaking the lint on purpose and reading the output, which is the only
 * way that class of defect ever surfaces: the test fails correctly and tells you
 * nothing. An array of strings compared against `[]` prints every offender.
 */
function noneOf(
  docs: readonly { slug: string; locale: string; doc: LoreDoc }[],
  words: readonly string[] | ((locale: string) => readonly string[]),
  pattern: (word: string) => RegExp,
): string[] {
  const hits: string[] = [];
  for (const { slug, locale, doc } of docs) {
    const list = typeof words === 'function' ? words(locale) : words;
    for (const { field, text } of textsOf(doc)) {
      for (const w of list) {
        if (pattern(w).test(text)) hits.push(`${slug}.${locale} ${field}: "${w}"`);
      }
    }
  }
  return hits;
}

/** Word-bounded, case-insensitive, and either apostrophe. `sobat` is why. */
const bounded = (w: string) => new RegExp(`\\b${w.replace(/'/g, "['\u2019]")}\\b`, 'i');

/**
 * The English words for each pair's INDONESIAN interpretation images, forbidden in
 * the English `upright` and `reversed`.
 *
 * `glosses.test.ts`'s mechanism, generalised. **ONE-DIRECTIONAL, LIKE THE
 * ORIGINAL, AND FOR W6's REASON**: Indonesian is the source language, so the
 * failure mode is translating INTO English.
 *
 * **SCOPED TO `upright` AND `reversed` ONLY. THE `lore` SECTION IS EXEMPT AND THE
 * EXEMPTION IS PRINCIPLED.** Both documents describe ONE painting, so they must
 * share its nouns -- towers, wolf, dog, crayfish, skull. Interpretation may not
 * share imagery; a description of a shared object must. `glosses.ts` exempts its
 * element glosses from its own table for the same shape of reason and says so.
 *
 * One row per card, and the first assertion below is what makes the table and the
 * registry impossible to drift apart.
 */
const DIVERGENCE: Record<string, string[]> = {
  'the-moon': ['step', 'night', 'guess', 'message', 'seven', 'two in the morning'],
};

describe('the lore documents', () => {
  it('found documents at all, so nothing below passes vacuously', () => {
    expect(ALL.length).toBeGreaterThan(0);
    expect(ALL.length % 2).toBe(0);
    for (const { doc } of ALL) expect(textsOf(doc).length).toBeGreaterThan(20);
  });

  // ── the copy constraints ──────────────────────────────────────────────────

  it('has no Malay in the Indonesian half', () => {
    // `## Copy constraints`. The eleven-word list, `id` ONLY -- running it against
    // English is theatre (`## Localization` rule 4). `\b` matters: `obat` is
    // inside `sobat`.
    const id = ALL.filter((x) => x.locale === 'id');
    expect(noneOf(id, MALAY, bounded)).toEqual([]);
  });

  it('has no therapy, diagnosis, treatment or healing language, in either locale', () => {
    /*
     * The rule that began as an App Review constraint and is kept because it was
     * always the honest line for an entertainment app. **THE ENGLISH LIST IS
     * LONGER, NOT SHORTER** -- English tarot and wellness writing is saturated
     * with this vocabulary in a way Indonesian is not.
     *
     * `anxiety` IS DELIBERATELY ABSENT from both lists and must stay absent; the
     * rule is against DIAGNOSIS, which is why `anxiety disorder`, `clinical` and
     * `diagnosed` are the entries that are there.
     */
    expect(noneOf(ALL, (l) => (l === 'id' ? THERAPY_ID : THERAPY_EN), bounded)).toEqual([]);
  });

  it('has none of the English generic-mystic tics', () => {
    const en = ALL.filter((x) => x.locale === 'en');
    expect(noneOf(en, EN_TICS, bounded)).toEqual([]);
    /*
     * And the two tics of SHAPE rather than of vocabulary, which `base.en.ts`
     * forbids in a reading for the same reason: the closing offer, and the
     * vocative. Neither is a word list, so they are patterns rather than entries
     * in `vocab.ts`.
     */
    const shapes = ['let me know if', 'feel free to', 'reach out', 'dear seeker', 'my friend'];
    expect(noneOf(en, shapes, (w) => new RegExp(w, 'i'))).toEqual([]);
  });

  it('keeps CARD NAMES IN ENGLISH in both locales, and refuses an invented one', () => {
    /*
     * `## Localization` rule 1. The model invents `Pulan` for The Moon and a human
     * writing Indonesian will reach for `Sang Bulan` -- and a card labelled
     * anything else disagrees with the reading and with `CardFace`'s own caption.
     *
     * **THE PATTERN IS `Sang ` FOLLOWED BY A CAPITAL, NOT A LIST OF NOUNS.**
     * Banning `Kematian`, `Keadilan` or `Kekuatan` would ban the ordinary
     * Indonesian words for death, justice and strength, which lore prose
     * legitimately uses -- the `lagi` trap in a new costume (`## Memory
     * features`). `Sang X` is the exact construction used to render an English
     * card title and appears in no ordinary sentence about a card.
     */
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      // Collected rather than asserted per field, for `noneOf`'s recorded reason:
      // a `toMatchObject({ hit: false })` prints only `hit: true` and hides the
      // three properties that say which card and which field.
      const named = textsOf(doc)
        .filter((t) => /\bSang [A-Z]/.test(t.text) || /\bPulan\b/i.test(t.text))
        .map((t) => `${slug}.${locale} ${t.field}`);
      expect(named).toEqual([]);
      // `Major Arcana` stays English too -- it is the eyebrow's own words.
      const joined = textsOf(doc).map((t) => t.text).join(' ');
      expect({ slug, locale, hit: /Ark?ana (Mayor|Utama|Besar)/i.test(joined) })
        .toMatchObject({ hit: false });
      // And the card must name itself, in English, in its own title and h1.
      expect(doc.title).toContain(card.name);
      expect(doc.h1).toContain(card.name);
      if (locale === 'id') expect(joined).toContain(card.name);
    }
  });

  it('spills nothing about how the app works (S-D7\u2019s corollary)', () => {
    // The same constraint roadmap §7 puts on S6's article. A lore page may name
    // the three services and the three positions and nothing else.
    const SECRETS = [
      'prompt', 'LLM', 'token', 'Shadow Arcana', 'Lotus', 'persona',
      'frequency verdict', 'system message', 'temperature', 'model',
    ];
    /*
     * **`' api '` IS DELIBERATELY NOT ON THIS LIST**, and S6 found out why while
     * writing: it fires on `elemen api`, which is Indonesian for the FIRE element
     * and appears in correct copy on six of these pages. `api key` and `/api/` are
     * the entries that would be safe; neither has ever been at risk here.
     */
    expect(noneOf(ALL, SECRETS, bounded)).toEqual([]);
  });

  // ── the shape constraints ─────────────────────────────────────────────────

  it('carries no HTML and no entities, because the source is UTF-8 prose', () => {
    for (const { slug, doc } of ALL) {
      for (const { field, text } of textsOf(doc)) {
        expect({ slug, field, hit: /<\/?[a-z][a-z0-9]*[\s/>]/i.test(text) })
          .toMatchObject({ hit: false });
        expect({ slug, field, hit: /&[a-z]+;|&#\d+;/i.test(text) })
          .toMatchObject({ hit: false });
        // No markdown either: the block union IS the structure.
        expect({ slug, field, hit: /(\*\*|^#{1,6}\s|\[[^\]]+\]\()/m.test(text) })
          .toMatchObject({ hit: false });
        expect({ slug, field, trimmed: text === text.trim() }).toMatchObject({ trimmed: true });
      }
    }
  });

  it('emits headings at level 2 or 3 only', () => {
    for (const { slug, doc } of ALL) {
      for (const bs of [doc.upright, doc.reversed, doc.lore, doc.inSpread]) {
        for (const b of bs) {
          if (b.kind === 'heading') {
            expect({ slug, level: b.level }).toMatchObject({ level: expect.anything() });
            expect([2, 3]).toContain(b.level);
          }
        }
      }
    }
  });

  it('keeps the SERP strings inside their budgets', () => {
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      const at = `${slug}.${locale}`;
      // <= 65 and no brand: the SERP budget is finite and `Tarot Major Arcana`
      // earns more on a query nobody knows us by than a brand suffix does.
      expect({ at, len: doc.title.length }).toMatchObject({ len: expect.any(Number) });
      expect(doc.title.length).toBeLessThanOrEqual(65);
      expect(doc.title).not.toContain('JMTarot');
      expect(doc.title).toContain(`(${card.numeral})`);
      // 110-165: under 110 wastes a slot Google fills from the body instead; over
      // 165 truncates mid-clause.
      expect({ at, len: doc.description.length }).toMatchObject({ len: expect.any(Number) });
      expect(doc.description.length).toBeGreaterThanOrEqual(110);
      expect(doc.description.length).toBeLessThanOrEqual(165);
      // The h1 is not the title.
      expect(doc.h1).not.toBe(doc.title);
      expect(doc.standfirst.length).toBeGreaterThanOrEqual(60);
    }
  });

  it('writes alt text that DESCRIBES rather than repeating the name', () => {
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      expect({ slug, locale, len: doc.imageAlt.length }).toMatchObject({ len: expect.any(Number) });
      expect(doc.imageAlt.length).toBeGreaterThanOrEqual(60);
      expect(doc.imageAlt.startsWith(card.name)).toBe(false);
      // A description of a painting has at least one clause boundary; the cheap
      // proxy is that it is not a bare noun phrase of keywords.
      expect({ slug, locale, punctuated: doc.imageAlt.includes(',') || doc.imageAlt.includes(';') })
        .toMatchObject({ punctuated: true });
    }
  });

  it('agrees with effectiveYesNo() in both orientations', () => {
    /*
     * **THE ONE PLACE A LORE PAGE COULD CONTRADICT THE APP AND NOBODY WOULD
     * NOTICE.** The flip is counter-intuitive -- The Moon answers `no` upright and
     * `yes` reversed -- so a writer following the artwork's mood gets it
     * backwards. Held as data and asserted, which is the same move §3.2's slug
     * table makes. The page renders the ENGINE's answer, never this field.
     */
    for (const { slug, locale, doc } of ALL) {
      const card = cardById(doc.cardId)!;
      expect({ slug, locale, ...doc.yesno }).toMatchObject({
        upright: effectiveYesNo({ card, reversed: false }),
        reversed: effectiveYesNo({ card, reversed: true }),
      });
      expect(doc.yesno.note.length).toBeGreaterThan(40);
    }
  });

  it('has every internal cardRef resolve to a real card, and never to itself', () => {
    // A dead internal link on forty-four pages is a real cost and nothing notices
    // it by eye. A self-link is a rendering bug that reads as a link.
    for (const { slug, doc } of ALL) {
      for (const b of [...doc.upright, ...doc.reversed, ...doc.lore, ...doc.inSpread]) {
        if (b.kind !== 'cardRef') continue;
        expect({ slug, ref: b.slug, resolves: CARDS.some((c) => cardUrlSlug(c) === b.slug) })
          .toMatchObject({ resolves: true });
        expect(b.slug).not.toBe(slug);
        expect(b.text.length).toBeGreaterThan(8);
      }
    }
  });

  it('has the block counts each section is specified for', () => {
    for (const { slug, locale, doc } of ALL) {
      const at = `${slug}.${locale}`;
      expect({ at, n: doc.upright.length }).toMatchObject({ n: expect.any(Number) });
      expect(doc.upright.length).toBeGreaterThanOrEqual(2);
      expect(doc.upright.length).toBeLessThanOrEqual(4);
      expect(doc.reversed.length).toBeGreaterThanOrEqual(2);
      expect(doc.reversed.length).toBeLessThanOrEqual(4);
      expect(doc.lore.length).toBeGreaterThanOrEqual(6);
      expect(doc.lore.length).toBeLessThanOrEqual(14);
      expect(doc.inSpread.length).toBeGreaterThanOrEqual(1);
      expect(doc.inSpread.length).toBeLessThanOrEqual(3);
      expect(doc.questions.length).toBeGreaterThanOrEqual(3);
      expect(doc.questions.length).toBeLessThanOrEqual(5);
      // Every quote carries a source with a name in it, or it reads as invented.
      for (const b of doc.lore) {
        if (b.kind === 'quote') expect(b.source.length).toBeGreaterThan(10);
      }
    }
  });

  // ── §8.2: rewritten, not translated ──────────────────────────────────────

  it('leads the two locales with DIFFERENT anchors', () => {
    for (const slug of LORE_SLUGS) {
      const pair = ARCANA_LORE[slug];
      expect({ slug, id: pair.id.anchor, en: pair.en.anchor })
        .toMatchObject({ id: expect.any(String), en: expect.any(String) });
      expect(pair.id.anchor).not.toBe(pair.en.anchor);
    }
  });

  it('shares no interpretation IMAGERY across the pair (the DIVERGENCE table)', () => {
    expect(Object.keys(DIVERGENCE).sort()).toEqual([...LORE_SLUGS].sort());
    for (const [slug, words] of Object.entries(DIVERGENCE)) {
      for (const { field, text } of INTERPRETATION(ARCANA_LORE[slug].en)) {
        for (const w of words) {
          expect({ slug, field, word: w, hit: new RegExp(`\\b${w}s?\\b`, 'i').test(text) })
            .toMatchObject({ hit: false });
        }
      }
    }
  });

  it('asks DIFFERENT questions in the two locales', () => {
    // A translated document asks the same questions in the same order. There is
    // no mechanical test for "different subject", so this forbids the cheapest
    // tell -- an identical list, positionally -- and the per-card editorial table
    // plus a reviewer's eye carry the rest.
    for (const slug of LORE_SLUGS) {
      const pair = ARCANA_LORE[slug];
      expect(pair.en.questions.map((q) => q.q)).not.toEqual(pair.id.questions.map((q) => q.q));
    }
  });

  // ── the file tree ────────────────────────────────────────────────────────

  it('has one file per registered document, named <slug>.<locale>.ts', () => {
    const files = readdirSync(join(process.cwd(), 'src/content/arcana'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');
    const expected = ALL.map(({ slug, locale }) => `${slug}.${locale}.ts`).sort();
    expect(files.sort()).toEqual(expected);
  });

  it('imports nothing but the type from a document file', () => {
    // A document is DATA. The moment one imports the deck, the engine or the
    // catalog, it has become code and the lint's flatten stops seeing all of its
    // prose.
    const dir = join(process.cwd(), 'src/content/arcana');
    for (const { slug, locale } of ALL) {
      const src = readFileSync(join(dir, `${slug}.${locale}.ts`), 'utf8');
      /*
       * ANCHORED TO AN `import` STATEMENT AT THE START OF A LINE, and it has to
       * be. The bare `from\s+['"]…['"]` this started as matched INSIDE the prose
       * -- an authored sentence ending in the word "from" before a `+`
       * concatenation reads as an import specifier to a regex that does not know
       * what a statement is, and the failure names a card rather than the test.
       */
      const specs = [...src.matchAll(/^import\s[^\n]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
      expect({ slug, locale, specs }).toMatchObject({ specs: ['@/content/types'] });
    }
  });
});

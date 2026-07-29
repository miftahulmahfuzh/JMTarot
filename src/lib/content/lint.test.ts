import { describe, expect, it } from 'vitest';
import { bullets, cardRef, h2, h3, link, para, s, steps, strong } from '@/content/blocks';
import type { Block } from '@/content/types';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import {
  ARTICLE_RULES,
  LAUNCH_ARTICLE_RULES,
  LAUNCH_SLUGS,
  LINT_RULES,
  badPath,
  divergenceAdvisory,
  formatViolation,
  hasErrors,
  lintDocument,
  lintTexts,
  rulesFor,
  spansSeparate,
  type LintDoc,
  type LintRule,
} from './lint';

/**
 * Every rule in `lint.ts`, both locale scopes, and the negative controls.
 *
 * **THE ASSERTION SHAPE IS THE POINT** (A6-14): every case below collects rule names
 * into an array and compares against `[]` or against an exact list. The per-word
 * `expect({ … }).toMatchObject({ hit: false })` form prints `hit: true` and nothing
 * else, because vitest omits the MATCHING properties -- which are precisely the ones
 * naming which document, which field and which word. S4 found that by breaking a lint
 * on purpose and reading the output.
 *
 * **THE SCOPE CASES ARE THE ONES THAT MATTER MOST** and each is asserted in BOTH
 * directions: the Malay grep fires on `id` and must NOT fire on `en`, the tic list
 * fires on `en` and must NOT fire on `id`. *Running the Malay words against English is
 * theatre* (`## Localization` rule 4) and a lint that does it anyway is a lint that
 * refuses correct English prose.
 */

/** A minimal document that violates nothing. Every case below mutates one field. */
function clean(over: Partial<LintDoc> = {}): LintDoc {
  return {
    locale: 'id',
    slug: 'sebuah-tulisan',
    title: 'Membaca tarot untuk pemula',
    description:
      'Panduan singkat untuk siapa pun yang baru memegang setumpuk kartu dan ingin tahu harus mulai dari mana hari ini.',
    hero: null,
    body: [
      h2('mulai', 'Mulai dari sini'),
      para(s('Ambil satu kartu, lihat gambarnya, dan katakan apa yang kamu lihat.')),
      para(s('Lihat '), link('/gallery', 'galeri'), s(' untuk melihat semuanya.')),
    ],
    ...over,
  };
}

const rulesIn = (doc: LintDoc, rules?: readonly LintRule[]) =>
  [...new Set(lintDocument(doc, rules).map((v) => v.rule))].sort();

describe('the fixtures are real, so nothing below passes vacuously', () => {
  it('lints a clean document to []', () => {
    expect(lintDocument(clean())).toEqual([]);
  });

  it('names every rule in LINT_RULES in one of the two sets, and only there', () => {
    /*
     * A rule added to `LINT_RULES` and to neither set is a rule that never runs, and
     * the failure is invisible: `lintDocument` simply does not check it.
     */
    expect([...ARTICLE_RULES, ...LAUNCH_ARTICLE_RULES].sort()).toEqual([...LINT_RULES].sort());
    expect(ARTICLE_RULES.filter((r) => LAUNCH_ARTICLE_RULES.includes(r))).toEqual([]);
  });
});

describe('the word lists, and their locale scopes (A6-2)', () => {
  it('refuses `tempoh` in the `id` half', () => {
    const doc = clean({ body: [para(s('Tunggu tempoh yang cukup sebelum menarik kartu lagi.'))] });
    expect(rulesIn(doc)).toContain('malay');
  });

  it('accepts the SAME word in the `en` half — running Malay against English is theatre', () => {
    /*
     * W6 rule 4 and `vocab.ts:35-40`. `kerana` is not a risk in English, and an `en`
     * document is entitled to any string that is not an English tic. The scope is the
     * rule; a lint that ignores it fails correct prose in one of the two locales.
     */
    const doc = clean({
      locale: 'en',
      title: 'A short guide',
      description:
        'A short guide for anyone holding a deck for the first time and wondering where on earth to begin with it.',
      body: [para(s('Tempoh and kerana and awak are not English words, and that is fine.'))],
    });
    expect(rulesIn(doc)).not.toContain('malay');
  });

  it('refuses every one of the eleven Malay words, one at a time', () => {
    const missed = MALAY.filter(
      (w) => !rulesIn(clean({ body: [para(s(`Kalimat dengan ${w} di dalamnya.`))] })).includes('malay'),
    );
    expect(missed).toEqual([]);
  });

  it('refuses the therapy vocabulary in BOTH locales, from each locale’s own list', () => {
    const missedId = THERAPY_ID.filter(
      (w) => !rulesIn(clean({ body: [para(s(`Kalimat dengan ${w} di dalamnya.`))] })).includes('therapy'),
    );
    expect(missedId).toEqual([]);

    const missedEn = THERAPY_EN.filter(
      (w) =>
        !rulesIn(
          clean({
            locale: 'en',
            body: [para(s(`A sentence with ${w} inside it.`))],
          }),
        ).includes('therapy'),
    );
    expect(missedEn).toEqual([]);
  });

  it('uses `anxiety` freely and `anxiety disorder` never', () => {
    /*
     * **THE NEGATIVE CONTROL, CARRIED VERBATIM FROM `blog.content.test.ts:435-440`.**
     * `anxiety` is deliberately absent from both therapy lists and must stay absent:
     * the rule is against DIAGNOSIS, which is why `anxiety disorder`, `clinical` and
     * `diagnosed` are the entries that are there. This case exists so that somebody
     * "tightening" the list has to argue with a named case.
     */
    expect([...THERAPY_EN]).not.toContain('anxiety');
    expect([...THERAPY_EN]).toContain('anxiety disorder');

    const ok = clean({
      locale: 'en',
      body: [para(s('That low-grade anxiety before you send the text is worth naming.'))],
    });
    expect(rulesIn(ok)).not.toContain('therapy');

    const bad = clean({
      locale: 'en',
      body: [para(s('This is not a treatment for an anxiety disorder.'))],
    });
    expect(rulesIn(bad)).toContain('therapy');
  });

  it('does not fire `obat` on `sobat`, because \\b is why the matcher is bounded', () => {
    // A bare `includes()` fails a correct sentence, and what somebody does when a
    // lint fails correct prose is delete the lint.
    const doc = clean({ body: [para(s('Tanya sobat kamu sebelum memutuskan.'))] });
    expect(rulesIn(doc)).not.toContain('therapy');
  });

  it('refuses the English tics in the `en` half and NOT in the `id` half', () => {
    const en = clean({
      locale: 'en',
      body: [para(s('A card about abundance and the Universe.'))],
    });
    expect(rulesIn(en)).toContain('tics');

    const id = clean({ body: [para(s('Kartu tentang abundance, kalau kamu mau menyebutnya begitu.'))] });
    expect(rulesIn(id)).not.toContain('tics');
  });

  it('matches a tic UNBOUNDED, which is `blog.content.test.ts:441-457`’s form kept exactly', () => {
    /*
     * The tic list is about REGISTER rather than about tokens: `manifesting` is the
     * same tic as `manifest`, and the whole reason `EN_TICS` exists is that all three
     * readers drift toward this vocabulary together. Bounded matching would let every
     * inflected form through.
     */
    const doc = clean({
      locale: 'en',
      body: [para(s('Manifesting what you want, energetically speaking.'))],
    });
    expect(rulesIn(doc)).toContain('tics');
  });

  it('refuses every tic, one at a time', () => {
    const missed = EN_TICS.filter(
      (w) =>
        !rulesIn(clean({ locale: 'en', body: [para(s(`A sentence with ${w} inside it.`))] })).includes(
          'tics',
        ),
    );
    expect(missed).toEqual([]);
  });

  it('refuses a closing offer in `en` only', () => {
    const en = clean({ locale: 'en', body: [para(s('Let me know if you want more.'))] });
    expect(rulesIn(en)).toContain('closing-offer');
    const id = clean({ body: [para(s('Kabari saja kalau mau tahu lebih banyak.'))] });
    expect(rulesIn(id)).not.toContain('closing-offer');
  });

  it('refuses an invented card name in both locales', () => {
    expect(rulesIn(clean({ body: [para(s('Kartu Sang Bulan bicara soal kabut.'))] }))).toContain(
      'card-names',
    );
    expect(
      rulesIn(clean({ locale: 'en', body: [para(s('Pulan is not a card in any deck.'))] })),
    ).toContain('card-names');
  });

  it('does not fire on the ordinary Indonesian words the invented names are built from', () => {
    /*
     * The `lagi` trap in a new costume. Banning `Kematian` alone would ban the
     * ordinary word for death, which article prose legitimately uses -- so the list
     * carries two-word constructions that appear in no ordinary sentence.
     */
    const doc = clean({ body: [para(s('Bulan purnama di atas jalan, dan roda yang berputar.'))] });
    expect(rulesIn(doc)).not.toContain('card-names');
  });

  it('refuses a tag and an HTML entity in an authored string', () => {
    expect(rulesIn(clean({ body: [para(s('Ini <em>miring</em> katanya.'))] }))).toContain('markup');
    expect(rulesIn(clean({ body: [para(s('Ini &ldquo;kutipan&rdquo; katanya.'))] }))).toContain(
      'markup',
    );
  });

  it('refuses an explanation of how JMTarot works', () => {
    expect(rulesIn(clean({ body: [para(s('Bacaan disusun oleh sebuah language model.'))] }))).toContain(
      'app-secrets',
    );
  });

  it("keeps `' api '` OFF the secrets list, permanently", () => {
    /*
     * **`api` IS INDONESIAN FOR FIRE** and any article naming the four elements trips
     * a substring check on it -- `workstream-notes.md:3716-3720` records that it fired
     * on `elemen api` in correct copy. `api key` and `/api/` are the shapes that
     * indicate a leak. A lint that cries wolf is a lint somebody deletes.
     */
    const doc = clean({
      body: [para(s('Empat elemen: elemen api, air, udara, dan tanah, masing-masing punya watak.'))],
    });
    expect(rulesIn(doc)).not.toContain('app-secrets');

    // And the two shapes that DO indicate a leak still fire.
    expect(rulesIn(clean({ body: [para(s('Simpan api key kamu baik-baik.'))] }))).toContain(
      'app-secrets',
    );
  });
});

describe('span adjacency — R16’s condition wearing a different hat (A6-16)', () => {
  /**
   * **THIS CASE MOVED HERE FROM `blog.content.test.ts` (§6.5, task 24), AND MOVING IT
   * IS NOT DELETING IT.** R16 says in those words: *if `doc.test.ts`'s joining
   * assertion or the adjacency case is deleted, revert `paragraph.text` to
   * `text: string`.* A6 inherits that condition and does not get to discharge it, and
   * losing this during a file move is exactly how it would be discharged by accident.
   * `doc.test.ts`'s joining assertion is untouched and lives where it always did.
   */
  it('catches a glued pair when it is given one — the negative control', () => {
    // `para(s('Lihat'), link('/gallery', 'galeri'))` renders `Lihatgaleri`. A
    // whitespace checker that has never been seen to fail is a checker nobody knows
    // works, and this one passes on four correct documents.
    expect(spansSeparate('Lihat', 'galeri')).toBe(false);
    const doc = clean({ body: [para(s('Lihat'), link('/gallery', 'galeri'))] });
    expect(rulesIn(doc)).toContain('span-adjacency');
  });

  it('accepts the same pair with its trailing space', () => {
    expect(spansSeparate('Lihat ', 'galeri')).toBe(true);
    expect(rulesIn(clean({ body: [para(s('Lihat '), link('/gallery', 'galeri'))] }))).not.toContain(
      'span-adjacency',
    );
  });

  it('accepts a punctuation boundary on either side', () => {
    expect(spansSeparate('kata,', 'lalu')).toBe(true);
    expect(spansSeparate('kata', '—lalu')).toBe(true);
    expect(spansSeparate('(', 'kata')).toBe(true);
  });

  it('walks list items and quote text, not only paragraphs', () => {
    const doc = clean({ body: [bullets([s('Satu'), strong('dua')])] });
    expect(rulesIn(doc)).toContain('span-adjacency');
  });
});

describe('bare paths — the shape half (A6-20)', () => {
  it('refuses a prefixed path, an absolute URL and an uppercase segment', () => {
    expect(badPath('/en/arcana/the-moon')).toBeTruthy();
    expect(badPath('https://example.test/x')).toBeTruthy();
    expect(badPath('/Arcana/The-Moon')).toBeTruthy();
    expect(badPath('/blog?utm=1')).toBeTruthy();
  });

  it('accepts a bare path and a lowercase in-page anchor', () => {
    expect(badPath('/arcana/the-moon')).toBeNull();
    expect(badPath('/gallery')).toBeNull();
    expect(badPath('/')).toBeNull();
    expect(badPath('#myths-and-facts')).toBeNull();
  });

  it('refuses an anchor that is not #lowercase-hyphens', () => {
    expect(badPath('#Myths And Facts')).toBeTruthy();
  });

  it('reports it as a `bare-path` violation from the document', () => {
    const doc = clean({ body: [para(s('Lihat '), link('/en/gallery', 'galeri'))] });
    expect(rulesIn(doc)).toContain('bare-path');
  });

  it('leaves RESOLUTION to the route handler, and says so', () => {
    /*
     * `cardByUrlSlug` lives in `@/data/deck`, which this module may not import
     * (A6-3), so *"does `/arcana/the-mooon` name a real card"* is answered beside the
     * zod parse in `POST /api/admin/blog`. The split is stated in both files and this
     * case is what stops somebody "completing" the rule here and dragging a card
     * gloss into the lint's reach.
     */
    expect(badPath('/arcana/the-mooon')).toBeNull();
  });
});

describe('structure', () => {
  it('refuses a level-2 heading with no id', () => {
    const doc = clean({ body: [{ kind: 'heading', level: 2, text: 'Tanpa id' } as Block] });
    expect(rulesIn(doc)).toContain('heading-id');
  });

  it('refuses a duplicate heading id, which makes one table-of-contents row unreachable', () => {
    const doc = clean({ body: [h2('sama', 'Satu'), h3('sama', 'Dua')] });
    expect(rulesIn(doc)).toContain('heading-id-unique');
  });

  it('refuses an empty quote source, which the TYPE cannot refuse', () => {
    // `source` is REQUIRED in the union, so a missing one is a compile error -- and an
    // empty string satisfies the type and defeats it. That is the whole reason the
    // rule exists rather than being left to TypeScript.
    const doc = clean({ body: [{ kind: 'quote', text: 'Sebuah kutipan.', source: '  ' }] });
    expect(rulesIn(doc)).toContain('quote-source');
  });
});

describe('the warning class — properties of a FINISHED article (A6-17)', () => {
  it('warns rather than errors on the title, the description and the hero alt', () => {
    const doc = clean({
      title: 'x'.repeat(120),
      description: 'terlalu pendek',
      hero: { cardUrlSlug: 'the-moon', alt: 'The Moon' },
    });
    const v = lintDocument(doc);
    const warned = [...new Set(v.filter((x) => x.cls === 'warning').map((x) => x.rule))].sort();
    expect(warned).toEqual(['description-band', 'hero-pair', 'title-length']);
    /*
     * **AND `hasErrors` IS FALSE, WHICH IS THE WHOLE PRODUCT JUDGEMENT.** A word-list
     * violation is a mistake at the moment it is typed; a description band is a
     * property of something finished. Refusing to SAVE a half-written draft is
     * refusing to let somebody write, and what they do then is paste the whole thing
     * in at the end, unreviewed -- the failure the gate exists to prevent, arrived at
     * by the gate.
     */
    expect(hasErrors(v)).toBe(false);
  });

  it('flags a hero alt that merely repeats the card name', () => {
    /*
     * `LoreDoc.imageAlt`'s rule, applied: the name is already in the `<h1>`, the prose
     * and the fact strip, and a fourth copy in `alt` is noise to a screen reader.
     *
     * **THE FOUR COMMITTED ARTICLES FAIL THIS, AND THAT IS A REAL FINDING RATHER THAN
     * A MIS-CALIBRATION.** All four hero alts are the bare card name. They import
     * fine -- `scripts/blog-import.ts` gates on the ERROR class -- and re-publishing
     * one after an unpublish asks the operator to write a real `alt` first, in one
     * field, which is the lint doing its job.
     */
    const doc = clean({ hero: { cardUrlSlug: 'the-high-priestess', alt: 'The High Priestess' } });
    const heroWarnings = lintDocument(doc).filter((v) => v.rule === 'hero-pair');
    expect(heroWarnings.map((v) => v.cls)).toEqual(['warning', 'warning']);
  });

  it('accepts a described hero', () => {
    const doc = clean({
      hero: {
        cardUrlSlug: 'the-high-priestess',
        alt: 'Seorang perempuan duduk di antara dua pilar gelap, gulungan di pangkuannya, bulan sabit di kakinya.',
      },
    });
    expect(rulesIn(doc)).not.toContain('hero-pair');
  });
});

describe('LAUNCH_ARTICLE_RULES bind two slugs, by name (R44)', () => {
  it('demands the three orientation anchors and the word floor of the launch pair only', () => {
    const short = clean({ slug: 'what-tarot-is' });
    expect(rulesIn(short, rulesFor('what-tarot-is')).filter((r) => LAUNCH_ARTICLE_RULES.includes(r)))
      .toEqual(['orientation-anchors', 'word-floor']);
  });

  it('asks NEITHER of an ordinary article — which is the whole of R44', () => {
    /*
     * *"An article about one card does not need `#what-tarot-is`."* Applied to every
     * future row these two rules refuse most of them, and what an author does with a
     * lint that refuses correct work is switch it off. Applied to nothing, the two
     * best articles lose their guarantees.
     */
    const doc = clean({ slug: 'kartu-the-moon' });
    expect(rulesIn(doc, rulesFor('kartu-the-moon'))).toEqual([]);
  });

  it('names exactly the two v0.4.0 slugs and nothing else', () => {
    expect([...LAUNCH_SLUGS].sort()).toEqual(['how-to-read-tarot', 'what-tarot-is']);
  });
});

describe('the divergence advisory is a PAIR predicate and never blocks (A6-15)', () => {
  it('reports every way an English document reads as a translation', () => {
    const id = clean({
      slug: 'x',
      title: 'Judul',
      description: 'Deskripsi yang cukup panjang untuk memenuhi pita delapan puluh karakter dengan mudah sekali.',
      body: [h2('satu', 'Satu'), cardRef('the-moon', 'The Moon'), para(s('Lihat '), link('/arcana/the-moon', 'The Moon'))],
    });
    const en = { ...id, locale: 'en' as const };
    const reasons = divergenceAdvisory(id, en);
    expect(reasons.length).toBeGreaterThan(3);
  });

  it('is quiet on a genuinely divergent pair', () => {
    const id = clean({
      title: 'Judul Indonesia',
      body: [h2('satu', 'Satu'), cardRef('the-moon', 'M'), para(s('Lihat '), link('/arcana/the-moon', 'x'))],
    });
    const en = clean({
      locale: 'en',
      title: 'An English title',
      description: 'A completely different sentence, written rather than translated, and long enough for the band.',
      body: [h2('two', 'Two'), cardRef('the-sun', 'S'), para(s('See '), link('/arcana/the-sun', 'x'))],
    });
    expect(divergenceAdvisory(id, en)).toEqual([]);
  });
});

describe('the violation is readable, and carries no prose (A6-14)', () => {
  it('formats one violation as one line naming the rule, the place and the word', () => {
    const doc = clean({ body: [para(s('Tunggu tempoh yang cukup.'))] });
    const line = formatViolation(lintDocument(doc)[0]);
    expect(line).toContain('malay');
    expect(line).toContain('tempoh');
  });

  it('truncates the excerpt and never carries the whole document', () => {
    const long = `Tunggu tempoh yang cukup. ${'lorem ipsum '.repeat(40)}`;
    const doc = clean({ body: [para(s(long))] });
    for (const v of lintDocument(doc)) expect(v.excerpt.length).toBeLessThanOrEqual(60);
  });

  it('carries the caller’s own location label through `at`', () => {
    // Caller 1 has a `LoreDoc` with fields this union does not name, and reports
    // `upright[3].items[2]`. The five-value `field` is what the editor groups by.
    const v = lintTexts([{ field: 'body', at: 'upright[3]', text: 'tempoh' }], 'id');
    expect(v[0].at).toBe('upright[3]');
    expect(v[0].field).toBe('body');
  });
});

describe('lintTexts and lintDocument cannot drift (A-D13: same word lists, same function)', () => {
  it('gives the same verdict on the same string through both doors', () => {
    /*
     * `lintDocument` is BUILT ON `lintTexts` rather than written beside it, and this
     * is the mechanical statement of that. Two implementations of the Malay grep --
     * one for lore, one for articles -- is exactly the divergence `vocab.ts`'s header
     * says cost `tempoh` its place the first time.
     */
    const line = 'Tunggu tempoh yang cukup sebelum menarik kartu.';
    const viaTexts = lintTexts([{ field: 'body', text: line }], 'id').map((v) => v.rule);
    const viaDoc = lintDocument(clean({ body: [para(s(line))] })).map((v) => v.rule);
    expect(viaTexts).toEqual(viaDoc);
  });
});

describe('the ordered-list arm is walked too', () => {
  it('lints a `steps` item exactly as it lints a paragraph', () => {
    const doc = clean({ body: [steps([s('Tunggu tempoh yang cukup.')])] });
    expect(rulesIn(doc)).toContain('malay');
  });
});

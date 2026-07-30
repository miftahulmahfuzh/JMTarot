/**
 * The copy lint, extracted so a database row is gated by the same words a committed
 * file was. **v0.5.0 / A6, decision A-D13, reconciliation R43 and R44.**
 *
 * ── WHY IT MOVED, AND WHAT WOULD HAVE BEEN LOST IF IT HAD NOT ────────────────
 *
 * `src/content/types.ts:38` says in capitals: **THE LINT IS THE REASON THIS IS
 * DATA.** *"Anyone converting these files to TSX for authoring comfort switches the
 * release's only quality gate off, silently."* **A DATABASE ROW IS THE SAME HAZARD
 * IN DIFFERENT CLOTHES** (A6-1), and the hazard is not that the prose becomes
 * unstructured -- a row keeps the typed block union and `plainText()` still restores
 * the exact reader string -- it is that **no test runs over it**. All thirty-six
 * cases in `blog.content.test.ts` derive their fixtures from `BLOG_ARTICLES`, so the
 * commit that deletes `src/content/blog/**` deletes the gate over the two articles
 * that are live in production, not merely over their source.
 *
 * Hence **THREE callers, not the two A-D13 names** (R43):
 *
 *   1. `src/content/arcana/lore.test.ts`, over S4's forty-four lore documents.
 *   2. `POST` / `PUT /api/admin/blog`, over a submitted body, before storage.
 *   3. `src/app/blog/blog.published.integration.test.ts`, over every published ROW.
 *
 * The third is the one that keeps A-D13 honest: without it, *"the lint survives the
 * move to Postgres"* is true of new writes and false of everything already
 * published -- and the failure is invisible, because **the lint would be passing on
 * an empty set.** `scripts/blog-import.ts` is a fourth in effect and is deliberately
 * not counted; it lints the same documents caller 1's sibling test already covers,
 * and it is there so the import cannot introduce prose the API would have refused.
 *
 * ── PURE, AND THE MARKER-FREE RULE IS NOT DECORATIVE ─────────────────────────
 *
 * Imports: `@/lib/copy/vocab`, `@/lib/content/doc`, `@/lib/i18n/prefix` (edge-safe,
 * marker-free, and see `badPath` for why it is here rather than a `'/en/'` literal),
 * and TYPES ONLY from `@/content/types` and `@/lib/i18n/locale`. **No `server-only`** -- the vitest
 * suite and `scripts/blog-import.ts` both import this and the marker throws outside
 * a Next server bundle. No `process.env`, no React, no `next/*`, and **no
 * `@/data/deck`** (A6-3, and see `bare-path` below). `queries/contract.test.ts`
 * walks the graph transitively, so acquiring any of them here would fail a test in
 * a directory this file is not in.
 *
 * ── TWO RULE SETS, AND MERGING THEM MAKES THE EDITOR REFUSE VALID ARTICLES ───
 *
 * **R44.** The three orientation anchors, the ~1100-word floor and the `en`/`id`
 * divergence proof are facts about **the two launch articles**, not about *an*
 * article: an article about one card needs no `#what-tarot-is` and may honestly be
 * six hundred words. Applied to every future row they refuse most of them, and what
 * an author does with a lint that refuses correct work is switch it off. Applied to
 * nothing, the two best articles lose their guarantees.
 *
 *   `ARTICLE_RULES`         bind every row, every save, forever.
 *   `LAUNCH_ARTICLE_RULES`  bind the two imported slugs only, BY NAME.
 *
 * `rulesFor(slug)` is the join and it is the only place the two slugs are named.
 *
 * ── IT RETURNS AN ARRAY. `[]` IS CLEAN. IT NEVER THROWS AND NEVER RETURNS A
 *    BOOLEAN (A6-14) ───────────────────────────────────────────────────────────
 *
 * A boolean cannot tell an author WHICH word; a throw cannot report the second
 * violation. And the array shape is what makes the assertion readable, which is not
 * a detail: S4 wrote the per-word form
 * `expect({ slug, field, word, hit }).toMatchObject({ hit: false })` and *"then it
 * prints `hit: true` and nothing else -- vitest omits the three MATCHING
 * properties"*, which are precisely the three that say which document, which field
 * and which word. **Collect into an array, compare against `[]`, format each entry
 * as one string.** Found by breaking a lint on purpose and reading the output; do
 * not un-learn it.
 *
 * ── THE SCOPE IS `src/content/**` PLUS SUBMITTED BODIES. NEVER THE RENDERED PAGE ─
 *
 * A6-3, and it is recorded in CLAUDE.md verbatim. `EN_TICS` bans `abundance`, which
 * is The Empress's own English keyword in generated `cards.json`; so are `sacred`
 * (The Hierophant), `heal`/`healing` (Temperance, The Star) and `shadow work` (The
 * Devil, The Moon). **Anyone who widens this to the rendered page fails on data the
 * blog does not own, concludes the lint is broken, and switches it off.** The
 * mechanical consequence: `lintDocument` takes a DOCUMENT, never a page, never a
 * slug it resolves, and nothing here can reach a card gloss.
 */
import type { Block } from '@/content/types';
import type { Locale } from '@/lib/i18n/locale';
import { headingIds, linkPaths, phrasingText, plainText, wordCount } from '@/lib/content/doc';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import { stripLocalePrefix } from '@/lib/i18n/prefix';

export type LintClass = 'error' | 'warning';

/**
 * Which part of the document. **FIVE VALUES, AND THE EDITOR GROUPS BY THEM** -- a
 * violation the author cannot locate is a violation they cannot fix.
 *
 * A lore document has more fields than these (`h1`, `standfirst`, `imageAlt`,
 * `questions[3].a`); caller 1 maps them onto this set and carries the precise
 * location in `at`, which is why that field exists.
 */
export type LintField = 'title' | 'description' | 'body' | 'hero' | 'slug';

export type LintViolation = {
  /** The kebab-case rule name, from the closed set below. */
  rule: LintRule;
  cls: LintClass;
  locale: Locale;
  field: LintField;
  /**
   * The offending word, id or path. **NEVER the whole document** -- this string
   * reaches `admin.blog_saved`'s neighbourhood, an editor pane and a cron report,
   * and a lint that echoes the prose it is linting is a lint that logs the prose.
   * (`admin.blog_saved` carries only the COUNT; see `events.ts`.)
   */
  detail: string;
  /** <= 60 characters of the line it was found in. Enough to find it, never a copy. */
  excerpt: string;
  /**
   * The caller's own location label, when it has one more precise than `field`.
   * `upright[3].items[2]` for a lore document; absent for a blog body.
   */
  at?: string;
};

/**
 * Every rule, as a closed set. **A NEW RULE IS AN ENTRY HERE AND A CASE IN
 * `lint.test.ts`**, in the same commit, or the rule sets below silently do not
 * carry it.
 */
export const LINT_RULES = [
  'malay',
  'therapy',
  'tics',
  'closing-offer',
  'card-names',
  'markup',
  'app-secrets',
  'span-adjacency',
  'bare-path',
  'dead-anchor',
  'heading-id',
  'heading-id-unique',
  'title-length',
  'description-band',
  'quote-source',
  'hero-pair',
  // LAUNCH_ARTICLE_RULES only.
  'orientation-anchors',
  'word-floor',
] as const;

export type LintRule = (typeof LINT_RULES)[number];

/**
 * **BIND EVERY ROW, EVERY SAVE, FOREVER** (R44).
 *
 * The word lists, the markup ban, the secrets list, span adjacency, bare paths, the
 * heading-id interface, `quote.source`, and the three cosmetic bands as WARNINGS.
 * Every one of them is a fact about *an* article rather than about the two we
 * happen to have written.
 */
export const ARTICLE_RULES: readonly LintRule[] = [
  'malay',
  'therapy',
  'tics',
  'closing-offer',
  'card-names',
  'markup',
  'app-secrets',
  'span-adjacency',
  'bare-path',
  'dead-anchor',
  'heading-id',
  'heading-id-unique',
  'title-length',
  'description-band',
  'quote-source',
  'hero-pair',
];

/**
 * **BIND THE TWO IMPORTED SLUGS ONLY** (R44, A6-15).
 *
 * `orientation-anchors` exists because reconciliation R5 of v0.4.0 moved the public
 * footer's three links onto `what-tarot-is` and both launch documents carry the
 * sections: they are an interface **of those two documents**. `word-floor` is
 * roadmap §7's *"substantial -- a real article, not 300 words"*, which is a fact
 * about the launch pair and not a property the CMS may demand of everything.
 *
 * **THE `en`/`id` DIVERGENCE PROOF IS NOT HERE AND CANNOT BE**, because it is a
 * predicate over TWO documents and this function sees one. It survives as
 * `divergenceAdvisory()` below -- a publish-time advisory in the editor, never
 * blocking, because the `en` document is legitimately empty for an hour while
 * somebody writes it -- and as a hard assertion over the two launch slugs in
 * `blog.published.integration.test.ts`.
 */
export const LAUNCH_ARTICLE_RULES: readonly LintRule[] = ['orientation-anchors', 'word-floor'];

/**
 * The two articles v0.4.0 shipped, by name.
 *
 * **THE ONLY PLACE THEY ARE NAMED, AND THAT IS THE POINT OF R44.** A third article
 * is not required to carry their interface; these two are, because their anchors are
 * linked from the public footer and their length is what makes them worth indexing.
 */
export const LAUNCH_SLUGS = ['what-tarot-is', 'how-to-read-tarot'] as const;

/** `ARTICLE_RULES`, plus the launch set for the two slugs that own it. */
export function rulesFor(slug: string): readonly LintRule[] {
  return (LAUNCH_SLUGS as readonly string[]).includes(slug)
    ? [...ARTICLE_RULES, ...LAUNCH_ARTICLE_RULES]
    : ARTICLE_RULES;
}

/** The three orientation sections. Locale-invariant ids; an anchor is an INTERFACE. */
const ORIENTATION_ANCHORS = ['what-tarot-is', 'myths-and-facts', 'what-its-for'] as const;

/** The launch pair's floor. Roadmap §7's "substantial", made a number. */
const WORD_FLOOR = 1100;

/**
 * The document, as the lint sees it.
 *
 * Deliberately NOT `BlogDoc`: this is also what a submitted body looks like before
 * anything has decided it is a valid document, and what `toLintDoc()` builds from a
 * database row. A lint that only accepts the type the renderer accepts is a lint
 * that cannot run on the write path.
 */
export type LintDoc = {
  locale: Locale;
  slug: string;
  title: string;
  description: string;
  hero: { cardUrlSlug: string; alt: string } | null;
  body: readonly Block[];
};

/** One named string, for the word-list half. Caller 1's door. */
export type LintText = { field: LintField; at?: string; text: string };

// ── the word lists, as matchers ────────────────────────────────────────────────

/**
 * Word-bounded, case-insensitive, either apostrophe.
 *
 * **`\b` MATTERS AND `sobat` IS WHY**: `THERAPY_ID` contains `obat`, and `sobat`
 * ("mate") is ordinary casual Indonesian. A bare `includes()` fails a correct
 * sentence, and what somebody does when a lint fails correct prose is delete the
 * lint.
 */
const bounded = (w: string) => new RegExp(`\\b${escapeRe(w).replace(/'/g, "['’]")}\\b`, 'i');

/**
 * **NOT word-bounded, and that is `blog.content.test.ts:441-457`'s form kept
 * exactly.** The tic list is about register rather than about tokens: `manifesting`
 * and `abundant` are the same tic as `manifest` and `abundance`, and the whole
 * reason `EN_TICS` exists is that all three readers drift toward this vocabulary
 * together.
 */
const unbounded = (w: string) => new RegExp(escapeRe(w).replace(/'/g, "['’]"), 'i');

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Card names a writer or a model invents. **NEVER A LIST OF ORDINARY NOUNS.**
 *
 * **`Kematian` WAS ON THIS LIST AND HAD TO COME OUT** (2026-07-30, on the first real
 * article anybody tried to write through the editor). It came from
 * `blog.content.test.ts`, where it never fired because none of the four launch
 * documents happens to use the word -- and `lore.test.ts` had ALREADY rejected the
 * noun-list approach, in capitals: *"THE PATTERN IS `Sang ` FOLLOWED BY A CAPITAL, NOT
 * A LIST OF NOUNS. Banning `Kematian`, `Keadilan` or `Kekuatan` would ban the ordinary
 * Indonesian words for death, justice and strength, which lore prose legitimately uses
 * -- the `lagi` trap in a new costume."*
 *
 * It refused `kartu "Death" (Kematian)`, which is the CORRECT construction: the card
 * named in English, glossed once for the reader. And because the match is
 * case-sensitive, `kematian fisik` passed while `Kematian` at a sentence start failed
 * -- a position-dependent false positive, which is the worst kind. **A lint that cries
 * wolf is a lint somebody deletes.**
 *
 * What is left is the `Sang X` construction, two-word renamings that appear in no
 * ordinary sentence, and `Pulan`, which is the name a model actually invented for The
 * Moon. Every one of them is a phrase used INSTEAD OF the English name.
 */
const INVENTED_CARD_NAMES = [
  'Sang Pandir',
  'Bulan Tarot',
  'Roda Keberuntungan',
  'Pulan',
  'Sang Bulan',
  'Kartu Bulan',
] as const;

/**
 * A parenthesised match is a GLOSS, not a rename, and is not a violation.
 *
 * `kartu "Wheel of Fortune" (Roda Keberuntungan)` names the card in English and
 * translates it once for a reader who has never seen a deck — which is the thing an
 * article explaining tarot to a beginner is FOR. **The rule's target is an Indonesian
 * name used in place of the English one**, and a rename in running prose is never
 * parenthesised.
 *
 * Deliberately looser than "the English name must precede it": that would need the
 * deck, which this module may not import (A6-3).
 */
function isGloss(text: string, name: string): boolean {
  return new RegExp(`[(\u201c"']\s*${escapeRe(name)}\s*[)\u201d"']`).test(text);
}

/**
 * How this application works. **LOWERCASED SUBSTRING, NOT WORD-BOUNDED.**
 *
 * Miftah's brief: *"dont spill our business secrets… just spout some bullshit on how
 * to read tarot in general."* Read as: write about tarot, not about us.
 *
 * **`' api '` IS NOT ON THIS LIST AND MUST NEVER GO BACK ON IT.** `api` is
 * Indonesian for fire, and any article naming the four elements trips it --
 * `workstream-notes.md:3716-3720` records that it fired on `elemen api` in correct
 * copy. `api key` and `/api/` are the shapes that indicate a leak. **A lint that
 * cries wolf is a lint somebody deletes.**
 */
const APP_SECRETS = [
  'prompt',
  'system prompt',
  'llm',
  'language model',
  'model bahasa',
  'shadow arcana',
  'lotus',
  'teratai',
  'openai',
  'anthropic',
  'kecerdasan buatan',
  'artificial intelligence',
  'api key',
  '/api/',
  'algoritma',
  'algorithm',
] as const;

/** The closing offer. A shape rather than a vocabulary, so it is a pattern. */
const CLOSING_OFFER = /\b(let me know|feel free to|if you'?d like|happy to|i hope this helps)\b/i;

/** Any tag or HTML entity in an authored string. `types.ts`'s embraced consequence. */
const MARKUP = /<\/?[a-z][^>]*>|&[a-z]+;|&#\d+;/i;

/** A slug is hyphenated lowercase ASCII. The same shape the CHECK constraint holds. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** An in-page anchor. Never prefixed by `Prose`, so its shape is its own. */
const ANCHOR_RE = /^#[a-z0-9-]+$/;

/** A bare internal path. No scheme, no `/en/`, no query, no uppercase. */
const BARE_PATH_RE = /^\/[a-z0-9/-]*$/;

// ── the two entry points ───────────────────────────────────────────────────────

/**
 * The word-list half, over named strings. **CALLER 1's DOOR.**
 *
 * `lore.test.ts` has a `LoreDoc`, not a `BlogDoc`, and flattens it into `{ field,
 * at, text }` triples of its own. It gets **the same lists and the same matchers**
 * as an article does, which is A-D13's requirement in as many words -- *"same word
 * lists, same function"* -- and `lintDocument` below is built on this call rather
 * than beside it, so the two cannot drift.
 *
 * The structural rules (spans, paths, heading ids, the bands) are absent here
 * because they are questions about a `Block[]`, and a lore document's blocks live in
 * four separate arrays with four different meanings.
 */
export function lintTexts(
  texts: readonly LintText[],
  locale: Locale,
  rules: readonly LintRule[] = ARTICLE_RULES,
): LintViolation[] {
  const out: LintViolation[] = [];
  const on = (r: LintRule) => rules.includes(r);

  const hit = (
    rule: LintRule,
    cls: LintClass,
    t: LintText,
    detail: string,
  ): void => {
    out.push({ rule, cls, locale, field: t.field, detail, excerpt: excerptOf(t.text), ...(t.at ? { at: t.at } : {}) });
  };

  for (const t of texts) {
    if (on('malay') && locale === 'id') {
      for (const w of MALAY) if (bounded(w).test(t.text)) hit('malay', 'error', t, w);
    }
    if (on('therapy')) {
      for (const w of locale === 'en' ? THERAPY_EN : THERAPY_ID) {
        if (bounded(w).test(t.text)) hit('therapy', 'error', t, w);
      }
    }
    if (on('tics') && locale === 'en') {
      for (const w of EN_TICS) if (unbounded(w).test(t.text)) hit('tics', 'error', t, w);
    }
    if (on('closing-offer') && locale === 'en' && CLOSING_OFFER.test(t.text)) {
      hit('closing-offer', 'error', t, CLOSING_OFFER.exec(t.text)![0]);
    }
    if (on('card-names')) {
      for (const n of INVENTED_CARD_NAMES) {
        if (t.text.includes(n) && !isGloss(t.text, n)) hit('card-names', 'error', t, n);
      }
    }
    if (on('markup') && MARKUP.test(t.text)) {
      hit('markup', 'error', t, MARKUP.exec(t.text)![0]);
    }
    if (on('app-secrets')) {
      const lower = t.text.toLowerCase();
      for (const s of APP_SECRETS) if (lower.includes(s)) hit('app-secrets', 'error', t, s);
    }
  }
  return out;
}

/**
 * The whole lint over one document, in one locale. **CALLERS 2 AND 3's DOOR.**
 *
 * `rules` defaults to `ARTICLE_RULES`; the save path passes `rulesFor(slug)` so the
 * two launch articles keep their extra guarantees and nothing else acquires them.
 */
export function lintDocument(
  doc: LintDoc,
  rules: readonly LintRule[] = ARTICLE_RULES,
): LintViolation[] {
  const on = (r: LintRule) => rules.includes(r);
  const out: LintViolation[] = [];

  /*
   * The word lists run over EVERY authored string, and the three fields outside the
   * body are named individually rather than concatenated -- `textOf()` in
   * `blog.content.test.ts` joined title, description and body with newlines, which
   * is correct for a grep and useless for an editor that has to say WHICH FIELD.
   */
  const texts: LintText[] = [
    { field: 'title', text: doc.title },
    { field: 'description', text: doc.description },
    ...plainText(doc.body)
      .split('\n')
      .map((line, i) => ({ field: 'body' as const, at: `body.line[${i}]`, text: line })),
  ];
  if (doc.hero) texts.push({ field: 'hero', at: 'hero.alt', text: doc.hero.alt });
  out.push(...lintTexts(texts, doc.locale, rules));

  const push = (rule: LintRule, cls: LintClass, field: LintField, detail: string, excerpt = '') =>
    out.push({ rule, cls, locale: doc.locale, field, detail, excerpt: excerptOf(excerpt) });

  // ── structure ──────────────────────────────────────────────────────────────

  if (on('span-adjacency')) {
    for (const { at, left, right } of adjacentSpans(doc.body)) {
      if (!spansSeparate(left, right)) {
        push('span-adjacency', 'error', 'body', `${left.slice(-14)}|${right.slice(0, 14)}`, `${left}${right}`);
      }
      void at;
    }
  }

  if (on('bare-path')) {
    for (const p of linkPaths(doc.body)) {
      const bad = badPath(p);
      if (bad) push('bare-path', 'error', 'body', p, bad);
    }
  }

  if (on('dead-anchor')) {
    /*
     * **A `#reversals` THAT NAMES NO HEADING IS A LINK THAT SCROLLS NOWHERE, AND
     * NOTHING ABOUT THE PAGE LOOKS WRONG.** Cheap to check, invisible by eye, and the
     * launch article carries four of them.
     *
     * **IT IS IN THE LINT AND NOT IN THE HANDLER, UNLIKE THE OTHER HALF OF
     * `bare-path`'s RESOLUTION** (A6-20), and the line is exactly whether the answer
     * is inside the document: an in-page anchor resolves against this document's own
     * headings, while `/arcana/the-moon` resolves against the deck -- which is
     * `@/data/deck`, which this module may not import (A6-3).
     */
    const ids = new Set([...headingIds(doc.body, 2), ...headingIds(doc.body, 3)]);
    for (const p of linkPaths(doc.body)) {
      if (p.startsWith('#') && !ids.has(p.slice(1))) push('dead-anchor', 'error', 'body', p, p);
    }
  }

  if (on('heading-id')) {
    const h2s = doc.body.filter((b) => b.kind === 'heading' && b.level === 2);
    const withId = headingIds(doc.body, 2);
    if (withId.length !== h2s.length) {
      const missing = h2s
        .filter((b) => b.kind === 'heading' && b.id === undefined)
        .map((b) => (b.kind === 'heading' ? b.text : ''));
      push('heading-id', 'error', 'body', missing.join(', ') || 'a level-2 heading', missing[0] ?? '');
    }
  }

  if (on('heading-id-unique')) {
    const ids = [...headingIds(doc.body, 2), ...headingIds(doc.body, 3)];
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const id of new Set(dupes)) push('heading-id-unique', 'error', 'body', id, id);
  }

  if (on('quote-source')) {
    /*
     * `source` is REQUIRED in the union, so a missing one is a compile error -- and
     * an EMPTY STRING satisfies the type and defeats it. That is the whole reason
     * this rule exists rather than being left to TypeScript.
     */
    for (const b of doc.body) {
      if (b.kind === 'quote' && b.source.trim() === '') {
        push('quote-source', 'error', 'body', 'quote', phrasingText(b.text));
      }
    }
  }

  // ── the cosmetic bands, as WARNINGS (A6-17) ────────────────────────────────

  if (on('title-length') && doc.title.length > 110) {
    push('title-length', 'warning', 'title', String(doc.title.length), doc.title);
  }
  if (on('description-band') && (doc.description.length < 80 || doc.description.length > 158)) {
    push('description-band', 'warning', 'description', String(doc.description.length), doc.description);
  }
  if (on('hero-pair') && doc.hero) {
    if (doc.hero.alt.trim().length < 60) {
      push('hero-pair', 'warning', 'hero', `alt is ${doc.hero.alt.trim().length} chars`, doc.hero.alt);
    }
    /*
     * `LoreDoc.imageAlt`'s rule, applied: the card's name is already in the `<h1>`,
     * the prose and the fact strip, and a fourth copy in `alt` is noise to a screen
     * reader. The card's own words are the slug's, hyphens turned to spaces.
     */
    const name = doc.hero.cardUrlSlug.replace(/-/g, ' ');
    if (doc.hero.alt.trim().toLowerCase().startsWith(name)) {
      push('hero-pair', 'warning', 'hero', 'alt opens with the card name', doc.hero.alt);
    }
  }

  // ── LAUNCH_ARTICLE_RULES ───────────────────────────────────────────────────

  if (on('orientation-anchors')) {
    const ids = headingIds(doc.body, 2);
    for (const a of ORIENTATION_ANCHORS) {
      if (!ids.includes(a)) push('orientation-anchors', 'error', 'body', a, '');
    }
  }

  if (on('word-floor')) {
    const words = wordCount(doc.body);
    if (words < WORD_FLOOR) push('word-floor', 'error', 'body', `${words} words`, '');
  }

  return out;
}

/**
 * The `en`/`id` divergence proof, as an ADVISORY over a PAIR (A6-15).
 *
 * `## Localization` rule 3: *"an English document that reads as a translation of the
 * Indonesian one is a defect a reviewer can see in five seconds."* A lint cannot
 * enforce that on a document being drafted paragraph by paragraph -- the `en`
 * document is legitimately empty for an hour -- so this is surfaced in the editor
 * and **never blocks a save or a publish.** It stays a hard assertion for the two
 * imported articles, in the integration suite.
 *
 * Returns the reasons the pair reads as a translation. `[]` means it does not.
 */
export function divergenceAdvisory(idDoc: LintDoc, enDoc: LintDoc): string[] {
  const out: string[] = [];
  const cardRefs = (d: LintDoc) =>
    new Set(d.body.flatMap((b) => (b.kind === 'cardRef' ? [b.slug] : [])));
  const arcanaLinks = (d: LintDoc) =>
    new Set(linkPaths(d.body).filter((p) => p.startsWith('/arcana/')));

  const sharedCards = [...cardRefs(idDoc)].filter((c) => cardRefs(enDoc).has(c));
  if (sharedCards.length > 0) out.push(`works its example on the same card(s): ${sharedCards.join(', ')}`);

  const idIds = new Set(headingIds(idDoc.body, 2));
  const enIds = new Set(headingIds(enDoc.body, 2));
  if (![...idIds].some((x) => !enIds.has(x))) out.push('no level-2 section the English lacks');
  if (![...enIds].some((x) => !idIds.has(x))) out.push('no level-2 section the Indonesian lacks');

  if ([...arcanaLinks(idDoc)].sort().join() === [...arcanaLinks(enDoc)].sort().join()) {
    out.push('recommends the identical set of card pages');
  }
  if (idDoc.title === enDoc.title) out.push('shares its title');
  if (idDoc.description === enDoc.description) out.push('shares its description');
  return out;
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** One violation as one readable line. The array form's whole payoff (A6-14). */
export function formatViolation(v: LintViolation): string {
  const where = v.at ?? v.field;
  return `[${v.cls}] ${v.rule} ${where}: "${v.detail}"${v.excerpt ? ` — ${v.excerpt}` : ''}`;
}

/** True if any violation refuses a SAVE. Errors do; warnings do not (A6-17). */
export function hasErrors(violations: readonly LintViolation[]): boolean {
  return violations.some((v) => v.cls === 'error');
}

function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 60 ? flat : `${flat.slice(0, 59)}…`;
}

/**
 * Every adjacent span pair in a document, as the strings either side of the join.
 *
 * **THE ONE RULE THE EDITOR MOST NEEDS** (A6-16). `blocks.ts:27-36`:
 * `para(s('Lihat '), link('/gallery', 'galeri'))` renders `Lihat galeri`; drop the
 * trailing space and it renders `Lihatgaleri` -- the block union's form of the
 * JSX-whitespace bug that shipped three times in one afternoon as
 * `www.jmtarot.siteand add to your phone`. **A form field trims by default and a
 * person editing a span cannot see a trailing space, so the CMS makes this failure
 * mode MORE likely than the file did, not less.**
 */
function adjacentSpans(blocks: readonly Block[]): { at: string; left: string; right: string }[] {
  const runs = blocks.flatMap((b, i) =>
    b.kind === 'paragraph' || b.kind === 'quote'
      ? [{ at: `body[${i}]`, run: b.text }]
      : b.kind === 'list'
        ? b.items.map((run, j) => ({ at: `body[${i}].items[${j}]`, run }))
        : [],
  );
  const out: { at: string; left: string; right: string }[] = [];
  for (const { at, run } of runs) {
    if (typeof run === 'string') continue;
    for (let i = 0; i + 1 < run.length; i++) {
      out.push({ at, left: run[i].text, right: run[i + 1].text });
    }
  }
  return out;
}

/**
 * Do two adjacent spans join into one word?
 *
 * **EXPORTED, BECAUSE THE EDITOR RENDERS THE SAME ANSWER INLINE** (A6-31) and a
 * second copy of this predicate in a client component is the drift the lint exists
 * to prevent. The character sets are `blog.content.test.ts`'s, verbatim.
 */
const OPENING = new Set(['(', '[', '“', '"', '‘', '—', '/']);
const CLOSING = new Set([')', ']', '”', '"', '’', ',', '.', ':', ';', '?', '!', '—', '/', '-']);

export function spansSeparate(left: string, right: string): boolean {
  const a = left.at(-1) ?? '';
  const b = right.at(0) ?? '';
  return /\s/.test(a) || /\s/.test(b) || CLOSING.has(a) || OPENING.has(a) || CLOSING.has(b);
}

/**
 * Why a link path is refused, or `null`.
 *
 * **THE SHAPE HALF ONLY. THE RESOLUTION HALF IS THE ROUTE HANDLER'S** (A6-20), and
 * the split is stated in both files: `cardByUrlSlug` lives in `@/data/deck`, which
 * this module may not import (A6-3), so *"does `/arcana/the-mooon` name a real
 * card"* is answered beside the zod parse in `POST /api/admin/blog`.
 *
 * `Prose.tsx:41-54` applies `localePath()`, so a document that spells
 * `/en/arcana/the-moon` is wrong in one of the two trees -- and refusing it on SAVE
 * rather than at render is the difference between a form error and a broken page.
 */
export function badPath(path: string): string | null {
  if (path.startsWith('#')) {
    return ANCHOR_RE.test(path) ? null : 'an in-page anchor must be #lowercase-hyphens';
  }
  if (path.includes('://')) return 'an absolute URL leaves the site from inside the prose';
  /*
   * **`stripLocalePrefix` RATHER THAN A `'/en/'` LITERAL, AND THE FENCE IS WHY.**
   * `contentLocale.contract.test.ts` allows the segment to be spelled in exactly two
   * modules -- `prefix.ts` and `alternates.ts` -- because *"forty-four pages
   * hand-writing `/en/…` is forty-four chances to emit a non-reciprocal `hreflang`
   * pair."* It caught the first draft of this function, which is the fence working.
   * `contentAlternates()` refuses a prefixed path with the same call, so the lint and
   * the canonical builder answer *"is this prefixed"* identically by construction.
   *
   * `prefix.ts` is EDGE-SAFE and marker-free -- no `server-only`, no `next/*`, no
   * `process.env`, one import of `./locale` -- so this costs the purity rule nothing.
   */
  if (stripLocalePrefix(path).locale !== null) {
    return 'a bare path, never a prefixed one — Prose applies localePath()';
  }
  if (!BARE_PATH_RE.test(path)) return 'a bare lowercase path, no query and no uppercase';
  return null;
}

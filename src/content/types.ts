/**
 * The shape of authored public content (S4, roadmap §5).
 *
 * PURE AND CLIENT-IMPORTABLE. The prose modules beside it are NOT -- §5 rule 1
 * fences `src/content/**` from client components and `clientBoundary.test.ts`
 * carries the rule. This file is the exception, and it is the same split
 * `moderation/types.ts` has against `blocklist.ts` and `share/types.ts` against
 * `share/links.ts`: the SHAPE crosses the boundary, the CONTENT does not.
 *
 * ── OWNERSHIP, BECAUSE TWO WORKSTREAMS WRITE HERE ───────────────────────────────
 *
 * **S4 owns everything above the `BlogDoc` marker. S6 owns `BlogDoc` and appends it
 * below.** Roadmap §12 names this as one of two seams in v0.4.0 and §5's tree puts
 * both document types in one file; splitting them into two files would have been
 * tidier and would have made the shared thing -- `Block`, which one renderer
 * consumes -- ambiguous about who may widen it. Nobody widens it: a sixth block kind
 * is a reconciliation question.
 *
 * **S6 DID EDIT ABOVE THE MARKER, ONCE, AND THIS IS THE RECORD OF IT.**
 * Reconciliation R16 granted three field-level changes to `Block` and refused the
 * fourth, and this file was written before that ruling landed: `Inline`/`Phrasing`
 * arrived, `heading` gained an optional `id`, `list` gained an optional `ordered`,
 * and `paragraph.text` / `list.items[]` widened to `Phrasing`. **No variant lost a
 * field, no variant was renamed, and no sixth kind exists** -- `callout` is the ask
 * R16 refused. Every widening is optional or a union with what was there, which is
 * why the forty-four lore documents needed no edit at all. That property is the
 * evidence the seam held; check it before widening anything else here.
 *
 * ── WHY PROSE IS DATA AND NOT TSX ───────────────────────────────────────────────
 *
 * `terms.id.tsx` is this codebase's precedent for long-form bilingual prose and it
 * settles the question §5 rule 4 asks it to settle: **MDX is not added.** It does
 * not settle this one. §11.4 requires a copy lint -- the Malay grep, the therapy
 * lists, the English tic list -- over every word of this content, and a lint needs
 * exact strings. In a `.tsx` document a sentence is split across text nodes by
 * `{' '}`, punctuation arrives as `&ldquo;`, and `\btempoh\b` can straddle a JSX
 * boundary and never match. One `text: string` per paragraph gives the lint the
 * sentence a reader will read. **THE LINT IS THE REASON THIS IS DATA.** Anyone
 * converting these files to TSX for authoring comfort switches the release's only
 * quality gate off, silently.
 *
 * Consequence, embraced: typographic characters go in the source LITERALLY -- an em
 * dash is an em dash, a quote is a quote. Never an HTML entity. React escapes on
 * render, the file is UTF-8, and the lint sees what the reader sees.
 * `lore.test.ts` forbids a tag and an entity in any `text` field.
 */
import type { Locale, YesNo } from '@/data/types';

/**
 * A run of words inside one block. **S6's addition, granted by reconciliation R16.**
 *
 * ── WHY THE UNION BENT, AND WHY S4's ARGUMENT AGAINST IT WAS THE BETTER ONE ─────
 *
 * S4 wrote `text: string` per block **so the copy lint sees the exact sentence a
 * reader sees** -- the file header above says at length that the lint is the reason
 * the prose is data at all, and a sentence split across nodes can hide
 * `\btempoh\b` straddling a boundary. That argument is correct and it is the
 * stronger of the two.
 *
 * It bent because **an article cannot be written without bold lead-ins and inline
 * links**, and internal linking is one of the two things the blog is in this
 * release to do (R5 doubles down on the other): every myth in `#myths-and-facts` is
 * `**Mitos: X.** Fakta: Y`, and `#next` is one paragraph carrying four links into
 * the lore pages. **What keeps the lint's guarantee rather than trading it away is
 * `plainText()` joining spans with the EMPTY STRING**, so the linted string is
 * byte-identical to the rendered one. Two tests make that mechanical rather than
 * promised: `doc.test.ts` asserts the joining directly, and
 * `blog.content.test.ts`'s adjacency case asserts the joined string is the one the
 * renderer produces. **If either is deleted, revert to `text: string`** -- R16 says
 * so in those words, and the lint outranks the typography.
 *
 * **`link.path` IS A BARE PATH, NEVER A PREFIXED ONE.** `/arcana/the-moon`, never
 * `/en/arcana/the-moon`: `Prose.tsx` applies `localePath()`, so one document serves
 * both trees and cannot be wrong about either. A path beginning `#` is an in-page
 * anchor and is left unprefixed. `blog.content.test.ts` fences both.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; path: string; text: string };

/**
 * A run of words, either as one plain string or as spans.
 *
 * **THE PLAIN STRING IS NOT LEGACY AND IS NOT BEING MIGRATED.** Forty-four lore
 * documents use it and they are right to: a lore paragraph carries no emphasis and
 * no inline link, so `Inline[]` there would be ceremony around one `text` node.
 * `plainText()` normalises both shapes and is the only thing that reads them.
 */
export type Phrasing = string | Inline[];

/**
 * One unit of prose. Rendered by `src/components/Prose.tsx` and by nothing else.
 *
 * **NO `html`, NO `raw`, NO `markdown` VARIANT, EVER** (§5 rule 3, §10). The CSP is
 * `script-src 'self' 'unsafe-inline'` in report-only and the goal is to TIGHTEN it.
 * A markup-carrying block is a `dangerouslySetInnerHTML` call site waiting to be
 * written, and what it costs is not a theoretical injection on prose we wrote --
 * it is a permanent new reason the policy can never be enforced.
 *
 * **AND THERE IS NO SIXTH KIND. S6 ASKED FOR `callout` AND RECONCILIATION R16
 * REFUSED IT**, on S6's own recommendation that it was the ask to refuse first: an
 * aside that must not be skimmed past is a paragraph, and the two in the launch
 * article read correctly as one. The five kinds here are the whole vocabulary and
 * widening the union is a reconciliation question, not an authoring convenience.
 */
export type Block =
  /**
   * `level` is 2 or 3 and NEVER 1: the page owns its single `<h1>` and a document
   * that could emit a second one would break the one heading rule a crawler
   * actually reads. Never used for styling -- if a line needs to be large and is
   * not a section, it is a paragraph and the CSS says so.
   *
   * **`id` IS OPTIONAL AND AN ANCHOR IS AN INTERFACE** (R16, granted): a lore page
   * anchors its sections with the fixed `LORE_ANCHORS` enum and needs none, while
   * an article's sections differ per article -- and without a per-heading id there
   * is no `/blog/x#myths-and-facts`, no table of contents, and no target for the
   * three orientation links §D8 asks for. Optional rather than required so the
   * forty-four lore documents are untouched; `Prose.tsx` emits the attribute only
   * when it is there.
   */
  | { kind: 'heading'; level: 2 | 3; id?: string; text: string }
  | { kind: 'paragraph'; text: Phrasing }
  /**
   * **`ordered` IS OPTIONAL AND ABSENT MEANS UNORDERED** (R16, granted). `<ol>`
   * against `<ul>` is semantics rather than styling: the launch article teaches a
   * five-step draw and lists five mistakes in order, and rendering "1, 2, 3, 4, 5"
   * as bullets is a numbered procedure lying about being unnumbered. Optional for
   * the same reason `heading.id` is -- forty-four unordered lists stay as written.
   */
  | { kind: 'list'; ordered?: boolean; items: Phrasing[] }
  /**
   * `source` is REQUIRED. A quotation with no attribution, on a page making claims
   * about a tradition, is precisely what reads as invented -- and the roadmap's
   * ruling is that lore may be invented where tradition is SILENT, which is only
   * an honest position if the parts that are not invented are sourced.
   */
  | { kind: 'quote'; text: string; source: string }
  /**
   * An inline link to another card's page. `slug` is a URL slug (S-D4) and
   * `lore.test.ts` asserts every one of them resolves through `cardByUrlSlug` -- a
   * dead internal link on forty-four pages is a real cost and nothing would notice
   * it by eye.
   *
   * The href is built by the RENDERER from the locale it resolves itself, so a
   * document never spells the prefix and can never be wrong about it.
   */
  | { kind: 'cardRef'; slug: string; text: string };

export type BlockKind = Block['kind'];

/** One question and its answer. Content, never `FAQPage` markup (S-D16). */
export type QA = { q: string; a: string };

/**
 * The tradition detail a document LEADS its lore with.
 *
 * **THIS FIELD EXISTS TO MAKE §8.2 MECHANICAL.** "English content is rewritten, not
 * translated" is checked three ways in `lore.test.ts`, and this is the cheapest and
 * the hardest to fake: the `id` and `en` documents for one card must not share an
 * anchor. It forces the writer to PLAN the divergence instead of discovering
 * afterwards that they translated.
 */
export const LORE_ANCHORS = [
  'goldenDawnTitle',
  'hebrewLetter',
  'path',
  'marseille',
  'rws',
  'sign',
  'number',
  'element',
  'stage',
  'polarity',
] as const;

export type LoreAnchor = (typeof LORE_ANCHORS)[number];

/** One card's lore, in one locale. One file per document, 44 files. */
export type LoreDoc = {
  /**
   * The URL slug, and the filename's first segment. **DERIVABLE from `cardId`, and
   * carried anyway**, for `Legal.tsx`'s stated reason about clause anchors: it makes
   * the address GREPPABLE. A search for the slug finds the document, its registry
   * entry and every `cardRef` pointing at it. `lore.test.ts` asserts it equals
   * `cardUrlSlug(cardById(cardId))`, so the redundancy is collapsed rather than
   * trusted -- the same move §3.2's slug table makes.
   */
  slug: string;
  /** Asserted against the filename's second segment. */
  locale: Locale;
  /** 0-21. The join to `cards.json`, the correspondence engine and analytics. */
  cardId: number;

  /**
   * The whole document title. **NO BRAND**, and 60 characters is the reason: the
   * SERP budget is finite and `Tarot Major Arcana` earns more on a query nobody
   * knows us by than a brand suffix does. `lore.test.ts` asserts <= 65 characters,
   * and that it contains the card's English name and its numeral in parentheses.
   */
  title: string;
  /**
   * The meta description. `lore.test.ts` asserts 110-165 characters: under 110
   * wastes a slot Google will fill from the body instead, over 165 is truncated
   * mid-clause. It is not a summary of the page, it is the sentence that earns the
   * click.
   */
  description: string;
  /** The single `<h1>`. Not the same string as `title`. */
  h1: string;
  /**
   * One sentence under the `<h1>`, before anything else. The answer a reader came
   * for, above the fold, on a phone.
   */
  standfirst: string;
  /**
   * The art's `alt`. **A DESCRIPTION OF THE PAINTING, NEVER THE CARD NAME REPEATED**
   * -- the name is already in the `<h1>`, the surrounding prose and the fact strip,
   * and a fourth copy in `alt` is noise to a screen reader and to a crawler.
   *
   * `lore.test.ts` asserts it does NOT start with the card name and is at least 60
   * characters. **THE AUTHOR MUST LOOK AT THE ARTWORK BEFORE WRITING IT**;
   * describing a Rider-Waite card from memory is how this field becomes false, and
   * this deck is its own painting.
   */
  imageAlt: string;
  /** Which tradition detail the lore leads with. Must differ across the pair. */
  anchor: LoreAnchor;

  /** Upright reading. 2-4 blocks. */
  upright: Block[];
  /** Reversed reading. 2-4 blocks. */
  reversed: Block[];
  /**
   * The yes/no verdict, AS DATA, plus the sentence the writer builds from it.
   *
   * **ASSERTED AGAINST `effectiveYesNo()` AND THEREFORE NOT DUPLICATION** -- the
   * same shape §3.2's slug table has. It is here because the flip is
   * counter-intuitive and a writer following the mood of the artwork will get it
   * backwards: **The Moon answers `no` upright and `yes` reversed.** Getting that
   * wrong on a public page contradicts the verdict the app itself would print,
   * which is the exact failure roadmap §7 names.
   *
   * **IT IS NEVER THE SOURCE OF WHAT IS RENDERED.** The page takes the words from
   * `effectiveYesNo()` plus the catalog, so the screen and the app agree by
   * construction; this field exists to be checked.
   */
  yesno: { upright: YesNo; reversed: YesNo; note: string };
  /** Tradition, the glyph, the number, the painting. 6-14 blocks. */
  lore: Block[];
  /**
   * How the card lands in a reading. 1-3 blocks.
   *
   * **IT MAY NAME THE THREE SERVICES AND THE THREE POSITIONS AND NOTHING ELSE ABOUT
   * HOW THE APP WORKS** (S-D7's corollary, and the same constraint roadmap §7 puts
   * on S6's article). No prompt, no model, no chaining, no card-frequency scoring,
   * no Shadow Arcana, no Lotus, no persona. `lore.test.ts` greps for all of those.
   */
  inSpread: Block[];
  /**
   * Q&A CONTENT. 3-5 pairs. **No `FAQPage` markup** (S-D16): Google restricted FAQ
   * rich results to authoritative government and health sites in August 2023, so
   * the schema buys approximately nothing. The content still earns its place for
   * the reader and for long-tail matching, which is why it is written and not
   * skipped.
   */
  questions: QA[];
};

/* ────────────────────────────────────────────────────────────────────────────────
 * S6 APPENDS `BlogDoc` BELOW THIS LINE AND CHANGES NOTHING ABOVE IT.
 * `Block`, `BlockKind` and `QA` are shared; `LoreDoc` is S4's alone.
 * (It changed four fields above, once, under reconciliation R16 -- the header
 * records exactly what and why. Nothing else.)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One blog article, in one locale. **S6 (`docs/plans/2026-07-28-blog.md` §D1).**
 *
 * **`title` AND `description` LIVE HERE AND NOT IN THE CATALOG** (S-D6, I9). They
 * are per-article prose rather than chrome, and the catalog is shipped to the
 * browser as JSON on *every* page: a `meta.description` key per article per locale
 * would be four catalog values today and ninety the day the lore pages want the
 * same thing. `blog.content.test.ts` asserts the description's length band, because
 * these two strings are the highest-leverage words in the workstream -- they are
 * what a search result shows.
 *
 * **NO `body` PROSE ANYWHERE NEAR THE REGISTRY.** `src/content/blog/index.ts` holds
 * the dates, the locales and the hashes and no words at all (roadmap §5). The words
 * are in `<slug>.<locale>.ts`, one file per document, imported only by the server.
 *
 * There is deliberately no `h1` field, unlike `LoreDoc`. A lore page has a title
 * that must earn a click and an `<h1>` that must read as a heading, and those pull
 * in different directions; an article's title is the same sentence in both places,
 * and two fields holding one sentence is how they drift.
 */
export type BlogDoc = {
  /**
   * The URL slug. Hyphenated lowercase, **identical in both locales** and English
   * in both, exactly like every other path in this app -- the same ruling that kept
   * `/history` from becoming `/jejak`. A per-locale slug would need a per-locale
   * path table that `contentAlternates()` has no way to express, so it is not a
   * style preference: it is what makes `/blog/X` <-> `/en/blog/X` a clean mapping.
   */
  slug: string;
  /** Asserted against the filename's second segment by the copy lint's naming case. */
  locale: Locale;
  /** The `<h1>` and the `<title>`. Under 110 characters -- Google's headline cap. */
  title: string;
  /** The meta description. 80-158 characters; `blog.content.test.ts` asserts the band. */
  description: string;
  /**
   * A committed card image, or `null`. **NO NEW ASSET** (S-D9): the hero is one of
   * the twenty-two paintings already in `public/cards/`, named by its URL slug so a
   * typo is a failing test rather than a broken image in production. Nullable
   * because an article need not be about a card.
   */
  hero: { cardUrlSlug: string; alt: string } | null;
  body: Block[];
};

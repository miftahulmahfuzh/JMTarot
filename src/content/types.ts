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
 * One unit of prose. Rendered by `src/components/Prose.tsx` and by nothing else.
 *
 * **NO `html`, NO `raw`, NO `markdown` VARIANT, EVER** (§5 rule 3, §10). The CSP is
 * `script-src 'self' 'unsafe-inline'` in report-only and the goal is to TIGHTEN it.
 * A markup-carrying block is a `dangerouslySetInnerHTML` call site waiting to be
 * written, and what it costs is not a theoretical injection on prose we wrote --
 * it is a permanent new reason the policy can never be enforced.
 */
export type Block =
  /**
   * `level` is 2 or 3 and NEVER 1: the page owns its single `<h1>` and a document
   * that could emit a second one would break the one heading rule a crawler
   * actually reads. Never used for styling -- if a line needs to be large and is
   * not a section, it is a paragraph and the CSS says so.
   */
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  /** Unordered only. See the file header's note. */
  | { kind: 'list'; items: string[] }
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
 * ──────────────────────────────────────────────────────────────────────────── */

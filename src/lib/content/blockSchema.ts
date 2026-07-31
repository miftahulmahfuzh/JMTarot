/**
 * The submitted body, validated before it is stored. **v0.5.0 / A6, decision A-D14.**
 *
 * PURE. zod is already a dependency (`zod ^4.4.3`), so this adds **no new runtime
 * dependency** (§9.7). No `server-only`: `queries/contract.test.ts` walks the import
 * graph transitively and the save path reaches this from a query module's
 * neighbourhood.
 *
 * ── WHY IT EXISTS AT ALL ─────────────────────────────────────────────────────
 *
 * `body` is `jsonb`. The database will hand back whatever was stored, and the read
 * path deliberately does not re-validate (A6-12): a zod parse on every render would
 * sit on the request path of the pages this release exists to get indexed, and a page
 * that threw on a row it could not parse would **500 on a URL in the sitemap for a
 * defect that is already committed.** So the write path is the gate. There is exactly
 * one, and this is it.
 *
 * ── `.strict()` ON EVERY OBJECT, AND THAT IS WHAT REFUSES THE SIXTH KIND (A6-18) ─
 *
 * zod's default STRIPS unknown keys silently, so a submitted
 * `{ kind: 'paragraph', text: [...], html: '<script>' }` would validate, store the
 * extra key in `jsonb`, and sit in the database until somebody wrote a renderer that
 * read it. `.strict()` makes it a `422`.
 *
 * `discriminatedUnion` refuses an unknown `kind` outright, which is what refuses
 * `callout` -- **the ask reconciliation R16 REFUSED**, asserted absent by
 * `types.contract.test.ts:65-77` *because the failure mode of a refused ask is
 * somebody granting it quietly.* **A6 does not grant it, and there is no `html`, no
 * `raw` and no `markdown` variant** (§5 rule 3 of v0.4.0, and the CSP argument in
 * A-D10: what a markup-carrying block costs is not a theoretical injection on prose
 * we wrote, it is a permanent new reason the policy can never be enforced).
 *
 * ── IT IS CHECKED AGAINST `Block` IN BOTH DIRECTIONS, AT THE TYPE LEVEL (A6-19) ──
 *
 * A second definition of the block union is a second definition, and the two drift
 * the day somebody adds a field to one. The two assignments at the bottom of this
 * file compile or the build fails. Same move `types.contract.test.ts` makes with
 * `blocks.ts` -- *"checked against S4's union rather than by restating it."*
 *
 * ── WHAT IT DOES NOT CHECK ───────────────────────────────────────────────────
 *
 * **RESOLUTION.** Whether `/arcana/the-mooon` names a real card, and whether
 * `cardRef.slug` and `hero_card_slug` resolve, is answered in the route handler
 * beside this parse (A6-20): `cardByUrlSlug` lives in `@/data/deck`, which the lint
 * may not import (A6-3), and keeping the two halves in one place would drag a card
 * gloss into the lint's reach. The `bare-path` rule's SHAPE half is in `lint.ts` and
 * its RESOLUTION half is in the handler; the split is stated in all three files.
 */
import { z } from 'zod';
import type { Block, Inline, Phrasing } from '@/content/types';

/**
 * One span. Four kinds, exactly `Inline`'s.
 *
 * `text` is `.min(1)` on all four: an empty span renders nothing, contributes
 * nothing to `plainText()`, and is invisible in the editor -- so it is a row somebody
 * added and abandoned, and storing it makes the span-adjacency rule reason about a
 * boundary that is not there.
 *
 * `link.path` is a bare `z.string()` here on purpose. Its shape is `lint.ts`'s
 * `badPath()` and its resolution is the handler's; a third spelling of the rule in a
 * zod refinement is how the three disagree.
 */
const inlineSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string().min(1) }),
  z.strictObject({ kind: z.literal('em'), text: z.string().min(1) }),
  z.strictObject({ kind: z.literal('strong'), text: z.string().min(1) }),
  z.strictObject({ kind: z.literal('link'), path: z.string().min(1), text: z.string().min(1) }),
]);

/**
 * `string | Inline[]`, exactly `Phrasing`.
 *
 * **THE PLAIN-STRING ARM IS NOT LEGACY AND IS NOT BEING MIGRATED** -- forty-four lore
 * documents take it, and the editor's *teks biasa* toggle stores it for a paragraph
 * with no emphasis. An `Inline[]` of one `text` span would be ceremony that the
 * span-adjacency rule then has to reason about.
 */
const phrasingSchema = z.union([z.string().min(1), z.array(inlineSchema).min(1)]);

/**
 * The five kinds. **FIVE. NOT SIX.**
 *
 * `heading.id` and `list.ordered` are OPTIONAL, which is why the forty-four lore
 * documents needed no edit when R16 widened the union -- and why they are `.optional()`
 * here rather than `.default()`: a default would WRITE the field, so a round trip
 * through this schema would stop being the identity and A6-35's byte-identity oracle
 * would fail on documents nobody touched.
 */
const blockSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('heading'),
    /** 2 or 3 and NEVER 1: the page owns its single `<h1>`. */
    level: z.union([z.literal(2), z.literal(3)]),
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
    text: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('paragraph'), text: phrasingSchema }),
  z.strictObject({
    kind: z.literal('list'),
    ordered: z.boolean().optional(),
    items: z.array(phrasingSchema).min(1),
  }),
  /**
   * `source` is REQUIRED by the union and `.min(1)` here, and the lint checks it a
   * third time for whitespace. Three layers because an empty string satisfies the
   * TYPE and defeats the point: a quotation with no attribution, on a page making
   * claims about a tradition, is precisely what reads as invented.
   */
  z.strictObject({ kind: z.literal('quote'), text: z.string().min(1), source: z.string().min(1) }),
  z.strictObject({ kind: z.literal('cardRef'), slug: z.string().min(1), text: z.string().min(1) }),
]);

/**
 * A document body. **At least one block.**
 *
 * An empty array is not a draft, it is a document with nothing in it -- and A6-6's
 * published-locale predicate is `status = 'published' AND jsonb_array_length(body) > 0`
 * precisely because a published row with an empty body would name a URL in
 * `hreflang` that renders a blank page. Refusing it on save is the cheaper half.
 */
export const bodySchema = z.array(blockSchema).min(1);

/**
 * The hero, or nothing. **THE SUBMITTED SHAPE CARRIES A SLUG AND NO `alt`.**
 *
 * A6-11 said *both fields or null, never a half-set object*, and that rule is intact —
 * it is now satisfied by CONSTRUCTION rather than by validation. `alt` is derived from
 * the card's lore document by `heroAltFor()` on the save path, so the submitted document
 * cannot carry a half-set pair and cannot carry a wrong one either. See
 * `@/lib/content/heroAlt` for why the field was deleted: four indexed pages shipped
 * `alt: 'The World'`, which is the one thing `LoreDoc.imageAlt` forbids in its own words.
 *
 * **`.strict()` IS WHAT MAKES THE DELETION REAL.** A client still sending `alt` gets a
 * `422` rather than having it silently stripped and then silently overwritten — so an
 * old editor build, or a script written against the old shape, fails loudly instead of
 * appearing to work.
 */
export const heroSchema = z.strictObject({ cardUrlSlug: z.string().min(1) }).nullable();

/** One `(slug, locale)` document, as the save endpoint receives it. */
export const documentSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  locale: z.union([z.literal('id'), z.literal('en')]),
  title: z.string().min(1),
  description: z.string().min(1),
  hero: heroSchema,
  body: bodySchema,
});

export type SubmittedDocument = z.infer<typeof documentSchema>;

/* ────────────────────────────────────────────────────────────────────────────────
 * A6-19. **BOTH ASSIGNMENTS COMPILE OR THE BUILD FAILS.**
 *
 * This is the cheap version of finding out that two definitions of one union have
 * drifted. `void` on each so no lint rule calls them unused; they exist for `tsc`.
 * ──────────────────────────────────────────────────────────────────────────── */
const _inlineToUnion: Inline = {} as z.infer<typeof inlineSchema>;
const _inlineFromUnion: z.infer<typeof inlineSchema> = {} as Inline;
const _phrasingToUnion: Phrasing = {} as z.infer<typeof phrasingSchema>;
const _phrasingFromUnion: z.infer<typeof phrasingSchema> = {} as Phrasing;
const _blockToUnion: Block = {} as z.infer<typeof blockSchema>;
const _blockFromUnion: z.infer<typeof blockSchema> = {} as Block;
void _inlineToUnion;
void _inlineFromUnion;
void _phrasingToUnion;
void _phrasingFromUnion;
void _blockToUnion;
void _blockFromUnion;

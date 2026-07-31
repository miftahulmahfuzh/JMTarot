/**
 * The hero image's `alt`, DERIVED from the lore document. **PURE.**
 *
 * v0.5.0 / the markdown editor, `docs/plans/2026-07-31-blog-markdown-editor-design.md`
 * §7. It replaces a free-text field on `/admin/blog`, and the field is not merely
 * inconvenient — **it shipped a broken `alt` on four indexed pages.**
 *
 * ── THE FOUR COMMITTED ARTICLES ARE THE EVIDENCE ────────────────────────────
 *
 *     what-tarot-is.id      the-world            alt: 'The World'
 *     what-tarot-is.en      the-high-priestess   alt: 'The High Priestess'
 *     how-to-read-tarot.id  the-hermit           alt: 'The Hermit'
 *     how-to-read-tarot.en  the-high-priestess   alt: 'The High Priestess'
 *
 * Every one is the card's name repeated verbatim, nine to eighteen characters. That is
 * exactly what `LoreDoc.imageAlt` forbids in its own words — *"A DESCRIPTION OF THE
 * PAINTING, NEVER THE CARD NAME REPEATED … the name is already in the `<h1>`, the
 * surrounding prose and the fact strip, and a fourth copy in `alt` is noise to a screen
 * reader and to a crawler"* — and what `lore.test.ts` refuses for all forty-four lore
 * pages.
 *
 * **THE BLOG PATH HAD THE SAME RULE AND COULD NOT ENFORCE IT.** `lint.ts`'s `hero-pair`
 * checks both halves — under 60 characters, opens with the card name — but at **warning**
 * class, and `scripts/blog-import.ts` writes `status: 'published'` directly rather than
 * through `changeStatus`. So the gate that would have caught it was never on the path
 * that created the rows. Deriving is what makes the rule unbreakable instead of
 * unenforced.
 *
 * ── WHY DERIVED AND NOT WRITTEN AGAIN ───────────────────────────────────────
 *
 * The forty-four strings already exist, one per card per locale, already asserted ≥60
 * characters and not opening with the card name, and already written by somebody who
 * looked at **our** painting rather than remembering a Rider-Waite. A second set would
 * be a second description of one image with only the first one linted — and the shared
 * `@id` trap S3/S4 paid for twice is the same shape: *two owners of one fact, and a
 * consumer picks one silently.*
 *
 * ── THIS MODULE IS SERVER-SIDE BY TRANSITIVITY AND CARRIES NO MARKER ────────
 *
 * No `server-only`, following `blogResolve.ts` exactly: it is reached from `blogSave.ts`,
 * which deliberately has neither `server-only` nor `next/*` so `withRollback` can drive
 * it. **But `@/content/arcana` statically imports all forty-four lore documents**, so a
 * CLIENT component importing this module would serialise tens of thousands of words into
 * an RSC payload — the failure `clientBoundary.test.ts` fences `src/content/**` against,
 * arriving one hop further along. That fence checks direct imports only, so
 * `heroAlt.contract.test.ts` names this module and asserts no client component reaches
 * it.
 */
import { loreFor } from '@/content/arcana';
import type { Locale } from '@/data/types';

/**
 * The painting's description for one card in one locale, or `null` when that card has
 * no lore document.
 *
 * **`null` IS A REFUSAL AND THE CALLER MUST TREAT IT AS ONE**, never as "use the card
 * name" and never as `''`. An empty `alt` on a hero image is an accessibility failure
 * that renders as a perfectly normal-looking page — A6-11's argument, and the reason
 * `toBlogDoc` reads a half-set pair as `null` rather than inventing one.
 *
 * All twenty-two cards have a document today (`LORE_SLUGS` equals `CARD_URL_SLUGS`), so
 * this cannot fire. **Identical-today is exactly when somebody simplifies one of two
 * lists**, which is the reason R2 exists and the reason the branch is here.
 */
export function heroAltFor(cardUrlSlug: string, locale: Locale): string | null {
  return loreFor(cardUrlSlug, locale)?.imageAlt ?? null;
}

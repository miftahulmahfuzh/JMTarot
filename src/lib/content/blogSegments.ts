/**
 * A document, flattened to its human-readable strings and rebuilt from them. **PURE.**
 *
 * v0.5.0 / A6. **SPLIT OUT OF `blogTranslate.ts` BECAUSE THE EDITOR NEEDS IT AND THE
 * EDITOR IS A CLIENT COMPONENT.** `blogTranslate.ts` imports `namesIn` from
 * `@/lib/translate/contract`, which `clientBoundary.test.ts` fences from client
 * components because it carries prompt prose — so the half that builds a prompt and the
 * half that walks a document cannot live in one file.
 *
 * That split has a second payoff worth naming: **this module has no idea a model
 * exists.** It is a document transform with an identity property, and its test is a
 * round trip rather than a mock.
 *
 * ── THE MODEL NEVER SEES THE STRUCTURE, SO IT CANNOT BREAK IT ───────────────
 *
 * **THE LOAD-BEARING DECISION.** The obvious design hands a model the `Block[]` as JSON
 * and asks for JSON back. That design loses: it can invent a sixth kind, drop a
 * `heading.id`, translate a `link.path`, renumber a list, or return something that does
 * not parse — and every one of those is a defect in a document the admin then saves.
 *
 * So a document is flattened to a list of strings, and put back positionally.
 * **`applySegments` cannot change the shape of anything**: block kinds, ordering,
 * `heading.id`, `link.path`, `cardRef.slug` and `hero.cardUrlSlug` are never in the list
 * and are copied through untouched. A count mismatch is a refusal, not a merge.
 *
 * Same instinct as `choice.ts` — *the model picks and code validates* — and
 * `blockSchema.ts`'s, where the write path is the gate rather than the renderer.
 *
 * ── WHAT IS DELIBERATELY NOT IN THE LIST ───────────────────────────────────
 *
 * **`heading.id` STAYS BYTE-IDENTICAL.** `blocks.ts`: *"English in both locales, like
 * every other id and slug in this app."* An anchor is an interface — `/blog/x#next` is
 * linked from elsewhere — and a per-locale anchor set would make `contentAlternates()`'s
 * clean `/blog/X` <-> `/en/blog/X` mapping a lie one level down.
 *
 * **`link.path`, `cardRef.slug` AND `hero.cardUrlSlug` ARE ADDRESSES.** A translated
 * path is a 404; `resolveViolations` would catch it on save, and not being able to
 * produce it at all is better than catching it.
 *
 * **`hero.alt` IS DERIVED AND LEFT THE LIST ON 2026-07-31.** It is the card's own
 * `LoreDoc.imageAlt` in the target locale, so a translation of it would be a third
 * description of one painting. See the `hero` line in `walk` and `@/lib/content/heroAlt`.
 */
import type { Block, Inline, Phrasing } from '@/content/types';
import type { LintDoc } from './lint';

/**
 * Every human-readable string in a document, in a fixed traversal order.
 *
 * **THE ORDER IS THE CONTRACT** between `extractSegments` and `applySegments`, and it is
 * defined by one recursive walk written once rather than by two functions agreeing. The
 * round-trip case in the test file is what holds it: `applySegments(doc,
 * extractSegments(doc))` must deep-equal `doc` for every shape.
 */
export function extractSegments(doc: LintDoc): string[] {
  const out: string[] = [];
  walk(doc, (s) => {
    out.push(s);
    return s;
  });
  return out;
}

/**
 * The same walk, writing instead of reading. **Throws on a count mismatch.**
 *
 * A merge that tolerated a short list would silently leave half a document in the source
 * language, which is worse than a refusal because it looks finished. The caller turns
 * the throw into a stated failure the admin reads.
 */
export function applySegments(doc: LintDoc, texts: readonly string[]): LintDoc {
  const expected = extractSegments(doc).length;
  if (texts.length !== expected) {
    throw new Error(`segment count mismatch: expected ${expected}, got ${texts.length}`);
  }
  let i = 0;
  return walk(doc, () => texts[i++]);
}

/**
 * ONE traversal, used for both directions. `visit` sees each string and returns its
 * replacement; `extractSegments` returns it unchanged.
 *
 * Every field NOT passed to `visit` is structure, and copying it through here is what
 * makes "the model cannot break the document" true by construction rather than by
 * validation.
 */
function walk(doc: LintDoc, visit: (s: string) => string): LintDoc {
  const phrasing = (p: Phrasing): Phrasing =>
    typeof p === 'string'
      ? visit(p)
      : p.map((span: Inline): Inline =>
          // `path` is an ADDRESS and is copied, never visited.
          span.kind === 'link'
            ? { kind: 'link', path: span.path, text: visit(span.text) }
            : { kind: span.kind, text: visit(span.text) },
        );

  const body: Block[] = doc.body.map((b): Block => {
    switch (b.kind) {
      case 'heading':
        // `id` is an INTERFACE and is copied, never visited.
        return { ...b, text: visit(b.text) };
      case 'paragraph':
        return { kind: 'paragraph', text: phrasing(b.text) };
      case 'list':
        return { ...b, items: b.items.map(phrasing) };
      case 'quote':
        return { kind: 'quote', text: visit(b.text), source: visit(b.source) };
      case 'cardRef':
        // `slug` is an ADDRESS and is copied, never visited.
        return { ...b, text: visit(b.text) };
      default: {
        /* A sixth kind is a compile error here too, never a silently untranslated block. */
        const unhandled: never = b;
        return unhandled;
      }
    }
  });

  return {
    ...doc,
    title: visit(doc.title),
    description: visit(doc.description),
    /*
     * **NEITHER HERO FIELD IS A SEGMENT. `cardUrlSlug` IS AN ADDRESS AND `alt` IS
     * DERIVED**, so both are copied through like `heading.id`.
     *
     * `alt` used to be visited, and it must not be: it comes from the card's own lore
     * document in the TARGET locale (`heroAltFor`), which is a string a human wrote while
     * looking at the painting and which `lore.test.ts` already checks. Translating it
     * would produce a THIRD description of one image, differing from both lore documents
     * — the shared-`@id` failure S3 and S4 paid for twice, arriving through a new door.
     *
     * **THIS CHANGED THE SEGMENT COUNT BY ONE FOR EVERY DOCUMENT WITH A HERO**, which is
     * the contract `applySegments` refuses a mismatch on. That is the contract working:
     * the count is derived from this one walk, so both directions moved together and
     * `blogSegments.test.ts`'s round trip is what re-asserts it.
     */
    hero: doc.hero ? { cardUrlSlug: doc.hero.cardUrlSlug, alt: doc.hero.alt } : null,
    body,
  };
}

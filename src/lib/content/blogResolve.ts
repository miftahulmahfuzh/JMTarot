/**
 * The RESOLUTION half of `bare-path`, and of `cardRef` and `hero`. **A6-20.**
 *
 * PURE. Imports `@/data/deck`, which is why it is a separate module from `lint.ts`
 * and not three more rules in it.
 *
 * ── WHY THE SPLIT EXISTS, IN THE WORDS OF THE RULE IT PROTECTS ──────────────
 *
 * A6-3, recorded in CLAUDE.md verbatim: `EN_TICS` bans `abundance`, which is The
 * Empress's own English keyword in generated `cards.json` -- and so are `sacred`,
 * `heal`/`healing` and `shadow work` for their cards. **Anyone who widens the lint to
 * reach card data fails on data the blog does not own, concludes the lint is broken,
 * and switches it off.** So `lint.ts` may not import `@/data/deck`, and the question
 * *"does `/arcana/the-mooon` name a real card"* has to be asked somewhere else.
 *
 * The line is not arbitrary: **the lint answers what a document says about itself,
 * and this answers what it says about the world.** An in-page anchor resolves against
 * the document's own headings and is therefore the lint's (`dead-anchor`); everything
 * that resolves against the deck or against the set of published articles is here.
 *
 * ── RESOLVED ON SAVE, NOT AT RENDER (A-D14) ────────────────────────────────
 *
 * **A dead internal link discovered at render time is a broken page; one discovered
 * on save is a form error.** `Prose.tsx` builds a `cardRef` href from the slug at
 * render and would emit `/arcana/the-mooon` happily. The editor makes both a
 * `<select>` over the twenty-two, so a free-text slug is not reachable through the
 * UI -- and this is what covers the API, `scripts/blog-import.ts`, and a body pasted
 * by a future tool.
 */
import { cardByUrlSlug } from '@/data/deck';
import type { Block } from '@/content/types';
import { linkPaths } from '@/lib/content/doc';
import type { LintDoc, LintViolation } from '@/lib/content/lint';

const violation = (
  locale: LintViolation['locale'],
  field: LintViolation['field'],
  detail: string,
  excerpt: string,
): LintViolation => ({ rule: 'bare-path', cls: 'error', locale, field, detail, excerpt });

/** Every `cardRef` slug in a body, in order. */
function cardRefSlugs(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b) => (b.kind === 'cardRef' ? [b.slug] : []));
}

/**
 * Everything a document names that has to exist. `[]` is clean.
 *
 * `knownSlugs` is the set of article slugs a `/blog/<x>` link may name. **The
 * document's OWN slug is always permitted**, whether or not it is published: an
 * article that links to itself from a "read this first" line is legitimate, and
 * refusing it would make the first save of a self-referencing draft impossible.
 *
 * **`/`, `/gallery` and `/blog` ARE THE ONLY BARE ROUTES ALLOWED**, which is
 * `blog.content.test.ts`'s *"points every internal path at a route this release
 * serves"* moved to the write path. Adding `/history` here would put a link to a
 * gated page in public prose -- a 302 to `/login` inside an article, which a crawler
 * reads as the article linking to a login form.
 */
export function resolveViolations(doc: LintDoc, knownSlugs: readonly string[]): LintViolation[] {
  const out: LintViolation[] = [];
  const slugs = new Set([...knownSlugs, doc.slug]);

  for (const p of linkPaths(doc.body)) {
    if (p.startsWith('#')) continue; // the lint's `dead-anchor`, not this module's.
    if (p === '/' || p === '/gallery' || p === '/blog') continue;
    if (p.startsWith('/arcana/')) {
      if (cardByUrlSlug(p.slice('/arcana/'.length)) === undefined) {
        out.push(violation(doc.locale, 'body', p, 'no card has that URL slug'));
      }
      continue;
    }
    if (p.startsWith('/blog/')) {
      if (!slugs.has(p.slice('/blog/'.length))) {
        out.push(violation(doc.locale, 'body', p, 'no published article has that slug'));
      }
      continue;
    }
    /*
     * Anything else is a route this release does not serve publicly. It passed the
     * lint's SHAPE check, so it is a well-formed bare path -- which is exactly the
     * shape `/history` and `/account` have.
     */
    out.push(violation(doc.locale, 'body', p, 'not a public route this release serves'));
  }

  for (const slug of cardRefSlugs(doc.body)) {
    if (cardByUrlSlug(slug) === undefined) {
      out.push(violation(doc.locale, 'body', slug, 'cardRef names no card in the deck'));
    }
  }

  if (doc.hero && cardByUrlSlug(doc.hero.cardUrlSlug) === undefined) {
    out.push(violation(doc.locale, 'hero', doc.hero.cardUrlSlug, 'hero names no card in the deck'));
  }

  return out;
}

import type { Block, Inline } from './types';

/**
 * Authoring sugar for `src/content/**`. **NOTHING HERE IS PROSE.**
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────────
 *
 * Four committed article documents are typed by hand, and
 * `{ kind: 'paragraph', text: [{ kind: 'text', text: '…' }] }` two hundred times is
 * unreviewable in a diff -- the same argument `src/components/Legal.tsx` made for
 * `<P>` over `<p className={styles.p}>`. These ten functions are the whole vocabulary
 * an author needs, and they are checked by `types.contract.test.ts` against S4's
 * union rather than by restating it.
 *
 * **NO `server-only` MARKER and no imports beyond the type.** `blog.content.test.ts`
 * and `doc.test.ts` both import this, and the marker throws outside a Next server
 * bundle. It is still fenced from client components by `clientBoundary.test.ts`'s
 * `src/content/**` rule, alongside the prose it builds -- and that rule is a
 * BUNDLE-SIZE rule rather than a secrecy one, which is why it is easy to breach by
 * accident and why the fence is mechanical.
 *
 * **OFFERED TO S4 AND NOT IMPOSED ON IT.** The forty-four lore documents were
 * written before this file existed and write their blocks as literals; nothing here
 * asks them to change. The names are deliberately short because they appear a
 * thousand times.
 *
 * ── SPANS CARRY THEIR OWN SPACES, AND THAT IS THE ONE TRAP IN THIS FILE ─────────
 *
 * `para(s('Lihat '), link('/gallery', 'galeri'))` renders `Lihat galeri`; drop the
 * trailing space inside `s()` and it renders `Lihatgaleri`. **React inserts nothing
 * between adjacent children**, so this is the block union's version of the
 * JSX-whitespace bug `legal.test.ts` describes -- *"JSX strips the leading whitespace
 * of a text node that spans more than one line"*, which shipped three times in one
 * afternoon as `www.jmtarot.siteand add to your phone`. The union removes the JSX
 * form and replaces it with this narrower one, so `blog.content.test.ts` has a test
 * on span adjacency for exactly the reason that one exists.
 *
 * ── TWO HELPERS ARE DELIBERATELY ABSENT ────────────────────────────────────────
 *
 * There is no `quote()`: S4's `quote` block **requires** a `source`, which S6's
 * amendment conceded in full, and no article quotes anything -- so a helper here
 * would be inventing a signature for a block nobody in this workstream writes.
 * There is no `note()`: it would have built the `callout` kind reconciliation R16
 * refused. `types.contract.test.ts` asserts both absences, because "the helpers were
 * incomplete" is how a refused ask comes back.
 */

export const s = (text: string): Inline => ({ kind: 'text', text });
export const em = (text: string): Inline => ({ kind: 'em', text });
export const strong = (text: string): Inline => ({ kind: 'strong', text });

/**
 * An INTERNAL link, by bare path. `/arcana/the-moon`, never `/en/arcana/the-moon`:
 * `Prose.tsx` applies S2's `localePath()`, so one document serves both prefixes and
 * nothing here duplicates the locale scheme. A path beginning `#` is an in-page
 * anchor and is left alone.
 */
export const link = (path: string, text: string): Inline => ({ kind: 'link', path, text });

/**
 * A section heading with its anchor id. **The id is an INTERFACE** -- the same
 * discipline `Clause id="6-2"` established, and `blog.content.test.ts` asserts the
 * three orientation ids exist in both locale documents. English in both locales, like
 * every other id and slug in this app.
 */
export const h2 = (id: string, text: string): Block => ({ kind: 'heading', level: 2, id, text });
export const h3 = (id: string, text: string): Block => ({ kind: 'heading', level: 3, id, text });

export const para = (...text: Inline[]): Block => ({ kind: 'paragraph', text });

/** An unordered list. `ordered: false` is written explicitly so a reader of the data sees it. */
export const bullets = (...items: Inline[][]): Block => ({ kind: 'list', ordered: false, items });

/** A numbered procedure. `<ol>` is semantics: five steps rendered as bullets is a lie. */
export const steps = (...items: Inline[][]): Block => ({ kind: 'list', ordered: true, items });

/**
 * One card, beside the paragraph that discusses it. `slug` is S-D4's hyphenated
 * English name (`the-moon`), resolved by `cardByUrlSlug` at render time -- so a typo
 * is a failing test rather than a broken image in production.
 */
export const cardRef = (slug: string, text: string): Block => ({ kind: 'cardRef', slug, text });

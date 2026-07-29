import Link from 'next/link';
import type { Block, Inline, Phrasing } from '@/content/types';
import type { Locale } from '@/data/types';
import { getLocale } from '@/lib/i18n/t';
import { localePath } from '@/lib/i18n/prefix';
import styles from './Prose.module.css';

/**
 * One run of words. **S6's addition (reconciliation R16), and it is the whole of what
 * `Phrasing` costs the renderer.**
 *
 * `Phrasing` is `string | Inline[]`, and the plain-string arm is not legacy: forty-four
 * lore documents take it because a lore paragraph carries no emphasis and no inline
 * link. The array arm exists because an article cannot be written without bold
 * lead-ins and inline links into the lore pages.
 *
 * **THE SPANS CARRY THEIR OWN SPACES AND THIS FUNCTION ADDS NONE.** React inserts
 * nothing between adjacent children, and `plainText()` joins with the empty string for
 * exactly that reason -- which is the condition R16 attached to granting the widening,
 * because it keeps the copy lint reading the string a reader actually sees.
 * `blocks.ts`'s header and `blog.content.test.ts`'s adjacency case are the other two
 * halves; a space inserted here would silently invalidate both.
 *
 * **AN INLINE LINK'S `path` IS BARE AND THE PREFIX IS APPLIED HERE**, the same
 * argument `cardRef` makes below: a document that spells `/en/...` duplicates S2's
 * helper and is wrong in one of the two trees. A path beginning `#` is an in-page
 * anchor and must NOT be prefixed -- prefixing one produces `/en/#next`, which is a
 * navigation to another page rather than a jump within this one.
 */
function spans(text: Phrasing, at: Locale) {
  if (typeof text === 'string') return text;
  return text.map((span: Inline, i: number) => {
    switch (span.kind) {
      case 'text':
        return span.text;
      case 'em':
        return <em key={i}>{span.text}</em>;
      case 'strong':
        return <strong key={i}>{span.text}</strong>;
      case 'link':
        return span.path.startsWith('#') ? (
          <a key={i} className={styles.link} href={span.path}>
            {span.text}
          </a>
        ) : (
          <Link
            key={i}
            className={styles.link}
            href={localePath(at, span.path)}
            prefetch={false}
          >
            {span.text}
          </Link>
        );
      default: {
        const unhandled: never = span;
        return unhandled;
      }
    }
  });
}

/**
 * The ONE renderer for `src/content/**`'s block union. S4 owns it; S6 mounts it too.
 *
 * **A SERVER COMPONENT, DELIBERATELY.** `Legal.tsx`'s header gives the reason for
 * this exact shape of content: static prose, no interaction, and a hydration bundle
 * for a document nobody touches is waste on the one page a stranger reads over
 * mobile data. Forty-four of those pages.
 *
 * **IT RESOLVES THE LOCALE ITSELF AND TAKES NO `locale` PROP.**
 * `LocaleProvider`'s header says "NO LOCALE PROP IS DRILLED ANYWHERE", and
 * CLAUDE.md's `/s/` section records what drilling one would have cost there.
 * `getLocale()` is `cache()`d, so N calls in one render are one `headers()` read.
 * Importing `@/lib/i18n/t` also makes this file permanently unreachable from a
 * client component, which `clientBoundary.test.ts` already enforces -- a feature,
 * because a content module must never reach the browser (§5 rule 1).
 *
 * **NO `dangerouslySetInnerHTML`, and the union has no markup-carrying kind** (§10,
 * §5 rule 3). The measurement that settled the JSON-LD version of this question is
 * in `JsonLd.tsx`; nothing here needs the exception it was refused.
 *
 * The `switch` is exhaustive and the `never` assignment is what makes a sixth block
 * kind a compile error rather than a silently blank paragraph.
 *
 * ── WHAT S6 ADDED, AND THE ONE THING IT ASKED FOR AND DID NOT GET ──────────────
 *
 * Three of S6's four field-level asks were granted by reconciliation R16 and all
 * three land here: `heading.id` when present, `<ol>` when `list.ordered`, and inline
 * spans through `spans()` below. **`callout` was refused**, which is why the `switch`
 * still has five arms -- and the two asides in the launch article are paragraphs.
 *
 * **IT DOES NOT WRITE `data-content-link`, AND S6's PLAN §D9 ASKED FOR IT.** The
 * attribute existed to feed a delegated click listener firing one event per in-prose
 * link. `events.ts` has ONE OWNER for v0.4.0 (S-D13) and S1 folded the agreed five
 * `public.*` events in; `public.link_clicked`'s `to` union has no `anchor` member, so
 * the listener would mean widening another workstream's data dictionary for an in-page
 * jump, after that workstream closed. So in-prose link clicks are unmeasured -- exactly
 * as they already are on the forty-four lore pages, whose `cardRef` links this
 * renderer has always emitted plainly -- and the chrome links that DO fire the event
 * (the blog index's orientation block, each lore page's gallery link) pass a literal
 * `to` through `TrackLink`. `linkKind()` survives in `@/lib/content/doc` as the single
 * definition of the classification for the day somebody wants it.
 */
export async function Prose({ blocks }: { blocks: readonly Block[] }) {
  const rendered = await getLocale();

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            /*
             * LEVEL 2 OR 3, NEVER 1. The page owns its single `<h1>`; a document
             * that could emit a second one breaks the one heading signal a crawler
             * reliably reads. And never a heading for size -- `Prose.module.css`
             * styles sections, and a line that needs to be big and is not a
             * section is a paragraph.
             */
            /*
             * `id` IS EMITTED ONLY WHEN THE DOCUMENT CARRIES ONE (R16). A lore page
             * anchors with the fixed `LORE_ANCHORS` enum and has none; an article's
             * sections differ per article, and without a per-heading id there is no
             * `/blog/x#myths-and-facts`, no table of contents and no target for the
             * three orientation links. `id={undefined}` renders no attribute, so the
             * conditional is for the reader rather than for React.
             */
            return block.level === 2 ? (
              <h2 key={i} id={block.id} className={styles.h2}>{block.text}</h2>
            ) : (
              <h3 key={i} id={block.id} className={styles.h3}>{block.text}</h3>
            );

          case 'paragraph':
            return <p key={i} className={styles.p}>{spans(block.text, rendered)}</p>;

          case 'list': {
            /*
             * `<ol>` WHEN `ordered`, AND IT IS SEMANTICS RATHER THAN STYLING (R16).
             * The launch article teaches a five-step draw and lists five mistakes in
             * order; rendering "1, 2, 3, 4, 5" as bullets is a numbered procedure
             * lying about being unnumbered. Absent means unordered, so the forty-four
             * lore documents come out of here exactly as they did before.
             */
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={i} className={styles.list}>
                {block.items.map((item, j) => (
                  <li key={j} className={styles.li}>{spans(item, rendered)}</li>
                ))}
              </List>
            );
          }

          case 'quote':
            /*
             * `<figure>`/`<figcaption>` rather than a bare `<blockquote>` plus a
             * `<p>`: the attribution is part of the quotation's meaning on a page
             * making claims about a tradition, and `figcaption` is the element
             * that says so to a screen reader.
             */
            return (
              <figure key={i} className={styles.quote}>
                <blockquote className={styles.quoteText}>{spans(block.text, rendered)}</blockquote>
                <figcaption className={styles.quoteSource}>{block.source}</figcaption>
              </figure>
            );

          case 'cardRef':
            /*
             * The href is built HERE, from the resolved locale, so no document
             * ever spells the prefix and no document can be wrong about the tree.
             * S2 owns `localePath`; forty-four pages hand-writing it is
             * forty-four chances to point at the wrong one.
             *
             * `prefetch={false}`: ten links per page on CDN-cached content for a
             * visitor who will follow at most one. `next/link` still emits a real
             * `<a href>` in the HTML, so a crawler follows it either way.
             */
            return (
              <p key={i} className={styles.p}>
                <Link
                  className={styles.cardRef}
                  href={localePath(rendered, `/arcana/${block.slug}`)}
                  prefetch={false}
                >
                  {block.text}
                </Link>
              </p>
            );

          default: {
            const unhandled: never = block;
            return unhandled;
          }
        }
      })}
    </>
  );
}

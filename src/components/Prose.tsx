import Link from 'next/link';
import type { Block } from '@/content/types';
import { getLocale } from '@/lib/i18n/t';
import { localePath } from '@/lib/i18n/prefix';
import styles from './Prose.module.css';

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
            return block.level === 2 ? (
              <h2 key={i} className={styles.h2}>{block.text}</h2>
            ) : (
              <h3 key={i} className={styles.h3}>{block.text}</h3>
            );

          case 'paragraph':
            return <p key={i} className={styles.p}>{block.text}</p>;

          case 'list':
            return (
              <ul key={i} className={styles.list}>
                {block.items.map((item, j) => (
                  <li key={j} className={styles.li}>{item}</li>
                ))}
              </ul>
            );

          case 'quote':
            /*
             * `<figure>`/`<figcaption>` rather than a bare `<blockquote>` plus a
             * `<p>`: the attribution is part of the quotation's meaning on a page
             * making claims about a tradition, and `figcaption` is the element
             * that says so to a screen reader.
             */
            return (
              <figure key={i} className={styles.quote}>
                <blockquote className={styles.quoteText}>{block.text}</blockquote>
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

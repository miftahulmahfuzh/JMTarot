import type { Block } from '@/content/types';
import { headingIds } from '@/lib/content/doc';
import styles from './ArticleToc.module.css';

/**
 * An article's table of contents. **ONE DEFINITION, TWO MOUNTS.**
 *
 * v0.5.0, the markdown editor, `docs/plans/2026-07-31-blog-markdown-editor-design.md` §9.
 * Lifted out of `src/app/blog/[slug]/page.tsx`, unchanged in behaviour, so the admin
 * preview shows the same outline `/blog/<slug>` does.
 *
 * ── IT WAS ALREADY AUTOMATIC, WHICH IS THE POINT WORTH RECORDING ────────────
 *
 * The feature request was *"the LLM automatically generates a clickable Table of Contents
 * from the sectioned content"*, and **it has existed since S6 and no admin has ever
 * authored one.** The reason it appeared missing is that the admin preview mounted `Prose`
 * alone, without the page chrome around it — so the one surface an operator looks at while
 * writing was the one surface that did not show it.
 *
 * A6-32's argument for not reimplementing `Prose` applies here for the same reason: two
 * definitions of the outline would agree with each other right up until they did not, and
 * the divergence would show on a public page rather than in the preview.
 *
 * ── THE LABEL IS A PROP, AND THAT IS TWO FENCES RATHER THAN LAZINESS ────────
 *
 * The public page passes `t('blog.inThisArticle')`; the admin passes a literal from
 * `copy.ts`. Calling `t()` in here would break `adminCopy.test.ts`, which forbids `getT`
 * and `useT` across the admin tree because **the admin surface is deliberately
 * Indonesian-only and not locale-switched** — an operator's chrome following the viewer's
 * locale is a translation nobody asked for on a page nobody but Miftah sees. Taking the
 * string means the component is pure presentation and neither fence bends.
 *
 * ── `> 2`, AND THE THRESHOLD IS THE ORIGINAL'S ──────────────────────────────
 *
 * Two sections are not an outline; they are the article's two halves, and a two-row
 * contents box above them is furniture. Copied rather than reconsidered, because changing
 * it would silently add or remove the box from four published pages.
 */
export function ArticleToc({
  blocks,
  label,
  className,
}: {
  blocks: readonly Block[];
  /** The heading above the list. A PROP — see the header. */
  label: string;
  /** Lets a mount place the box in its own layout without this file knowing about either. */
  className?: string;
}) {
  const sections = blocks.filter((b) => b.kind === 'heading' && b.level === 2);
  /*
   * `headingIds` counts only headings that HAVE an id, because a section with none is not
   * a link — and the count is what decides whether the box renders at all. Using
   * `sections.length` instead would render an empty `<ol>` for an article whose headings
   * carry no anchors, which is the shape a hand-typed markdown paste has before
   * `parseMarkdown` derives them.
   */
  const anchors = headingIds(blocks, 2);
  if (anchors.length <= 2) return null;

  return (
    <nav className={[styles.toc, className].filter(Boolean).join(' ')} aria-labelledby="toc-title">
      <p className={styles.tocTitle} id="toc-title">
        {label}
      </p>
      {/*
        A real list of real anchors. It works with JavaScript off, a crawler reads it as the
        document's outline, and the three orientation sections a reader who arrived knowing
        nothing needs are its first three rows.

        `<ol>`, because an article's sections are in an order the author chose.
      */}
      <ol className={styles.tocList}>
        {sections.map((block) =>
          block.kind === 'heading' && block.id ? (
            <li key={block.id}>
              <a href={`#${block.id}`}>{block.text}</a>
            </li>
          ) : null,
        )}
      </ol>
    </nav>
  );
}

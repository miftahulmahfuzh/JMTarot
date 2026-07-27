import type { ReactNode } from 'react';
import styles from './Legal.module.css';

/**
 * The shared furniture for `/terms` and `/privacy`.
 *
 * Two long documents in two locales is four files of prose, and the one thing
 * they must agree about is the HEADING IDS -- because the moderation refusal
 * links to `/terms#6-2` and `CLAUSE_FOR` in `src/lib/moderation/types.ts` is the
 * table of which. `Clause` takes the id as a required prop rather than deriving
 * it from the number so that the anchor is greppable: searching for `"6-2"`
 * finds the link, the map and the heading.
 *
 * **RENUMBERING CLAUSE 6 IS A BREAKING CHANGE TO THE MODERATION GATE.**
 * `legal.test.ts` fails if any `CLAUSE_FOR` value has no matching heading in
 * either locale document.
 *
 * Server components, no `'use client'`: these are static prose and shipping a
 * hydration bundle for a document nobody interacts with would be waste on the
 * one page a stranger reads over mobile data.
 */

export function LegalDoc({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.doc}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.effective}>{effective}</p>
      {children}
    </article>
  );
}

/**
 * One numbered clause.
 *
 * `id` is the anchor and `n` is what the reader sees. They are usually the same
 * number with a dot swapped for a dash, and they are separate props because the
 * anchor is an interface and the label is copy.
 */
export function Clause({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.clause}>
      {/*
        `scroll-margin-block-start` on the heading, not padding on the section:
        the app has no sticky header today, but `/terms#6-2` arriving at the very
        top edge of the viewport reads as if the link missed. A few lines of
        breathing room above the target is what makes an anchor look like it
        worked.
      */}
      <h2 className={styles.heading} id={id}>
        <span className={styles.number}>{n}</span> {title}
      </h2>
      {children}
    </section>
  );
}

/** A sub-clause. Same anchor discipline; `6.2` lives at `#6-2`. */
export function SubClause({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.sub}>
      <h3 className={styles.subHeading} id={id}>
        <span className={styles.number}>{n}</span> {title}
      </h3>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className={styles.p}>{children}</p>;
}

/** A bulleted list. Used sparingly -- a legal document that is all bullets is a slide deck. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className={styles.list}>
      {items.map((item, i) => (
        <li key={i} className={styles.li}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * A boxed aside for the two statements that must not be skimmed past: the
 * entertainment-only disclaimer and the governing-language clause.
 */
export function Callout({ children }: { children: ReactNode }) {
  return <aside className={styles.callout}>{children}</aside>;
}

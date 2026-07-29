/**
 * The four primitives every section on `/admin/users/[id]` is built from.
 * v0.5.0 / A5, task 11.
 *
 * Fourteen sections is a lot of surface, and §14's task 20 names the honest failure mode:
 * *"Fourteen sections is a lot; the honest failure mode is a wall."* These exist so that
 * every panel has the same anchor, the same heading, the same empty state and the same
 * table shape — which is what makes a wall scannable rather than merely long.
 *
 * **THEY SPELL NOTHING.** Every string is a prop, from `copy.ts` (A-D12, I-16's rule for
 * A4's primitives applied here). A primitive that carries its own Indonesian is a primitive
 * somebody has to translate twice.
 *
 * **AND THEY RENDER NO `<main>`** — `src/app/admin/layout.tsx` owns the only one in the
 * subtree and `adminSurface.test.ts` asserts it, because a page that nested a second could
 * forget its `lang="id"`.
 */
import type { ReactNode } from 'react';
import styles from '../detail.module.css';

/**
 * One section. The `id` is the anchor the table of contents links to, so it is required
 * rather than optional — a section with no anchor is a section the operator has to scroll
 * for.
 */
export function Panel({
  id,
  heading,
  note,
  children,
}: {
  id: string;
  heading: string;
  /** The sentence that keeps a rule visible to the operator. Optional; most have one. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.panel} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={styles.h2}>
        {heading}
      </h2>
      {note ? <p className={styles.note}>{note}</p> : null}
      {children}
    </section>
  );
}

/** A label/value pair. `value` takes a node so a section can put a `<code>` or a badge in it. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>{value}</dd>
    </div>
  );
}

export function Fields({ children }: { children: ReactNode }) {
  return <dl className={styles.fields}>{children}</dl>;
}

/**
 * A table. **It scrolls inside its own container and the page body never does** — loop 4's
 * requirement at 320/360/390, and the same rule A4's tables follow.
 *
 * `caption` is rendered as a visually-hidden caption rather than repeated as a heading: A4
 * measured a table printing its title twice at 1440px, once as the `<caption>` and once as
 * the first column's header, and *only a screenshot shows that*.
 */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: Array<{ label: string; numeric?: boolean }>;
  /** One array per row. A `ReactNode` cell is fine — several sections put a reveal in one. */
  rows: ReactNode[][];
}) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} scope="col" className={c.numeric ? styles.numeric : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            // The row index is the key: these rows have no stable client identity, they are
            // never reordered, and nothing here is stateful.
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j} className={columns[j]?.numeric ? styles.numeric : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A section with no rows. **Never a blank panel**: V5's M14 rule, generalised — an empty
 * panel reads as a failure, and the difference between "nothing happened here" and "this
 * query broke" is the whole information content of the sentence.
 */
export function Empty({ children }: { children: string }) {
  return <p className={styles.empty}>{children}</p>;
}

/**
 * Pre-formatted JSON, for `traits`, `facts` and `props`.
 *
 * Rendered as TEXT inside a `<pre>` and never interpolated as markup. For `events.props`
 * that is what `sanitizeProps()`'s guarantee buys — non-scalars stripped, strings truncated
 * to 120 characters, 24 keys max — and for `traits` and `facts` it is model and engine
 * output the operator needs verbatim.
 */
export function Json({ value }: { value: unknown }) {
  return (
    <pre className={styles.json}>
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  );
}

/** A short hash or id prefix. Twelve characters: enough to tell two apart and to recognise
 *  one you have seen, and never the whole digest (A5-12). */
export function Prefix({ value, chars = 12 }: { value: string | null; chars?: number }) {
  if (value === null) return <>—</>;
  return <code className={styles.code}>{value.slice(0, chars)}</code>;
}

/** A state word. `tone` picks the one existing token it wears; there is no new hex here. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warn' | 'good';
}) {
  const cls =
    tone === 'warn' ? styles.badgeWarn : tone === 'good' ? styles.badgeGood : styles.badge;
  return <span className={cls}>{children}</span>;
}

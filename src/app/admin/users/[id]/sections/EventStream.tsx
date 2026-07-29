/**
 * §4.13 — the last 200 `events`. v0.5.0 / A5, decision A5-D5.
 *
 * **`props` IS RENDERED AS TEXT AND THAT IS SAFE FOR A PROVABLE REASON.** `sanitizeProps()`
 * drops non-scalars, truncates strings to 120 characters, caps at 24 keys and rejects
 * `__proto__`, `constructor` and `prototype` by name — the property that makes `events` rows
 * honest survivors of account erasure, and the property that makes this section renderable at
 * all. It goes inside a `<pre>` as a string and is never interpolated as markup.
 *
 * **THE CAP IS STATED ON SCREEN**, so 200 is not read as "that is all there ever was".
 *
 * **`session_id` IS THE BROWSER SESSION, NOT THE AUTH SESSION**, and it is labelled as such:
 * `events.session_id = readings.session_id` reconstructs one interaction, and that join is the
 * one thing this section is actually for.
 *
 * **AN EMPTY STREAM MEANS TWO DIFFERENT THINGS AND THE PAGE SAYS WHICH.** `events.user_id` is
 * `on delete set null`, so a purged user's events are unreachable from here: empty beside a
 * live account is a bug, empty beside a hard-deleted one is correct.
 */
import type { EventRow } from '@/lib/db/schema';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { DataTable, Empty, Panel } from './kit';

export function EventStream({ rows, cap }: { rows: EventRow[]; cap: number }) {
  const c = DETAIL.events;
  return (
    <Panel id="peristiwa" heading={c.heading} note={c.cap(cap)}>
      {rows.length === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.columns.created },
            { label: c.columns.localDate },
            { label: c.columns.locale },
            { label: c.columns.session },
            { label: c.columns.name },
            { label: c.columns.props },
          ]}
          rows={rows.map((r) => [
            r.createdAt.toISOString().replace('T', ' ').slice(0, 19),
            // A STRING: the querent's own calendar day.
            r.localDate,
            r.locale ?? U.empty,
            r.sessionId ?? U.empty,
            r.name,
            <code key={r.id} className={styles.codeWrap}>
              {JSON.stringify(r.props)}
            </code>,
          ])}
        />
      )}
      <p className={styles.note}>{c.sessionNote}</p>
      <p className={styles.note}>{c.propsNote}</p>
      <p className={styles.note}>{c.purgedNote}</p>
    </Panel>
  );
}

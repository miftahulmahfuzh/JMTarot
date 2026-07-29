/**
 * §4.6 — `readings` + `reading_cards` + the per-reading ledger. v0.5.0 / A5.
 *
 * A list of `AdminReadingDetail`s rather than a table, because a reading is not a row: it has
 * three cards, a question, a verdict, a choice and a reveal. The count and the paging link are
 * here; everything inside one reading is that component's (R27, §11.5).
 *
 * **`body` AND `gist` ARE NOT IN THIS PAGE'S PAYLOAD** (A5-8) — `hasBody` and `hasGist` are the
 * nullity, and the prose is one audited request away.
 */
import type { AdminReadingRow, ReadingCost } from '@/lib/db/queries/admin/readings';
import { DETAIL } from '../../copy';
import { AdminReadingDetail } from '../AdminReadingDetail';
import styles from '../detail.module.css';
import { Empty, Panel } from './kit';

export function Readings({
  rows,
  costs,
  userId,
  totalReadings,
  nextHref,
}: {
  rows: AdminReadingRow[];
  costs: Map<string, ReadingCost>;
  userId: string;
  totalReadings: number;
  /** The next page, as a link. **A navigation and not a fetch** — the whole page is server
   *  rendered and a change of page is a URL. */
  nextHref: string | null;
}) {
  const c = DETAIL.readings;
  return (
    <Panel id="bacaan" heading={c.heading} note={c.ttftNote}>
      {rows.length === 0 ? (
        <Empty>{DETAIL.readings.count(0, totalReadings)}</Empty>
      ) : (
        <>
          <p className={styles.note}>{c.count(rows.length, totalReadings)}</p>
          <p className={styles.note}>{c.costNote}</p>
          <div className={styles.readings}>
            {rows.map((r) => (
              <AdminReadingDetail
                key={r.id}
                reading={r}
                cost={costs.get(r.id)}
                userId={userId}
              />
            ))}
          </div>
          {nextHref ? (
            <a className={styles.pageLink} href={nextHref}>
              {c.count(rows.length, totalReadings)} · →
            </a>
          ) : null}
        </>
      )}
    </Panel>
  );
}

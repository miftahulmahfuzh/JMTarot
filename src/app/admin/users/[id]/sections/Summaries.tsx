/**
 * §4.8 — `daily_summaries`. v0.5.0 / A5.
 *
 * **`generation_count` AND `updated_at` SIT NEXT TO EACH OTHER, AND THAT IS THE WHOLE POINT.**
 * The regeneration throttle compares exactly those two columns, and `generation_count` exists
 * to make *"is the throttle set right?"* one query instead of an events aggregation — this page
 * is where that question gets asked.
 */
import type { DailySummary } from '@/lib/db/schema';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { DataTable, Empty, Panel } from './kit';

export function Summaries({ rows }: { rows: DailySummary[] }) {
  const c = DETAIL.summaries;
  return (
    <Panel id="ringkasan" heading={c.heading} note={c.note}>
      {rows.length === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.columns.localDate },
            { label: c.columns.reader },
            { label: c.columns.locale },
            { label: c.columns.generationCount, numeric: true },
            { label: c.columns.updatedAt },
            { label: c.columns.promptVersion },
            { label: c.columns.sources, numeric: true },
            { label: c.body },
          ]}
          rows={rows.map((r) => [
            // A STRING (A5-15): the querent's own calendar day.
            r.localDate,
            r.readerId,
            r.locale,
            String(r.generationCount),
            r.updatedAt.toISOString().replace('T', ' ').slice(0, 19),
            r.promptVersion,
            String(r.sourceReadingIds.length),
            // `lang` on the prose, from the row's own locale.
            <span key={r.id} lang={r.locale} className={styles.cellProse}>
              {r.body}
            </span>,
          ])}
        />
      )}
    </Panel>
  );
}

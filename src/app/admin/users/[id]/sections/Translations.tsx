/**
 * §4.10 — `translations`, with the staleness flag. v0.5.0 / A5.
 *
 * **STALE IS `translations.updated_at < source.updated_at` AND THERE IS NO `source_hash`
 * COLUMN** — that comparison *is* the entire mechanism, and `putTranslation` setting
 * `updatedAt` by hand inside `onConflictDoUpdate` is what keeps it working (Drizzle's
 * `$onUpdate()` does not fire there). **Rendering the flag here is the only place the
 * mechanism is visible**, and a frozen `updated_at` shows up as "nothing is ever stale",
 * which is exactly how the bug would present. Both timestamps are on screen for that reason.
 *
 * **`entity_id` HAS NO FOREIGN KEY** and orphans are possible by design — the daily sweep's
 * fourth delete is the answer — so an orphan row is unreachable from a user page. Stated so
 * the absence is not read as a bug.
 */
import type { AdminTranslation } from '@/lib/db/queries/admin/detail';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { Badge, DataTable, Empty, Panel, Prefix } from './kit';

export function Translations({ rows }: { rows: AdminTranslation[] }) {
  const c = DETAIL.translations;
  return (
    <Panel id="terjemahan" heading={c.heading} note={c.note}>
      {rows.length === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.columns.entity },
            { label: c.columns.entityId },
            { label: c.columns.field },
            { label: c.columns.from },
            { label: c.columns.to },
            { label: c.columns.model },
            { label: c.columns.updatedAt },
            { label: 'source updated_at' },
            { label: c.columns.stale },
            { label: c.body },
          ]}
          rows={rows.map((r) => [
            r.entity,
            <Prefix key={r.id} value={r.entityId} chars={8} />,
            r.field,
            r.sourceLocale,
            r.locale,
            r.model,
            r.updatedAt.toISOString().replace('T', ' ').slice(0, 19),
            r.sourceUpdatedAt.toISOString().replace('T', ' ').slice(0, 19),
            r.stale ? <Badge tone="warn">{c.staleYes}</Badge> : c.staleNo,
            // `lang` is the TARGET locale: this is the translated prose.
            <span key={`${r.id}-b`} lang={r.locale} className={styles.cellProse}>
              {r.body}
            </span>,
          ])}
        />
      )}
      <p className={styles.note}>{c.orphanNote}</p>
    </Panel>
  );
}

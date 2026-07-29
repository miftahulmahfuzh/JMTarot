/**
 * §4.11 — `share_links`. v0.5.0 / A5.
 *
 * **`locale = NULL` RENDERS "as-written" AND NEVER "unknown".** Every link minted before that
 * column existed is NULL, and the honest behaviour for those is the prose verbatim in
 * `readings.locale`. A non-NULL value always has a `translations` row behind it, because the
 * mint resolves the pin rather than trusting it.
 *
 * **`view_count` IS LABELLED APPROXIMATE.** It is the one unauthenticated write in the product,
 * incremented in `after()` behind a per-IP limiter with failures swallowed — *a load and abuse
 * signal, not an audience metric.*
 *
 * **AND THERE IS NO REVOKE BUTTON.** §1: the only admin writes are blog rows and the audit log.
 * Revocation is per-artifact and kills every language (Miftah's ruling), it is the querent's to
 * perform, and **re-sharing rotates the slug — so there is no way back from an admin revoke.**
 */
import type { AdminShareLink } from '@/lib/db/queries/admin/detail';
import { int } from '../../../format';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { Badge, DataTable, Empty, Panel, Prefix } from './kit';

export function ShareLinks({ rows }: { rows: AdminShareLink[] }) {
  const c = DETAIL.shareLinks;
  return (
    <Panel id="tautan" heading={c.heading} note={c.asWrittenNote}>
      {rows.length === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.columns.slug },
            { label: c.columns.entity },
            { label: c.columns.entityId },
            { label: c.columns.locale },
            { label: c.columns.includeQuestion },
            { label: c.columns.includeNickname },
            { label: c.columns.views, numeric: true },
            { label: c.columns.createdAt },
            { label: c.columns.revokedAt },
            { label: c.columns.live },
          ]}
          rows={rows.map((r) => [
            <code key={r.id} className={styles.code}>
              {r.slug}
            </code>,
            r.entity,
            <Prefix key={`${r.id}-e`} value={r.entityId} chars={8} />,
            // NULL is as-written, never "unknown".
            r.locale ?? c.asWritten,
            r.includeQuestion ? U.yes : U.no,
            r.includeNickname ? U.yes : U.no,
            int(r.viewCount),
            r.createdAt.toISOString().replace('T', ' ').slice(0, 19),
            r.revokedAt === null ? U.empty : r.revokedAt.toISOString().replace('T', ' ').slice(0, 19),
            r.live ? <Badge tone="good">{c.liveYes}</Badge> : <Badge>{c.liveNo}</Badge>,
          ])}
        />
      )}
      <p className={styles.note}>{c.viewsApprox}</p>
      <p className={styles.note}>{c.noRevoke}</p>
    </Panel>
  );
}

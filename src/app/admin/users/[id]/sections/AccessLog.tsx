/**
 * §4.14 — `admin_access_log` for this subject. v0.5.0 / A5.
 *
 * **THIS SECTION IS WHY THE SUBJECT INDEX EXISTS.** It is the answer to a subject access
 * request, and it is the only way the operator ever finds out whether the audit trail is
 * working. Served by `admin_access_log_subject_created_idx`.
 *
 * **THE UNATTRIBUTED CASE IS REACHABLE AND IS RENDERED** (R3). Both FK columns are nullable
 * with `on delete set null` — which is not an attribution preference but an **erasure fix**: the
 * original `NOT NULL` + `on delete set null` raises `23502`, so the hard delete of any user an
 * admin had ever read about would ABORT. A row whose admin account is gone renders
 * *"admin dihapus"*, which means the admin's ROW is gone and never "unknown admin", and it must
 * not render as a blank line.
 *
 * **NO DELETE CONTROL** (A5-20): a delete button on an audit trail is the audit trail's absence.
 *
 * **`resource_key` IS NEVER A DECRYPTED VALUE, BY CONSTRUCTION** — a question key, a flag id or
 * a reading id. Nothing here needs to filter it, which is the property worth stating.
 */
import type { AdminAccessLogRow } from '@/lib/db/schema';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { DataTable, Empty, Panel } from './kit';

export function AccessLog({
  rows,
  adminEmails,
}: {
  rows: AdminAccessLogRow[];
  /** `admin_user_id` → email, resolved in one statement rather than one per row. */
  adminEmails: Map<string, string>;
}) {
  const c = DETAIL.access;
  return (
    <Panel id="audit" heading={c.heading} note={c.note}>
      {rows.length === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.columns.created },
            { label: c.columns.admin },
            { label: c.columns.resource },
            { label: c.columns.resourceKey },
          ]}
          rows={rows.map((r) => [
            r.createdAt.toISOString().replace('T', ' ').slice(0, 19),
            // NULL means the admin's row was hard-deleted. R3's reachable state.
            r.adminUserId === null
              ? U.adminDeleted
              : (adminEmails.get(r.adminUserId) ?? U.adminDeleted),
            r.resource,
            r.resourceKey === null ? U.empty : (
              <code key={r.id} className={styles.code}>
                {r.resourceKey}
              </code>
            ),
          ])}
        />
      )}
      <p className={styles.note}>{c.noDelete}</p>
      <p className={styles.note}>{c.listGap}</p>
      <p className={styles.note}>{c.purged}</p>
    </Panel>
  );
}

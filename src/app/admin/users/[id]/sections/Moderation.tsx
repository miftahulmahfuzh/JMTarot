/**
 * §4.12 — `moderation_flags`, with a per-row audited reveal. v0.5.0 / A5.
 *
 * **THREE TEXT STATES, AND TELLING THEM APART IS THE POINT** — `redacted_at` is what
 * distinguishes them, and *without it the retention policy is unverifiable from the data
 * itself*:
 *
 *   - `question` not null, `redacted_at` null → *ada teks*, reveal offered and **audited**;
 *   - `question` null, `redacted_at` set → *teks sudah dihapus (redaksi)*, **no audit row**;
 *   - both null → *teks tidak pernah disimpan* — `sexual_minor`, or there was no question.
 *
 * `sexual_minor` **never stores the text** — not encrypted, not for thirty days — because
 * storing it at all is the exposure. The page says so in words rather than rendering an empty
 * field that reads like a bug.
 *
 * **`pattern_id` IS ON SCREEN** because it turns *"the blocklist has false positives"* into
 * *"pattern `id.self_harm.method` has eleven false positives"*, which is the whole reason the
 * column exists. It is the one field here that is never returned to a client on any other
 * surface, and it is safe on an admin page.
 *
 * **`question_hmac` IS TWELVE CHARACTERS AND NOTHING COMPARES IT TO ANYTHING** (A5-12). It
 * survives redaction so repeat probing stays detectable — a **dedupe key, not anonymization**.
 * A "check whether this phrase was asked before" box is the feature that turns it into an
 * oracle, and there is no function anywhere in A5 that could serve one.
 *
 * **THE 30-DAY SWEEP IS UNTOUCHED:** no exemption, no "keep for review" flag, no un-redaction.
 */
import type { AdminFlagRow } from '@/lib/db/queries/admin/moderation';
import { oneDp } from '../../../format';
import { DETAIL, U } from '../../copy';
import { AdminReveal } from '../AdminReveal';
import styles from '../detail.module.css';
import { Badge, DataTable, Empty, Panel, Prefix } from './kit';

export function Moderation({ rows, userId }: { rows: AdminFlagRow[]; userId: string }) {
  const c = DETAIL.moderation;
  return (
    <Panel id="moderasi" heading={c.heading} note={c.patternNote}>
      {rows.length === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.columns.created },
            { label: c.columns.category },
            { label: c.columns.source },
            { label: c.columns.action },
            { label: c.columns.locale },
            { label: c.columns.patternId },
            { label: c.columns.confidence, numeric: true },
            { label: c.columns.hmac },
            { label: c.columns.redactedAt },
            { label: c.columns.text },
          ]}
          rows={rows.map((r) => [
            r.createdAt.toISOString().replace('T', ' ').slice(0, 19),
            r.category,
            r.source,
            r.action,
            r.locale,
            r.patternId ?? U.empty,
            oneDp(r.confidence),
            <Prefix key={r.id} value={r.hmacPrefix} />,
            r.redactedAt === null
              ? U.empty
              : r.redactedAt.toISOString().replace('T', ' ').slice(0, 19),
            <TextCell key={`${r.id}-t`} row={r} userId={userId} />,
          ])}
        />
      )}
      <p className={styles.note}>{c.neverStoredNote}</p>
      <p className={styles.note}>{c.hmacNote}</p>
      <p className={styles.note}>{c.noUnredact}</p>
    </Panel>
  );
}

function TextCell({ row, userId }: { row: AdminFlagRow; userId: string }) {
  const c = DETAIL.moderation;
  if (row.state === 'redacted') return <Badge tone="warn">{c.redacted}</Badge>;
  if (row.state === 'never_stored') return <Badge>{c.neverStored}</Badge>;
  return (
    <AdminReveal
      href={`/api/admin/users/${userId}/moderation/${row.id}`}
      label={c.reveal}
      field="question"
      // The `undecryptable` state comes back as a 200 with no `question`, so the reveal's
      // "nothing to reveal" branch renders THIS -- which is why it names the key rather than
      // the redaction. A rotated key is not the same fact as a retention sweep.
      emptyLabel={c.undecryptable}
      // NO `lang`: this is text the querent typed, and `locale` on the row is the UI
      // preference rather than a declaration of what language they typed in. W7's own rule --
      // *the blocklist runs BOTH locales' patterns under both locales*.
    />
  );
}

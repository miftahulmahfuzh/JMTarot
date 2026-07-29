/**
 * §4.4 — `lotus_avatars`, in full, in both locales. v0.5.0 / A5.
 *
 * **THERE IS NO COMPUTED "STALE" FLAG HERE, AND THE ABSENCE IS THE DECISION.** Recomputing
 * `lotusInputHash` needs the six answers DECRYPTED, which is a bulk decrypt (A5-5). So the page
 * puts `lotus_avatars.updated_at` next to the answers' `max(updated_at)` and lets the operator
 * read them — two honest numbers instead of one derived from a forbidden read.
 */
import type { LotusAvatar } from '@/lib/db/schema';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { Empty, Field, Fields, Json, Panel, Prefix } from './kit';

export function Lotus({
  lotus,
  answersUpdatedAt,
}: {
  lotus: LotusAvatar | null;
  answersUpdatedAt: Date | null;
}) {
  const c = DETAIL.lotus;
  if (!lotus) {
    return (
      <Panel id="lotus" heading={c.heading}>
        <Empty>{c.noRow}</Empty>
      </Panel>
    );
  }
  return (
    <Panel id="lotus" heading={c.heading} note={c.note}>
      <Fields>
        <Field label={c.sourceVersion} value={String(lotus.sourceVersion)} />
        <Field label={c.inputHash} value={<Prefix value={lotus.inputHash} />} />
        <Field label={c.model} value={lotus.model} />
        <Field
          label={c.updatedAt}
          value={lotus.updatedAt.toISOString().replace('T', ' ').slice(0, 19)}
        />
        <Field
          label={c.answersUpdatedAt}
          value={
            answersUpdatedAt === null
              ? U.empty
              : answersUpdatedAt.toISOString().replace('T', ' ').slice(0, 19)
          }
        />
      </Fields>
      {/* Both locales, in full. `summary` is model output `lotusSafetyCheck` already passed,
          and it is injected into EVERY reading prompt -- so `lang` matters here. */}
      <h3 className={styles.h3}>{c.summaryId}</h3>
      <p className={styles.prose} lang="id">
        {lotus.summary.id}
      </p>
      <h3 className={styles.h3}>{c.summaryEn}</h3>
      <p className={styles.prose} lang="en">
        {lotus.summary.en}
      </p>
      <h3 className={styles.h3}>{c.traits}</h3>
      <Json value={lotus.traits} />
      <p className={styles.note}>{c.staleNote}</p>
    </Panel>
  );
}

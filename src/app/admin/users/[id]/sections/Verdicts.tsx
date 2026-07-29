/**
 * §4.9 — `frequency_verdicts`. v0.5.0 / A5.
 *
 * **THE PAGE RENDERS NO COUNT AND DERIVES NO TALLY.** V3 deleted `m` and `n` from both prompts
 * rather than forbidding them, on the ground that *a model cannot recite a count it was never
 * given*. A dashboard that puts them on screen beside the verdict is not a breach of that, but
 * it is the arithmetic the feature exists to stop doing out loud, and it invites somebody to
 * "surface" it in the product. Two card names, the fingerprint prefix and the prose.
 *
 * **Card names stay English** (`## Card data`), in both locales, for the same reason as
 * everywhere else: a verdict refers to The Moon.
 */
import { cardById } from '@/data/deck';
import type { FrequencyVerdict } from '@/lib/db/schema';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { DataTable, Empty, Panel, Prefix } from './kit';

function name(cardId: number): string {
  return cardById(cardId)?.name ?? DETAIL.readings.unknownCard;
}

export function Verdicts({ rows }: { rows: FrequencyVerdict[] }) {
  const c = DETAIL.verdicts;
  return (
    <Panel id="verdict" heading={c.heading} note={c.note}>
      {rows.length === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.columns.windowKey },
            { label: c.columns.locale },
            { label: c.columns.top },
            { label: c.columns.second },
            { label: c.columns.fingerprint },
            { label: c.columns.model },
            { label: c.columns.updatedAt },
            { label: c.body },
          ]}
          rows={rows.map((r) => [
            r.windowKey,
            r.locale,
            name(r.topCardId),
            name(r.secondCardId),
            <Prefix key={r.id} value={r.fingerprint} />,
            r.model,
            r.updatedAt.toISOString().replace('T', ' ').slice(0, 19),
            <span key={`${r.id}-b`} lang={r.locale} className={styles.cellProse}>
              {r.body}
            </span>,
          ])}
        />
      )}
    </Panel>
  );
}

/**
 * §4.3 — the six answers, as PRESENCE with a per-row audited reveal. v0.5.0 / A5.
 *
 * This is V8's `/account` shape with two differences: the querent's own page has an edit
 * control and this one has none (§1 of the roadmap — *an admin may not edit a reading, a
 * profile, an answer or a persona*), and every reveal here writes an `admin_access_log` row
 * before the plaintext exists.
 *
 * **THE THREE STATES ARE TOLD APART AND THAT IS THE POINT** — *terjawab* / *dilewati* /
 * *belum ditanya*. A missing row means the stepper never reached that question, which after
 * completion is a bug worth seeing rather than an empty field worth editing.
 *
 * **THE CLOSED TWO ARE NOT SECRETS.** `introversion` and `color` store their value in
 * `answer_choice`, which is not encrypted and is not text the querent typed, so it is shown
 * inline and offers no reveal — a reveal control over an unencrypted closed-set value would
 * suggest a protection that does not exist and would cost an audit row for the word "black".
 */
import { isFreeText } from '@/data/onboarding';
import type { AdminAnswerState } from '@/lib/db/queries/admin/detail';
import { DETAIL, U } from '../../copy';
import { AdminReveal } from '../AdminReveal';
import styles from '../detail.module.css';
import { DataTable, Panel } from './kit';

export function Answers({
  states,
  userId,
}: {
  states: AdminAnswerState[];
  userId: string;
}) {
  const c = DETAIL.answers;
  return (
    <Panel id="jawaban" heading={c.heading} note={c.note}>
      <DataTable
        caption={c.heading}
        columns={[
          { label: 'Pertanyaan' },
          { label: 'Status' },
          { label: c.updatedAt },
          { label: c.revealed },
        ]}
        rows={states.map((s) => [
          c.titles[s.key],
          !s.asked ? c.notAsked : s.skipped || !s.answered ? c.skipped : c.answered,
          s.updatedAt === null ? U.empty : s.updatedAt.toISOString().slice(0, 19).replace('T', ' '),
          <AnswerCell key={s.key} state={s} userId={userId} />,
        ])}
      />
      <p className={styles.note}>{c.closed}</p>
      <p className={styles.note}>{c.noEdit}</p>
    </Panel>
  );
}

function AnswerCell({ state, userId }: { state: AdminAnswerState; userId: string }) {
  const c = DETAIL.answers;
  if (!state.asked) return <>{U.empty}</>;
  // A closed question: the value is not encrypted, so it is shown and there is no reveal.
  if (!isFreeText(state.key)) return <>{state.choice ?? U.empty}</>;
  return (
    <AdminReveal
      // **THE URL IS BUILT ON THE SERVER**, so the client never composes a path from a
      // subject id it might get wrong (§10).
      href={`/api/admin/users/${userId}/answer/${state.key}`}
      label={c.reveal}
      field="text"
      emptyLabel={c.empty}
    />
  );
}

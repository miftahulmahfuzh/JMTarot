'use client';

import { useState } from 'react';

import type { OnboardingQuestionKey } from '@/data/onboarding';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './AccountAnswers.module.css';

/**
 * Per-answer clearing (reconciliation §7.3).
 *
 * **IT SHIPS BECAUSE `/privacy` ALREADY PROMISES IT, TWICE, IN BOTH LOCALES** —
 * clause 3 (*"You can clear it at any time, one answer at a time, without deleting
 * your account"*) and clause 7. That made it a published promise of a control the
 * user could not perform, which is the exact mistake `/account` itself made for a
 * whole release. Deferring it would have been committing it a second time while
 * fixing the first.
 *
 * ── THE PAGE SHOWS WHICH ANSWERS EXIST AND NEVER WHAT IS IN THEM ─────────────
 *
 * `answerPresence` reads `answer_text IS NOT NULL` and decrypts nothing, and there
 * is **no reveal control at all** — so the plaintext never leaves the server.
 * `worst_thing` is the most sensitive string in the product; the page that lets
 * somebody delete it has no business reading it back to them, and the requirement
 * §7.3 folded in was "show which answers exist without showing their decrypted text
 * until asked". V8's answer to "until asked" is that it is never asked.
 *
 * ── WHY IT IS SIX ROWS AND NOT ONE "DELETE MY ANSWERS" BUTTON ────────────────
 *
 * V8's plan offered both shapes and worried that six rows "turns the rite into a
 * settings page", which is L13's own warning about EDITING them. But the promise
 * `/privacy` makes is specifically *one answer at a time*, and a single button that
 * clears all six is a different control with a different consequence — somebody who
 * regrets one answer would have to erase the other five to reach it.
 *
 * The rite is protected a different way: the rows are **labelled by question and
 * blank by content**, they sit under a heading below the persona rather than at the
 * top of the page, and there is no edit affordance anywhere near them. L13's
 * asymmetry survives — the six are deletable and NOT editable; the three FACTS are
 * the other way round.
 *
 * ── A CLEARED ROW SAYS "CLEARED", NOT "NOT ANSWERED" ────────────────────────
 *
 * The column ends up in exactly the state a skip leaves it — `answer_text = NULL,
 * skipped = true`, which is the honest record and is why the route does not delete
 * the row. But a row that REVERTS to the same words a never-answered one uses reads
 * as if the button did nothing, so the cleared state is tracked in this component
 * for the life of the page. It is deliberately not persisted: on the next visit it
 * is simply an unanswered question, which is the truth.
 */
export function AccountAnswers({
  initial,
}: {
  initial: Array<{ key: OnboardingQuestionKey; answered: boolean }>;
}) {
  const t = useT();
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function clear(key: OnboardingQuestionKey) {
    if (busy) return;
    setBusy(key);
    setFailed(null);

    try {
      const res = await fetch(`/api/onboarding/answer/${key}`, { method: 'DELETE' });
      if (!res.ok) {
        /*
         * A 404 means there was nothing to clear, which is indistinguishable from a
         * real failure to this component and is reported as one. That is the safe
         * direction: claiming an erasure that did not happen is the wrong answer to
         * give about somebody's data, and the route's own comment makes the same
         * call in the other direction.
         */
        setFailed(key);
        setBusy(null);
        return;
      }
      setCleared((prev) => new Set(prev).add(key));
      setBusy(null);
    } catch {
      setFailed(key);
      setBusy(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>{t('account.answers.hint')}</p>

      <ul className={styles.rows}>
        {initial.map((row) => {
          const justCleared = cleared.has(row.key);
          const answered = row.answered && !justCleared;
          /*
           * The question's own title, from the catalog W3 already wrote. The keys
           * are a closed set so this template literal cannot miss — and it is why
           * the union is narrowed at the boundary rather than typed as `string`.
           */
          const question = t(`onboarding.q.${row.key}.title` as 'onboarding.q.color.title');

          return (
            <li key={row.key} className={styles.row}>
              <div className={styles.text}>
                <span className={styles.question}>{question}</span>
                <span className={styles.state}>
                  {answered
                    ? t('account.answers.answered')
                    : justCleared
                      ? t('account.answers.cleared')
                      : t('account.answers.empty')}
                </span>
              </div>

              {answered ? (
                <button
                  type="button"
                  className={styles.clear}
                  /* The label names the QUESTION, because six identical "Clear"
                     buttons in a list are six identical announcements to a screen
                     reader and the row's own text is a separate node. */
                  aria-label={t('account.answers.clearAria', { question })}
                  onClick={() => void clear(row.key)}
                  disabled={busy !== null}
                >
                  {busy === row.key
                    ? t('account.answers.clearing')
                    : t('account.answers.clear')}
                </button>
              ) : null}

              {failed === row.key ? (
                <p className={styles.failed} role="alert">
                  {t('account.answers.failed')}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Said out loud, because it is the part nobody would guess: the deleted
          material is also PARAPHRASED inside the Lotus block, and the route
          rewrites both that and the persona. A delete button whose effect stops at
          one table is worse than no delete button. */}
      <p className={styles.note}>{t('account.answers.note')}</p>
    </div>
  );
}

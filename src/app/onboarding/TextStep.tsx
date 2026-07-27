'use client';

/**
 * The four free-text questions: `best_thing`, `worst_thing`, `most_loved`,
 * `willow_wish`.
 *
 * ONE COMPONENT FOR ALL FOUR, with `worst_thing` differing in exactly two ways
 * -- both of them specified in plan §4 and both visible on screen:
 *
 *   1. Skip sits BESIDE Continue at equal weight rather than below it. On the
 *      one question that asks about the worst thing someone has witnessed,
 *      declining must not look like the lesser option.
 *   2. Its hint names the encryption. That is the question where a user is
 *      entitled to ask what happens to the string, and the only one where the
 *      answer is worth the words.
 *
 * NOTHING ACKNOWLEDGES THE ANSWER AFTER IT IS GIVEN. No "thank you for sharing",
 * no softening line, no icon. An "ouch, that's heavy" would be the worst line in
 * the app, and the absence is a design decision rather than an omission.
 *
 * A RESUMED STEP SHOWS AN EMPTY FIELD. The server never sends answer text back
 * (see `getOnboardingState`), so `alreadySaved` is all this component knows, and
 * it says so rather than looking like lost data. Decrypting `worst_thing` to
 * pre-fill a textarea is not a thing this app does.
 */
import { useState } from 'react';
import {
  ONBOARDING_MAX_ANSWER_CHARS,
  type OnboardingQuestionKey,
  type RawAnswer,
} from '@/data/onboarding';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './onboarding.module.css';

type Props = {
  questionKey: OnboardingQuestionKey;
  headingId: string;
  /** This question already has a row, from a previous session. */
  alreadySaved: boolean;
  onAnswer: (raw: RawAnswer) => void;
};

/** Past this fraction of the cap, the counter appears. */
const COUNTER_AT = 0.8;

export function TextStep({ questionKey, headingId, alreadySaved, onAnswer }: Props) {
  const t = useT();
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const over = trimmed.length > ONBOARDING_MAX_ANSWER_CHARS;
  const showCounter = text.length >= ONBOARDING_MAX_ANSWER_CHARS * COUNTER_AT;

  /*
   * `worst_thing` is the only step that levels the two buttons. Keyed off the
   * question rather than a prop, so the rule lives beside the reason for it and
   * cannot be set on the wrong step from the parent.
   */
  const levelActions = questionKey === 'worst_thing';

  return (
    <div className={styles.step}>
      <h1 className={styles.title} id={headingId} tabIndex={-1}>
        {t(`onboarding.q.${questionKey}.title`)}
      </h1>

      {/* The framing line carries the permission to decline on `worst_thing`,
          and it is rendered ABOVE the field on purpose: it has to arrive before
          the field is focused, not after the user has started typing. */}
      <p className={styles.framing}>{t(`onboarding.q.${questionKey}.framing`)}</p>
      <p className={styles.hint}>{t(`onboarding.q.${questionKey}.hint`)}</p>

      {alreadySaved ? <p className={styles.hint}>{t('onboarding.answerSaved')}</p> : null}

      <textarea
        className={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        /*
         * `maxLength` is NOT set, deliberately. It would silently swallow
         * keystrokes at the cap, which on a long answer reads as a broken
         * keyboard. The counter warns, the button disables, and the server
         * rejects rather than truncating -- three honest signals instead of one
         * silent one.
         */
        rows={4}
        autoCapitalize="sentences"
        // No `autoFocus`: it summons the keyboard over the framing line the user
        // has not read yet, and on `worst_thing` that line is the one granting
        // permission to decline.
        aria-describedby={`${headingId}-hint`}
      />

      <span
        className={`${styles.counter} ${over ? styles.counterOver : ''}`}
        aria-live="polite"
      >
        {showCounter ? `${trimmed.length} / ${ONBOARDING_MAX_ANSWER_CHARS}` : ''}
      </span>

      {over ? (
        <p className={styles.error} role="alert">
          {t('onboarding.error.tooLong')}
        </p>
      ) : null}

      <div className={`${styles.actions} ${levelActions ? styles.actionsLevel : ''}`}>
        <button
          type="button"
          className={styles.cta}
          disabled={trimmed.length === 0 || over}
          onClick={() => onAnswer({ text: trimmed })}
        >
          {t('onboarding.actions.next')}
        </button>
        <button
          type="button"
          className={styles.skip}
          /*
           * `skipped: true` AND NOT an empty string. The two are different facts
           * -- a skip is `answer_text IS NULL`, an encrypted empty string is
           * indistinguishable from an encrypted answer in a dump -- and sending
           * the wrong one here is precisely the class of bug the iframe harness
           * exists to catch: the page looks right and the request is wrong.
           */
          onClick={() => onAnswer({ skipped: true })}
        >
          {t('onboarding.actions.skip')}
        </button>
      </div>
    </div>
  );
}

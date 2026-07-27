'use client';

/**
 * `introversion`: a native range, 0-100 in steps of 5.
 *
 * THE WHOLE DESIGN OF THIS STEP IS L5. A slider parked at centre makes "no
 * answer" and "dead centre" the same picture, and storing 50 for someone who
 * never touched it would be a silent lie in `traits` -- the kind that is
 * indistinguishable from data afterwards. So the control starts at the middle
 * (it has to start somewhere, and the middle is the least suggestive place) but
 * is drawn UNTOUCHED, "Lanjut" is disabled until it moves, and skipping is
 * always available.
 *
 * Native `<input type="range">` because iOS already knows how to drag it, and
 * because a hand-rolled slider would need pointer capture, keyboard support and
 * an ARIA role the platform gives away.
 */
import { useState } from 'react';
import {
  INTROVERSION_MAX,
  INTROVERSION_MIN,
  INTROVERSION_STEP,
  type RawAnswer,
} from '@/data/onboarding';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './onboarding.module.css';

type Props = {
  headingId: string;
  alreadySaved: boolean;
  onAnswer: (raw: RawAnswer) => void;
};

const MIDPOINT = (INTROVERSION_MIN + INTROVERSION_MAX) / 2;

export function ScaleStep({ headingId, alreadySaved, onAnswer }: Props) {
  const t = useT();
  const [value, setValue] = useState(MIDPOINT);
  const [touched, setTouched] = useState(false);

  return (
    <div className={styles.step}>
      <h1 className={styles.title} id={headingId} tabIndex={-1}>
        {t('onboarding.q.introversion.title')}
      </h1>
      <p className={styles.framing}>{t('onboarding.q.introversion.framing')}</p>
      <p className={styles.hint}>{t('onboarding.q.introversion.hint')}</p>

      {alreadySaved ? <p className={styles.hint}>{t('onboarding.answerSaved')}</p> : null}

      <div className={styles.scale}>
        <input
          type="range"
          className={`${styles.range} ${touched ? '' : styles.rangeUntouched}`}
          min={INTROVERSION_MIN}
          max={INTROVERSION_MAX}
          step={INTROVERSION_STEP}
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
            setTouched(true);
          }}
          /*
           * The two ends are the labels, so the slider needs an accessible name
           * of its own -- the visible text says what 0 and 100 mean, not what the
           * control is. `aria-valuetext` is deliberately absent: the number has
           * no unit and "37" is less informative than the percentage the platform
           * reads by default.
           */
          aria-labelledby={headingId}
        />
        <div className={styles.scaleEnds}>
          <span>{t('onboarding.q.introversion.left')}</span>
          <span>{t('onboarding.q.introversion.right')}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cta}
          disabled={!touched}
          onClick={() => onAnswer({ choice: String(value) })}
        >
          {t('onboarding.actions.next')}
        </button>
        <button
          type="button"
          className={styles.skip}
          onClick={() => onAnswer({ skipped: true })}
        >
          {t('onboarding.actions.skip')}
        </button>
      </div>
    </div>
  );
}

'use client';

/**
 * `color`: three tappable plates.
 *
 * THE COPY SAYS "JANGAN DIPIKIR LAMA", SO THE CONTROL MUST NOT ASK ANYONE TO.
 * Three plates, one tap, no confirm step -- a tap selects and advances is
 * tempting and wrong, because a mis-tap on a phone would then be unrecoverable
 * without going Back. Tap selects, "Lanjut" commits, which is one extra tap and
 * the only forgiving version.
 *
 * The plates are a `radiogroup`, not three buttons: it is one choice from a
 * closed set, and the role is what makes arrow keys work and what stops a screen
 * reader announcing three unrelated buttons.
 *
 * THE GREY IS A `color-mix` OF TWO EXISTING TOKENS, in the stylesheet. `tokens.ts`
 * has no neutral grey and W3 is not adding one. See `.plateGrey`.
 */
import { useState } from 'react';
import { LOTUS_COLORS, type LotusColor, type RawAnswer } from '@/data/onboarding';
import { c, q } from './copy';
import styles from './onboarding.module.css';

type Props = {
  headingId: string;
  alreadySaved: boolean;
  onAnswer: (raw: RawAnswer) => void;
};

/** The swatch class and the label key for each colour, in asking order. */
const PLATES = {
  black: { swatch: styles.plateBlack, label: 'onboarding.q.color.option.black' },
  white: { swatch: styles.plateWhite, label: 'onboarding.q.color.option.white' },
  grey: { swatch: styles.plateGrey, label: 'onboarding.q.color.option.grey' },
} as const satisfies Record<LotusColor, { swatch: string; label: Parameters<typeof c>[0] }>;

export function ColorStep({ headingId, alreadySaved, onAnswer }: Props) {
  const [chosen, setChosen] = useState<LotusColor | null>(null);

  return (
    <div className={styles.step}>
      <h1 className={styles.title} id={headingId} tabIndex={-1}>
        {q('color', 'title')}
      </h1>
      <p className={styles.framing}>{q('color', 'framing')}</p>
      <p className={styles.hint}>{q('color', 'hint')}</p>

      {alreadySaved ? <p className={styles.hint}>{c('onboarding.answerSaved')}</p> : null}

      <div className={styles.plates} role="radiogroup" aria-labelledby={headingId}>
        {LOTUS_COLORS.map((colour) => (
          <div key={colour} className={styles.plateWrap}>
            <button
              type="button"
              role="radio"
              aria-checked={chosen === colour}
              className={`${styles.plate} ${PLATES[colour].swatch} ${
                chosen === colour ? styles.plateSelected : ''
              }`}
              onClick={() => setChosen(colour)}
            >
              {/* The plate itself is a colour, so its accessible name has to come
                  from somewhere. The visible label below is that name. */}
              <span className={styles.srOnly}>{c(PLATES[colour].label)}</span>
            </button>
            <span className={styles.plateLabel} aria-hidden="true">
              {c(PLATES[colour].label)}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cta}
          disabled={chosen === null}
          onClick={() => chosen && onAnswer({ choice: chosen })}
        >
          {c('onboarding.actions.next')}
        </button>
        {/*
          L5 says the colour is REQUIRED and the slider must be touched or
          explicitly skipped. Skip is offered here anyway, and the reason is
          roadmap §8's plainer rule plus the invitation's own promise --
          "Pertanyaan apa pun boleh kamu lewati". A screen that silently exempts
          itself from a promise made three screens earlier is worse than a
          slightly weaker `traits.color`, which is already nullable because a
          skipped question has to be representable.
        */}
        <button
          type="button"
          className={styles.skip}
          onClick={() => onAnswer({ skipped: true })}
        >
          {c('onboarding.actions.skip')}
        </button>
      </div>
    </div>
  );
}

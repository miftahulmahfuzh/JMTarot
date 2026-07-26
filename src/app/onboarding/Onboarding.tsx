'use client';

/**
 * The stepper shell: one screen at a time (L1).
 *
 * WHY A STEPPER AND NOT A FORM. Nine fields stacked on one phone screen is a
 * signup wall, and the keyboard covers half the viewport, so it becomes
 * scroll-and-hunt. It also reads as being onboarded rather than as being read,
 * which is the register this whole flow is trying to stay out of. One question
 * per screen additionally lets each question carry its own framing line without
 * the page becoming a wall of italics, and gives the skip control somewhere to
 * sit that is not next to five other skip controls.
 *
 * NINE SCREENS, NOT ELEVEN. Plan §3's flow diagram is what this implements:
 * step 0 the invitation, step 1 all three facts together, steps 2-7 the six,
 * step 8 the close. L1 says "nine steps plus an opening and a closing card",
 * which counts the nine QUESTIONS -- and Task 11 carries that arithmetic
 * forward as "eleven steps" to screenshot. The concrete flow, Task 4's explicit
 * "three fields" on the facts step, the single `onboarding.facts.title` key and
 * the single `POST /api/onboarding/facts` endpoint all agree on nine screens.
 * There are eleven screenshots only if you count the three facts separately.
 */
import { useMemo, useState } from 'react';
import {
  ONBOARDING_QUESTION_KEYS,
  nextUnansweredKey,
  type OnboardingQuestionKey,
} from '@/data/onboarding';
import type { Profile } from '@/data/types';
import { c } from './copy';
import styles from './onboarding.module.css';

/** Step 0 is the invitation, step 1 the facts, 2-7 the six, 8 the close. */
const STEP_INTRO = 0;
const STEP_FACTS = 1;
const STEP_FIRST_QUESTION = 2;
const STEP_DONE = STEP_FIRST_QUESTION + ONBOARDING_QUESTION_KEYS.length;

/**
 * What the progress counter shows: the number of the FIRST question on this
 * screen, out of nine.
 *
 * The invitation promises "sembilan pertanyaan", so the counter has to be over
 * nine or it contradicts the copy one screen later. The facts screen carries
 * three questions at once, so it is `1 / 9` -- you are on the first of nine --
 * and `best_thing` is `4 / 9`. Monotonic, starts at one, ends at nine.
 *
 * Counting the seven INPUT SCREENS instead would be a truer description of where
 * you are in the flow and a worse one of what you were promised. The counter is
 * not shown on the invitation or the close, which have no question on them.
 */
const TOTAL_QUESTIONS = 3 + ONBOARDING_QUESTION_KEYS.length;

function firstQuestionNumber(step: number): number | null {
  if (step === STEP_FACTS) return 1;
  if (step >= STEP_FIRST_QUESTION && step < STEP_DONE) {
    // The three facts occupy 1-3, so the six start at 4.
    return 4 + (step - STEP_FIRST_QUESTION);
  }
  return null;
}

export type OnboardingProps = {
  /** Null until the facts step has been submitted -- `full_name` is `not null`,
   *  so the row cannot exist half-made and there is nothing to restore. */
  profile: Profile | null;
  /** WHICH questions have a row. Never what is in them. */
  answeredKeys: OnboardingQuestionKey[];
  /** `?step=`, honoured outside production only. See `page.tsx`. */
  initialStep: number | null;
};

export function Onboarding({ profile, answeredKeys, initialStep }: OnboardingProps) {
  /**
   * WHERE A RESUMED STEPPER OPENS.
   *
   * Derived, never stored (§3). `nextUnansweredKey` returns the first key with
   * no row, and the resume point is that key's screen -- so there is no cursor
   * to get out of sync with the rows it points at.
   *
   * The facts step comes first if there is no profile at all. If there is one
   * and all six are recorded, the close: the user got as far as the last answer
   * and closed the tab before the final submit, and sending them back through
   * six answered questions would be a punishment for it.
   *
   * `useMemo` and not `useState`'s initialiser-with-side-effects: this is a pure
   * computation over props, and the deck taught this project what happens when
   * an impure one runs in an initialiser (two different decks, one on the server
   * and one on the client, with nothing on screen looking wrong).
   */
  const resumeStep = useMemo(() => {
    if (!profile) return STEP_INTRO;
    const next = nextUnansweredKey(answeredKeys);
    if (next === null) return STEP_DONE;
    return STEP_FIRST_QUESTION + ONBOARDING_QUESTION_KEYS.indexOf(next);
  }, [profile, answeredKeys]);

  const [step, setStep] = useState(initialStep ?? resumeStep);

  const questionNumber = firstQuestionNumber(step);

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        {step === STEP_INTRO ? (
          <Invitation onStart={() => setStep(STEP_FACTS)} />
        ) : (
          <>
            <button
              type="button"
              className={styles.back}
              onClick={() => setStep((s) => Math.max(STEP_INTRO, s - 1))}
              disabled={step === STEP_INTRO}
            >
              {c('onboarding.actions.back')}
            </button>

            {questionNumber === null ? null : (
              <p className={styles.progress}>
                {c('onboarding.progress', { n: questionNumber, total: TOTAL_QUESTIONS })}
              </p>
            )}

            {/*
              Steps 1-7 land here in Tasks 4 and 5: FactsStep, then TextStep /
              ScaleStep / ColorStep for the six. The step model, the resume
              point and the close are what Task 3 needed in order to verify the
              gate and the derived resume, and they are what is here.
            */}
            {step === STEP_DONE ? (
              <Close />
            ) : (
              <p className={styles.hint}>
                {/* Placeholder, replaced in Tasks 4-5. Never shipped: Task 11's
                    verification pass walks every screen. */}
                step {step}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Step 0.
 *
 * The middle line says what the Lotus DOES -- the cards know which way to fall
 * -- and never what it is or who builds it. Explaining the mechanism is what
 * breaks the spell, because it reveals an engineer behind it.
 *
 * The permission to refuse is here, before the first question, rather than after
 * the last.
 */
function Invitation({ onStart }: { onStart: () => void }) {
  return (
    <div className={styles.step}>
      <span className={styles.eyebrow}>{c('onboarding.intro.eyebrow')}</span>
      <h1 className={styles.titleLarge}>{c('onboarding.intro.title')}</h1>
      <p className={styles.body}>{c('onboarding.intro.body')}</p>
      <p className={styles.note}>{c('onboarding.intro.note')}</p>
      <button type="button" className={styles.cta} onClick={onStart}>
        {c('onboarding.intro.cta')}
      </button>
    </div>
  );
}

/**
 * Step 8.
 *
 * NO "your avatar is being woven", NO progress indicator, and no link to
 * anything but the reader picker. The distillation runs in `after()` and may not
 * have finished when the user arrives: a line claiming it is ready would be
 * false, a spinner would be a wait we just decided not to impose, and "still
 * working" would draw attention to plumbing. "Sudah cukup" is true whenever it
 * is read.
 *
 * The submit that sets `completed_at` is wired in Task 6.
 */
function Close() {
  return (
    <div className={styles.step}>
      <h1 className={styles.titleLarge}>{c('onboarding.done.title')}</h1>
      <p className={styles.body}>{c('onboarding.done.body')}</p>
      <a className={styles.cta} href="/">
        {c('onboarding.done.cta')}
      </a>
    </div>
  );
}

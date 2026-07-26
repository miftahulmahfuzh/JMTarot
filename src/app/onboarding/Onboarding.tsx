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
 *
 * WHERE THE WRITES GO (L2). The facts step awaits its POST. The six do not:
 * they fire and forget, and the close screen's submit re-sends everything
 * authoritatively, which is idempotent on `(user_id, question_key)` and repairs
 * anything that was lost. Nobody waits on a spinner between questions.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ONBOARDING_QUESTION_KEYS,
  nextUnansweredKey,
  type OnboardingQuestionKey,
  type RawAnswer,
} from '@/data/onboarding';
import type { Profile } from '@/data/types';
import { ColorStep } from './ColorStep';
import { c } from './copy';
import { FactsStep, type Facts } from './FactsStep';
import { ScaleStep } from './ScaleStep';
import { TextStep } from './TextStep';
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

function keyForStep(step: number): OnboardingQuestionKey | null {
  if (step < STEP_FIRST_QUESTION || step >= STEP_DONE) return null;
  return ONBOARDING_QUESTION_KEYS[step - STEP_FIRST_QUESTION];
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
   * Computed once, as the initial state, rather than in a `useMemo` that would
   * re-run and fight the user's own navigation: `answeredKeys` is a prop from
   * the server, and if it changed under an open stepper the last thing anyone
   * wants is the step index jumping.
   *
   * If there is a profile and all six are recorded, this opens on the close: the
   * user got as far as the last answer and shut the tab before the final submit,
   * and marching them back through six answered questions would punish them for
   * it.
   */
  const [step, setStep] = useState(() => {
    if (initialStep !== null) return initialStep;
    if (!profile) return STEP_INTRO;
    const next = nextUnansweredKey(answeredKeys);
    if (next === null) return STEP_DONE;
    return STEP_FIRST_QUESTION + ONBOARDING_QUESTION_KEYS.indexOf(next);
  });

  /**
   * The three facts, and the six answers, as this session knows them.
   *
   * The answers are held so the close screen can re-send everything
   * authoritatively (L2). NOTE WHAT IS *NOT* HERE ON RESUME: answers written in
   * a previous session are absent, because the server never sent their text
   * back. That is correct rather than lossy -- the final submit upserts per key,
   * so a key this session never touched keeps the row it already has.
   */
  const [facts, setFacts] = useState<Facts | null>(
    profile
      ? { fullName: profile.fullName, nickname: profile.nickname, birthDate: profile.birthDate }
      : null,
  );
  const [answers, setAnswers] = useState<Partial<Record<OnboardingQuestionKey, RawAnswer>>>({});

  const questionNumber = firstQuestionNumber(step);
  const headingId = 'onboarding-step-heading';

  /*
   * MOVE FOCUS TO THE STEP HEADING ON ADVANCE, and announce the step politely.
   *
   * Without this, a screen-reader user who taps "Lanjut" hears nothing: the
   * heading changed but focus is still on a button that has just been replaced,
   * so the reading order restarts from the top of the document on the next
   * gesture. Nine times.
   *
   * THE EFFECT DEPENDS ON `step` AND NOTHING ELSE, which is CardDetail.tsx's
   * discipline applied to the same hazard: anything read out of props or state
   * here would re-fire the focus() on every keystroke in a textarea, and the
   * caret would jump to the heading mid-sentence.
   */
  const headingRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Not on first paint. Stealing focus before the user has done anything is
    // the behaviour that makes screen readers announce a page twice.
    if (step === STEP_INTRO) return;
    const el = document.getElementById(headingId);
    headingRef.current = el;
    el?.focus();
  }, [step]);

  function advance() {
    setStep((s) => Math.min(STEP_DONE, s + 1));
  }

  /** The facts step's awaited write. Throws on failure so the step can say so. */
  async function submitFacts(next: Facts) {
    const response = await fetch('/api/onboarding/facts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!response.ok) throw new Error(`facts ${response.status}`);
    setFacts(next);
    advance();
  }

  /**
   * One of the six. Advances IMMEDIATELY and writes in the background (L2).
   *
   * The write is not awaited and its failure is not surfaced: it is a resume
   * marker, the close screen re-sends everything, and a "couldn't save" banner
   * between two questions would be alarming about something already handled.
   * The `.catch` is required all the same -- an unhandled rejection in a
   * fire-and-forget fetch is a console error on every skipped question.
   */
  function submitAnswer(key: OnboardingQuestionKey, raw: RawAnswer) {
    setAnswers((prev) => ({ ...prev, [key]: raw }));
    void fetch('/api/onboarding/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, ...raw }),
    }).catch(() => {
      // Deliberately silent. See above.
    });
    advance();
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        {/*
          The polite live region. Separate from the heading because the heading
          is what receives focus, and a node that is both the focus target and an
          aria-live region gets announced twice by VoiceOver.
        */}
        <p className={styles.srOnly} role="status" aria-live="polite">
          {questionNumber === null
            ? ''
            : c('onboarding.progress', { n: questionNumber, total: TOTAL_QUESTIONS })}
        </p>

        {step === STEP_INTRO ? (
          <Invitation onStart={advance} />
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
              <p className={styles.progress} aria-hidden="true">
                {c('onboarding.progress', { n: questionNumber, total: TOTAL_QUESTIONS })}
              </p>
            )}

            <StepBody
              step={step}
              profile={profile}
              facts={facts}
              answers={answers}
              answeredKeys={answeredKeys}
              headingId={headingId}
              onSubmitFacts={submitFacts}
              onSubmitAnswer={submitAnswer}
            />
          </>
        )}
      </div>
    </main>
  );
}

function StepBody({
  step,
  profile,
  facts,
  answers,
  answeredKeys,
  headingId,
  onSubmitFacts,
  onSubmitAnswer,
}: {
  step: number;
  profile: Profile | null;
  facts: Facts | null;
  answers: Partial<Record<OnboardingQuestionKey, RawAnswer>>;
  answeredKeys: OnboardingQuestionKey[];
  headingId: string;
  onSubmitFacts: (facts: Facts) => Promise<void>;
  onSubmitAnswer: (key: OnboardingQuestionKey, raw: RawAnswer) => void;
}) {
  if (step === STEP_FACTS) {
    return <FactsStep profile={profile} headingId={headingId} onSubmit={onSubmitFacts} />;
  }

  if (step === STEP_DONE) {
    return <Close facts={facts} answers={answers} headingId={headingId} />;
  }

  const key = keyForStep(step);
  if (!key) return null;

  /*
   * `alreadySaved` is the resume signal, and it is the ONLY thing the client
   * learns about a previous answer. The step says an answer exists and that
   * typing replaces it; it never shows the text, because the server never sent
   * it.
   *
   * A key answered in THIS session is not "already saved" in that sense -- the
   * user just typed it and going Back should not tell them their own answer is
   * a mystery -- so `answers` shadows `answeredKeys`.
   */
  const alreadySaved = answeredKeys.includes(key) && !(key in answers);

  /*
   * The key selects the component. A `switch` on the key rather than a field in
   * the catalog: `isFreeText` already says which of the two shapes a question
   * has, and the two closed questions need different controls from each other,
   * so a table would have one row per question anyway and would put the mapping
   * a file away from the components it names.
   */
  if (key === 'introversion') {
    return (
      <ScaleStep
        headingId={headingId}
        alreadySaved={alreadySaved}
        onAnswer={(raw) => onSubmitAnswer(key, raw)}
      />
    );
  }

  if (key === 'color') {
    return (
      <ColorStep
        headingId={headingId}
        alreadySaved={alreadySaved}
        onAnswer={(raw) => onSubmitAnswer(key, raw)}
      />
    );
  }

  return (
    <TextStep
      // Keyed so that moving between two free-text questions REMOUNTS the
      // component. Without it React reuses the instance and its `text` state,
      // and the answer to `best_thing` appears pre-typed under the heading for
      // `worst_thing` -- which on that question in particular would be alarming.
      key={key}
      questionKey={key}
      headingId={headingId}
      alreadySaved={alreadySaved}
      onAnswer={(raw) => onSubmitAnswer(key, raw)}
    />
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
 * Step 8, and the authoritative submit.
 *
 * NO "your avatar is being woven", NO progress indicator, and no link to
 * anything but the reader picker. The distillation runs in `after()` and may not
 * have finished when the user arrives: a line claiming it is ready would be
 * false, a spinner would be a wait we just decided not to impose, and "still
 * working" would draw attention to plumbing. "Sudah cukup" is true whenever it
 * is read.
 *
 * THE BUTTON IS A BUTTON, NOT A LINK, and that is the one thing this screen is
 * doing that the copy does not show. `POST /api/onboarding/complete` has to
 * finish before the navigation, because it is what sets `completed_at` AND
 * re-mints the cookie -- follow an `<a href="/">` first and middleware reads the
 * old `onb: false` and bounces the user back into the questionnaire.
 */
function Close({
  facts,
  answers,
  headingId,
}: {
  facts: Facts | null;
  answers: Partial<Record<OnboardingQuestionKey, RawAnswer>>;
  headingId: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // Omitted when the facts came from a previous session; the row is
          // already there and the server does not need it re-sent.
          ...(facts ? { facts } : {}),
          /*
           * Everything THIS SESSION answered, re-sent authoritatively (L2). Each
           * upsert is idempotent on `(user_id, question_key)`, so this repairs any
           * of the six optimistic writes that were lost, and costs nothing when
           * none were. Keys answered in a previous session are absent and keep the
           * rows they already have -- the server confirms the full set itself.
           */
          answers: Object.entries(answers).map(([key, raw]) => ({ key, ...raw })),
        }),
      });

      if (!response.ok) throw new Error(`complete ${response.status}`);

      /*
       * A FULL NAVIGATION, not `router.push`. The completion response carries a
       * `Set-Cookie` with the re-minted session, and a client-side navigation
       * would ask the Next router for `/` using the RSC cache and the router's own
       * fetch -- which the fresh cookie may not have reached yet. A document
       * navigation cannot race it.
       */
      window.location.assign('/');
    } catch {
      setSaving(false);
      setError(c('onboarding.error.saveFailed'));
    }
  }

  return (
    <div className={styles.step}>
      <h1 className={styles.titleLarge} id={headingId} tabIndex={-1}>
        {c('onboarding.done.title')}
      </h1>
      <p className={styles.body}>{c('onboarding.done.body')}</p>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <button type="button" className={styles.cta} onClick={finish} disabled={saving}>
        {c('onboarding.done.cta')}
      </button>
    </div>
  );
}

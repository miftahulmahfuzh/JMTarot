'use client';

import { useEffect, useRef, useState } from 'react';

import {
  INTROVERSION_MAX,
  INTROVERSION_MIN,
  INTROVERSION_STEP,
  LOTUS_COLORS,
  ONBOARDING_MAX_ANSWER_CHARS,
  type LotusColor,
  type OnboardingQuestionKey,
} from '@/data/onboarding';
import { useT } from '@/lib/i18n/LocaleProvider';
import { track } from '@/lib/analytics/track.client';
import styles from './AccountAnswers.module.css';

/**
 * The six mysterious questions, on `/account`: which are answered, what they say,
 * and both ways to change that.
 *
 * ── WHAT THIS REVERSES, AND WHO REVERSED IT ──────────────────────────────────
 *
 * **THIS FILE'S HEADER USED TO SAY, IN A BOX, THAT THE PAGE "SHOWS WHICH ANSWERS
 * EXIST AND NEVER WHAT IS IN THEM", and that V8's answer to reconciliation §7.3's
 * *"until asked"* was "that it is never asked".** Miftah's ruling, 2026-07-29, on a
 * phone: a querent must be able to see what they said and fix it.
 *
 * That is an AMENDMENT rather than a violation, and the distinction matters because
 * the next session will read the old header in git first. §7.3's requirement was
 * *"show which answers exist without showing their decrypted text until asked"* —
 * V8 chose to make "asked" unreachable, and **a tap on a question is asking.** What
 * actually died is L13: *"the six are deletable and NOT editable."* Its stated
 * reasons were that editing turns a rite into a settings page and that "the reader's
 * sense of you changes under you". The first is answered by placement, below; the
 * second is answered by the persona regenerating on the next visit, which is when
 * the querent is there to watch it change.
 *
 * ── WHAT DID NOT CHANGE, AND MUST NOT ────────────────────────────────────────
 *
 * **NOTHING IS DECRYPTED ON A RENDER PATH.** `/account`'s server component still
 * calls `answerPresence`, which reads `answer_text IS NOT NULL` and decrypts
 * nothing. The plaintext of `worst_thing` — the most sensitive string in the
 * product — leaves the server only in the response to `GET
 * /api/onboarding/answer/<key>`, one key per request, `private, no-store`, fired
 * because the querent tapped that specific row. There is deliberately no bulk read.
 *
 * **THE RITE IS PROTECTED BY PLACEMENT, WHICH IS V8's ARGUMENT UNCHANGED.** The
 * section sits below the persona rather than beside the facts, the rows are labelled
 * by question, and no answer text is on screen until a row is opened. L13's warning
 * that six rows "turn the rite into a settings page" was about exactly this, and it
 * is why the list is six taps into a sheet rather than six textareas in a column.
 *
 * ── THE ROW IS A BUTTON AND THE STATE IS AN ICON ──────────────────────────────
 *
 * `Saved` / `Not answered` / `Cleared` are gone as visible text (Miftah's ruling)
 * and survive as the icon's `aria-label`. **THAT IS NOT A DOWNGRADE — IT IS THE ONLY
 * WAY THE ICON IS LEGAL.** A glyph with no accessible name is a row that says
 * nothing at all to a screen reader, so the two words moved from a text node to
 * `account.answers.state.*` and are read rather than shown.
 *
 * **THE `cleared` STATE WENT WITH ITS STRING, AND THAT IS NOW CORRECT.** V8 tracked
 * "just cleared" in component state for the life of the page because a row
 * reverting to *Not answered* read as if the button had done nothing. With a sheet
 * the feedback is immediate and local — it closes, the icon changes — so there is
 * nothing left to distinguish.
 */
type Row = { key: OnboardingQuestionKey; answered: boolean };

export function AccountAnswers({ initial }: { initial: Row[] }) {
  const t = useT();
  /*
   * The server's list, then whatever this page has changed since. **NOT a refetch
   * and NOT `router.refresh()`**: the page's other four blocks include a persona
   * whose client fetch would fire again, and re-rendering all of it to flip one
   * icon is the wrong trade. The server is authoritative on the next visit, which
   * is also when the persona regenerates — see `/api/persona`.
   */
  const [rows, setRows] = useState<Row[]>(initial);
  const [open, setOpen] = useState<OnboardingQuestionKey | null>(null);

  /*
   * ONE REF PER ROW, AND THE SHEET TAKES THE OPENER AS A PROP.
   *
   * **SAFARI DOES NOT FOCUS A `<button>` WHEN IT IS TAPPED**, so
   * `document.activeElement` on the way in captures `<body>` on the one platform
   * this app is built for, and restoring focus to that "opener" drops the querent at
   * the top of the document. `AccountMenu` is the precedent and `GalleryGrid` proved
   * it with loop 5 rather than assuming it. The row that was tapped is the only
   * thing that knows where to go back to.
   */
  const openerRefs = useRef<Partial<Record<OnboardingQuestionKey, HTMLButtonElement | null>>>({});

  const openRow = rows.find((r) => r.key === open) ?? null;

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>{t('account.answers.hint')}</p>

      <ul className={styles.rows}>
        {rows.map((row) => {
          /*
           * The question's own title, from the catalog W3 already wrote. The keys
           * are a closed set so this template literal cannot miss — and it is why
           * the union is narrowed at the boundary rather than typed as `string`.
           */
          const question = t(`onboarding.q.${row.key}.title` as 'onboarding.q.color.title');
          const state = row.answered
            ? t('account.answers.state.answered')
            : t('account.answers.state.empty');

          return (
            <li key={row.key} className={styles.row}>
              <button
                type="button"
                className={styles.rowButton}
                ref={(el) => {
                  openerRefs.current[row.key] = el;
                }}
                /*
                 * THE LABEL NAMES THE QUESTION AND ITS STATE, because six rows
                 * differing only by an icon are six identical announcements
                 * otherwise. The visible text is a separate node, so `aria-label`
                 * replaces it rather than duplicating it.
                 */
                aria-label={t('account.answers.openAria', { question, state })}
                /*
                  NO EVENT ON OPEN. `account.answer_revealed` was drafted and
                  refused -- see `events.ts`: a look-and-close changes no decision,
                  and the privacy question it looked like it answered is answered by
                  request volume in the platform log.
                */
                onClick={() => setOpen(row.key)}
              >
                <span className={styles.question}>{question}</span>
                {/*
                  `aria-hidden` ON THE GLYPH, because the button's own label already
                  says the state in words. Without it a screen reader announces the
                  label and then the character, which at best is a stray "check".
                */}
                <span
                  className={row.answered ? styles.markAnswered : styles.markEmpty}
                  aria-hidden="true"
                >
                  {row.answered ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Said out loud, because it is the part nobody would guess: the material is
          also PARAPHRASED inside the Lotus block, and both routes rewrite it. An
          edit whose effect stopped at one table would be worse than no edit. */}
      <p className={styles.note}>{t('account.answers.note')}</p>

      {openRow ? (
        <AnswerSheet
          row={openRow}
          returnFocusTo={{ current: openerRefs.current[openRow.key] ?? null }}
          onClose={() => setOpen(null)}
          onSaved={(answered) => {
            setRows((prev) =>
              prev.map((r) => (r.key === openRow.key ? { ...r, answered } : r)),
            );
            setOpen(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** What the reveal endpoint returns, narrowed at the boundary. */
type Revealed = {
  freeText: boolean;
  text: string | null;
  choice: string | null;
  skipped: boolean;
};

/**
 * One question, its answer, and both ways to change it.
 *
 * **TWO SHAPES, BECAUSE `isFreeText` SPLITS THE SIX INTO TWO KINDS OF QUESTION.**
 * Four take prose and two are closed sets — `color` is three plates and
 * `introversion` is a slider at `INTROVERSION_STEP`. The step is imported rather
 * than typed for the reason `onboarding.ts` gives: a hardcoded 5 in two files is how
 * a slider comes to offer values the server silently rounds.
 *
 * **`freeText` COMES FROM THE SERVER even though `isFreeText` is pure and reachable
 * here.** It decides which control mounts, and a client that disagreed with the
 * server about which kind a question is would post `text` to a closed question and
 * get an opaque 400 out of `normaliseAnswer`. One answer, from the side that owns
 * the write.
 */
function AnswerSheet({
  row,
  returnFocusTo,
  onClose,
  onSaved,
}: {
  row: Row;
  returnFocusTo: { current: HTMLElement | null };
  onClose: () => void;
  onSaved: (answered: boolean) => void;
}) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState<Revealed | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);

  /** The draft. `null` until the reveal lands, so the field cannot flash empty. */
  const [text, setText] = useState('');
  const [choice, setChoice] = useState('');

  const question = t(`onboarding.q.${row.key}.title` as 'onboarding.q.color.title');
  const framing = t(`onboarding.q.${row.key}.framing` as 'onboarding.q.color.framing');

  /*
   * Read through refs so the effect below depends on nothing — `CardDetail`'s
   * reason: these arrive as inline arrow functions, so a dependency array naming
   * them re-runs the effect on every render of the parent and re-steals focus.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusRef = useRef(returnFocusTo);
  returnFocusRef.current = returnFocusTo;

  useEffect(() => {
    /*
     * FOCUS THE DIALOG, NOT THE FIRST CONTROL. `AccountMenu`'s measured reason:
     * Chrome applies `:focus-visible` to programmatic focus, so focusing the
     * textarea puts a gold ring on it for a thumb user who has never touched a
     * keyboard.
     */
    sheetRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      /* THE OPENER, NOT `document.activeElement`. See the parent's header. */
      returnFocusRef.current.current?.focus();
    };
  }, []);

  useEffect(() => {
    let live = true;
    /*
     * ONE KEY, ON OPEN. This is reconciliation §7.3's "until asked", and the fetch
     * IS the asking — so it fires here rather than on mount of the list, and the
     * plaintext of a question the querent never opened never leaves the server.
     */
    fetch(`/api/onboarding/answer/${row.key}`, { headers: { accept: 'application/json' } })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data = (await res.json()) as Revealed;
        setLoaded(data);
        setText(data.text ?? '');
        /*
         * A CLOSED QUESTION WITH NO ANSWER GETS ITS MIDPOINT, NOT ZERO. A slider
         * parked at "menyendiri" for somebody who skipped the question is an answer
         * they did not give; the midpoint is visibly the absence of a choice. The
         * colour plates have no such default and simply start unselected.
         */
        setChoice(
          data.choice ??
            (row.key === 'introversion'
              ? String((INTROVERSION_MIN + INTROVERSION_MAX) / 2)
              : ''),
        );
      })
      .catch(() => {
        if (live) setFailed(true);
      });

    return () => {
      live = false;
    };
  }, [row.key]);

  const overLimit = text.length > ONBOARDING_MAX_ANSWER_CHARS;

  async function save() {
    if (busy || !loaded) return;
    /*
     * THE CLIENT COUNTS AND THE SERVER REFUSES. `AnswerBody`'s zod schema checks the
     * RAW length before anything is sanitized, which is what keeps "too long" and
     * "effectively empty" distinguishable — so this guard is courtesy, not the rule.
     */
    if (loaded.freeText && overLimit) return;
    setBusy('save');
    setFailed(false);

    try {
      const res = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          loaded.freeText
            ? { key: row.key, text }
            : /*
               * `skipped: true` FOR AN EMPTY CLOSED VALUE, never `choice: ''`.
               * `normaliseAnswer` throws on the second — "needs a value or an
               * explicit skip" — and an opaque 400 on a colour nobody picked would
               * read as a broken sheet.
               */
              choice === ''
              ? { key: row.key, skipped: true }
              : { key: row.key, choice },
        ),
      });
      if (!res.ok) {
        setFailed(true);
        setBusy(null);
        return;
      }
      /*
       * WHAT WAS ACTUALLY RECORDED, from the response rather than from the draft.
       * The route echoes `skipped` back precisely so a client cannot disagree with
       * the row it just wrote: whitespace-only prose is a SKIP, and an icon showing
       * a tick over `answer_text IS NULL` would be the list lying about the data.
       */
      const body = (await res.json()) as { skipped?: boolean };
      const answered = body.skipped !== true;
      /* `length`, never the text. See `events.ts`. */
      track('account.answer_changed', {
        question_key: row.key,
        action: 'edited',
        length: loaded.freeText ? text.trim().length : choice.length,
      });
      onSaved(answered);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy('remove');
    setFailed(false);

    try {
      const res = await fetch(`/api/onboarding/answer/${row.key}`, { method: 'DELETE' });
      if (!res.ok) {
        /*
         * A 404 means there was nothing to clear, which is indistinguishable from a
         * real failure here and is reported as one. That is the safe direction:
         * claiming an erasure that did not happen is the wrong answer to give about
         * somebody's data, and the route's own comment makes the same call.
         */
        setFailed(true);
        setBusy(null);
        return;
      }
      track('account.answer_changed', { question_key: row.key, action: 'removed', length: 0 });
      onSaved(false);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  }

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={question}
        tabIndex={-1}
        /* The sheet is inside the scrim, so a tap on a control must not close it. */
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={styles.sheetTitle}>{question}</h3>
        <p className={styles.sheetFraming}>{framing}</p>

        {failed && loaded === null ? (
          <p className={styles.failed} role="alert">
            {t('account.answers.failed')}
          </p>
        ) : loaded === null ? (
          <p className={styles.loading}>{t('account.answers.loading')}</p>
        ) : (
          <>
            {loaded.freeText ? (
              <>
                <textarea
                  className={styles.textarea}
                  value={text}
                  rows={5}
                  /* `maxLength` on top of the counter: the cheapest of the three
                     guards, and the only one that stops the paste rather than
                     reporting it. */
                  maxLength={ONBOARDING_MAX_ANSWER_CHARS}
                  onChange={(e) => setText(e.target.value)}
                  aria-label={question}
                  placeholder={t('account.answers.emptyField')}
                />
                <p className={styles.counter}>
                  {text.length} / {ONBOARDING_MAX_ANSWER_CHARS}
                </p>
              </>
            ) : row.key === 'color' ? (
              <div className={styles.plates}>
                {LOTUS_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={choice === c ? styles.plateOn : styles.plate}
                    /* The three labels the questionnaire already uses, so the sheet
                       and the rite name the same colours. */
                    onClick={() => setChoice(c)}
                    aria-pressed={choice === c}
                  >
                    {t(`onboarding.q.color.option.${c}` as `onboarding.q.color.option.${LotusColor}`)}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.scale}>
                <input
                  type="range"
                  className={styles.range}
                  min={INTROVERSION_MIN}
                  max={INTROVERSION_MAX}
                  step={INTROVERSION_STEP}
                  value={choice === '' ? (INTROVERSION_MIN + INTROVERSION_MAX) / 2 : Number(choice)}
                  onChange={(e) => setChoice(e.target.value)}
                  aria-label={question}
                />
                <div className={styles.scaleEnds}>
                  <span>{t('onboarding.q.introversion.left')}</span>
                  <span>{t('onboarding.q.introversion.right')}</span>
                </div>
              </div>
            )}

            {failed ? (
              <p className={styles.failed} role="alert">
                {t('account.answers.failed')}
              </p>
            ) : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.save}
                onClick={() => void save()}
                disabled={busy !== null || (loaded.freeText && overLimit)}
              >
                {busy === 'save' ? t('account.answers.saving') : t('account.answers.save')}
              </button>

              {/*
                REMOVE IS OFFERED ONLY WHEN THERE IS SOMETHING TO REMOVE. A delete
                control over an unanswered question would 404 — the route reports one
                honestly for a question that was never answered — and the querent
                would read that as a broken button rather than as nothing to do.
              */}
              {row.answered ? (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => void remove()}
                  disabled={busy !== null}
                >
                  {busy === 'remove'
                    ? t('account.answers.removing')
                    : t('account.answers.remove')}
                </button>
              ) : null}

              <button
                type="button"
                className={styles.cancel}
                onClick={onClose}
                disabled={busy !== null}
              >
                {t('account.answers.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

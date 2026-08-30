'use client';

import { useState } from 'react';

import type { MemoryItemView } from '@/lib/account/memoryView';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './AccountMemory.module.css';

/**
 * What the room has noted about the querent, on `/account` — and both ways to
 * destroy it.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 *
 * **NOBODY ASKED FOR THIS SCREEN. IT IS A DUTY THAT FOLLOWS FROM THE FEATURE
 * BESIDE IT.** The group chat now stores model-written inferences about a real
 * person — habits, food, who annoys them at work — and re-reads them into every
 * future prompt. That is a stronger claim on somebody than anything else in this
 * database: `readings.question` and `chat_messages.body` are text the QUERENT
 * typed, and the six onboarding answers are theirs too. A sentence a machine wrote
 * ABOUT them is neither, and the two honest answers to it are *you can see it* and
 * *you can destroy it*.
 *
 * ── NOTHING IS ON SCREEN UNTIL IT IS ASKED FOR ───────────────────────────────
 *
 * The section mounts with a heading, a hint and one button. `/account`'s server
 * component reads nothing: the notes are absent from the page's HTML and arrive
 * only in the response to a press. **That press is the asking**, which is
 * reconciliation §7.3's standard and `AccountAnswers`' *"a tap on a question is
 * asking"* one section up.
 *
 * **THE LIST ARRIVES WHOLE, AND THAT IS ARGUED IN THE ROUTE'S HEADER, NOT HERE.**
 * Short version: `/api/onboarding/answer/<key>`'s one-per-request rule works
 * because a question TITLE is a non-revealing handle. A note has no title. Twelve
 * rows saying "Catatan 1 … Catatan 12" would cost twelve taps and protect nothing.
 *
 * ── THERE IS NO EDIT CONTROL, AND THAT IS A DECISION ─────────────────────────
 *
 * V8's L13 was reversed for the six answers — *"a querent must be able to see what
 * they said and fix it"* — and the reversal does NOT transfer, because those are
 * words the querent WROTE. Editing a note here is not correcting your own sentence;
 * it is dictating what three readers believe about you, in prose that goes straight
 * into a model prompt. That needs W7's gate, a `source: 'model' | 'user'` flag the
 * extractor respects, and a length cap — three things owned by other files. **The
 * correction offered here is deletion**, and it is a complete one.
 *
 * ── THE COPY SAYS A MACHINE WROTE IT, IN THE HINT, ABOVE THE BUTTON ──────────
 *
 * `account.memory.hint` is the load-bearing string, `C-D8`'s finding applied a
 * second time: **nobody re-reads `/privacy` and everybody reads the hint in front
 * of them.** It must keep saying who wrote these sentences and that they can be
 * wrong. Softening it into "to personalise your experience" is the sentence this
 * project exists not to write.
 *
 * ── SIMPLER THAN `AccountAnswers`, ON PURPOSE ────────────────────────────────
 *
 * There is no sheet, so there is no `document.activeElement` trap, no
 * `returnFocusTo` prop and no Escape handler — Safari's does-not-focus-a-button
 * behaviour costs nothing when nothing steals focus. That is what "proportionate"
 * means here: the smallest surface that discharges the duty.
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; items: MemoryItemView[] }
  | { kind: 'failed' };

export function AccountMemory() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** The id currently being removed, or `'all'` for the whole payload. */
  const [busy, setBusy] = useState<string | null>(null);
  /** The forget-everything control's second step. */
  const [confirming, setConfirming] = useState(false);
  /** A failure AFTER the list is on screen, which must not blank it. */
  const [writeFailed, setWriteFailed] = useState(false);

  async function reveal() {
    if (phase.kind === 'loading') return;
    setPhase({ kind: 'loading' });
    try {
      const res = await fetch('/api/account/memory', {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        setPhase({ kind: 'failed' });
        return;
      }
      const data = (await res.json()) as { items?: unknown };
      /*
       * NARROWED AT THE BOUNDARY, `PersonaBlockClient`'s habit. The route builds this
       * with the same pure function, so a mismatch means a deploy skew rather than a
       * malformed row — and rendering `undefined.map` would take the whole page down
       * for a section nobody has to use.
       */
      const items = Array.isArray(data.items)
        ? data.items.filter(
            (i): i is MemoryItemView =>
              typeof i === 'object' &&
              i !== null &&
              typeof (i as MemoryItemView).id === 'string' &&
              typeof (i as MemoryItemView).text === 'string',
          )
        : [];
      setPhase({ kind: 'ready', items });
    } catch {
      setPhase({ kind: 'failed' });
    }
  }

  async function forgetOne(id: string) {
    if (busy || phase.kind !== 'ready') return;
    setBusy(id);
    setWriteFailed(false);
    try {
      const res = await fetch(`/api/account/memory/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        /*
         * A 404 means there was nothing to remove, which is indistinguishable from a
         * real failure here and is reported as one — `AccountAnswers`' call, and the
         * safe direction: claiming an erasure that did not happen is the wrong answer
         * to give about somebody's data.
         */
        setWriteFailed(true);
        setBusy(null);
        return;
      }
      /*
       * THE ROW LEAVES THE LIST LOCALLY, NOT BY REFETCHING. `AccountAnswers`' reason:
       * this page's persona block would fire its own fetch on a `router.refresh()`,
       * and re-rendering four other blocks to remove one line is the wrong trade. The
       * server is authoritative on the next visit.
       */
      setPhase({ kind: 'ready', items: phase.items.filter((i) => i.id !== id) });
      setBusy(null);
    } catch {
      setWriteFailed(true);
      setBusy(null);
    }
  }

  async function forgetAll() {
    if (busy) return;
    setBusy('all');
    setWriteFailed(false);
    try {
      const res = await fetch('/api/account/memory', { method: 'DELETE' });
      if (!res.ok) {
        setWriteFailed(true);
        setBusy(null);
        setConfirming(false);
        return;
      }
      setPhase({ kind: 'ready', items: [] });
      setBusy(null);
      setConfirming(false);
    } catch {
      setWriteFailed(true);
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {/* THE DISCLOSURE, ABOVE THE CONTROL AND BEFORE ANY CONTENT. It says who wrote
          these sentences and that they can be wrong, and it is on screen whether or
          not the querent ever presses the button. */}
      <p className={styles.hint}>{t('account.memory.hint')}</p>

      {phase.kind === 'idle' ? (
        <button type="button" className={styles.reveal} onClick={() => void reveal()}>
          {t('account.memory.reveal')}
        </button>
      ) : null}

      {phase.kind === 'loading' ? (
        <p className={styles.loading} role="status">
          {t('account.memory.loading')}
        </p>
      ) : null}

      {phase.kind === 'failed' ? (
        <p className={styles.failed} role="alert">
          {t('account.memory.failed')}
        </p>
      ) : null}

      {phase.kind === 'ready' && phase.items.length === 0 ? (
        <p className={styles.empty}>{t('account.memory.empty')}</p>
      ) : null}

      {phase.kind === 'ready' && phase.items.length > 0 ? (
        <>
          <ul className={styles.rows}>
            {phase.items.map((item) => (
              <li key={item.id} className={styles.row}>
                {/*
                  `lang` IS DELIBERATELY ABSENT. A note is written in whatever
                  language the querent was typing in the room, which is not
                  necessarily the language of this page — and unlike a persona there
                  is no `locale` column to read it off, because `C-D9` keeps this
                  material out of `TRANSLATABLE` entirely. Declaring the viewer's
                  locale over Indonesian prose would make a screen reader mispronounce
                  it, which is worse than declaring nothing.
                */}
                <p className={styles.text}>{item.text}</p>
                <button
                  type="button"
                  className={styles.remove}
                  /* Names WHAT is being removed: a column of identical `Hapus`
                     buttons is a column of identical announcements otherwise. */
                  aria-label={t('account.memory.itemAria', { text: item.text })}
                  onClick={() => void forgetOne(item.id)}
                  disabled={busy !== null}
                >
                  {busy === item.id
                    ? t('history.item.delete.working')
                    : t('account.memory.remove')}
                </button>
              </li>
            ))}
          </ul>

          {writeFailed ? (
            <p className={styles.failed} role="alert">
              {t('account.memory.failed')}
            </p>
          ) : null}

          {/*
            FORGET EVERYTHING IS TWO STEPS, AND IT IS THE ONLY TWO-STEP CONTROL ON
            THIS BLOCK. One row is one sentence and is cheap to lose; the whole
            payload is weeks of the room's sense of somebody, and there is no
            restore. `DeleteAccount` is the precedent for the shape — a destructive
            control that asks once — and `account.facts.cancel` and
            `history.item.delete.working` are reused rather than given keys of their
            own, the way `/account` already reuses `history.home`. Two strings for
            one control is how two screens come to disagree about what `Batal` is
            called; it is also ~78 bytes of a catalog ceiling this phase measured at
            50 bytes of remaining headroom. `id.ts` carries that accounting.
          */}
          {confirming ? (
            <div className={styles.confirm}>
              <button
                type="button"
                className={styles.forgetAllConfirm}
                onClick={() => void forgetAll()}
                disabled={busy !== null}
              >
                {busy === 'all'
                  ? t('history.item.delete.working')
                  : t('account.memory.forgetAllConfirm')}
              </button>
              <button
                type="button"
                className={styles.cancel}
                onClick={() => setConfirming(false)}
                disabled={busy !== null}
              >
                {t('account.facts.cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.forgetAll}
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
            >
              {t('account.memory.forgetAll')}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}

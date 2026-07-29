'use client';

/**
 * **THE ONE REVEAL CONTROL, MOUNTED THREE TIMES** — an onboarding answer, a flagged
 * question, a reading body. v0.5.0 / A5, task 12, decision A5-D7.
 *
 * One component and three configurations, so the `private, no-store` handling, the client
 * bound, the failure state and the "nothing to reveal" state exist once. **A second reveal
 * component is how the fourth one ships without a bound.**
 *
 * ── NOTHING IS FETCHED ON MOUNT, AND THAT IS THE PRIVACY MECHANISM ──────────
 *
 * The request IS the asking (reconciliation §7.3's *"until asked"*), so the plaintext of a
 * row the operator never opened never leaves the server. A `useEffect` that pre-fetched
 * "for responsiveness" would turn opening a page into a bulk decrypt — the exact thing
 * A5-5 forbids — and would write an `admin_access_log` row per row on screen, which makes
 * §4.14's panel unreadable and the subject-access answer wrong.
 *
 * ── THE BOUND, AND THE ONE RETRY ────────────────────────────────────────────
 *
 * `AbortSignal.timeout(REVEAL_ABORT_MS)` — 12s, against the route's `maxDuration = 15` and
 * A3's 10s statement timeout. §4.2 rule 2: *a bigger `maxDuration` is not a latency
 * regression, but it must be paired with a bound on the client, or you have only made the
 * hang longer.*
 *
 * **A TIMEOUT IS THE ONE OUTCOME THAT MEANS UNKNOWN, so it is the only one retried** — once
 * — while a `!res.ok` renders the error and stops, because that is an answer. That is
 * `POST /api/locale`'s third rule, applied to a read.
 *
 * ── NO EVENT FIRES HERE, EVER (A5-19, A-D18) ────────────────────────────────
 *
 * Not on reveal, not on open, not on close. `admin_access_log` is the record of truth for a
 * reveal and **that is exactly why A-D18 dropped `admin.pii_revealed`**: a second copy in
 * `events` buys nothing while putting a resource key into a table whose rows survive the
 * subject's erasure with `user_id` nulled. A5 does not reinstate it under another name.
 *
 * ── AND IT IS NOT A DIALOG, PARTLY BECAUSE SAFARI ───────────────────────────
 *
 * It reveals in place. An admin page is desktop-first and a modal per row is nine modals —
 * and if it ever becomes a dialog it takes the opener as a **prop** (`returnFocusTo`), never
 * `document.activeElement`: **Safari does not focus a `<button>` when it is tapped**, so
 * `activeElement` captures `<body>` and restoring focus to that "opener" drops the reader at
 * the top of the document.
 *
 * The button is **44px minimum**. `PublicShare`'s 36px control is a known defect on
 * twenty-three pages; A5 does not add a twenty-fourth.
 */
import { useCallback, useRef, useState } from 'react';
import { REVEAL_ABORT_MS } from '@/lib/admin/types';
import { REVEAL } from '../copy';
import styles from './detail.module.css';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'revealed'; text: string }
  | { kind: 'empty' }
  | { kind: 'failed'; retryable: boolean };

export function AdminReveal({
  href,
  label,
  field,
  emptyLabel,
  lang,
}: {
  /** The full URL, **built by the SERVER section** so the client never composes a path from
   *  a subject id it might get wrong. */
  href: string;
  label: string;
  /** Which field of the JSON body holds the plaintext. */
  field: 'text' | 'question' | 'body';
  /** Rendered when the field comes back null — a skip, or a reading with no body. */
  emptyLabel: string;
  /** `reading.locale` for a body; **absent for a question and for a choice**, because those
   *  are what the querent typed and a querent may type Indonesian into the English app. */
  lang?: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const retried = useRef(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch(href, {
        // The route sets `private, no-store`; asking for it here too means a bfcache or a
        // service worker cannot serve a decrypted answer from anywhere.
        cache: 'no-store',
        signal: AbortSignal.timeout(REVEAL_ABORT_MS),
      });
      if (!res.ok) {
        // An answer, not an unknown. Not retryable.
        setState({ kind: 'failed', retryable: false });
        return;
      }
      const body = (await res.json()) as Record<string, unknown>;
      const value = body[field];
      if (typeof value === 'string' && value.length > 0) {
        setState({ kind: 'revealed', text: value });
        return;
      }
      /*
       * A moderation flag that is redacted or was never stored comes back 200 with a `state`
       * and no text, and a skipped answer comes back with `text: null`. Both are the "nothing
       * to reveal" case and neither is a failure — the section's own label already says
       * WHICH, from the state it rendered server-side.
       */
      setState({ kind: 'empty' });
    } catch {
      /*
       * A timeout, or the network. **The one outcome that means UNKNOWN**, so it is the only
       * one retried, once. Nothing about the error is logged: there is nobody to read a
       * browser console on this surface and an error object here can carry a URL that
       * contains a subject id.
       */
      const retryable = !retried.current;
      retried.current = true;
      setState({ kind: 'failed', retryable });
    }
  }, [href, field]);

  if (state.kind === 'revealed') {
    return (
      <div className={styles.revealed}>
        {/* `lang` on the PROSE only. A screen reader and the browser's translate offer both
            read it, and the language of a reading's body is `reading.locale`. */}
        <p className={styles.revealedText} lang={lang} aria-live="polite">
          {state.text}
        </p>
        <p className={styles.revealNote}>{REVEAL.audited}</p>
        <button type="button" className={styles.revealButton} onClick={() => setState({ kind: 'idle' })}>
          {REVEAL.close}
        </button>
      </div>
    );
  }

  if (state.kind === 'empty') {
    return (
      <div className={styles.revealed}>
        <p className={styles.revealEmpty} aria-live="polite">
          {emptyLabel}
        </p>
        <p className={styles.revealNote}>{REVEAL.audited}</p>
      </div>
    );
  }

  if (state.kind === 'failed') {
    return (
      <div className={styles.revealed}>
        <p className={styles.revealEmpty} aria-live="polite">
          {state.retryable ? REVEAL.timedOut : REVEAL.failedFinal}
        </p>
        {state.retryable ? (
          <button type="button" className={styles.revealButton} onClick={load}>
            {REVEAL.failed}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.revealButton}
      onClick={load}
      disabled={state.kind === 'loading'}
      aria-expanded={false}
    >
      {state.kind === 'loading' ? REVEAL.loading : label}
    </button>
  );
}

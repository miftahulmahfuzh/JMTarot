'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ERASURE_GRACE_DAYS } from '@/lib/account/grace';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';
import styles from './DeleteAccount.module.css';

/**
 * The account-deletion control, at the very bottom of `/account` (VD13).
 *
 * ── TWO TAPS, AND THE SECOND BUTTON IS WORDED DIFFERENTLY FROM THE FIRST ─────
 *
 * "Hapus akun" opens a sheet whose confirm button says "Ya, hapus akunku", so
 * muscle memory cannot complete the flow: there is no position on screen where
 * tapping twice in the same place deletes an account.
 *
 * A SHEET AND NOT `confirm()`. A native dialog is unstyled, unlocalized, and on
 * iOS standalone it is the one piece of chrome that says "this is a web page".
 * This is structurally `AccountMenu`: same scrim, same blur, same `rise` on
 * `--ease-card`, same reduced-motion kill switch, same body scroll lock, same Tab
 * trap, same focus restore to the opener passed as a PROP.
 *
 * **THE OPENER IS A REF WE OWN, NOT `document.activeElement`, AND THAT IS THE
 * SAFARI TRAP `AccountMenu` PAID FOR.** Safari -- macOS and iOS both -- does not
 * focus a `<button>` when it is clicked or tapped, so `document.activeElement` at
 * open time is `<body>` on the one platform this app is built for, and restoring
 * to it drops the querent at the top of the document.
 *
 * ── THE DESTRUCTIVE BUTTON IS NOT THE PRIMARY ONE AND DOES NOT AUTOFOCUS ─────
 *
 * `Batal` / `Keep it` is the styled one. The confirm button is outlined in
 * `--danger` and is the second in the Tab order. Autofocusing a destructive
 * control means Enter deletes an account.
 *
 * ── WHAT THE COPY MUST KEEP SAYING ──────────────────────────────────────────
 *
 * Three paragraphs, and the third is the one nobody would think to write: the
 * moderation text is deleted NOW rather than in thirty days, because
 * `moderation_flags.user_id` is `on delete set null` and the row outlives the
 * account. A page that promises full restoration and then does not restore
 * something is worse than a page that says which part is gone.
 */
export function DeleteAccount() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);

  return (
    <div className={styles.wrap}>
      <div className={styles.hairline} aria-hidden="true" />
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
      >
        {t('account.delete.trigger')}
      </button>
      {open ? <Sheet onClose={() => setOpen(false)} returnFocusTo={trigger} /> : null}
    </div>
  );
}

function Sheet({
  onClose,
  returnFocusTo,
}: {
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  /**
   * In flight. A second tap must not issue a second DELETE -- the route is
   * idempotent and would answer 404, but a 404 would render
   * `account.delete.failed` over a deletion that actually succeeded.
   */
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  /* Read through refs so the effect below can depend on nothing at all --
     `AccountMenu`'s reason: both are passed as inline arrows, so an effect keyed
     on their identity would tear down and re-focus on every parent re-render. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusRef = useRef(returnFocusTo);
  returnFocusRef.current = returnFocusTo;

  useEffect(() => {
    // The DIALOG, not the first control. Focusing a button puts `:focus-visible`
    // on it in Chrome, so a thumb user would find one of two buttons wearing a
    // ring, which reads as "this one is selected" on a destructive sheet.
    sheetRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const sheet = sheetRef.current;
      if (!sheet) return;
      const items = [...sheet.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      /* `active === sheet` is the ENTRY case and is not redundant with
         `!contains`: the effect focuses the container, and the container is
         inside itself, so a Shift+Tab as the very first keystroke would otherwise
         escape into the browser chrome with a scrim over the page. */
      if (e.shiftKey && (active === first || active === sheet || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      // Read at CLEANUP time rather than captured, so it is a no-op after
      // `location.assign` has begun tearing the tree down.
      returnFocusRef.current.current?.focus?.();
    };
  }, []);

  async function confirm() {
    if (working) return;
    setWorking(true);
    setFailed(false);

    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: {
          [SESSION_HEADER]: getSessionId(),
          [LOCAL_DATE_HEADER]: todayKey(),
        },
      });

      if (!response.ok) {
        /*
         * A 404 means already deleted, which is indistinguishable from a
         * genuine failure to this component and is treated as one. It is the
         * safe direction: telling somebody "that did not go through" when it did
         * costs them one wasted tap on a route that is idempotent, while the
         * reverse would navigate them to a goodbye page over a live account.
         */
        setFailed(true);
        setWorking(false);
        return;
      }

      /*
       * `location.assign`, NOT `router.push`. The session cookie is gone as of
       * this response and every cached client-side segment above us was rendered
       * for a signed-in user; a soft navigation would render them again from that
       * cache. A full load is the only way the whole tree agrees the session
       * ended. Middleware would send us here anyway once the cookie is gone --
       * doing it explicitly is what puts the confirmation line on screen instead
       * of a bare login page.
       */
      window.location.assign('/login?deleted=1');
    } catch {
      // Offline, or the request was cut. The account is almost certainly still
      // there; leave the sheet open and let them try again.
      setFailed(true);
      setWorking(false);
    }
  }

  return createPortal(
    <div className={styles.scrim} onClick={working ? undefined : onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grip} aria-hidden="true" />
        <h2 className={styles.title} id="delete-account-title">
          {t('account.delete.heading')}
        </h2>

        <p className={styles.body}>{t('account.delete.body1')}</p>
        {/* `{days}` interpolated from the constant the sweep reads, so the copy
            and the cron cannot disagree about thirty. */}
        <p className={styles.body}>
          {t('account.delete.body2', { days: String(ERASURE_GRACE_DAYS) })}
        </p>
        <p className={styles.body}>
          {t('account.delete.body3', { days: String(ERASURE_GRACE_DAYS) })}
        </p>

        {failed ? (
          <p className={styles.failed} role="alert">
            {t('account.delete.failed')}
          </p>
        ) : null}

        <div className={styles.actions}>
          {/* The SAFE button is the primary-styled one and comes first in the
              Tab order. */}
          <button
            type="button"
            className={styles.cancel}
            onClick={onClose}
            disabled={working}
          >
            {t('account.delete.cancel')}
          </button>
          <button type="button" className={styles.confirm} onClick={confirm} disabled={working}>
            {working ? t('account.delete.working') : t('account.delete.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

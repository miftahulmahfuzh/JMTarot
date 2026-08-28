'use client';

/**
 * One row. Cards first, because the cards are what the querent remembers.
 *
 * THE QUESTION IS SHOWN, CLAMPED TO ONE LINE. It is the querent's own text on
 * the querent's own screen behind the querent's own login, and it identifies a
 * reading far better than three card names do. Clamped because it can be 200
 * characters and this is a list. The counter-argument is real — a history list
 * gets scrolled in public — and it is recorded as V6's open question 1 rather
 * than silently resolved by a settings toggle nobody asked for.
 *
 * NO PROSE. The list payload does not carry `body` at all (H10) — not to save
 * bytes, though it does, but because shipping Indonesian prose into an English
 * client is what VD8 forbids whether or not anything renders it.
 *
 * ── THE SWIPE, AND THE THREE THINGS IT HAD TO SOLVE ─────────────────────────
 *
 * 1. THE DRAG IS READ FROM A REF, NEVER FROM INSIDE A `setState` UPDATER.
 *    StrictMode double-invokes updaters, so a handler called from inside one
 *    fires twice and cancels itself out — the bug that left the fan completely
 *    dead in development while working in production. `Fan.tsx`'s `onPointerUp`
 *    carries the full account. Every updater below is pure.
 *
 * 2. THE ROW IS ONE LARGE `<Link>`, so a horizontal drag must not navigate
 *    while a tap still must. `pointerup` always precedes `click`, so the pure
 *    machine's verdict is parked in `releaseRef` and the anchor's own `onClick`
 *    calls `preventDefault()` on a drag. CANCELLING THE DEFAULT IS THE
 *    MECHANISM: conditionally rendering the anchor instead would tear the DOM
 *    out from under an in-flight pointer sequence and the click would never
 *    fire at all. `draggable={false}` is the other half — an `<a>` is natively
 *    draggable and a mouse drag would otherwise start an HTML5 drag and replace
 *    the pointermove stream.
 *
 * 3. THE TRASH CONTROL CLEARS 44px on both axes (88 wide, >= 90 tall, plus an
 *    explicit floor in the CSS). `PublicShare`'s 36px button is already a known
 *    defect in this repo and a second one must not ship.
 *
 * ── A CONFIRM, NOT AN UNDO ──────────────────────────────────────────────────
 *
 * An undo needs a restore path and there is none: the plan's scope refuses one,
 * and the only way to fake it is to hold the DELETE back for a few seconds — a
 * held request the querent can walk away from, which for a feature that exists
 * because somebody is embarrassed is the worst failure available. So two taps,
 * and the second one is in a different place and worded differently, which is
 * `DeleteAccount`'s rule: there is no position on screen where tapping twice
 * deletes a reading. The sheet below is structurally that component's, down to
 * the focus restore going to A REF WE OWN — Safari does not focus a `<button>`
 * when it is tapped, so `document.activeElement` is `<body>` on the one
 * platform this app is built for.
 *
 * THE TRAY IS AFTER THE SLIDER IN DOM ORDER AND UNDER IT IN PAINT ORDER. That
 * is not arbitrary: z-index decides what is seen and DOM order decides what Tab
 * reaches, so this is the arrangement in which the destructive control is
 * painted behind the row and reached AFTER the link.
 */
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { CardFace } from '@/components/CardFace';
import { cardById } from '@/data/deck';
import { readerById } from '@/data/readers';
import { serviceById } from '@/data/services';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { dayOffset } from '@/lib/history/dates';
import { advanceDrag, beginDrag, endDrag, REVEAL_WIDTH, type SwipeDrag } from '@/lib/history/swipe';
import { formatTime } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/LocaleProvider';
import type { HistoryItem } from '@/lib/history/types';
import styles from './HistoryItemRow.module.css';

/** How the tray came to be open, for `history.item_deleted.via`. */
type OpenedVia = 'swipe' | 'keyboard';

export type HistoryItemRowProps = {
  item: HistoryItem;
  today: string;
  /** ONE TRAY AT A TIME, and the list owns which. See `HistoryBrowser`. */
  open: boolean;
  onOpenChange: (id: string, open: boolean) => void;
  /** Called only after the server has answered 2xx. Never optimistically. */
  onDeleted: (id: string) => void;
};

export function HistoryItemRow({
  item,
  today,
  open,
  onOpenChange,
  onDeleted,
}: HistoryItemRowProps) {
  const t = useT();

  /* Every hook runs before the guard below, which is the shape this file
     already had: a row referencing a reader that no longer exists is a gap in a
     list, not a crash on a rendered page — same reasoning as `ReadingView`. */
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dragRef = useRef<SwipeDrag | null>(null);
  const releaseRef = useRef<'tap' | 'drag' | null>(null);
  const openedVia = useRef<OpenedVia>('swipe');
  const trash = useRef<HTMLButtonElement | null>(null);

  /* The settled position follows the PROP; local state is only the transient
     drag. Guarded on the ref so a re-render mid-gesture cannot snap the row
     back under the finger. */
  useEffect(() => {
    if (dragRef.current) return;
    setOffset(open ? REVEAL_WIDTH : 0);
  }, [open]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // A secondary mouse button is a context menu, not a swipe.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try {
        // The tray is 88px wide; the pointer leaves this element almost at once.
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* Not capturable — a very fast tap. The tap path is unaffected. */
      }
      dragRef.current = beginDrag(e.clientX, e.clientY, e.timeStamp, open);
      setDragging(true);
    },
    [open],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const next = advanceDrag(current, e.clientX, e.clientY, e.timeStamp);
    dragRef.current = next;
    // Read from the ref and set a plain value. Nothing decides anything inside
    // an updater; see the header.
    if (next.axis === 'x') setOffset(next.offset);
  }, []);

  const onPointerUp = useCallback(() => {
    const current = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!current) return;

    const release = endDrag(current);
    if (release.kind === 'tap') {
      // The anchor's onClick, which fires next, decides what a tap means.
      releaseRef.current = 'tap';
      return;
    }
    releaseRef.current = 'drag';
    setOffset(release.open ? REVEAL_WIDTH : 0);
    if (release.open) openedVia.current = 'swipe';
    onOpenChange(item.id, release.open);
  }, [item.id, onOpenChange]);

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    // A cancelled sequence is not a tap: it must not navigate.
    releaseRef.current = 'drag';
    setOffset(open ? REVEAL_WIDTH : 0);
  }, [open]);

  const onLinkClick = useCallback(
    (e: ReactMouseEvent<HTMLAnchorElement>) => {
      const release = releaseRef.current;
      releaseRef.current = null;

      if (release === 'drag') {
        e.preventDefault();
        return;
      }

      /* AN OPEN TRAY SWALLOWS THE NEXT TAP. iOS's own rule: while a destructive
         control is exposed the row is not a link, it is a thing to put away.
         `release === null` here is a keyboard Enter, which falls through to the
         same check and then navigates. */
      if (open) {
        e.preventDefault();
        onOpenChange(item.id, false);
        return;
      }

      track('history.item_opened', {
        reading_id: item.id,
        reader_id: item.readerId,
        service_id: item.serviceId,
        status: item.status,
        age_days: dayOffset(today, item.localDate),
        needs_translation: item.locale !== t.locale,
      });
    },
    [item, onOpenChange, open, t.locale, today],
  );

  const service = serviceById(item.serviceId);
  const reader = readerById(item.readerId);
  if (!service || !reader) return null;

  return (
    <li className={styles.row}>
      <div
        className={styles.swipe}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className={styles.slider}
          data-dragging={dragging ? 'true' : undefined}
          style={{ transform: `translateX(${-offset}px)` }}
        >
          <Link
            href={`/history/${item.id}`}
            className={styles.link}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onClick={onLinkClick}
          >
            <div className={styles.cards}>
              {[...item.cards]
                .sort((a, b) => a.position - b.position)
                .map((c, i) => {
                  const card = cardById(c.cardId);
                  return card ? (
                    <div key={`${c.cardId}-${i}`} className={styles.thumb}>
                      <CardFace card={card} reversed={c.reversed} size="thumb" />
                    </div>
                  ) : null;
                })}
            </div>

            <div className={styles.text}>
              <div className={styles.top}>
                <span className={styles.service}>{service.name[t.locale]}</span>
                <span className={styles.time}>
                  {formatTime(new Date(item.createdAtIso), t.locale)}
                </span>
              </div>
              <div className={styles.reader}>{reader.name}</div>
              {item.question ? <p className={styles.question}>{item.question}</p> : null}
              {/* `failed` and `aborted` are shown (H5) and must SAY so, or a row with
                  no prose behind it reads as a bug the moment it is opened.

                  PHASE 4's RETRY HINT GOES HERE, AS TEXT. This paragraph is inside
                  the `<Link>` and inside the swipe surface, so an interactive
                  control here would swallow both the tap and the drag. One place to
                  press stays `/history/[id]`. */}
              {!item.hasBody ? (
                <p className={styles.unfinished}>{t('history.item.unfinished')}</p>
              ) : null}
            </div>

            {/* V7 writes `shared_at`; this only reads it. Non-null after a revoke too --
                "was this ever public" is a different question from "is it now". */}
            {item.sharedAt ? (
              <span className={styles.shared}>{t('history.item.shared')}</span>
            ) : null}
          </Link>
        </div>

        {/*
          THE NON-TOUCH PATH IS THIS BUTTON BEING PERMANENTLY TABBABLE.
          Removing it from the tab order while the tray is closed is exactly what
          would make the feature keyboard-unreachable; instead, arriving on it
          opens the tray, so the focus ring is never underneath the row.

          `if (open) return` is what keeps `via` honest: on Chrome a CLICK also
          focuses the button, and without the guard a swipe-then-tap would be
          reported as `keyboard`. On Safari a tap does not focus a button at all,
          which is the same trap the sheet's focus restore is written around.

          NO `onBlur`. Closing on blur races the sheet taking focus into its
          portal, and a tray left open is a revealed button and nothing worse.
        */}
        <div className={styles.tray}>
          <button
            ref={trash}
            type="button"
            className={styles.trash}
            aria-label={t('history.item.delete.aria')}
            onFocus={() => {
              if (open) return;
              openedVia.current = 'keyboard';
              onOpenChange(item.id, true);
            }}
            onClick={() => setConfirming(true)}
          >
            <TrashMark />
          </button>
        </div>
      </div>

      {confirming ? (
        <ConfirmSheet
          item={item}
          today={today}
          via={openedVia.current}
          onClose={() => setConfirming(false)}
          onDeleted={onDeleted}
          returnFocusTo={trash}
        />
      ) : null}
    </li>
  );
}

/**
 * The confirmation, structurally `DeleteAccount`'s sheet.
 *
 * IT ISSUES THE REQUEST ITSELF and calls `onDeleted` only on a 2xx, so the row
 * outlives the sheet and there is nothing to revert. `HistoryBrowser` owns the
 * list; this owns the one call.
 *
 * EXACTLY TWO BRANCHES ON THE RESPONSE: `ok`, and everything else. A 401, a
 * 404, a 503 and a thrown fetch are one outcome to a querent — "that did not go
 * through" — and the route is idempotent, so pressing again costs nothing. The
 * safe direction is `DeleteAccount`'s: saying it failed when it did not costs
 * one tap; saying it worked when it did not is the lie this feature exists to
 * avoid.
 */
function ConfirmSheet({
  item,
  today,
  via,
  onClose,
  onDeleted,
  returnFocusTo,
}: {
  item: HistoryItem;
  today: string;
  via: OpenedVia;
  onClose: () => void;
  onDeleted: (id: string) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement | null>(null);
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
      // THE OPENER IS A REF WE OWN, NOT `document.activeElement`. Safari does
      // not focus a `<button>` when it is tapped, so `activeElement` at open
      // time is `<body>` on the one platform this app is built for, and
      // restoring to it drops the querent at the top of the document.
      returnFocusRef.current.current?.focus?.();
    };
  }, []);

  async function confirm() {
    if (working) return;
    setWorking(true);
    setFailed(false);

    /*
     * THE CLIENT BOUND, AND IT IS PHASE 1'S ROUTE HEADER THAT REQUIRES IT.
     * `DELETE /api/history/[id]` declares `maxDuration = 20` because it is the
     * first WRITE in that directory and a write is one of the few things likely
     * to be the request that wakes a suspended Neon compute -- the failure that
     * killed `POST /api/locale` at Vercel's ten-second Hobby default. **A bigger
     * server budget without a bound on the caller does not fix a hang, it
     * lengthens one**, so the two ship together.
     *
     * 25s AND NOT 20s, ON PURPOSE: longer than the route's own budget, so this
     * never aborts a request the server would still have answered. What it
     * bounds is the case where no answer is coming at all.
     *
     * AN ABORT TAKES THE ORDINARY FAILURE BRANCH, WHICH IS A DELIBERATE
     * DEPARTURE FROM THE HANDOFF'S FIRST SUGGESTION (optimistically hide the row
     * and re-fetch). A timeout means UNKNOWN -- but this component removes the
     * row only on a 2xx and holds no optimistic state, and **hiding a row on an
     * unknown outcome is exactly the false "it's gone" this whole design
     * refuses.** The route is idempotent, so a second press is free and settles
     * it: the resolution is one more tap, not a guess.
     */
    const controller = new AbortController();
    const bound = setTimeout(() => controller.abort(), 25_000);

    try {
      const response = await fetch(`/api/history/${item.id}`, {
        method: 'DELETE',
        headers: {
          [SESSION_HEADER]: getSessionId(),
          [LOCAL_DATE_HEADER]: today,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        setFailed(true);
        setWorking(false);
        return;
      }

      /* Fired from the CLIENT, like the other three history events (H11): the
         route has no `withAnalytics` and history reads are not rate limited.
         `had_share_link` is `shared_at`, which stays non-null after a revoke —
         it means WAS EVER PUBLIC, and that is the fact worth having here. */
      track('history.item_deleted', {
        reading_id: item.id,
        reader_id: item.readerId,
        service_id: item.serviceId,
        age_days: dayOffset(today, item.localDate),
        had_share_link: item.sharedAt !== null,
        question_length: item.question?.length ?? 0,
        via,
      });

      onDeleted(item.id);
    } catch {
      // Offline, cut, or the 25s bound above fired. The reading may or may not
      // still be there and this component does not guess; the route is
      // idempotent, so the honest move is to leave the sheet open, leave the row
      // in the list, and let them press again.
      setFailed(true);
      setWorking(false);
    } finally {
      clearTimeout(bound);
    }
  }

  return createPortal(
    <div className={styles.scrim} onClick={working ? undefined : onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`delete-reading-title-${item.id}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grip} aria-hidden="true" />
        <h2 className={styles.sheetTitle} id={`delete-reading-title-${item.id}`}>
          {t('history.item.delete.heading')}
        </h2>

        {/* Names the consequence the querent cannot see: Phase 1's route revokes
            every live share link in the same transaction. */}
        <p className={styles.sheetBody}>{t('history.item.delete.body1')}</p>
        {/* NEITHER "permanen" NOR a restore. The row is kept for the operator, so
            "permanent" would be false; there is no restore UI, so offering one
            would be worse. "from here" is the precise, honest sentence. */}
        <p className={styles.sheetBody}>{t('history.item.delete.body2')}</p>

        {failed ? (
          <p className={styles.sheetFailed} role="alert">
            {t('history.item.delete.failed')}
          </p>
        ) : null}

        <div className={styles.actions}>
          {/* The SAFE button is the primary-styled one and comes first in the
              Tab order. The destructive one is outlined, never filled, and does
              not autofocus — autofocusing it means Enter deletes a reading. */}
          <button type="button" className={styles.cancel} onClick={onClose} disabled={working}>
            {t('history.item.delete.cancel')}
          </button>
          <button type="button" className={styles.confirm} onClick={confirm} disabled={working}>
            {working ? t('history.item.delete.working') : t('history.item.delete.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A lid, a body and two staves. No icon dependency in this project and there
 * must not be one; `ChatButton`'s mark is the precedent for the stroke weight
 * and the `aria-hidden` / `focusable` pair — the button carries the name.
 */
function TrashMark() {
  return (
    <svg
      className={styles.trashMark}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.5C9.5 4.9 10 4.5 10.5 4.5h3c0.6 0 1 0.4 1 1V7" />
      <path d="M6.5 7l0.9 11.1c0.1 0.8 0.7 1.4 1.5 1.4h6.2c0.8 0 1.4-0.6 1.5-1.4L17.5 7" />
      <path d="M10.3 10.5v6" />
      <path d="M13.7 10.5v6" />
    </svg>
  );
}

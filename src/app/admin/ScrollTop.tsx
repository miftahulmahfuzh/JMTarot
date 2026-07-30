'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { COMMON } from './copy';
import styles from './ScrollTop.module.css';

/**
 * Back to the top of an admin page. 2026-07-30.
 *
 * `/admin/users/[id]` is fourteen sections about one person and the token pages are
 * tall charts; the operator's report was that getting back to the tab row is a long
 * flick. Mounted once in the shell, so it is on all seven pages.
 *
 * ── IT IS ABSENT UNTIL IT WOULD DO SOMETHING ─────────────────────────────────
 *
 * Below `SHOW_AFTER_SCREENS` there is nothing above you worth a button, and a control
 * pinned over the bottom-right corner of `/admin/blog/new` — a short form — is just
 * 44px of covered page. So it fades in, and the listener is passive and rAF-coalesced
 * because a scroll handler that lays out is a scroll handler that stutters.
 *
 * ── THE `data-still` READ IS THE TRAP `SwipeDeck` PREDICTED BY NAME ──────────
 *
 * *"The same trap will catch the next component that auto-scrolls."* This is that
 * component. **A JS `scrollTo({ behavior })` OVERRIDES CSS `scroll-behavior` rather
 * than defaulting from it** — the option is not a default, it is an override — so
 * `html[data-still]` in a stylesheet has no say over this call, and every 1440px
 * screenshot taken after a tap would photograph the page mid-glide. `goTo`'s line is
 * copied deliberately: `reduce || still ? 'auto' : 'smooth'`.
 *
 * **NO `t()`** (A-D12). The label is Indonesian and hardcoded in `copy.ts`.
 */

/**
 * How far down the button appears, in viewports.
 *
 * **IT WAS 1.5 AND THAT WAS MEASURABLY WRONG, ON THE ONE PAGE THIS EXISTS FOR.** At
 * 1440x1200 — the shape of the screen this dashboard is read on — `/admin/users/[id]`
 * is 2774px tall, so its maximum `scrollY` is about 1717 and the 1800 that 1.5 screens
 * demands is **unreachable**. The button never appeared on the page whose scrolling was
 * the report. A threshold in viewports is fine; 1.5 of a tall desktop viewport is not,
 * and only driving the real page at a real size shows it.
 *
 * `1` is "the top of the page is no longer on screen", which is exactly when a
 * back-to-top control starts earning its corner. It still requires a page twice the
 * viewport's height, so `/admin/blog/new` — a short form — never shows one.
 */
const SHOW_AFTER_SCREENS = 1;

export function ScrollTop() {
  const [shown, setShown] = useState(false);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      setShown(window.scrollY > SHOW_AFTER_SCREENS * window.innerHeight);
    };

    /*
     * rAF-coalesced: scroll fires far more often than a frame, and `measure` reads
     * `innerHeight`, which is layout. Without the guard a fast flick queues dozens of
     * reads per frame for one boolean that cannot change more than once.
     */
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure(); // a reload can restore a scroll position, so do not wait for a scroll
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const toTop = useCallback(() => {
    // See the header: the stylesheet cannot govern this, so the attribute is read here.
    const still = document.documentElement.hasAttribute('data-still');
    window.scrollTo({ top: 0, behavior: reduce || still ? 'auto' : 'smooth' });
  }, [reduce]);

  return (
    <button
      type="button"
      className={shown ? `${styles.button} ${styles.shown}` : styles.button}
      onClick={toTop}
      /*
       * HIDDEN FROM EVERYTHING, NOT JUST FROM SIGHT. An opacity-0 button still takes
       * focus and still answers a screen reader, so a keyboard operator at the top of
       * the page would tab into a control they cannot see and that does nothing.
       */
      aria-hidden={shown ? undefined : true}
      tabIndex={shown ? undefined : -1}
      aria-label={COMMON.toTop}
    >
      {/* Decorative: the button's name is its aria-label. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

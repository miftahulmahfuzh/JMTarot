'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId } from '@/lib/analytics/track.client';
import type { ChatStateReply } from '@/lib/chat/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './ChatButton.module.css';

/** How long the badge's one fetch may take. Under `/api/chat/state`'s `maxDuration`
 *  of 30, and generous for three indexed reads on a cold Neon compute. */
const STATE_TIMEOUT_MS = 10_000;

/**
 * The second circle in the top-right corner: the way into the group (`C-D17`).
 *
 * ── MOUNTED BY THE OWNING SERVER PAGE, NEVER BY `src/app/layout.tsx` ────────
 *
 * `AccountButton`'s rule and all three of its reasons, copied deliberately rather
 * than referenced — that header is the reason those rules survived three
 * workstreams, and a second button in the same corner with no header of its own is
 * the one somebody moves into the layout while being helpful.
 *
 *  - **MOUNTING IT *IS* THE SESSION CHECK.** `/`, `/[reader]`, `/account` and
 *    `/history` are all outside `isPublic()`, so `src/middleware.ts` has already
 *    proved there is a signed-in, onboarded querent before any of them renders. This
 *    component reads no session, takes no `Viewer` and needs no `ViewerProvider`.
 *  - **IN THE ROOT LAYOUT** it would mean either an `auth()` call on every request
 *    the app serves — including `/terms`, `/privacy` and V7's public `/s/[slug]` —
 *    or a second copy of `isPublic()` kept in step by hand.
 *  - **NOT ON THE DRAW SCREEN**, for `AccountButton`'s reason 2 verbatim: *a one-tap
 *    exit in the corner of a streaming page is wrong regardless.* `Draw.tsx` aborts
 *    its reading on unmount, so a tap here mid-stream kills the reading and records
 *    `reading.aborted`. The draw screen's route into the room is F6's attachment
 *    control, which appears only once the reading has finished.
 *  - **NOT ON `/chat` ITSELF.** A badge on the page you are already looking at is a
 *    control pointing at itself; `PublicShell`'s deleted `LINKS` table is the
 *    precedent, where deleting the filter let the landing page's footer grow a link
 *    to itself.
 *  - **NOT ON ANY PAGE WITHOUT A SESSION**: `/login`, `/terms`, `/privacy`,
 *    `/onboarding`, `/s/`, the landing page, `/gallery`, `/arcana`, `/blog`.
 *
 * **THE ENFORCEMENT IS THE ABSENCE OF AN IMPORT, NEVER A RUNTIME FLAG**, and
 * `src/components/chatSurface.test.ts` is the deny-shaped guard — modelled on
 * `accountSurface.test.ts`, because *an allowlist somebody has to edit to make their
 * branch green is an allowlist somebody widens without reading it.*
 *
 * ── THE FIXED-POSITION TRAP, UNCHANGED ─────────────────────────────────────
 *
 * `position: fixed` resolves against the nearest ancestor carrying a `transform`,
 * `filter` or `perspective`, **not** against the viewport. Mount this inside a
 * transformed subtree — `.bleed`, anything under `Fan.module.css` — and the circle
 * lands somewhere else entirely, on one page, looking like a CSS mistake in the
 * wrong file. It is a **direct child of the page's shell**, and it does not portal:
 * a portal needs a mounted flag and the button would then pop in after hydration.
 *
 * ── THE BADGE IS CLIENT-FETCHED, AND RENDERS NOTHING AT ZERO ───────────────
 *
 * `C-D18` plus `M14` — `FrequencyLine`'s and `DaySummary`'s contract in a third
 * place: *render nothing until you have something, and nothing forever if you never
 * do.* The button renders with no dot and grows one; at `unread === 0` there is no
 * dot, no skeleton, no reserved height and no `0`, and the geometry is identical in
 * both states so nothing reflows.
 *
 * **NO SERVER READ.** Reading `chat_threads` in four server pages would put a
 * database read on the render path of the busiest screen in the app (roadmap §0.3)
 * and would flash a stale dot on a cached render.
 *
 * **NO POLLING LOOP** (`C-N2a`). One fetch on mount, one when the tab becomes
 * visible again — and that second one is `C-D18`'s **proactive tick**, the one
 * request this app can rely on a returning querent making, in whose `after()` F5
 * mints an unprompted run.
 */
export function ChatButton() {
  const t = useT();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      /*
       * BOUNDED, AND ABORTED ON UNMOUNT (`F4-11`). StrictMode mounts, unmounts and
       * remounts every effect in development; an unbounded fetch on a page that
       * lives for ten minutes is a socket held open for ten minutes.
       */
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), STATE_TIMEOUT_MS);
      try {
        const res = await fetch('/api/chat/state', {
          headers: { [SESSION_HEADER]: getSessionId() },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const state = (await res.json()) as ChatStateReply;
        if (!cancelled) setUnread(Math.max(0, state.unread));
      } catch {
        /*
         * Silence, covering the abort and a real failure alike. **THE BADGE IS NOT
         * WORTH AN ERROR** — there is no copy for this component by design (`M14`),
         * and with the database down it renders exactly what it renders for a
         * querent with nothing unread, which is nothing.
         */
      } finally {
        clearTimeout(timer);
      }
    };

    void load();

    /*
     * `visibilitychange`, and **not** an interval. A querent who leaves the tab open
     * all afternoon and comes back gets the dot without this app ever polling.
     */
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const label = unread > 0 ? t.plural('chat.button.aria.unread', unread) : t('chat.button.aria');

  /*
   * **`chat.opened` FIRES FROM THE ROOM AND NEVER FROM HERE**, and `?from=button` is
   * how it learns which entry point was used. ONE FIRE SITE: a click event here plus
   * a mount event there would count a querent who arrived by the button twice, and
   * F1 folded `chat.button_clicked` away with exactly that sentence — *the click IS
   * the open.* So this component tracks nothing, which also means it cannot get
   * `F4-16` wrong.
   */
  return (
    <Link href="/chat?from=button" className={styles.button} aria-label={label}>
      <ChatMark />
      {/* `M14`: no element at all at zero, rather than a hidden one. */}
      {unread > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
    </Link>
  );
}

/**
 * A stroked speech outline. **NOT A LOTUS**: the lotus is this app's symbol for the
 * QUERENT and `AccountButton` owns it (`F4-19`, `LotusMark`'s header). Two lotuses
 * in one corner is the app disagreeing with itself about what a circle means.
 *
 * Constructed exactly like `LotusMark` — `currentColor`, `aria-hidden`,
 * `focusable="false"` — so the button's own hover colours drive it and **there is
 * not a hex in this file.**
 */
function ChatMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* One bubble with a tail. Three people in a room, drawn as the thing they
          are doing rather than as three heads, which at 22px is a smudge. */}
      <path d="M4.5 7.5C4.5 6.4 5.4 5.5 6.5 5.5H17.5C18.6 5.5 19.5 6.4 19.5 7.5V14C19.5 15.1 18.6 16 17.5 16H10L6.2 19V16H6.5C5.4 16 4.5 15.1 4.5 14V7.5Z" />
      {/* Two lines of speech inside it, not three: at this size the third reads as
          fill rather than as text. */}
      <path d="M8 9.4H16" />
      <path d="M8 12.1H13" />
    </svg>
  );
}

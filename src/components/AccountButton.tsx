'use client';

import { useCallback, useRef, useState } from 'react';

import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { AccountMenu } from './AccountMenu';
import { LotusMark } from './LotusMark';
import styles from './AccountButton.module.css';

/** Where the button was tapped from. Closed, because `account.opened.surface` is. */
export type AccountSurface = 'reader_picker' | 'service_picker' | 'account' | 'history';

/**
 * The circle, top right. V4's whole visible surface.
 *
 * ── MOUNTED BY THE OWNING SERVER PAGE, NEVER BY src/app/layout.tsx ───────────
 *
 * The same rule, for the same reason, as `ViewerProvider`. Mounting it in the
 * root layout would mean either calling `auth()` there -- a JWE decrypt on every
 * request the app serves, including /terms, /privacy and V7's public /s/[slug] --
 * or matching a middleware-forwarded pathname against a second copy of
 * `isPublic()` kept in step by hand.
 *
 * MOUNTING IT *IS* THE SESSION CHECK. `/`, `/[reader]`, `/account` and `/history`
 * are all outside `isPublic()`, so `src/middleware.ts` has already proved there
 * is a signed-in, onboarded user before any of them renders. This component
 * reads no session, takes no `Viewer` and needs no `ViewerProvider`.
 *
 * ── NOT ON THE DRAW SCREEN. NOT THE LANGUAGE ROW -- THE WHOLE BUTTON ─────────
 *
 * Roadmap §7 trap 4 offers two resolutions and this is the second one.
 *
 *   1. `readings.locale` records the language the prose came out in, and the
 *      reading keeps it PERMANENTLY. Suppressing only the Language row while a
 *      reading streams re-enables it the instant the stream ends -- with the
 *      finished Indonesian reading still on screen, and `router.refresh()`
 *      KEEPING CLIENT STATE by design. The prose would survive the switch and
 *      sit under English chrome. Guarding "until navigation away" is this rule
 *      with extra machinery.
 *   2. The other three items navigate AWAY, and one of them ends the session.
 *      `Draw.tsx` aborts its reading on unmount, so History mid-stream kills the
 *      reading and records `reading.aborted`. A one-tap exit in the corner of a
 *      streaming page is wrong regardless of what the Language row is doing.
 *   3. The streaming state lives in `Draw.tsx`, three levels below any mount
 *      point. Plumbing it up is a context, a lift or a bus -- each of which
 *      fails silently when it desyncs. A suppression you cannot forget beats a
 *      flag you can, and with this mount seam it costs one absent import.
 *
 * `src/components/accountSurface.test.ts` is the guard. It also names `app/s/`
 * before V7 has built it.
 *
 * ── WHAT IS IN THE CIRCLE, AND WHAT IS NOT ───────────────────────────────────
 *
 * A lotus, stroked in `currentColor`, inline.
 *
 * NOT THE GOOGLE AVATAR. Reconciliation R21 removed `picture` from the token
 * deliberately -- to avoid a CSP `img-src` exception for a decorative element --
 * and CLAUDE.md records the 548-vs-676-byte cookie measurement behind it. Do not
 * reintroduce it.
 *
 * NOT AN INITIAL EITHER. `users.display_name` is in the token and is free, and it
 * is the GOOGLE name. The name this app calls the querent by is the NICKNAME from
 * onboarding -- "Ini yang akan dipakai pembacamu" -- which lives in `profiles`,
 * which a render path may not read (roadmap §6). A circle showing the Google
 * initial while every reader on screen uses the nickname is the app disagreeing
 * with itself about who the user is. A lettered circle top-right also reads as
 * Gmail, and nothing else in this app has an avatar.
 *
 * The lotus needs no data, no session and no network. It is the app's own symbol
 * for the querent's inner shape (`onboarding.lotusName`, "Teratai Batin") and it
 * points at exactly what V8 puts behind it. Inline rather than fetched, following
 * `GoogleMark` on /login and the no-external-hosts posture generally.
 *
 * ── THE FIXED-POSITION TRAP ──────────────────────────────────────────────────
 *
 * `position: fixed` positions against the nearest ancestor carrying a
 * `transform`, `filter` or `perspective`, NOT against the viewport. Mount this
 * inside a transformed subtree -- `.bleed`, anything in `Fan.module.css` -- and
 * the circle lands somewhere else entirely. Mount it as a direct child of the
 * page's shell. The MENU escapes this by portalling; the button deliberately
 * does not portal, because a portal needs a mounted flag and the button would
 * then pop in after hydration.
 */
export function AccountButton({
  surface,
  showLanguage,
}: {
  surface: AccountSurface;
  /** `localeSwitcherEnabled()`, resolved by the mounting server page. See AccountMenu. */
  showLanguage: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  /*
   * HANDED TO THE MENU SO IT CAN PUT FOCUS BACK, and not left for the menu to
   * infer from `document.activeElement`. SAFARI DOES NOT FOCUS A BUTTON ON TAP
   * -- only text inputs take focus from a pointer there -- so on the iPhone this
   * app is built for, "the element that was focused when the sheet opened" is
   * `<body>`. `AccountMenu`'s `returnFocusTo` carries the full argument.
   */
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={styles.button}
        aria-label={t('account.button.aria')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          /*
           * track() IN THE HANDLER BODY, NEVER INSIDE THE setState UPDATER.
           * StrictMode double-invokes updaters, so the event would fire twice in
           * development and once in production -- the worst kind of measurement
           * bug, because the numbers are wrong only where you look at them. Same
           * rule Draw.tsx carries in capitals.
           */
          if (!open) track('account.opened', { surface });
          setOpen((v) => !v);
        }}
      >
        <LotusMark />
      </button>
      {open ? (
        <AccountMenu onClose={close} showLanguage={showLanguage} returnFocusTo={buttonRef} />
      ) : null}
    </>
  );
}

/*
 * `LotusMark` MOVED TO `./LotusMark` IN v0.7.0 (F4's D8, ruled in by the
 * reconciliation as the one edit seam S9 permits to this file). `C-D16` makes the
 * querent's chat avatar the same glyph, and the alternative was a second copy of
 * four `d` strings held in step by a byte-identity test. Nothing else here changed:
 * the mark still strokes in `currentColor`, so this button's own hover and expanded
 * colours still drive it.
 *
 * `.mark`'s 22px went with the component, into `LotusMark.module.css`. The rule left
 * behind in `AccountButton.module.css` is dead and stays dead: **F4 may not edit that
 * stylesheet** (S9), and `chatSurface.test.ts` asserts its `width: 44px` and
 * `right: calc(10px +` still match the `corner` rail in `tokens.ts`.
 */

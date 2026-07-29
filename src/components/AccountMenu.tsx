'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { flushNow, track } from '@/lib/analytics/track.client';
import { signOutAction } from '@/lib/auth/actions';
import { useT } from '@/lib/i18n/LocaleProvider';
import { LocaleSwitch } from './LocaleSwitch';
import styles from './AccountMenu.module.css';

/**
 * The sheet the account circle opens. SIX items now:
 * User Details -> /account, Language, History -> /history, **Gallery ->
 * /gallery, Writing -> /blog**, and Sign out.
 *
 * VD12 fixed three. The fourth is roadmap R7.1, and the reason it is here rather
 * than in V8 is that it was falling between two workstreams the way `/account`
 * fell between W3 and W7: `auth.signed_out` has been in the closed taxonomy
 * since W4 with nothing to fire it, and a home-screen-installed PWA with no way
 * to leave is a real gap rather than a tidy-up.
 *
 * ── THE FIFTH AND SIXTH ARE MIFTAH'S RULING (2026-07-29), AND THE COMMENT THAT
 *    USED TO SIT HERE FORBADE THEM ────────────────────────────────────────────
 *
 * It said: *"DO NOT ADD A FIFTH without a decision recorded against VD12 --
 * sharing (V7) belongs on the artifact."* **This is that decision**, and it is
 * inverted rather than deleted, because the argument it was making is still
 * right about the case it was made for: a SHARE control belongs on the thing
 * being shared, not in an account menu.
 *
 * These two are a different kind of item. v0.4.0 put `/gallery` and `/blog` in
 * the public footer, which is mounted on the landing page and on all 22 lore
 * pages -- so a signed-in querent met "Galeri / Arti kartu / Tulisan" under
 * every card reading. Miftah's report: **the homepage and the card pages should
 * look clean.** The links are navigation to two public pages, they have to live
 * somewhere reachable from inside the app, and this sheet is the app's only
 * navigation surface. So they moved here, BELOW `/history`, in the order the
 * ruling named.
 *
 * **THE SEO COST IS ZERO AND THAT IS NOT LUCK**: `hreflang`, the sitemap and the
 * lore pages' own `arcana.gallery` link are what a crawler follows, and none of
 * them is chrome. The footer's cross-links were a convenience for a reader; the
 * account menu is where a signed-in reader's navigation already is.
 *
 * **`/blog` 404s UNTIL S6 LANDS.** That was already true of the footer link this
 * replaces, and the branch is not deployable until S6 ships for exactly that
 * reason -- roadmap §0.5. It is behind a session now rather than on the homepage,
 * which is strictly better while it is still missing.
 *
 * ── A BOTTOM SHEET, NOT A DROPDOWN ───────────────────────────────────────────
 *
 * The opener is a 44px circle in the top-right corner of a phone -- the furthest
 * point from a right thumb and unreachable for a left one -- and in iOS
 * standalone mode with viewport-fit=cover that corner is shared with the clock,
 * the battery and the Dynamic Island. A panel anchored there keeps its tap
 * targets in the worst place on the screen and has to negotiate with two insets
 * and a cutout. This puts them in the thumb arc and negotiates with one flat
 * strip, `env(safe-area-inset-bottom)`.
 *
 * It is also STRUCTURALLY `CardDetail`: the same scrim, the same blur, the same
 * `rise` on `--ease-card`, the same reduced-motion kill switch, the same
 * scrim-closes / sheet-stops-propagation pair, the same body scroll lock, the
 * same focus restore. One modal idiom in this app, not two.
 *
 * ── THE ONE THING CardDetail DOES NOT DO: A REAL TAB TRAP ────────────────────
 *
 * `CardDetail` is opened from a card in the middle of a long page, so tabbing
 * past it is survivable. THIS is opened from the topmost control on the screen.
 * Tab out of it and focus lands in the browser chrome with a scrim over the
 * page, and a keyboard user has no way back. The handler below cycles Tab and
 * Shift+Tab inside the sheet.
 *
 * ── PORTALLED TO document.body, ON PURPOSE ───────────────────────────────────
 *
 * `position: fixed` positions against the nearest ancestor with a `transform`,
 * `filter` or `perspective`, not against the viewport -- and this app is full of
 * transforms (`Fan.module.css`, `.bleed`, every card). Portalling means the sheet
 * is correct wherever `AccountButton` is mounted, including inside a subtree a
 * future workstream decides to animate. There is no SSR hazard: `AccountButton`
 * renders this only when `open` is true, and `open` starts false, so this
 * component never runs on the server.
 *
 * ── /account AND /history MAY NOT EXIST YET ──────────────────────────────────
 *
 * V6 and V8 land after V4 (roadmap §8's build order). Until they do, both links
 * resolve to the app's own `not-found.tsx`, which is styled and localized. That
 * is deliberately NOT hidden behind a flag: a flag here is a thing to forget to
 * remove, and a 404 on an unreleased branch is honest.
 */
export function AccountMenu({
  onClose,
  showLanguage,
  returnFocusTo,
}: {
  onClose: () => void;
  /**
   * `localeSwitcherEnabled()`, resolved by the mounting SERVER page.
   *
   * NOT read here. `LOCALE_SWITCHER` has no `NEXT_PUBLIC_` prefix, so inside a
   * `'use client'` module the bundler inlines `undefined` and the flag silently
   * stops working -- `resolve.ts`'s header records that this exact mistake
   * already shipped once, for about ten minutes.
   */
  showLanguage: boolean;
  /**
   * The circle that opened this, so focus can go back to it on close.
   *
   * PASSED EXPLICITLY, AND NOT READ OFF `document.activeElement`, BECAUSE OF
   * SAFARI. `CardDetail` captures the opener that way and it is the obvious
   * thing to copy; it is wrong on the one platform this app is built for.
   * Safari -- macOS and iOS both -- does NOT focus a `<button>` when it is
   * clicked or tapped; only text inputs take focus from a pointer. So on an
   * iPhone `document.activeElement` at open time is `<body>`, and restoring to
   * it drops the querent at the top of the document with no idea where the
   * menu went.
   *
   * Caught by `_accountshot.html`'s tab-trap check, which reported
   * `focus -> Major ArcanaJMTaro` instead of the circle. The harness dispatches
   * synthetic PointerEvents, which do not focus their target either -- so the
   * harness reproduced Safari's behaviour by accident, which is the only reason
   * this was found from WSL.
   *
   * `CardDetail` has the same latent bug for the same reason. It is not V4's
   * file and its opener is a card in a long list rather than a fixed control,
   * so the consequence there is smaller; worth fixing when someone is next in it.
   */
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  /* Sign-out is a full navigation with a network round trip in front of it. The
     flag exists so a second tap during that window cannot fire the event twice
     or issue a second POST -- not to display a spinner, which would need a
     catalog key to say nothing the disabled control has not already said. */
  const [leaving, setLeaving] = useState(false);

  /*
   * Read through a ref so the effect below can depend on nothing at all --
   * `CardDetail`'s reason, and it applies here too: `onClose` is passed as an
   * inline arrow, so an effect keyed on its identity would tear down and re-focus
   * on every parent re-render.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /* Same trick for the opener ref, so the effect below still depends on nothing
     and the cleanup still reads the current value. */
  const returnFocusRef = useRef(returnFocusTo);
  returnFocusRef.current = returnFocusTo;

  useEffect(() => {
    /*
     * FOCUS THE DIALOG, NOT THE FIRST ROW, and the difference is visible rather
     * than theoretical. Focusing the first `<Link>` puts `:focus-visible` on it
     * -- Chrome applies that pseudo-class to programmatic focus -- so a THUMB
     * user who has never touched a keyboard opens the sheet and finds row one
     * wearing a gold ring, which reads as "this one is selected". Measured in
     * `_accountshot.html`'s first pass.
     *
     * Focusing the container is the standard dialog pattern, keeps the ring for
     * the keyboard users it was written for, and still starts the Tab cycle at
     * row one. `CardDetail` focuses its Close button instead, which is right
     * there and wrong here: that dialog's primary action IS dismissal.
     */
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
      const items = [
        ...sheet.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      /*
       * `active === sheet` is the entry case and it is not redundant with the
       * `!contains` one: the effect above focuses the container, and the
       * container IS inside itself, so a Shift+Tab as the very first keystroke
       * would otherwise fall through this handler and escape into the browser
       * chrome -- the exact failure the trap exists to prevent, reachable only
       * on the first keypress after opening.
       */
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
      /*
       * Back to the circle. See `returnFocusTo`'s doc comment for why this is a
       * prop and not `document.activeElement` captured on the way in.
       *
       * The ref is read at CLEANUP time rather than captured above, which is
       * what makes it safe for the sign-out path: `signOutAction` navigates, the
       * whole tree unmounts, and `.current` is null by then, so this is a no-op
       * instead of a focus call into a detached node.
       */
      returnFocusRef.current.current?.focus?.();
    };
  }, []);

  /**
   * FIRE THE EVENT AND FLUSH IT BEFORE THE NAVIGATION, NOT AFTER.
   *
   * `track.client` debounces for two seconds and flushes on the hide path with
   * `sendBeacon`, which is right for every other event in the app and wrong for
   * this one: `signOutAction` clears the cookie and redirects, and the event is
   * about the session it is in the middle of ending. `flushNow()` is exported
   * for exactly this -- it issues the POST immediately, with `keepalive`, so it
   * survives the navigation that follows.
   *
   * Firing it BEFORE the action rather than after is not a nicety either: after
   * the await there is no after. `signOut` throws NEXT_REDIRECT.
   */
  async function leave() {
    if (leaving) return;
    setLeaving(true);
    track('auth.signed_out', {});
    flushNow();
    try {
      await signOutAction();
    } catch {
      /*
       * NEXT_REDIRECT lands here and is not an error -- Next unwinds it into a
       * navigation on its way past. A genuine failure (offline, a 500) lands
       * here too and is indistinguishable, so the honest response to both is the
       * same one `/api/locale` makes: leave the page as it is. The user is still
       * signed in, the sheet is still open, and the row re-arms.
       */
      setLeaving(false);
    }
  }

  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-menu-title"
        /* Focusable programmatically, never in the Tab order. See the effect. */
        tabIndex={-1}
        // The scrim closes on tap; the sheet is the part that must not.
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grip} aria-hidden="true" />
        <h2 className={styles.title} id="account-menu-title">
          {t('account.menu.title')}
        </h2>

        {/* Plain Links, not TrackLinks. The destination pages own their view
            events (`account.details_viewed` -- V8, `history.viewed` -- V6);
            firing a click event here as well would double-count the only funnel
            this feature has. `onClose` because a client navigation leaves this
            open for a frame otherwise. */}
        <Link href="/account" className={styles.item} onClick={onClose}>
          <span className={styles.label}>{t('account.menu.details')}</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>

        {showLanguage ? (
          <div className={styles.item}>
            <span className={styles.label}>{t('account.menu.language')}</span>
            <LocaleSwitch variant="codes" />
          </div>
        ) : null}

        <Link href="/history" className={styles.item} onClick={onClose}>
          <span className={styles.label}>{t('account.menu.history')}</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>

        {/*
          THE TWO PUBLIC PAGES, BELOW READING HISTORY, IN THIS ORDER (Miftah's
          ruling -- see the header). Plain `Link`s like the three above: the
          destination pages own their view events, and `public.page_viewed` fires
          from `PublicPageViewed` on arrival. Firing a click event here as well
          would double-count the only funnel those pages have.

          They are NOT `TrackLink`s with `public.link_clicked` either, and that is
          deliberate: `from` on that event is a closed union of PUBLIC surfaces
          (`landing | gallery | arcana | blog_index | blog_post | footer`), and
          the account menu is none of them. Adding a seventh value to measure a
          tap from inside the app would put an app surface in a public-funnel
          union -- the "how do people move through the CONTENT" question stops
          having a clean answer. If this tap ever needs measuring, it is
          `account.opened`'s sibling, not this event's.
        */}
        <Link href="/gallery" className={styles.item} onClick={onClose}>
          <span className={styles.label}>{t('account.menu.gallery')}</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>

        <Link href="/blog" className={styles.item} onClick={onClose}>
          <span className={styles.label}>{t('account.menu.blog')}</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>

        {/*
          VISUALLY SEPARATED, AND DELIBERATELY NOT STYLED AS DESTRUCTIVE.
          Deleting the account is destructive; signing out is reversible with the
          same button that got you in. Making the two look alike on one sheet --
          and V8 puts account deletion behind `/account`, one row above this --
          is how somebody taps the wrong one. `--danger` is V8's and is not
          borrowed here. The separation is a rule and a gap, nothing louder.
        */}
        <div className={styles.divider} role="presentation" />
        <button type="button" className={styles.signOut} onClick={leave} disabled={leaving}>
          {t('account.menu.signOut')}
        </button>

        <button type="button" className={styles.close} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>,
    document.body,
  );
}

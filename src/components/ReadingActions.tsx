'use client';

/**
 * Home, share, account — under a finished reading (2026-08-30, Miftah's ruling).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Until now the tail of a reading offered two controls and neither of them LEFT the
 * reading: `Bahas di grup` goes deeper into it and `Bagikan` opens a sheet about it.
 * There was no way back to the reader picker from the draw screen or from
 * `/history/[id]`, and no account control on either -- `AccountButton` is mounted on
 * `/`, `/[reader]`, `/account` and `/history` and on nothing else.
 *
 * ── IT OWNS THE CIRCLE AND HANDS IT OUT ────────────────────────────────────
 *
 * `styles.circle` is passed to `ShareFooter` and `AccountButton` as a `className`.
 * That is deliberate and it is the reason those two components grew a `className`
 * prop rather than a `variant`: the alternative is the same eight declarations
 * written a third and a fourth time, in two stylesheets, agreeing with this one by
 * nothing but somebody's memory. `AccountButton.module.css` and
 * `ChatButton.module.css` are already two copies of it, and `chatSurface.test.ts`
 * exists to hold those two together.
 *
 * ── ROADMAP §7 TRAP 4 IS SUPPRESSED HERE, IN CODE, AND NOT BY A CALL SITE ──
 *
 * `readings.locale` records the language the prose came out in, and `Draw.tsx` holds
 * a finished reading in React state with no translation path -- so a language flip
 * on the draw screen leaves Indonesian prose under English chrome, and
 * `router.refresh()` keeps the state that makes that possible. `AccountButton`'s
 * header rejected "suppress only the Language row" because a suppression that holds
 * only WHILE STREAMING re-enables itself the moment the stream ends, with the
 * finished reading still on screen.
 *
 * **THE SUPPRESSION BELOW IS PERMANENT AND UNCONDITIONAL, WHICH IS A DIFFERENT
 * THING FROM THE ONE THAT WAS REJECTED**: `surface !== 'draw'` reads no streaming
 * state, is one expression, and is asserted by `accountSurface.test.ts`. A caller
 * cannot pass its way past it -- `showLanguage` is ANDed, never trusted -- because a
 * flag two files away is exactly the thing that desyncs.
 *
 * `/history/[id]` keeps the Language row: it renders through `ReadingView`, whose
 * rule 4 and `refillView`'s `shownProse` exist to handle a viewer reading in a
 * language the prose was not generated in.
 *
 * ── THE HOME LINK FIRES NOTHING ────────────────────────────────────────────
 *
 * `AttachReadingLink`'s rule, verbatim: *a tap that navigates and is then abandoned
 * is not the thing you wanted to count.* `events.ts` is a closed taxonomy with one
 * owner per release and this change adds no name to it -- only two members to
 * `account.opened.surface`, which `AccountButton` already fires.
 *
 * ── THE ROW IS RENDERED BY ITS HOST'S CONDITION, NEVER ITS OWN ─────────────
 *
 * `[F6-3]`'s rule. The draw screen mounts it inside the existing three-clause
 * `status === 'done' && finished.current && id !== 'unknown'`; `/history/[id]` mounts
 * it inside `view.status === 'ok' && view.body !== null`. A component that decided
 * for itself would put that decision in a `.tsx` where `npm test` cannot reach it --
 * and on the draw screen the condition is what stops a tap on Home unmounting
 * `Draw`, aborting a live stream and booking `reading.aborted { reason: 'user' }`.
 */
import Link from 'next/link';

import { useT } from '@/lib/i18n/LocaleProvider';
import { AccountButton, type AccountSurface } from './AccountButton';
import { ShareFooter, type ShareFooterProps } from './ShareFooter';
import styles from './ReadingActions.module.css';

/**
 * The two screens that render a whole reading. A SUBSET of `AccountSurface` rather
 * than a union of its own, so the value that rides `account.opened.surface` and the
 * value that decides the Language row cannot be two different things.
 */
export type ReadingActionsSurface = Extract<AccountSurface, 'draw' | 'history_detail'>;

export type ReadingActionsProps = {
  surface: ReadingActionsSurface;
  /**
   * `localeSwitcherEnabled()`, resolved by the mounting SERVER page -- a
   * non-`NEXT_PUBLIC_` variable inlines as `undefined` in a client component.
   *
   * **ANDed WITH `surface !== 'draw'` BELOW AND NEVER TRUSTED ALONE.** Defaulting to
   * `false` means the draw screen does not have to thread a value it can never use.
   */
  showLanguage?: boolean;
  /** Everything the share sheet needs, forwarded whole. See `ShareFooterProps`. */
  share: Omit<ShareFooterProps, 'className'>;
};

export function ReadingActions({ surface, showLanguage = false, share }: ReadingActionsProps) {
  const t = useT();

  /* Roadmap §7 trap 4. See the header -- this line is the whole suppression. */
  const language = surface !== 'draw' && showLanguage;

  return (
    <div className={styles.row}>
      {/*
        `prefetch={false}`, S3's tile rule: `/` is a gated, dynamic page that renders
        the reader picker for a signed-in querent, and prefetching it from under every
        finished reading is a render nobody asked for.

        A `<Link>` and not a `TrackLink`: see the header.
      */}
      <Link
        href="/"
        className={styles.circle}
        aria-label={t('reading.actions.home.aria')}
        prefetch={false}
      >
        <HomeMark />
      </Link>

      <ShareFooter {...share} className={styles.circle} />

      <AccountButton surface={surface} showLanguage={language} className={styles.circle} />
    </div>
  );
}

/**
 * A roof over a door. Constructed exactly like `LotusMark` and `ChatMark` --
 * `currentColor`, `aria-hidden`, `focusable="false"`, stroke 1.2 -- so the circle's
 * own hover colours drive it and **there is not a hex in this file.**
 *
 * The accessible name is on the link, not here: a glyph that announces itself as
 * well reads the thing twice.
 */
function HomeMark() {
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
      <path d="M4.5 10.4L12 4.5L19.5 10.4V18.8C19.5 19.4 19.1 19.8 18.5 19.8H5.5C4.9 19.8 4.5 19.4 4.5 18.8V10.4Z" />
      {/* The door. Without it the roof alone reads as a chevron at 22px. */}
      <path d="M9.8 19.8V14.4H14.2V19.8" />
    </svg>
  );
}

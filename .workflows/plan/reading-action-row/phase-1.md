# Phase 1 — The reading action row

**Plan set:** `READING_ACTION_ROW_PLAN.md`
**Satisfies:** R1 (prompt items 1, 1a, 1b, 1c)
**Depends on:** —
**Worktree:** `/home/miftah/.worktrees/tarot_app/reading-action-row`, branch `feature/reading-action-row`
**Difficulty:** NORMAL

---

## What this phase does

Puts a centred row of three 44px circles — home, share, account — under a finished reading, on the draw screen and on `/history/[id]`, in place of the `BAGIKAN` text button. `Bahas di grup` stays a text button and becomes the filled one.

**It changes no vertical spacing.** `.row` carries `margin-top: 22px; padding-top: 18px` — `ShareFooter`'s `.footer` verbatim — so the tail's rhythm after this phase is pixel-identical to today's. Phase 2 owns every pixel that moves.

## Two decisions that reverse something written down

**1. The account control reaches the draw screen, and roadmap §7 trap 4 is suppressed rather than solved.**

`accountSurface.test.ts` currently forbids `app/[reader]/[service]/` from importing `AccountButton`, and its comment gives the reason: a language flip *"after"* a reading — `router.refresh()` keeps client state — leaves Indonesian prose under English chrome, because `Draw.tsx` holds the finished text in React state and has no translation path.

That reason is still true and is **not** being argued away. What changes is that the header offered two resolutions and rejected the first (*"suppressing only the Language row"*) because a suppression that only holds **while streaming** re-enables itself the instant the stream ends. On this screen the suppression is **permanent and unconditional** — `surface !== 'draw'`, evaluated in `ReadingActions`, with no streaming state anywhere near it. That is a different thing from the one that was rejected, and it is the only reason this mount is safe.

`/history/[id]` has no such problem and keeps the Language row: it renders through `ReadingView`, whose rule 4 and `refillView`'s `shownProse` exist precisely to handle a viewer reading in a language the prose was not generated in.

**2. `AttachReadingLink` becomes the filled control, which reverses its own stylesheet's rule.**

That file says: *"`--gold-wash` is `.primary`'s fill inside the share SHEET… Out here gold means 'a card goes here' on the draw screen, and two filled gold buttons under a reading is two primaries — so both of these are an outline and a label. If a future release wants one of them emphasised, that is a decision about which, made once, in both files."* This is that decision, and the "two primaries" premise is gone: `Bagikan` is no longer a text button at all.

## Files

| File | Change |
|---|---|
| `src/components/ReadingActions.module.css` | new |
| `src/components/ReadingActions.tsx` | new |
| `src/components/ShareFooter.tsx` | trigger becomes an icon button with no wrapper; `className` prop |
| `src/components/ShareFooter.module.css` | delete `.footer`/`.action`; add `.mark` |
| `src/components/AccountButton.tsx` | `AccountSurface` +2; optional `className` |
| `src/lib/analytics/events.ts` | `account.opened.surface` +2 |
| `src/components/AttachReadingLink.module.css` | `.action` colours only |
| `src/app/[reader]/[service]/Draw.tsx` | mount the row |
| `src/app/history/[id]/HistoryDetail.tsx` | mount the row; new `showLanguage` prop |
| `src/app/history/[id]/page.tsx` | pass `localeSwitcherEnabled()` |
| `src/components/accountSurface.test.ts` | teach the guard the one hop |
| `src/lib/i18n/locales/id.ts`, `en.ts` | one new key each |

---

## Step 1 — `src/components/ReadingActions.module.css` (new)

```css
/*
 * The action row under a finished reading (2026-08-30, Miftah's ruling).
 *
 * ── ONE COPY OF THE CIRCLE, HANDED TO THREE CONTROLS ────────────────────────
 *
 * `.circle` is the corner chrome's declarations with the four corner-specific ones
 * -- `position`, `top`, `right`, `z-index` -- left out. It is defined ONCE here and
 * passed to `ShareFooter` and `AccountButton` as a `className`, because the
 * alternative is two more copies of the same eight lines in two more stylesheets
 * with nothing holding them in agreement. `AccountButton.module.css` and
 * `ChatButton.module.css` are already two copies and `chatSurface.test.ts` exists
 * because of it.
 *
 * NO NEW HEX, NO NEW FONT SIZE, NO NEW CURVE. `--gold-wash` / `--gold-hairline` at
 * rest and `--gold-wash-strong` / `--gold-border` lifted, which is the pair
 * `AccountButton`, `ChatButton` and `CardDetail`'s `.close` all use.
 *
 * ── NOT FIXED, AND THAT IS THE WHOLE DIFFERENCE ─────────────────────────────
 *
 * `AccountButton.module.css` spends a paragraph on `position: fixed` resolving
 * against a transformed ancestor rather than the viewport, and on adding
 * `env(safe-area-inset-*)` back because <body>'s padding does nothing for a fixed
 * element. **NONE OF THAT APPLIES HERE AND NONE OF IT IS COPIED.** This row is an
 * ordinary flex child of the page's shell: it is inside <body>'s padding, it
 * scrolls with the reading it belongs to, and the `.bleed` transform that would
 * have trapped a fixed element is a sibling it is never inside.
 *
 * ── THE GAP IS `--corner-gap` ───────────────────────────────────────────────
 *
 * The same 8px that separates the account circle from the chat circle up in the
 * corner. Three circles 8px apart is what the corner already looks like, which is
 * what "the same theme buttons as our existing floating buttons" asks for.
 */

.row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--corner-gap);
  /*
   * `ShareFooter`'s `.footer` VERBATIM, which is the block this row replaces -- so
   * this phase moves nothing vertically and the whole of R2 is visible in phase 2's
   * diff. **Phase 2 sets `margin-top: 0`** and `readingRhythm.test.ts` then pins the
   * 18px against three other stylesheets.
   */
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--gold-hairline);
}

.circle {
  display: flex;
  align-items: center;
  justify-content: center;
  /* The iOS tap-target floor exactly, like both corner circles. `PublicShare`'s
     36px is a known defect and is not the thing to copy. */
  width: var(--corner-size);
  height: var(--corner-size);
  /* The row is centred, so nothing should ever stretch or shrink these. */
  flex: 0 0 auto;
  border-radius: 50%;
  color: var(--gold-pale);
  background: var(--gold-wash);
  border: 1px solid var(--gold-hairline);
  /* One of the three controls is an <a>. Without this the home circle carries an
     underline the other two do not have. */
  text-decoration: none;
  backdrop-filter: blur(6px);
  cursor: pointer;
}

.circle:hover,
.circle:focus-visible {
  color: var(--gold-text);
  background: var(--gold-wash-strong);
  border-color: var(--gold-border);
  outline: none;
}

/* The account circle sets `aria-expanded` while its menu is open. The corner
   button lifts for it and so does this one, or the querent loses track of which
   control opened the sheet in front of them. */
.circle[aria-expanded='true'] {
  color: var(--gold-text);
  border-color: var(--gold-border);
}

.mark {
  width: 22px;
  height: 22px;
}
```

## Step 2 — `src/components/ReadingActions.tsx` (new)

```tsx
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
```

## Step 3 — `src/components/ShareFooter.tsx`

**3a.** Add the prop. Find `ShareFooterProps` and append a member after `nickname`:

```ts
  /** For the "A reading for {nickname}" line, mirroring the public page's chrome. */
  nickname?: string | null;
  /**
   * **THE TRIGGER'S CLASS, AND IT IS REQUIRED (2026-08-30).**
   *
   * This component used to draw its own hairline and its own outlined `Bagikan`
   * button. It is now an ICON in `ReadingActions`'s row, and the row owns the
   * hairline and the circle -- one copy of eight declarations, handed to three
   * controls, instead of a fourth stylesheet nobody remembers to keep in step.
   *
   * REQUIRED rather than optional because there is exactly one caller and a default
   * would be a second, unreviewed appearance for the one control in this app that
   * puts a page on the public internet. A future mount (`entity: 'persona'` on
   * `/account`) brings its own class, or brings back a wrapper in its own commit.
   */
  className: string;
```

**3b.** Destructure it:

```ts
export function ShareFooter({ entity, entityId, preview, prose, nickname, className }: ShareFooterProps) {
```

**3c.** Replace the trigger. The current markup is

```tsx
  return (
    <div className={styles.footer}>
      <button
        ref={opener}
        type="button"
        className={styles.action}
        onClick={() => void openSheet()}
      >
        {t('share.action')}
      </button>

      {open ? (
```

Replace those lines with

```tsx
  return (
    /*
      A FRAGMENT AND NOT A WRAPPER (2026-08-30). `ReadingActions`'s `.row` is the flex
      container and this button is one of its three children; a `<div>` here would make
      it one child holding one button, and the `gap` would space two things instead of
      three. The hairline that used to live on `.footer` moved to `.row` with it.
    */
    <>
      <button
        ref={opener}
        type="button"
        className={className}
        /*
          THE NAME MOVED FROM THE LABEL TO `aria-label` AND THE STRING DID NOT CHANGE.
          `share.action` is still the one place `Bagikan` is written; a glyph with no
          accessible name is a control a screen reader announces as "button".
        */
        aria-label={t('share.action')}
        onClick={() => void openSheet()}
      >
        <ShareMark />
      </button>

      {open ? (
```

**3d.** Close it. The component's final `</div>` (the one that closes `styles.footer`, immediately after the `{open ? (…) : null}` block) becomes `</>`.

**3e.** Add the mark, at the end of the file, beside `previewReadingView` and the other helpers:

```tsx
/**
 * A page leaving through the top of a tray -- the share glyph both platforms this
 * app runs on already use, so it needs no label to be understood.
 *
 * Constructed exactly like `ChatMark` and `LotusMark`: `currentColor`, `aria-hidden`,
 * `focusable="false"`, stroke 1.2, viewBox 24. **There is not a hex in this function**
 * and the circle's own hover colours drive it.
 */
function ShareMark() {
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
      {/* The tray, open at the top. */}
      <path d="M8.2 10.6H6.4C5.8 10.6 5.4 11 5.4 11.6V19C5.4 19.6 5.8 20 6.4 20H17.6C18.2 20 18.6 19.6 18.6 19V11.6C18.6 11 18.2 10.6 17.6 10.6H15.8" />
      {/* The page, leaving. */}
      <path d="M12 14.2V4.2" />
      <path d="M8.6 7.6L12 4.2L15.4 7.6" />
    </svg>
  );
}
```

**Do not touch anything else in this file.** `ShareFooter.test.ts` asserts `onClick={() => void openSheet()}` verbatim, a fetch/timeout count, and several regexes over the sheet body — all of which survive the edits above unchanged.

## Step 4 — `src/components/ShareFooter.module.css`

Delete `.footer`, `.action`, `.action:hover` and `.action:focus-visible` (the first four rules after the header). In their place:

```css
/*
 * ── THE TRIGGER LEFT THIS FILE (2026-08-30) ────────────────────────────────
 *
 * `.footer` (the hairline) and `.action` (the outlined `BAGIKAN` chip) are DELETED.
 * The control is now an icon in `ReadingActions`'s row, which owns both the hairline
 * and the circle -- see `ReadingActions.module.css`. Deleted rather than left behind
 * as dead rules, because a `.footer` still sitting here is what somebody re-mounts a
 * second share control from.
 *
 * Only the glyph's size stays, because the glyph stays. `LotusMark.module.css` is
 * the precedent: a mark owns its own dimensions and the button owns everything else.
 */
.mark {
  width: 22px;
  height: 22px;
}
```

Also amend the z-index ladder comment in the header — the line reading

```
 *   ShareFooter's sheet 1000  (the same rung as AccountMenu, and it cannot
 *                              collide: the account button is not mounted on the
 *                              draw screen at all, and the two sheets are opened
 *                              from different screens)
```

becomes

```
 *   ShareFooter's sheet 1000  (the same rung as AccountMenu, and since 2026-08-30
 *                              the two ARE opened from the same screen -- both
 *                              triggers sit in `ReadingActions`'s row. They still
 *                              cannot collide: each is rendered only while its own
 *                              `open` state is true, and neither trigger is reachable
 *                              behind the other's scrim, which covers the viewport.
 *                              **The old reason -- "the account button is not mounted
 *                              on the draw screen at all" -- is now FALSE and is
 *                              corrected rather than left standing.**)
```

## Step 5 — `src/components/AccountButton.tsx`

**5a.** Widen the surface union:

```ts
/**
 * Where the button was tapped from. Closed, because `account.opened.surface` is.
 *
 * **`'draw'` AND `'history_detail'` SINCE 2026-08-30**, when `ReadingActions` put an
 * account control under a finished reading on both screens that render one. They are
 * two values rather than one because a querent on the draw screen has just taken a
 * reading and one on `/history/[id]` is looking one up, and folding them would make
 * the only interesting comparison unaskable.
 */
export type AccountSurface =
  | 'reader_picker'
  | 'service_picker'
  | 'account'
  | 'history'
  | 'draw'
  | 'history_detail';
```

**5b.** Add the prop and use it:

```tsx
export function AccountButton({
  surface,
  showLanguage,
  className,
}: {
  surface: AccountSurface;
  /** `localeSwitcherEnabled()`, resolved by the mounting server page. See AccountMenu. */
  showLanguage: boolean;
  /**
   * **PLACEMENT, AND A CALLER THAT SUPPLIES IT TAKES OVER ALL OF IT (2026-08-30).**
   *
   * `styles.button` is the CORNER: `position: fixed`, the safe-area insets, the
   * z-index rung. `ReadingActions` mounts this control in the page flow instead and
   * hands in `.circle`, which is the same eight visual declarations with the four
   * corner-specific ones removed.
   *
   * A `className` rather than a `placement: 'corner' | 'inline'` enum, because a
   * second placement would need its own rules in THIS stylesheet -- and the row
   * already defines them for the two other controls beside this one. One copy of the
   * circle, in the file that draws the row.
   *
   * **A CALLER SUPPLYING THIS MUST KEEP THE 44px TARGET.** It is the only thing this
   * component gives up by accepting the prop.
   */
  className?: string;
}) {
```

and on the `<button>`:

```tsx
        className={className ?? styles.button}
```

Everything else in this file is unchanged, including the fixed-position header — which is still correct for the default and now reads as documentation of what a caller replaces.

**Do not delete `.button` or `.mark` from `AccountButton.module.css`.** `chatSurface.test.ts` asserts that stylesheet still contains `width: 44px` and `right: calc(10px +`, holding it in step with `corner` in `tokens.ts`.

## Step 6 — `src/lib/analytics/events.ts`

Widen one prop union. Nothing is added to the name list and the ceiling test's count does not move.

```ts
  /*
   * V4. `surface` is a CLOSED UNION AND NOT A PATHNAME (rule 2: no unbounded
   * cardinality). It costs nothing to be exact, because the button is mounted
   * per page and each mounting page passes its own -- there is no pathname to
   * parse and no `/[reader]` to explode into three values.
   *
   * **SIX SINCE 2026-08-30, AND IT IS A WIDENING RATHER THAN A NEW NAME.**
   * `ReadingActions` mounts the account control under a finished reading on the two
   * screens that render one. `'draw'` is the post-reading draw screen -- never a
   * streaming one, because the row is inside the host's `status === 'done'`
   * condition -- and `'history_detail'` is `/history/[id]`. The name, the row shape
   * and `sanitizeProps()` are untouched, so no historic row changes meaning.
   */
  'account.opened':            { surface: 'reader_picker' | 'service_picker' | 'account' | 'history'
                                          | 'draw' | 'history_detail' };
```

## Step 7 — `src/components/AttachReadingLink.module.css`

**Colours only. Do not touch `.wrap` — that is phase 2.**

Replace the header's `── SECONDARY, AND ShareFooter's CONTROL IS TOO. NEITHER MAY BE FILLED ──` section with:

```
 * ── IT IS THE FILLED ONE NOW (2026-08-30, Miftah's ruling) ──────────────────
 *
 * This block used to say that neither this control nor `ShareFooter`'s may be
 * filled, because *two filled gold buttons under a reading is two primaries* -- and
 * it ended by saying that if a release ever wanted one of them emphasised, that was
 * *"a decision about which, made once, in both files."* **This is that decision, and
 * `Bahas di grup` is the one**: the group is this product's edge and it is the one
 * control here that opens something the querent cannot get anywhere else.
 *
 * **THE OLD PREMISE IS GONE RATHER THAN OVERRULED, WHICH IS WHY THIS IS SAFE.**
 * `Bagikan` is no longer a button with a word in it -- it is one of three icons in
 * `ReadingActions`'s row, below this control. There are not two primaries under a
 * reading; there is one, and a row of chrome.
 *
 * The fill is `ShareFooter`'s `.primary` pair, token for token: `--gold-wash` over
 * `--gold-border` in `--gold-text`, lifting to `--gold-wash-strong` / `--gold-pale`.
 * NO NEW HEX. It is deliberately NOT `--gold` itself: gold at full strength means
 * "a card goes here" on the draw screen and nothing else in this app fills with it.
```

Then the rule itself:

```css
/* Filled, and the ONE emphasised control under a reading. The 44px minimum is the
   iOS target floor -- `PublicShare`'s 36px is a known defect and is not the thing to
   copy. */
.action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 12px 28px;
  border: 1px solid var(--gold-border);
  border-radius: var(--radius-chip);
  background: var(--gold-wash);
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-button);
  text-transform: uppercase;
  color: var(--gold-text);
  text-decoration: none;
  cursor: pointer;
}

.action:hover {
  background: var(--gold-wash-strong);
  color: var(--gold-pale);
  border-color: var(--gold-border);
}
```

`.action:focus-visible` and `.hint` are unchanged.

## Step 8 — `src/app/[reader]/[service]/Draw.tsx`

**8a.** Swap the import at line 10:

```ts
import { ReadingActions } from '@/components/ReadingActions';
```

replacing `import { ShareFooter } from '@/components/ShareFooter';`. Keep the `AttachReadingLink` import.

**8b.** In the `reading.status === 'done' && …` block, `<AttachReadingLink readingId={finished.current.id} from="draw" />` is unchanged. Replace the whole `<ShareFooter … />` element with:

```tsx
        {/*
          2026-08-30. THE SAME SHARE SHEET, NOW ONE ICON IN A ROW OF THREE.

          **`showLanguage` IS NOT PASSED AND MUST NOT BE**, so this file does not
          acquire a `localeSwitcherEnabled()` prop it could only ever pass as `false`.
          `ReadingActions` suppresses the Language row for `surface === 'draw'` in
          code -- roadmap §7 trap 4, whose whole point is that `readings.locale` is
          permanent and `router.refresh()` keeps the finished prose in state. See that
          component's header, and `accountSurface.test.ts` for the assertion.

          The row inherits this block's three clauses exactly. A Home tap unmounts
          `Draw`, which aborts an in-flight reading and records
          `reading.aborted { reason: 'user' }` -- so a row one character wider than
          `status === 'done'` is a button that destroys the thing it sits under.
        */}
        <ReadingActions
          surface="draw"
          share={{
            entity: 'reading',
            entityId: finished.current.id,
            preview: {
              id: finished.current.id,
              readerId: reader.id,
              serviceId: service.id,
              localDate: finished.current.localDate,
              createdAtIso: finished.current.atIso,
              locale: t.locale,
              status: 'ok',
              /*
               * DERIVED WITH THE SAME PURE FUNCTION THE SERVER USES, not guessed and
               * not parsed out of the prose. `effectiveYesNo` is what stored
               * `readings.verdict` at draw time, including the reversal flip, so the
               * preview and the public page cannot disagree -- and `null` for every
               * service that is not `yesno`, which is what the column holds.
               */
              verdict: verdictFor(service, finished.current.cards),
              question: finished.current.question,
              /*
               * LIFTED OFF THE STREAM AND NOT DERIVED, which is the one asymmetry with
               * `verdict` directly above. There is no pure function of the cards that
               * yields `ayam`: the option is a word out of this querent's question and
               * only the model chose between them. Already validated against the
               * question when it was captured.
               */
              choice: finished.current.choice,
              body: reading.text,
              sharedAt: null,
              cards: finished.current.cards.map((d, i) => ({
                cardId: d.card.id,
                reversed: d.reversed,
                position: i,
              })),
            },
            /*
             * `{ kind: 'original' }` AND NOT A GUESS. A reading generated on this
             * screen came out in `t.locale` -- the language the querent is reading
             * right now -- so the pin will equal the source, there is nothing to
             * translate and nothing to look up. `previewReadingView` maps this to
             * `as-written`, which is exactly what the public page will render.
             */
            prose: { kind: 'original' },
            nickname,
          }}
        />
```

## Step 9 — `src/app/history/[id]/HistoryDetail.tsx`

**9a.** Swap the import at line 44 to `import { ReadingActions } from '@/components/ReadingActions';`.

**9b.** Add the prop to the component signature, beside `nickname`:

```tsx
export function HistoryDetail({
  reading,
  cachedTranslation,
  nickname,
  showLanguage,
}: {
  reading: ReadingViewData;
  /** Read on the server from `translations`, so a second view has no spinner. */
  cachedTranslation: string | null;
  …nickname's existing declaration and comment, unchanged…
  /**
   * `localeSwitcherEnabled()`, resolved by `page.tsx` -- a non-`NEXT_PUBLIC_`
   * variable inlines as `undefined` in a client component, which is the trap
   * `localeSwitcherEnabled()`'s own header records.
   *
   * **THIS SCREEN KEEPS THE LANGUAGE ROW AND THE DRAW SCREEN DOES NOT**, and the
   * asymmetry is roadmap §7 trap 4: this page renders through `ReadingView`, whose
   * rule 4 and `refillView`'s `shownProse` exist precisely to handle a viewer reading
   * in a language the prose was not generated in. `Draw.tsx` holds finished prose in
   * React state with no translation path, so the same flip there strands it.
   */
  showLanguage: boolean;
}) {
```

**9c.** Replace the `<ShareFooter … />` element inside the `footer` slot with:

```tsx
            <ReadingActions
              surface="history_detail"
              showLanguage={showLanguage}
              share={{
                entity: 'reading',
                entityId: view.id,
                preview: view,
                /*
                 * **THE SAME `prose` THIS COMPONENT IS RENDERING, and it is what makes
                 * the sheet's "exactly what they will see" true rather than nearly
                 * true.** Since design A the link pins the locale being read and the
                 * public page renders that translation, so a sheet given only
                 * `preview` would show `reading.body` -- the Indonesian source --
                 * under a link that will show English. `previewReadingView` maps the
                 * five states; this mount just has to be honest about which one it is
                 * in.
                 */
                prose: shownProse,
                nickname,
              }}
            />
```

The surrounding condition (`view.status === 'ok' && view.body !== null`) and the `AttachReadingLink` above it are unchanged.

**9d.** Amend the comment block above `AttachReadingLink` that reads *"this page's ONLY route into the room — `C-D17` puts the chat button on `/history` and deliberately NOT on `/history/[id]` … Recorded so nobody 'fixes' it by adding a `ChatButton` here."* Append:

```
            **STILL TRUE AFTER 2026-08-30's ACTION ROW.** That row carries home, share
            and the account control, and deliberately NOT a `ChatButton`: `C-D17` is
            unchanged, and `Bahas di grup` directly above is this page's route into
            the room -- now the filled control, which is the emphasis a second badge
            would have competed with rather than added to.
```

## Step 10 — `src/app/history/[id]/page.tsx`

Add the import and pass the value:

```tsx
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
```

```tsx
      <HistoryDetail
        reading={reading}
        cachedTranslation={cached}
        nickname={nickname}
        /*
         * RESOLVED HERE, ON THE SERVER, AS A PROP. `LOCALE_SWITCHER` carries no
         * `NEXT_PUBLIC_` prefix, so reading it inside `HistoryDetail` -- a client
         * component -- yields `undefined` and silently hides the row. Every other
         * mount of the account control does exactly this.
         */
        showLanguage={localeSwitcherEnabled()}
      />
```

## Step 11 — `src/lib/i18n/locales/id.ts` and `en.ts`

One key each. `id.ts` owns the key set; write it there first and let TS2739 name the English gap.

In `id.ts`, immediately before `'reading.verdict.yes': 'Ya',`:

```ts
  /*
   * The home circle in `ReadingActions`. **IT NAMES THE DESTINATION, NOT THE GLYPH**
   * -- "Beranda" tells a screen-reader user nothing about what is there, and what is
   * there is the reader picker. Same rule as `chat.button.aria` ("Buka grup").
   */
  'reading.actions.home.aria': 'Kembali ke pilihan pembaca',
```

In `en.ts`, immediately before `'reading.verdict.yes': 'Yes',`:

```ts
  /* Rewritten, not translated -- see the Indonesian for the rule it follows. */
  'reading.actions.home.aria': 'Back to the readers',
```

**No key is added for the share icon.** `share.action` ("Bagikan" / "Share") moves from being the button's label to being its `aria-label`; a second string would be a second place to say one word.

## Step 12 — `src/components/accountSurface.test.ts`

The existing guard reads importers of `@/components/AccountButton` **by path**, and after this phase the draw screen imports `ReadingActions`, not `AccountButton`. Left alone the denylist would pass vacuously — a guard that is green because it can no longer see the thing it guards. Teach it the hop and record the amendment.

Replace the `describe('the account button', …)` block's mount derivation and its denylist test with:

```ts
describe('the account button', () => {
  /**
   * **TWO IMPORTS ARE A MOUNT SINCE 2026-08-30, AND MISSING THE SECOND WOULD HAVE
   * MADE THIS FILE GREEN AND BLIND.** `ReadingActions` mounts `AccountButton` under a
   * finished reading, so a page that imports the ROW mounts the BUTTON -- and the
   * draw screen imports only the row. A denylist that follows one import edge is not
   * a general solution; it is the one edge that exists, named, and it fails loudly if
   * a third intermediary appears, because that intermediary's importers will not be
   * on this list.
   */
  const DIRECT = importers(/from '@\/components\/AccountButton'/);
  const VIA_ROW = importers(/from '@\/components\/ReadingActions'/);
  const MOUNTS = [...new Set([...DIRECT, ...VIA_ROW])].sort();

  it('is mounted somewhere, so the denylist below is not vacuously passing', () => {
    expect(MOUNTS.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * **THE DRAW SCREEN LEFT THIS LIST ON 2026-08-30, AND THE REASON IT WAS ON IT IS
   * STILL TRUE.** Roadmap §7 trap 4: a language flip after a reading -- `router.refresh()`
   * keeps client state -- leaves the prose in one language and the chrome in another,
   * and `readings.locale` is permanent.
   *
   * What changed is which resolution is in force. `AccountButton`'s header rejected
   * *"suppress only the Language row"* because a suppression that holds only WHILE
   * STREAMING re-enables itself the instant the stream ends. `ReadingActions`
   * suppresses it PERMANENTLY for `surface === 'draw'`, reads no streaming state, and
   * is asserted by name in the next describe. **That assertion is now the load-bearing
   * one; if it is ever deleted, put `app/[reader]/[service]/` back on this list.**
   *
   * The rest have no session by design (`isPublic()`), except `/s/` -- which has
   * no session BECAUSE IT IS A STRANGER'S PAGE (V7, VD9).
   */
  it('is not mounted on any page without a session', () => {
    const FORBIDDEN = [
      'app/login/',
      'app/terms/',
      'app/privacy/',
      'app/onboarding/',
      'app/s/', // V7's public share page. Named before it exists.
      // S1's signed-out homepage. No session BY CONSTRUCTION: `page.tsx` renders
      // it only when `currentUser()` is null, so an account circle here would be
      // a control with nothing behind it.
      'app/Landing.tsx',
      'app/layout.tsx', // the mount seam is the owning page, never the root layout
    ];
    for (const prefix of FORBIDDEN) {
      expect({ [prefix]: MOUNTS.filter((p) => p.startsWith(prefix)) }).toEqual({
        [prefix]: [],
      });
    }
  });

  /**
   * The draw screen may reach the account control THROUGH THE ROW AND ONLY THROUGH
   * IT. A direct import there would be the un-suppressed button, which is the bug the
   * denylist above was written for.
   */
  it('never reaches the draw screen directly', () => {
    expect(DIRECT.filter((p) => p.startsWith('app/[reader]/[service]/'))).toEqual([]);
  });
});

describe('the reading action row', () => {
  const SOURCE = FILES.find((f) => f.path === 'components/ReadingActions.tsx');

  it('exists', () => {
    expect(SOURCE).toBeDefined();
  });

  /**
   * **ROADMAP §7 TRAP 4, AS AN ASSERTION.** This one line is the whole reason the
   * account control is allowed on the draw screen at all. Deleting it is a two-token
   * edit that looks like a simplification and strands a finished Indonesian reading
   * under English chrome, with nothing on screen looking wrong.
   */
  it('suppresses the language row on the draw screen, in code', () => {
    expect(SOURCE!.source).toMatch(/surface !== 'draw'/);
  });

  /** Both reading surfaces, and nothing else. R1b is half the requirement. */
  it('is mounted on exactly the two screens that render a whole reading', () => {
    expect(importers(/from '@\/components\/ReadingActions'/)).toEqual([
      'app/[reader]/[service]/Draw.tsx',
      'app/history/[id]/HistoryDetail.tsx',
    ]);
  });
});
```

The `LocaleSwitch`, `sign out` and `the account shell copy` describes are unchanged.

---

## Verification

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
cd /home/miftah/.worktrees/tarot_app/reading-action-row

npm run typecheck
npm test -- accountSurface ShareFooter i18n
npm test
npm run build          # DO NOT SKIP -- the TypeScript trap. Retry once on a
                       # `@vercel/turbopack-next/internal/font/google/font`
                       # resolution failure; that is the AAAA trap, not the code.
```

Then loop 4 and loop 5 — a green suite cannot see any of this:

```sh
npm run db:up && npm run dev            # http://localhost:3001
bash tools/e2e/run.sh                   # see .claude/skills/, E2E_BASE=http://localhost:3001
```

What to check by eye, on both `/[reader]/[service]` after a reading and on `/history/<id>`:

1. Three circles, centred, 8px apart, each 44px, matching the corner chrome on `/history` when you flip between the two screens.
2. Home lands on the reader picker. Share opens the sheet with the same preview as before. The lotus opens `AccountMenu`.
3. **On the draw screen the menu has no Language row; on `/history/[id]` it does.** This is the assertion that matters most and the one a unit test can only approximate.
4. `BAHAS DI GRUP` is filled and is the brightest control in the tail.
5. Nothing above the row moved. The tail's vertical rhythm must be pixel-identical to `main` — that is phase 2's job, and a difference here means `.row` did not copy `.footer`'s two margins.

**Loop 6 (a real iPhone) is the honest gate for the row**: three 44px targets 8px apart is exactly the geometry a thumb answers and WSL does not.

## Rollback

`git revert` this phase's commit. Nothing here is persisted; `events` rows already written with `surface: 'draw'` are harmless, since `sanitizeProps()` accepts any scalar and no query filters on that union.

---

## As built — 2026-08-30

The eleven files above landed as written. **Three files the plan did not name had to change,
and all three are the same failure: a guard written against `<ShareFooter>` by name, or against
`HistoryDetail.tsx`'s module graph, on a screen where both just moved.** Recorded here because
each one would otherwise have gone green and blind rather than red.

### 1. `src/app/history/[id]/refillView.ts` — NEW, and it is an extraction, not a design change

`HistoryDetail.test.ts` imports `refillView` **at runtime**, and the unit project runs in plain
Node with no Next compiler — so importing the component imports everything it imports,
transitively. `ReadingActions` -> `AccountButton` -> `AccountMenu` -> `@/lib/auth/actions` ->
`next-auth`, whose `'use server'` directive is inert under Vitest. The suite died on
`Cannot find module 'next/server'`, naming a package `refillView` has never heard of.

**`refillView` and its `Refill` type moved into their own pure module**, and the test imports
that. Nothing about the function changed — same body, same header, same truth table. This is the
separation the test file's own header already argued for (*"the component itself is unreachable
from the unit project"*), taken one file further; that header now says so.

**The rejected alternative was aliasing `next/server` in `vitest.config.ts`.** One line, and
wrong: it would have made the unit project able to load `next-auth`, which is a capability no
test here wants and which hides the next component that acquires a server graph by accident.

### 2. `src/components/attachSurface.test.ts` — two renames and one named exception

- Two ordering assertions pinned *"the private action above the public one"* with
  `src.indexOf('<ShareFooter')`. That element no longer appears on either screen, so both read
  `-1` — **the assertion would have passed vacuously the moment the name changed**, had the
  comparison run the other way. Both now index `<ReadingActions`, which is what those screens
  mount. The rule is unchanged; only the name it looks for moved.
- `[F6-11]`'s chat sweep filters `^components/(Chat|Reading|Staged)\w+\.tsx$`, written to reach
  `ReadingAttachment.tsx`, and it catches `ReadingActions.tsx` by accident — which mounts
  `ShareFooter` because that is what it is for. **`ReadingActions.tsx` is named in a `NOT_CHAT`
  list rather than the regex being narrowed**, so the sweep still fails on any other new
  `Chat*` / `Reading*` / `Staged*` component that grows a share control.

### 3. `AccountButton.tsx`'s header said the button is not on the draw screen

Step 5 said *"everything else in this file is unchanged"*. That left a section headed
**`NOT ON THE DRAW SCREEN`** standing in the file that had just been put there, which is exactly
the class of stale sentence `CLAUDE.md` warns about. It is **corrected rather than deleted** —
its three numbered points are all still true and are why the permanent suppression is the only
safe shape — and it now names `accountSurface.test.ts` as what holds it.

### Verification actually run

```
npm run typecheck                     clean
npm test                              204 files, 3946 tests, all passing
npm run build                         compiled; audit-secrets clean (66 files, 87 needles)
```

Loop 5, against `npm run dev` at 390x844 (Chrome reports `innerWidth: 500` — CLAUDE.md's
standing caveat), on a real completed `daily` reading and on `/history/<id>`:

- Three controls, `<a>` + `<button>` + `<button>`, **44.0 x 44.0 each, at x = 176 / 228 / 280 —
  8px apart**, centred in a 468px row (centre 250 = row centre). No horizontal overflow.
- Labels: `Kembali ke pilihan pembaca`, `Bagikan`, `Buka menu akun`.
- **The account menu on the draw screen: `AKUN / Tentang kamu / Riwayat bacaan / Galeri kartu /
  Tulisan / Keluar` — NO `Bahasa` row.**
- **The account menu on `/history/[id]`: the same list WITH `Bahasa  ID · EN`.**
  That asymmetry is the check the plan called the one that matters most, and it is measured.
- `BAHAS DI GRUP` renders filled, and is the brightest control in the tail.

**Loop 6 is NOT done and is still the honest gate**: three 44px targets 8px apart is thumb
geometry, and WSL cannot answer it.

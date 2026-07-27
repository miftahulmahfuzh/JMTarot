# V4 — The Account Shell Implementation Plan

> ### AMENDED 2026-07-27 AFTER RECONCILIATION — READ BEFORE THE PLAN BELOW
> `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` outranks this file.
>
> **THE MENU HAS FOUR ITEMS, NOT THREE. SIGN OUT IS YOURS AND IT SHIPS IN
> v0.3.0.** You found that the app has no sign-out control at all — that
> `auth.signed_out` has been in the closed taxonomy since W4 and nothing has ever
> fired it — and you flagged it rather than leaving it between two workstreams.
> Miftah's ruling: build it. Everywhere this plan says "three things and only
> three", it is now four: **User Details**, **Language**, **History**, **Sign
> out**. Notes for the implementation:
>
> - `signOut` is already exported from `src/lib/auth/auth.ts`. Use it via a
>   server action or `next-auth/react`'s client helper; do **not** hand-clear the
>   cookie, and do not add a `/api/auth/logout` route — W2 deleted that route
>   deliberately (reconciliation R10) and a second session-clearing path is
>   exactly the shape that makes holes.
> - **Fire `auth.signed_out` before the redirect**, not after. `track.client`
>   flushes on the hide path with `sendBeacon`, but a full navigation to `/login`
>   races the debounce; this is the one event where the 2s buffer is the enemy.
> - Sign out is **visually separated** from the other three and is not styled as
>   destructive — deleting the account is destructive, signing out is not, and
>   making them look alike on one sheet is how someone taps the wrong one.
>   V8 owns `--danger`; do not borrow it here.
> - Two catalog keys, both locales: `account.menu.signOut` and whatever
>   confirmation you decide it needs (it probably needs none — it is reversible).
>
> **Everything else in this plan is accepted as written**, including the two
> decisions it was asked to make and justify:
> - **Per-page mount, not `src/app/layout.tsx`** (§5.10). Your argument that a
>   layout cannot see the pathname — so suppression would need a hand-maintained
>   second copy of `isPublic()` — is the one that settled it.
> - **No account button on `/[reader]/[service]` at all.** Your reframing is
>   adopted into the roadmap: `LocaleSwitch`'s header is about *permanence*, not
>   streaming, and `router.refresh()` keeps client state, so a flip *after* the
>   stream still leaves English chrome over a finished Indonesian reading.
>
> **One requirement added by V5** (§5.10): the bottom sheet's backdrop must be
> `position: fixed` **and set `touch-action: none`**, or a horizontal drag meant
> for the sheet lands in V5's scroll-snap track underneath it. **V5 lands first**
> in `src/app/[reader]/page.tsx`; your edit is one import and one line on top.
>
> **`src/app/page.tsx` is yours** — §8 of the roadmap left it unowned and the
> reconciliation assigns it to you, footer removal and the 28px → 64px `.shell`
> padding included.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** One circular account control, top right, on every signed-in screen that
is not the draw screen. It opens a bottom sheet holding three things and only
three: **User Details** (`/account`, V8), **Language** (an inline `EN · ID`
toggle), and **History** (`/history`, V6). The language switcher leaves the page
footer everywhere except `/login`.

**Architecture:** Two new client components (`AccountButton`, `AccountMenu`), one
rewritten header and one new prop on `LocaleSwitch`, seven new catalog keys, two
new event names, and **no new mount point in `src/app/layout.tsx`**. The seam is
the one this codebase already uses for anything that needs to know there is a
user: *the owning server page mounts it.* That single decision is what makes the
draw-screen suppression structural rather than stateful, keeps `auth()` out of
the root layout, keeps `/terms`, `/privacy` and V7's `/s/[slug]` clean by
construction, and reduces V6's and V8's integration cost to one line each.

**Tech Stack:** Next 16 App Router, React 19, CSS Modules, `src/theme/tokens.css`.
No new dependencies — this project has none for UI and must not acquire any. No
popover library, no focus-trap library, no `@headlessui`. Vitest for the
source-level fences; a 390px iframe harness under `public/cards/` for the only
visual loop this machine has.

---

**Status:** planning. Nothing here is built yet.
**Date opened:** 2026-07-27.
**Owns:** `src/components/AccountButton.tsx`, `src/components/AccountMenu.tsx`,
`src/components/LocaleSwitch.tsx` (relocation, R1), the `account.*` catalog
namespace, `account.opened` / `account.details_viewed`, and the mount lines in
`src/app/page.tsx` and `src/app/[reader]/page.tsx`.
**Parent contract:** `PUBLIC_RELEASE_ROADMAP_v0.3.0.md`. R1, VD12 and §7 trap 4
are the mandate. Where this file and that one disagree, that one wins and this
file is wrong. Everything in `CLAUDE.md` and the v0.2.0 documents still binds.

---

## 1. The four decisions this plan makes

Everything else in the file falls out of these. Each one had a plausible
alternative and each alternative is written down, because the alternatives are
what a future session will reach for.

### 1.1 The mount seam: the owning server page, not the root layout

**`src/app/layout.tsx` is the obvious host and it is the wrong one.** Three
reasons, in increasing order of how much they cost.

The cheap one: `src/lib/auth/server.ts` and `src/lib/auth/viewer.tsx` both carry
an explicit, capitalised rule against calling `currentUser()` in the root layout.
Its original justification — that it would make `/terms` and `/privacy` dynamic —
is *partly* spent, because W6's `getLocale()` already opts the whole tree into
dynamic rendering and CLAUDE.md says the ● → ƒ flip is correct. What survives is
the real cost: a JWE decrypt on **every** request the app serves, including the
two legal pages a stranger loads and V7's brand-new public `/s/[slug]`. Paying
that to position one circle is the wrong trade, and it is invisible until someone
profiles a cold start.

The middling one: **a layout cannot see the pathname.** To suppress the button on
`/login`, `/terms`, `/privacy`, `/onboarding` and `/s/[slug]` from the root
layout, you need an allowlist or a denylist matched against a pathname forwarded
by middleware in a header. That is a second copy of `isPublic()` in a different
shape, kept in step by hand, whose failure mode is an account button rendered on
a stranger's share page — a control that either 404s or, worse, hints at an app
the viewer is not signed into.

The expensive one: **a route group is worse.** `src/app/(app)/layout.tsx` with
`page.tsx`, `[reader]/`, `account/` and `history/` moved inside it is the textbook
answer, and here it means moving directories that V5, V6 and V8 are creating or
editing *this week*, in parallel, against a §6 module map that fixes
`src/app/account/page.tsx` and `src/app/history/page.tsx` at those exact paths. A
route group would contradict the contract and produce the ugliest merge in the
release. **Do not create one.**

**So: each owning server page renders `<AccountButton …/>` itself.** This is
`ViewerProvider`'s stated rule verbatim ("the provider is mounted by the SERVER
PAGE that owns the client subtree, never by `src/app/layout.tsx`") and the same
shape as `FrequencyLine` and `DaySummary`, which are mounted per page for the
same family of reason.

Three properties fall out, and they are the whole argument:

1. **The suppression list becomes structural.** A page that does not mount it
   does not have it. There is no denylist to forget and no pathname to parse.
   V7's `/s/[slug]` cannot accidentally acquire an account button, because
   acquiring one would be an import V7 would have to type on purpose.
2. **No auth read is added anywhere.** `/`, `/[reader]`, `/account` and
   `/history` are all outside `isPublic()`, so `src/middleware.ts` has already
   proved there is a signed-in, onboarded user before the page renders. **The
   mount is the session check.** The button reads no session, takes no `Viewer`,
   and needs no `ViewerProvider` — which is just as well, because nothing in the
   tree currently mounts one.
3. **It stays one line.** The component is `position: fixed` and owns its own
   placement completely, so a mounting page adds an import and a line and
   changes no CSS. That is what makes the per-page seam cheap enough to be
   honest rather than a tax V6 and V8 will resent.

The one thing the mounting page must supply beyond `surface` is
`showLanguage={localeSwitcherEnabled()}`. `LOCALE_SWITCHER` carries no
`NEXT_PUBLIC_` prefix, so inside a `'use client'` module the bundler inlines
`undefined` and the flag silently stops working — `resolve.ts`'s own header
records that it lived in `LocaleSwitch.tsx` for about ten minutes. The two
existing callers are both server pages; this makes it four, all server pages,
which is the only place the function is meaningful.

### 1.2 What is in the circle: a lotus mark, not an initial and never an avatar

**Not the Google avatar.** Reconciliation R21 removed `picture` from the token
deliberately, to avoid a CSP `img-src` exception for a decorative element, and
CLAUDE.md records the 548-vs-676-byte cookie measurement behind it. Reintroducing
it would undo a decision that was measured. It is also the only remote request
the app would make outside `/login`'s inlined `GoogleMark`.

**Not an initial either, and this is the less obvious half.** `users.display_name`
is in the token and is free, so an initial is technically available. It is wrong
for two reasons. First, it would be the **only** place in the app where the
*Google account identity* surfaces: the name this app calls the querent by is the
**nickname** from onboarding — `onboarding.facts.nickname.hint` literally says
"Ini yang akan dipakai pembacamu" — and that lives in `profiles`, which a render
path may not read (roadmap §6, first non-negotiable). A circle showing `M` for a
Google display name of `Miftahul` while every reader on screen says `Mift` is the
app disagreeing with itself about who the user is. Second, a lettered circle at
the top right of a phone screen reads as Gmail. This app's visual language is gold
hairlines, Cinzel small caps and no avatars anywhere.

**So: a mark.** Specifically **a lotus**, inline SVG, stroked in `currentColor`
so it takes the gold tokens. It needs no data, no CSP exception and no session;
it is the app's own existing symbol for the querent's inner shape
(`onboarding.lotusName` — "Teratai Batin"); and it points at exactly what
`/account` will hold, since V8's deliverable is literally the Inner Heavenly
Lotus persona. Inline rather than fetched, following `GoogleMark`'s precedent and
the strict no-external-hosts posture.

The discoverability risk is real and is named in `## Open questions`: a lotus does
not say "account". Three things mitigate it — a 44px circle in the top-right
corner is a near-universal account affordance whatever is inside it, the
accessible name comes from `aria-label` and not from the glyph, and the sheet it
opens is titled. If it turns out not to be found, the fallback is the *nickname's*
initial, which costs a profile read on the render path and is therefore a real
decision rather than a tweak.

### 1.3 A bottom sheet, not a dropdown

A popover anchored to a 44px circle in the top-right corner is the wrong shape for
this app, and the reasoning is not aesthetic.

- **It is the worst place on a phone to put three tap targets.** The button sits
  at the top-right corner of a 390×844 screen — the furthest point from a right
  thumb and unreachable for a left one. A menu that opens *from* there keeps its
  contents there. A bottom sheet puts them in the thumb arc.
- **The corner is contested chrome.** In iOS standalone mode with
  `viewport-fit=cover` the status bar is black-translucent, so the top-right is
  where the clock, the battery and the Dynamic Island live. An anchored panel has
  to negotiate with `env(safe-area-inset-top)` *and* with the notch cutout; a
  bottom sheet negotiates with one inset, `env(safe-area-inset-bottom)`, which is
  a flat home-indicator strip.
- **An anchored panel needs anchoring maths.** Position, flip, collision detection,
  reposition on scroll and on orientation change. A bottom sheet is
  `position: fixed; inset: 0; align-items: flex-end` and needs none of it, and
  this project has already been bitten once by hand-rolled pointer geometry (the
  `setState`-updater trap that made the fan silently dead in development).
- **There is already exactly one modal idiom here and this is it.**
  `CardDetail.module.css` is a fixed scrim at `rgba(10,8,18,0.94)` with
  `backdrop-filter: blur(6px)`, a `rise` keyframe on `--ease-card`, and a
  `prefers-reduced-motion` kill switch. `AccountMenu` is that file with
  `align-items: flex-end` instead of `center`. Inventing a second overlay idiom
  for three rows would be two idioms to keep in step.

`CardDetail` establishes the behaviour too: `role="dialog"`, `aria-modal="true"`,
`aria-labelledby`, Escape to close, click-outside on the scrim with
`stopPropagation` on the sheet, `document.body.style.overflow = 'hidden'`, and
focus restored to the opener on unmount. **This adds one thing `CardDetail` does
not have: a real Tab trap.** `CardDetail` is reached from a card in the middle of
a long page, so tabbing past it is survivable. This is reached from the topmost
control on the screen — tab out of it and focus lands in the browser chrome, and
a keyboard user does not come back.

### 1.4 The draw-screen collision (roadmap §7 trap 4)

**Resolution: there is no account button on `/[reader]/[service]` at all.** Not a
disabled Language row — no button.

The roadmap offers two options. Option A, suppressing the Language item while a
reading streams, loses on three counts.

**A does not actually satisfy the invariant.** `LocaleSwitch`'s header is not
about streaming, it is about permanence: *"A reading keeps the locale it was
generated in, permanently."* Option A re-enables the toggle the instant the
stream ends — and the finished Indonesian prose is still on the screen. Worse,
the same header explains why the flip would not clear it: `router.refresh()` is
used **precisely because** it "re-fetches the RSC payload and keeps client
state". The reading text is `useState` inside `Draw.tsx`. So a post-stream flip
to `EN` re-renders the chrome in English and leaves the Indonesian reading sitting
underneath it, untouched — the exact failure the invariant forbids, arriving three
seconds after Option A stops guarding. To close that, A would have to suppress
from the first pick until navigation away, which is Option B with extra
machinery.

**A's mechanism is silent when it breaks.** The button is mounted by the server
page; `reading.status` lives in a client component below it. Wiring the two means
a context provider threaded through `Draw.tsx`, or lifting the reading state up
into the page, or an event bus. Every one of those fails the same way: the flag
desyncs, the row renders, somebody taps `EN` mid-stream, and nothing logs
anything. A suppression you cannot forget beats a flag you can — and with the
§1.1 seam, B costs nothing to implement, because `[reader]/[service]/page.tsx`
simply never imports the component.

**And the whole menu is wrong on that screen, not just the Language row.** The
other two items navigate *away*. `Draw.tsx` aborts on unmount
(`useEffect(() => () => abortRef.current?.abort(), [])`), so tapping History
mid-reading kills the reading and records `reading.aborted`. A one-tap route off a
streaming page, sitting in the corner of that page, is a footgun regardless of
what the Language row is doing.

**The cost to the user is one tap.** The draw screen already has a back link to
`/[reader]`, which has the button. Nobody changes interface language mid-draw; that
choice is made before the cards come out. And v0.3.0 fixes the actual underlying
want in the right place: VD7/VD8 make an old reading reachable in the other
language from `/history`, as a **derived translation row**, with the original
never overwritten. The draw screen is the live-generation surface and stays
locale-frozen; translation is history's job.

**The guard against this being undone** is `src/components/accountSurface.test.ts`
(Task 6), a source-level denylist in the `clientBoundary.test.ts` idiom, plus the
component's own header. The denylist names `app/s/` *before V7 builds it*, so V7
learns the rule from a red test rather than from a code review.

---

## 2. Copy

Seven new keys. `id.ts` first, always — the red typecheck is the checklist.

### 2.1 `src/lib/i18n/locales/id.ts`

```ts
  // ==========================================================================
  // V4 — the account shell.
  //
  // "Tentang kamu" AND NOT "Detail Pengguna". VD12 fixes what the item IS
  // (`/account`, V8); the wording is this file's job, and V8's page is the
  // querent's persona, their facts and the deletion button -- not a settings
  // form. "Detail Pengguna" is the register of a bank app and this is the
  // screen that tells someone which card the universe keeps handing them.
  // ==========================================================================
  'account.button.aria': 'Buka menu akun',
  'account.menu.title': 'Akun',
  'account.menu.details': 'Tentang kamu',
  'account.menu.language': 'Bahasa',
  'account.menu.history': 'Riwayat bacaan',

  // The SHORT tags, for the two-item toggle inside the menu (R1/VD12). The long
  // names in `locale.name.*` stay exactly as they are and stay on /login -- see
  // LocaleSwitch's header for why both are correct in the place each applies.
  // Identical across catalogs for the same reason `locale.name.*` is: a
  // language's own tag is written the same way whoever is reading it.
  'locale.code.id': 'ID',
  'locale.code.en': 'EN',
```

### 2.2 `src/lib/i18n/locales/en.ts`

```ts
  // ==========================================================================
  // V4 — the account shell. See id.ts for why "About you" and not "User
  // details".
  // ==========================================================================
  'account.button.aria': 'Open account menu',
  'account.menu.title': 'Account',
  'account.menu.details': 'About you',
  'account.menu.language': 'Language',
  'account.menu.history': 'Reading history',

  'locale.code.id': 'ID',
  'locale.code.en': 'EN',
```

`common.close` already exists in both and is reused for the sheet's dismiss
button. `locale.switch.aria` already exists and is reused as the toggle group's
label — the menu does not need a second one.

### 2.3 `src/lib/i18n/catalog.test.ts`

`locale.code.id` and `locale.code.en` are byte-identical across catalogs and must
join `SAME_ON_PURPOSE`, with the reason written next to the existing
`locale.name.*` entries. **Nothing else joins it.** `account.menu.title`
(`Akun` / `Account`) and the other four differ, and if a future edit makes one of
them identical, that test firing is correct.

---

## 3. Tasks

Prefix every npm call:

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
```

---

### Task 1: The catalog keys

**Files:** `src/lib/i18n/locales/id.ts`, `src/lib/i18n/locales/en.ts`,
`src/lib/i18n/catalog.test.ts`

1. Add the seven Indonesian keys from §2.1 at the end of `id.ts`, above the
   closing `} as const satisfies Record<string, string>;`, with the comment
   block.
2. **Run the typecheck before writing English.** It must be red with TS2739
   naming all seven — that red is the mechanism, and seeing it once is worth
   more than trusting it.

   ```sh
   export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
   npm run typecheck    # EXPECT: red, seven missing keys in en.ts
   ```

3. Add §2.2 to `en.ts`. Typecheck green.
4. Add `'locale.code.id'` and `'locale.code.en'` to `SAME_ON_PURPOSE` in
   `catalog.test.ts`, extending the existing comment rather than adding a second
   one.

**Verify:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test -- i18n
```

All five catalog assertions pass, including the no-identical-English one.

---

### Task 2: The two event names

**Files:** `src/lib/analytics/events.ts`

`EVENT_NAMES`, after the `— locale (W6) —` block:

```ts
  // — the account shell (V4) —
  'account.opened',
  'account.details_viewed',
```

`EventMap`, in the matching position:

```ts
  /*
   * V4. `surface` is a CLOSED UNION AND NOT A PATHNAME (rule 2: no unbounded
   * cardinality). It costs nothing to be exact, because the button is mounted
   * per page and each mounting page passes its own -- there is no pathname to
   * parse and no `/[reader]` to explode into three values.
   */
  'account.opened':            { surface: 'reader_picker' | 'service_picker' | 'account' | 'history' };
  /*
   * V4 DECLARES THIS AND V8 FIRES IT, from `/account` via `TrackView`. Declared
   * here because V4 lands first and a forward declaration costs nothing, and
   * because §6 wants every name in this file with a prop shape so the count
   * reaches 59. V8 owns the page and may widen the shape in its own plan; it is
   * the sole firer, so that is not a shared-file conflict.
   *
   * `from` is derived in the browser the way `ReaderViewed` derives
   * `reader.viewed.from`: the server never sees a Referer on a client-side
   * navigation, and "reached from the menu" and "reached from a bookmark" are
   * two different facts about whether the shell is discoverable.
   */
  'account.details_viewed':    { from: 'menu' | 'direct' };
```

Two things the file's own rules force and one this plan chose:

- No free text, no unbounded cardinality — both shapes are closed unions.
- The menu items are plain `<Link>`s, **not `TrackLink`s**. The destination pages
  own their view events (`account.details_viewed` for V8, `history.viewed` for
  V6). Firing a click event from the menu *and* a view event from the page would
  double-count the only funnel this feature has.

**Verify:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck    # the two compile-time exhaustiveness guards at the file's
                     # foot are what prove the name and the shape agree
npm test
```

---

### Task 3: `LocaleSwitch` — the relocation, and the header that explains it

**Files:** `src/components/LocaleSwitch.tsx`, `src/components/LocaleSwitch.module.css`

`variant` is **required**, not defaulted. Both call sites then have to declare
intent, and R1's relocation is visible at both of them in the diff.

Replace the header and the signature:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';

import { track } from '@/lib/analytics/track.client';
import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import styles from './LocaleSwitch.module.css';

/**
 * The language toggle. TWO PLACES, TWO SHAPES, AND THE SHAPE IS THE POINT.
 *
 * ── WHERE IT LIVES (v0.3.0 R1 — this REPLACES "the reader picker footer") ────
 *
 *   `variant="names"`  -- `Indonesia · English`, in the /login footer, and
 *                         nowhere else. There is no session there and therefore
 *                         no account button, so the footer is the only place a
 *                         stranger can find this control.
 *   `variant="codes"`  -- `ID · EN`, one row inside `AccountMenu`. VD12.
 *
 * The reader-picker footer no longer carries it. Do not put it back: two live
 * switchers on one screen is two controls that can disagree about what is
 * pending, and the menu is where v0.3.0 puts every account-shaped choice.
 *
 * ── WHY THE TWO SHAPES ARE BOTH CORRECT (VD12) ───────────────────────────────
 *
 * This header used to argue, flatly, that the names must always be written in
 * their own language -- `Indonesia`, `English`, never `Bahasa Inggris`. THAT
 * ARGUMENT IS STILL TRUE AND IT IS NARROWER THAN IT LOOKED. It is an argument
 * about a stranger meeting an unlabelled control on a login page in a language
 * they may not read: the only text that helps that person is the target
 * language's own name for itself.
 *
 * Inside the account menu none of that holds. The row is LABELLED -- `Bahasa` /
 * `Language`, from the catalog, in the language the user is already in -- and
 * the user opened the menu on purpose looking for exactly this. What is needed
 * there is a two-state toggle small enough to sit at the end of a menu row, and
 * `ID · EN` is that. `Indonesia · English` at the end of that row wraps at
 * 320px.
 *
 * So: full names where the control has to introduce itself, codes where the row
 * above it already did. Both are in the catalog (`locale.name.*`,
 * `locale.code.*`) and both are written in their own language.
 *
 * ── NOT THE DRAW SCREEN, AND NOW NOT THE ACCOUNT BUTTON EITHER ───────────────
 *
 * A flip mid-reading leaves streamed prose in one language and the chrome in
 * another, and `readings.locale` (I24) records the language the prose came out
 * in. THE READING KEEPS THE LOCALE IT WAS GENERATED IN, PERMANENTLY -- and
 * `router.refresh()` below KEEPS CLIENT STATE, so a flip after the stream ends
 * would leave the finished Indonesian reading sitting under English chrome.
 * That is why V4 suppresses the whole account button on `/[reader]/[service]`
 * rather than only this row; see `AccountButton.tsx`'s header and
 * `accountSurface.test.ts`.
 *
 * v0.3.0 R2 does NOT relax this. A reading becomes reachable in the other
 * language through `/history`, as a derived `translations` row (VD7), with the
 * original never overwritten. That is a different surface and a different
 * mechanism.
 *
 * `router.refresh()` and not `location.reload()`. The locale is resolved on the
 * server, so the page has to be re-rendered there; `refresh()` re-fetches the RSC
 * payload and keeps client state, which on the reader picker means the frequency
 * line does not flash away and come back.
 */
export function LocaleSwitch({ variant }: { variant: 'names' | 'codes' }) {
  const t = useT();
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [posting, setPosting] = useState(false);

  const busy = pending || posting;

  async function choose(next: Locale) {
    if (next === active || busy) return;
    setPosting(true);
    try {
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      /*
       * NO ERROR COPY, and it is the same call M14 made for the memory features:
       * a failed language switch leaves the page in the language it was already
       * in, which is a visible, self-explanatory outcome. A red sentence saying
       * "could not change language" adds nothing the screen has not already said,
       * and it would need two more catalog keys to say it in.
       */
      if (!response.ok) return;
      /*
       * `locale.changed` HAS BEEN IN THE TAXONOMY SINCE W6 AND HAS NEVER BEEN
       * FIRED. It is fired here, after the write succeeded, so the row means
       * "the language actually changed" and not "somebody tapped". `surface` is
       * `'settings'` from both call sites -- see `## Open questions`, the login
       * footer is arguably not settings and widening a union in W4's file is not
       * a change V4 makes unilaterally.
       */
      track('locale.changed', { from: active, to: next, surface: 'settings' });
      startTransition(() => router.refresh());
    } catch {
      // Offline. Same reasoning: the page is unchanged and says so by being unchanged.
    } finally {
      setPosting(false);
    }
  }

  const label = (locale: Locale) =>
    variant === 'codes' ? t(`locale.code.${locale}`) : t(`locale.name.${locale}`);

  return (
    <div
      className={variant === 'codes' ? `${styles.row} ${styles.inline}` : styles.row}
      role="group"
      aria-label={t('locale.switch.aria')}
    >
      {LOCALES.map((locale, i) => (
        <Fragment key={locale}>
          {i > 0 ? (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          ) : null}
          {locale === active ? (
            /*
             * A `<span>`, not a disabled button. `aria-current` tells a screen
             * reader which is selected, and a control that does nothing when
             * pressed should be neither focusable nor pressable-looking.
             */
            <span className={`${styles.option} ${styles.active}`} aria-current="true">
              {label(locale)}
            </span>
          ) : (
            <button
              type="button"
              className={styles.option}
              onClick={() => choose(locale)}
              disabled={busy}
            >
              {label(locale)}
            </button>
          )}
        </Fragment>
      ))}
    </div>
  );
}
```

Append to `LocaleSwitch.module.css` — **no new hex, no new font size, no new
curve**, exactly as its own header already demands:

```css
/*
 * The `codes` variant: `ID · EN`, sitting at the right-hand end of a menu row
 * rather than centred under a disclaimer. Same type, same colours, same 44px
 * tap height -- only the box changes.
 */
.inline {
  justify-content: flex-end;
  gap: 4px;
  margin: 0;
}

.inline .option {
  /* Still 44px tall. Narrower horizontally because the row's label is already
     carrying the meaning and the two codes are two characters each. */
  padding: 14px 4px;
}
```

**Verify:** typecheck is red at `src/app/login/page.tsx` (missing `variant`).
That is correct and Task 7 fixes it. Leave it red and move on — or, if a red tree
between tasks is uncomfortable, do Task 7's one-line login edit now.

---

### Task 4: `AccountMenu`

**Files:** create `src/components/AccountMenu.tsx`, `src/components/AccountMenu.module.css`

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@/lib/i18n/LocaleProvider';
import { LocaleSwitch } from './LocaleSwitch';
import styles from './AccountMenu.module.css';

/**
 * The sheet the account circle opens. Three items, and only three (VD12):
 * User Details -> /account, Language, History -> /history.
 *
 * ── A BOTTOM SHEET, NOT A DROPDOWN ───────────────────────────────────────────
 *
 * The opener is a 44px circle in the top-right corner of a phone -- the furthest
 * point from a right thumb and unreachable for a left one -- and in iOS
 * standalone mode with viewport-fit=cover that corner is shared with the clock,
 * the battery and the Dynamic Island. A panel anchored there keeps its three tap
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
}) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLAnchorElement | null>(null);

  /*
   * Read through a ref so the effect below can depend on nothing at all --
   * `CardDetail`'s reason, and it applies here too: `onClose` is passed as an
   * inline arrow, so an effect keyed on its identity would tear down and re-focus
   * on every parent re-render.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();

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

      if (e.shiftKey && (active === first || !sheet.contains(active))) {
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
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-menu-title"
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
        <Link href="/account" className={styles.item} onClick={onClose} ref={firstRef}>
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

        <button type="button" className={styles.close} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
```

```css
/*
 * The account sheet. STRUCTURALLY CardDetail.module.css with the sheet pinned to
 * the bottom edge instead of centred -- same scrim colour, same blur, same
 * animation, same tokens. One modal idiom in this app.
 *
 * NO NEW HEX, NO NEW FONT SIZE, NO NEW CURVE. Every value below appears in
 * src/theme/tokens.css or in CardDetail.module.css already.
 */

/*
 * THE Z-INDEX LADDER, written down once because it is now three deep:
 *   Backdrop           -1     (root layout, behind everything)
 *   AccountButton      800    (chrome, under any overlay)
 *   CardDetail         900    (content overlay)
 *   AccountMenu       1000    (chrome overlay, above both)
 * V6's ReadingView overlay, if it has one, belongs at 900 with CardDetail.
 */
.scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* --canvas at 94%, the same treatment CardDetail and the sticky footer use. */
  background: rgba(10, 8, 18, 0.94);
  backdrop-filter: blur(6px);
  animation: fade 200ms ease-out;
}

.sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* The app's shell width. The sheet is never wider than the page it belongs to. */
  max-width: 520px;
  /*
   * THE BOTTOM INSET IS NOT OPTIONAL AND body's PADDING DOES NOT HELP.
   * globals.css pads <body> with env(safe-area-inset-bottom), but this is
   * `position: fixed` -- positioned against the VIEWPORT, not the padded body --
   * and it is portalled, so it is not inside that padding box either. Without
   * this line the Close button sits under the home indicator in standalone mode.
   */
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
  background: var(--canvas);
  border-top: 1px solid var(--gold-hairline);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  animation: rise 260ms var(--ease-card);
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scrim,
  .sheet {
    animation: none;
  }
}

/* The drag affordance. Purely a signifier -- there is no drag handler and there
   must not be (VD17's reasoning applies: no pointer geometry we do not need). */
.grip {
  width: 36px;
  height: 3px;
  margin: 0 auto 12px;
  border-radius: var(--radius-chip);
  background: var(--gold-hairline);
}

.title {
  margin: 0 0 6px;
  font-family: var(--font-display), serif;
  font-weight: 400;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-section-label);
  text-transform: uppercase;
  color: var(--gold);
  text-align: center;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /*
   * 56px, not 44px. 44 is the floor for a tap target; these are three stacked
   * full-width rows a thumb hits without looking, and the extra 12px is what
   * stops History being tapped when Language was meant. The Language row's own
   * buttons carry their 44px from LocaleSwitch.module.css.
   */
  min-height: 56px;
  padding: 0 6px;
  border-bottom: 1px solid var(--gold-hairline);
}

.item:last-of-type {
  border-bottom: none;
}

a.item:hover,
a.item:focus-visible {
  outline: none;
}

a.item:hover .label,
a.item:focus-visible .label {
  color: var(--gold-lift);
}

a.item:focus-visible {
  /* Keyboard users get a visible ring; the hairline alone is not enough on a row
     whose only other state change is a text colour. */
  border-radius: var(--radius-chip);
  box-shadow: 0 0 0 1px var(--gold-border);
}

.label {
  font-family: var(--font-display), serif;
  font-size: var(--fs-card-title);
  letter-spacing: var(--ls-card-title);
  color: var(--gold-text);
}

.chevron {
  font-family: var(--font-body), Georgia, serif;
  font-size: var(--fs-card-title);
  color: var(--faint);
}

/* CardDetail's `.return`, verbatim: the quiet dismiss, not a call to action. */
.close {
  align-self: center;
  margin-top: 14px;
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-button);
  text-transform: uppercase;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--gold-hairline);
  border-radius: var(--radius-chip);
  padding: 14px 20px;
}

.close:hover {
  color: var(--button-text);
  border-color: var(--gold-border);
}
```

**Verify:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
```

---

### Task 5: `AccountButton` and the lotus mark

**Files:** create `src/components/AccountButton.tsx`, `src/components/AccountButton.module.css`

```tsx
'use client';

import { useCallback, useState } from 'react';

import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { AccountMenu } from './AccountMenu';
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
 *   2. The other two items navigate AWAY. `Draw.tsx` aborts its reading on
 *      unmount, so History mid-stream kills the reading and records
 *      `reading.aborted`. A one-tap exit in the corner of a streaming page is
 *      wrong regardless of what the Language row is doing.
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

  return (
    <>
      <button
        type="button"
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
      {open ? <AccountMenu onClose={close} showLanguage={showLanguage} /> : null}
    </>
  );
}

/**
 * Three petals over a bowl. Stroked, `currentColor`, so the button's own
 * hover/expanded colours drive it and there is not a hex in this file.
 *
 * `aria-hidden` and `focusable="false"`: the accessible name is the button's
 * `aria-label`, and a glyph announcing itself as well would read the control
 * twice.
 */
function LotusMark() {
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
      {/* centre petal */}
      <path d="M12 4.5C14.4 7.6 14.4 11.9 12 15C9.6 11.9 9.6 7.6 12 4.5Z" />
      {/* left petal */}
      <path d="M12 15C8.6 14.5 5.7 12 4.6 8.8C8.2 9.2 11.2 11.5 12 15Z" />
      {/* right petal */}
      <path d="M12 15C15.4 14.5 18.3 12 19.4 8.8C15.8 9.2 12.8 11.5 12 15Z" />
      {/* the bowl the flower sits in */}
      <path d="M4.2 13.6C6.1 17.9 8.9 20 12 20C15.1 20 17.9 17.9 19.8 13.6" />
    </svg>
  );
}
```

```css
/*
 * The account circle. 44x44 -- the tap-target floor exactly, because it sits in
 * the corner and must not eat more of the screen than it needs to.
 *
 * NO NEW HEX, NO NEW FONT SIZE, NO NEW CURVE. `--gold-wash` / `--gold-hairline`
 * at rest and `--gold-wash-strong` / `--gold-border` lifted, which is the same
 * pair CardDetail's `.close` uses.
 */
.button {
  position: fixed;
  /*
   * AGAINST THE VIEWPORT, NOT THE PADDED BODY. globals.css pads <body> with
   * env(safe-area-inset-top) -- and that padding does nothing for a fixed
   * element, which is positioned against the viewport. Without adding the inset
   * back here the circle sits under the clock and the notch in standalone mode,
   * which is the one place it cannot be checked from WSL.
   *
   * The right inset is for landscape on a notched device, where
   * safe-area-inset-right is nonzero and 0 in every orientation we design for.
   */
  top: calc(10px + env(safe-area-inset-top));
  right: calc(10px + env(safe-area-inset-right));
  /* See the ladder in AccountMenu.module.css. Chrome, under any content overlay. */
  z-index: 800;

  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--gold-pale);
  background: var(--gold-wash);
  border: 1px solid var(--gold-hairline);
  /* It floats over a scrolling page, including reader portraits. Without the
     blur the mark competes with whatever art happens to be under it. */
  backdrop-filter: blur(6px);
}

.button:hover,
.button:focus-visible {
  color: var(--gold-text);
  background: var(--gold-wash-strong);
  border-color: var(--gold-border);
  outline: none;
}

.button[aria-expanded='true'] {
  color: var(--gold-text);
  border-color: var(--gold-border);
}

.mark {
  width: 22px;
  height: 22px;
}
```

**Verify:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
```

---

### Task 6: The fences — write them RED

**Files:** create `src/components/accountSurface.test.ts`

This is the `clientBoundary.test.ts` / `legal.test.ts` idiom, and it is the only
kind of test available: the unit project globs `*.test.ts`, `environment` is
`node`, and there is no jsdom and no testing-library. `renderToStaticMarkup` is
available (`legal.test.ts` uses it) but cannot render `AccountMenu`, which
portals to a `document` that does not exist here. So: source-level, and the
denylist is where the value is.

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import id from '@/lib/i18n/locales/id';

/**
 * Where the account shell is allowed to appear, and where the language switcher
 * is allowed to live after v0.3.0 R1.
 *
 * BOTH ASSERTIONS ARE DENY-SHAPED, and that is deliberate. An allowlist would
 * have to be edited by V6, V7 and V8 as they land, and an allowlist somebody has
 * to edit to make their branch green is an allowlist somebody widens without
 * reading it. A denylist names the pages where the answer is NO and stays out of
 * everybody else's way -- and `app/s/` is on it before V7 has written that page,
 * so V7 learns the rule from a red test rather than from a review.
 */

const ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT).map((path) => ({
  path: path.slice(ROOT.length + 1).replaceAll('\\', '/'),
  source: readFileSync(path, 'utf8'),
}));

const importers = (re: RegExp) =>
  FILES.filter((f) => re.test(f.source)).map((f) => f.path).sort();

describe('the account button', () => {
  const MOUNTS = importers(/from '@\/components\/AccountButton'/);

  it('is mounted somewhere, so the denylist below is not vacuously passing', () => {
    expect(MOUNTS.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * **THE DRAW SCREEN IS THE IMPORTANT ENTRY** (roadmap §7 trap 4).
   *
   * A language flip mid-reading -- or after it, since `router.refresh()` keeps
   * client state -- leaves the prose in one language and the chrome in another,
   * and `readings.locale` records the language the prose came out in. The other
   * two menu items navigate away and abort the stream. So the whole button is
   * suppressed there, not just the Language row, and the suppression is the
   * ABSENCE OF AN IMPORT rather than a runtime flag that can desync.
   *
   * The rest have no session by design (`isPublic()`), except `/s/` -- which has
   * no session BECAUSE IT IS A STRANGER'S PAGE (V7, VD9).
   */
  it('is not mounted on the draw screen or on any page without a session', () => {
    const FORBIDDEN = [
      'app/[reader]/[service]/', // THE DRAW SCREEN. See above.
      'app/login/',
      'app/terms/',
      'app/privacy/',
      'app/onboarding/',
      'app/s/', // V7's public share page. Named before it exists.
      'app/layout.tsx', // the mount seam is the owning page, never the root layout
    ];
    for (const prefix of FORBIDDEN) {
      expect({ [prefix]: MOUNTS.filter((p) => p.startsWith(prefix)) }).toEqual({
        [prefix]: [],
      });
    }
  });
});

describe('LocaleSwitch after R1', () => {
  /**
   * v0.3.0 R1: the reader-picker footer no longer carries it. Two importers,
   * and the test names them, because "one place plus login" is a claim the
   * component's header now makes and a claim in a comment is not enforcement.
   */
  it('lives in exactly two places: the login footer and the account menu', () => {
    expect(importers(/from '(?:\.|@\/components)\/LocaleSwitch'/)).toEqual([
      'app/login/page.tsx',
      'components/AccountMenu.tsx',
    ]);
  });
});

describe('the account shell copy', () => {
  /**
   * I3: an unknown key renders THE KEY, on purpose. That is a good rule and a bad
   * failure mode for a typo, so check the literal keys these two files ask for
   * really exist. Template-literal keys are skipped -- `LocaleSwitch`'s
   * `locale.code.${locale}` is covered by the type lock instead.
   */
  it('asks the catalog for keys that exist', () => {
    for (const name of ['components/AccountButton.tsx', 'components/AccountMenu.tsx']) {
      const file = FILES.find((f) => f.path === name);
      expect(file, name).toBeDefined();
      const keys = [...file!.source.matchAll(/\bt\('([a-z][\w.]*)'\)/g)].map((m) => m[1]);
      expect({ [name]: keys.length }).not.toEqual({ [name]: 0 });
      for (const key of keys) {
        expect({ [name]: key, present: key in id }).toEqual({ [name]: key, present: true });
      }
    }
  });
});
```

**Verify — it must be RED first:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- accountSurface
```

Expect two failures: `MOUNTS.length` is 0, and `LocaleSwitch`'s importers still
include `app/page.tsx`. Task 7 turns both green.

---

### Task 7: Mount it, and move the footer switcher

**Files:** `src/app/page.tsx`, `src/app/[reader]/page.tsx`,
`src/app/login/page.tsx`, `src/app/page.module.css`

**7a — `src/app/login/page.tsx`.** One word. The footer switcher stays exactly
where it is; only the variant is declared.

```tsx
{localeSwitcherEnabled() ? <LocaleSwitch variant="names" /> : null}
```

Update the comment above it so it says why this one survived R1:

```tsx
{/* Before there is a session, so /api/locale writes only the cookie. A
    querent whose browser says en-GB should not have to sign in through
    an Indonesian form to find this.

    THE ONE FOOTER SWITCHER LEFT (v0.3.0 R1). Everywhere else it moved into
    the account menu; here there is no session and therefore no account
    button, so the footer is the only place it can be -- and `variant="names"`
    because a stranger meeting an unlabelled control needs the target
    language's own name for itself. See the component's header. */}
```

**7b — `src/app/page.tsx`.** Remove the footer switcher, add the button.

```tsx
import { AccountButton } from '@/components/AccountButton';
// LocaleSwitch import: DELETE. localeSwitcherEnabled stays -- it is now the
// button's prop.
```

```tsx
  return (
    <main className={styles.shell}>
      {/* Fixed to the viewport's top-right corner; it takes no space in this
          flex column and needs no layout from this file. `showLanguage` is
          resolved HERE because LOCALE_SWITCHER has no NEXT_PUBLIC_ prefix and
          would inline as `undefined` inside a client component. */}
      <AccountButton surface="reader_picker" showLanguage={localeSwitcherEnabled()} />
      <Eyebrow>{t('common.majorArcana')}</Eyebrow>
```

and at the foot, delete the two lines:

```tsx
      {/* Under the disclaimer, which is the calmest row on the calmest screen.
          Not on the draw screen -- see the component. */}
      {localeSwitcherEnabled() ? <LocaleSwitch /> : null}
```

leaving `<p className={styles.disclaimer}>` as the last child.

**7c — `src/app/page.module.css`.** The circle occupies roughly `y 10–54` at the
right edge; `.shell` currently starts its content at `padding-top: 28px`, which
puts `Eyebrow`'s full-width flanking hairline straight through it.

```css
.shell {
  min-height: 100dvh;
  max-width: 520px;
  margin: 0 auto;
  /* 64, not 28: the account circle is fixed at the top-right and Eyebrow's
     hairlines run the full width of this column. Measure it, do not eyeball it
     -- `public/cards/_accountshot.html` prints both rects. */
  padding: 64px 16px calc(40px + env(safe-area-inset-bottom));
  ...
}
```

**7d — `src/app/[reader]/page.tsx`.** **This file is V5's under roadmap §8.** The
change is one import and one line, additive and trivially mergeable; it is
recorded in `## Interfaces I need` so reconciliation sees it. If V5 has already
landed, take their file and insert the line.

```tsx
import { AccountButton } from '@/components/AccountButton';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
```

as the first child of `<main className={styles.shell}>`:

```tsx
      <AccountButton surface="service_picker" showLanguage={localeSwitcherEnabled()} />
```

No CSS change here: the first row is the left-aligned `← Pembaca lain` back link,
about 110px wide at 390px, and the circle is at the right edge.

**Verify:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test -- accountSurface     # green now
npm test
```

---

### Task 8: The screenshot harness

**Files:** create `public/cards/_accountshot.html`

Already gitignored by `public/cards/_*.html`. Nothing to add to `.gitignore`.

Two things `tools/shot.sh` alone cannot do, both recorded in its own header and
in `_onbshot.html`'s: it cannot plant a session cookie, and Windows clamps a
Chrome window to ~500px so `--window-size=390` lays out at ~500 and merely crops.
The 390px iframe fixes the second; `/api/auth/dev-session` fixes the first.

```html
<!doctype html>
<meta charset="utf-8" />
<title>JMTarot account shell — screenshot harness</title>
<!--
  LOCAL DEVELOPMENT ONLY, gitignored under public/cards/_*.html -- a path
  src/middleware.ts's matcher excludes, which is the only reason this loads
  without a session, which it must, since its job is to establish one.

  Usage:
    PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=open'          500 900 /tmp/acct-open-id.png
    PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=closed'        500 900 /tmp/acct-closed-id.png
    PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=open&lang=en'  500 900 /tmp/acct-open-en.png
    PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=open&at=reader' 500 900 /tmp/acct-open-reader.png

  `lang=en` POSTS TO /api/locale RATHER THAN APPENDING ?lang= TO THE IFRAME.
  W6's trap: ?lang= only affects the request that carries it, and it does not
  re-mint the session `loc` claim, which is FIRST in the resolution chain. Any
  client component that fetches afterwards resolves from the stale claim. This
  is `_enshot.html`'s fix, reused.

  IT WAITS FOR HYDRATION, NOT FOR `load`. `load` fires when the SSR HTML has
  parsed and React has not attached its delegated listener yet -- a real
  PointerEvent lands on a real button and NOTHING HAPPENS, which reads as a dead
  control. W3 paid for that one. Poll for React's `__reactFiber$` key.
-->
<style>
  html, body { margin: 0; background: #0a0812; display: flex; }
  iframe { width: 390px; height: 880px; border: 0; display: block; background: #0a0812; }
  #out { font: 11px/1.45 ui-monospace, monospace; color: #9c93b4; padding: 12px; white-space: pre; }
  #err { font: 13px/1.5 ui-monospace, monospace; color: #e0a3a3; padding: 16px; }
</style>

<iframe id="app" title="account shell"></iframe>
<pre id="out"></pre>
<div id="err" hidden></div>

<script type="module">
  const q = new URL(location.href).searchParams;
  const state = q.get('state') ?? 'closed';
  const at = q.get('at') ?? 'home';
  const lang = q.get('lang');

  const out = document.getElementById('out');
  const errBox = document.getElementById('err');
  const fail = (m) => { errBox.hidden = false; errBox.textContent = m; };

  const minted = await fetch('/api/auth/dev-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'miftah' }),
  });
  if (!minted.ok) {
    fail(minted.status === 404
      ? 'dev-session 404 -- set DEV_PASSWORD_LOGIN=1 in .env.local and restart the dev server'
      : `dev-session ${minted.status}`);
    throw new Error('no session');
  }
  const who = await minted.json();
  if (!who.onboardingComplete) {
    // Loud rather than silent: middleware would 307 the iframe to /onboarding and
    // the PNG would be the questionnaire with no hint why.
    fail('harness user has not completed onboarding -- run `npm run db:seed`, or walk /onboarding once');
    throw new Error('not onboarded');
  }

  if (lang) {
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: lang }),
    });
  }

  const frame = document.getElementById('app');
  frame.src = at === 'reader' ? '/thessaly' : '/';

  /** React has attached its listeners when a node carries a __reactFiber$ key. */
  const hydrated = (doc) =>
    [...doc.querySelectorAll('button, a')].some((el) =>
      Object.keys(el).some((k) => k.startsWith('__reactFiber$')),
    );

  const waitFor = (fn, label) =>
    new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        let v;
        try { v = fn(); } catch { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > 8000) return reject(new Error(`timeout: ${label}`));
        setTimeout(poll, 50);
      })();
    });

  const doc = await waitFor(() => {
    const d = frame.contentDocument;
    return d && hydrated(d) ? d : null;
  }, 'hydration');

  const button = doc.querySelector('button[aria-haspopup="dialog"]');
  if (!button) { fail('no account button on this page'); throw new Error('no button'); }

  const rect = (el) => { const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)}`; };

  const lines = [`viewport ${frame.contentWindow.innerWidth}px`, `button   ${rect(button)}`];

  if (state === 'open') {
    // Real PointerEvents, not .click(). The project drives its own UI this way
    // everywhere else and the difference has mattered before.
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      button.dispatchEvent(new frame.contentWindow.PointerEvent(type, { bubbles: true, cancelable: true }));
    }
    const sheet = await waitFor(() => doc.querySelector('[role="dialog"]'), 'sheet');
    lines.push(`expanded ${button.getAttribute('aria-expanded')}`, `sheet    ${rect(sheet)}`);
    for (const el of sheet.querySelectorAll('a[href], button')) {
      const r = el.getBoundingClientRect();
      const flag = r.height < 44 ? '  <-- UNDER 44px' : '';
      lines.push(`  ${(el.textContent || '').trim().slice(0, 22).padEnd(24)}${rect(el)}${flag}`);
    }
    const bottom = sheet.getBoundingClientRect().bottom;
    lines.push(`sheet bottom ${Math.round(bottom)} / viewport ${frame.contentWindow.innerHeight}`);
    lines.push('NOTE: safe-area insets are 0 in desktop Chrome. The bottom inset');
    lines.push('is verifiable ONLY on a real iPhone in standalone mode.');
  }

  out.textContent = lines.join('\n');
</script>
```

---

### Task 9: Look at it, at a real 390px, in both locales

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:up && npm run dev      # a second terminal
```

```sh
PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=closed'           500 900 /tmp/acct-closed.png
PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=open'             500 900 /tmp/acct-open-id.png
PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=open&lang=en'     500 900 /tmp/acct-open-en.png
PORT=3001 tools/shot.sh '/cards/_accountshot.html?state=open&at=reader'   500 900 /tmp/acct-reader.png
```

Read all four PNGs. The checklist, in order of how likely each is to be wrong:

1. **`acct-closed.png`** — the circle does not sit on top of the `MAJOR ARCANA`
   eyebrow or its hairlines. If it does, 7c's `padding-top: 64px` was not enough.
2. **`acct-reader.png`** — the circle does not collide with `← Pembaca lain`.
3. **Every row in the printed rects is ≥ 44px high**, and none carries the
   `<-- UNDER 44px` flag. The `.item` rows should measure 56.
4. **`acct-open-en.png`** — `About you`, `Language`, `Reading history`, `ID · EN`,
   `CLOSE`. Nothing renders as a bare dotted key; if it does, `accountSurface.test.ts`
   missed a template-literal key.
5. **Neither locale's labels wrap.** English fits better than Indonesian here (W6
   measured the same thing on the slot row); `Riwayat bacaan` is the longest label
   and must stay on one line at 390px.
6. The `ID · EN` toggle sits flush right and its active side is `--gold-text`
   against `--faint`.
7. `sheet bottom` equals the viewport height — the sheet is pinned, not floating.

Then, without the harness, confirm the suppression by eye:

```sh
PORT=3001 tools/shot.sh '/thessaly/spread3?lang=en' 500 900 /tmp/acct-draw.png
```

**No circle.** (This page needs a session, so it will redirect to `/login` unless
you have one in the Chrome profile — a `/login` PNG with no circle on it is also
a pass for this check, and `accountSurface.test.ts` is the assertion that
matters.)

---

### Task 10: The full gate

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test
npm run build            # DO NOT SKIP -- CLAUDE.md's TypeScript trap. It also
                         # runs `npm run audit:secrets`, and the account shell
                         # introduces no NEXT_PUBLIC_ read, so the tripwire must
                         # stay silent. Retry once on a fonts.gstatic.com
                         # failure; that is the AAAA trap, not the code.
```

Then two things a build cannot tell you:

- **Keyboard.** Tab to the circle, Enter, Tab through the sheet — it must cycle
  and never escape to the browser chrome. Shift+Tab from the first item lands on
  Close. Escape closes and focus returns **to the circle**.
- **Stop the database and open the menu.** `npm run db:down`. The button, the
  sheet and the language toggle must all behave exactly as normal, with nothing
  but `[analytics] …` lines in the log. The language *write* will fail and log —
  `/api/locale`'s own header says that is the designed degradation, not a 500.

### Task 11: The documentation R1 requires

**Files:** `CLAUDE.md`

R1 says the "two places in the whole app" claim exists in `CLAUDE.md` as well as
in the component, and that both must change. Update the `LOCALE_SWITCHER`
comment in `## Environment variables`:

```
LOCALE_SWITCHER=1                             # W6. Render the language toggle.
                                              # V4 MOVED IT (v0.3.0 R1): the
                                              # account menu, plus the /login
                                              # footer. Not the reader picker.
                                              # It is now a PROP resolved by the
                                              # mounting server page, because a
                                              # non-NEXT_PUBLIC_ var inlines as
                                              # undefined in a client component.
                                              # RENDERING ONLY -- English is still
                                              # reachable by Accept-Language and
                                              # cookie with it off. ONLY '0'
                                              # disables, same rule as below.
```

Flag in the commit message that reconciliation may want a `## The account shell`
section; V4 does not add one unilaterally, since `CLAUDE.md`'s structure is
reconciliation's to own.

---

## 4. Verification, in the order the loops cost

1. **`npm run typecheck`** — the catalog type lock (a missing English key is
   TS2739 naming it) and the `EventMap` exhaustiveness guards.
2. **`npm test`** — `catalog.test.ts` (identical-value, placeholders, Malay,
   plural families) and `accountSurface.test.ts` (the draw-screen denylist, the
   R1 two-importer assertion, the catalog-key existence check).
3. **`public/cards/_accountshot.html`** — real widths, real `getBoundingClientRect`,
   real `PointerEvent`s, hydration-aware. Four PNGs, both locales, both states.
4. **`npm run build`** — the TypeScript trap and the secrets tripwire.
5. **A real iPhone against a Vercel preview.** Three things nothing above can
   check and none of them is optional for this component:
   - `env(safe-area-inset-top)` — does the circle clear the clock and the
     Dynamic Island in standalone mode? Desktop Chrome reports 0 for every inset.
   - `env(safe-area-inset-bottom)` — does the Close button clear the home
     indicator?
   - Whether the sheet's `backdrop-filter: blur(6px)` over a scroll-locked page
     costs anything visible on an older device. `CardDetail` already ships it, so
     this is a regression check rather than a new risk.

**No Playwright, and there must not be.** Chromium cannot launch in this WSL
image.

---

## Schema deltas

**None.** V4 adds no table, no column, and no query. It reads no database on any
path — the mount is the session check (§1.1), and `showLanguage` comes from an
environment variable.

---

## Event deltas

Two names, both added to `src/lib/analytics/events.ts` by V4 (44 → 46 on the way
to reconciliation's 59), plus one existing name that finally gets fired.

| Name | Props | Fired by |
|---|---|---|
| `account.opened` | `{ surface: 'reader_picker' \| 'service_picker' \| 'account' \| 'history' }` | **V4**, in `AccountButton`'s click handler, on open only (not on close). |
| `account.details_viewed` | `{ from: 'menu' \| 'direct' }` | **V8**, from `/account` via `TrackView`. V4 declares the shape only. |
| `locale.changed` *(existing)* | `{ from: string; to: string; surface: 'settings' }` | **V4**, in `LocaleSwitch.choose()`, after the POST succeeds. Declared by W6 and never fired until now. |

Three rules from `events.ts`'s own header, and how each is satisfied:

- **No free text.** Nothing here carries a name, a label or a path. `surface` is
  a closed union.
- **No unbounded cardinality.** `surface` is deliberately *not* a pathname:
  `/[reader]` alone would be three values and V6's future filters would be more.
  Because the button is mounted per page, each page passes its own literal — the
  exact value, for free, with no parsing.
- **`track()` in the handler body, never inside a `setState` updater.** StrictMode
  double-invokes updaters; the count would be wrong only in development, which is
  where you look at it.

`history.viewed`, `history.filtered` and `history.item_opened` are V6's and are
not touched here. The menu items are plain `<Link>`s precisely so the destination
page owns its own view event and nothing is double-counted.

---

## Interfaces I export

**`src/components/AccountButton.tsx`**

```ts
export type AccountSurface = 'reader_picker' | 'service_picker' | 'account' | 'history';

export function AccountButton(props: {
  surface: AccountSurface;
  showLanguage: boolean;
}): JSX.Element;
```

**This is V6's and V8's entry point, and it is one line.** From a **server** page:

```tsx
import { AccountButton } from '@/components/AccountButton';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';

// ...as the first child of your page's shell element:
<AccountButton surface="history" showLanguage={localeSwitcherEnabled()} />
```

Five things V6 and V8 need to know and nothing else:

1. **`localeSwitcherEnabled()` must be called in the server page**, not inside
   any client component. `LOCALE_SWITCHER` has no `NEXT_PUBLIC_` prefix and would
   inline as `undefined`.
2. **It takes no space.** `position: fixed`, top right, `z-index: 800`. Your
   layout does not change — but **leave ~56px of clear space in the top-right of
   your first row**, or your first element runs under the circle. `src/app/page.tsx`
   needed its `.shell` top padding raised from 28px to 64px because `Eyebrow`'s
   hairlines are full-width; a left-aligned back link needs nothing.
3. **Do not mount it inside a transformed subtree.** `position: fixed` resolves
   against the nearest ancestor with a `transform`/`filter`/`perspective`. A
   direct child of your shell is right.
4. **It reads no session and needs no `ViewerProvider`.** Mount it only on pages
   outside `isPublic()` — the mount *is* the session check. `src/components/accountSurface.test.ts`
   fails your branch if you mount it on a public page, and `app/s/` is already on
   that denylist.
5. **`surface` must be a member of `AccountSurface`.** V6 uses `'history'`, V8
   uses `'account'`. If either wants a value not in the union, widen the union and
   the `account.opened` prop shape together, in one edit.

**`src/components/LocaleSwitch.tsx`** — `variant: 'names' | 'codes'` is now
**required**. Nothing outside `/login` and `AccountMenu` may import it; there is a
test.

**`src/components/AccountMenu.tsx`** — internal to V4. **Do not add a fourth item
without a decision recorded against VD12.** The menu is three items on purpose;
Sharing (V7) belongs on the artifact, not in the account shell.

---

## Interfaces I need

**From V5 (reader swipe deck) — one line in a file V5 owns.** `src/app/[reader]/page.tsx`
must render, as the first child of `<main className={styles.shell}>`:

```tsx
<AccountButton surface="service_picker" showLanguage={localeSwitcherEnabled()} />
```

V4 writes it (Task 7d) because it is additive and trivially mergeable, but V5 owns
the file under roadmap §8. If V5 lands first, take V5's file and insert the line;
do not revert V5's swipe deck to get it.

**From V6 (history) — `src/app/history/page.tsx` mounts
`<AccountButton surface="history" … />` and fires `history.viewed` itself.** V4
supplies the link target and nothing else; the route not existing yet is expected
and renders the app's own `not-found.tsx`.

**From V8 (`/account` and the persona) — `src/app/account/page.tsx` mounts
`<AccountButton surface="account" … />` and fires `account.details_viewed`,**
whose name and prop shape V4 has already put in `events.ts`. V8 is the sole firer
and may widen the shape in its own plan.

**From V7 (sharing) — do not mount it on `/s/[slug]`.** That page has no session
by design (VD9), the locale comes from the *viewer's* browser, and an account
control there would either 404 or advertise an app the viewer is not signed into.
`accountSurface.test.ts` already names `app/s/`.

**From W4 (`events.ts`) — nothing.** V4 adds its own two names under the file's
stated rule and touches no existing shape.

**From W6 (`resolve.ts`) — nothing.** `localeSwitcherEnabled()` is used as-is,
from server pages, which is what its header says it is for.

---

## Open questions

1. **Is a lotus discoverable as "account"?** §1.2's argument against an initial
   and against the Google avatar is solid; the argument *for* a lotus specifically
   rests on it being the app's own symbol, which is true but is not the same as
   being legible. This is the one thing in V4 that only a real person on a real
   phone can answer. **The fallback, if it is not found, is the nickname's
   initial** — and that is a real decision, not a tweak: the nickname lives in
   `profiles`, so it costs a database read on the render path, which roadmap §6's
   first non-negotiable forbids. The honest version of that fallback is stamping
   the nickname into the session claim at sign-in, next to `loc` — which is W2's
   file and V2's territory (VD11 is already editing `upsertUserOnSignIn`). Flagged
   for reconciliation rather than decided here.

2. **`locale.changed.surface` has no value for the login footer.** The union is
   `'settings' | 'onboarding' | 'auto'` and V4 fires `'settings'` from both call
   sites, which is right for the menu and a small lie for `/login`. Widening a
   union in W4's file for one call site is not a change V4 makes unilaterally.
   The cheap fix is adding `'login'`; the cheaper one is leaving it, since
   `users.locale_source` (VD11) will answer the question `'login'` would have
   answered, from a column rather than an event.

3. **Should the menu carry Sign out?** VD12 fixes three items and V4 implements
   three. But there is no sign-out anywhere in the app right now, and a user who
   wants to leave a home-screen-installed PWA has no way to. It is not V4's to add
   — `/api/auth/logout` was deleted in W2 (R13) and Auth.js's `signOut` is V8's
   neighbourhood, next to account deletion (VD13). **Raised so it does not fall
   between V4 and V8 the way `/account` fell between W3 and W7.**

4. **`/account` and `/history` 404 until V6 and V8 land.** Deliberate — a feature
   flag here is a thing to forget to remove. But if V4 ships to a preview URL
   before either lands, the first thing anyone taps is a 404. If that matters, the
   answer is to hold V4 out of the preview rather than to add a flag.

5. **`.shell { padding-top: 64px }` on `src/app/page.tsx` is a guess refined by
   one screenshot.** It is the only layout number V4 introduces and it exists
   solely to keep `Eyebrow`'s full-width hairlines out from under the circle. If
   V3's frequency verdict or anything else changes that page's first row, re-run
   Task 9's first PNG rather than trusting the number.

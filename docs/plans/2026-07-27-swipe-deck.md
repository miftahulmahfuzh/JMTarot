# V5 — Reader Swipe Deck Implementation Plan

> ### AMENDED 2026-07-27 AFTER RECONCILIATION — READ BEFORE THE PLAN BELOW
> `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` outranks this file. This plan
> is **accepted as written**; two coordination facts (§5.10):
>
> 1. **Your question to V4 is answered: NO, the account button is not in an
>    app-wide header slot.** V4 chose per-page mount, deliberately — a layout
>    cannot see the pathname, so suppressing the button on public pages would
>    need a hand-maintained second copy of `isPublic()`. So V4 also edits
>    `src/app/[reader]/page.tsx`. The two edits are textually disjoint: V4 adds
>    one import and one line near the top, you replace the block between the
>    banner wrap and `<Eyebrow>`. **You land first**, being the larger change.
> 2. **Your secondary warning was the substantive one and is now a requirement
>    on V4**, recorded in V4's plan: its bottom-sheet backdrop must be
>    `position: fixed` and set `touch-action: none`, or a horizontal drag meant
>    for the sheet lands in your snap track underneath it.
>
> Nothing else changes. The empty-state contract (the caller's array length *is*
> the M14 contract), the first-byte trigger, the deliberate absence of
> `cancelAnimationFrame` cleanup, and the `min-height` reserve all stand.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On the service picker (`/[reader]`), the reader's bio and today's summary
stop being two stacked paragraphs and become two panels of one horizontal deck.
The summary slides itself in **once**, when it arrives, and the querent can swipe
back and forth. For the querent who has not read today — most users, most days —
there is exactly **one** panel, no dots, no affordance, and a DOM whose height is
byte-identical to today's.

**Architecture:** Three layers, split so the untestable part is tiny.

```
src/lib/swipeDeck.ts        PURE. panelIndexAt() and shouldAutoSlide(). No React,
                            no DOM. This is where the auto-slide policy lives and
                            it is the only part `npm test` can reach.
src/components/SwipeDeck.tsx    'use client'. GENERIC. N panels on one CSS
  + SwipeDeck.module.css        scroll-snap track, the dots, the aria, the
                                once-only scroll. Knows nothing about readers,
                                summaries, fetching or analytics.
src/components/ReaderDeck.tsx   'use client'. THE POLICY MOUNT. Owns the summary
  + ReaderDeck.module.css       fetch, decides there are 1 or 2 panels, fires
                                `reader.panel_swiped`.
src/components/DaySummary.tsx   SPLIT: `useDaySummary()` (the fetch, unchanged)
                                and `DaySummary` (the paragraph, now unnamed —
                                the panel names it).
```

`src/app/[reader]/page.tsx` stays a **server component**. It hands `ReaderDeck` a
resolved bio string and mounts nothing else new.

**Tech Stack:** No new dependencies, and none are permitted (VD17). CSS
`scroll-snap-type: x mandatory` + `scroll-snap-align: start`, `Element.scrollTo()`
with a `behavior` chosen from `usePrefersReducedMotion()`, CSS `@container`
queries for the height reserve. No carousel library, no drag handler, no
`ResizeObserver`, no `IntersectionObserver`.

---

## 0. The five decisions, up front

Everything below is a consequence of one of these. Read them before the tasks.

### D-V5-1. The deck is ONE panel until the first byte, and the DOM shape does not change

`DaySummary` returns `null` until it has text, and W5's M14 is emphatic that this
is correct: an empty state announces that the feature exists and that this
querent has not earned it. A deck that renders two panels with the second one
blank **is** that empty state, wearing a dot.

So `ReaderDeck` builds `panels` from what it actually has:

```
text === ''  ->  [bio]                one panel, no dots, no scroll, no reserve
text !== ''  ->  [bio, summary]       two panels, two dots, the reserve applies
```

Two consequences that look like details and are not:

- **The dots row is conditional, not hidden.** `visibility: hidden` or
  `opacity: 0` would reserve its 30px and move the service list, which is the
  thing M14 forbids by another route.
- **The bio panel's markup is IDENTICAL in both states** — same `<div role="group">`,
  same `<p>`, same classes. Only a sibling is appended. React therefore does not
  remount the bio, and there is no flash of re-rendered text at the exact moment
  the deck slides.

The one thing that does change at first byte is the deck's **height**; see D-V5-3.

### D-V5-2. "Ready" is the FIRST BYTE, not the end of the stream

The trigger is `text` transitioning from `''` to non-empty. Not `done`.

**Why not `done`.** The stream is a 45-word greeting in the reader's voice
(`SUMMARY_MAX_WORDS = 45` in `src/lib/prompt/summary.ts`). Waiting for the end
means the deck sits still for the whole generation and then moves — several
seconds after load, by which time the querent has very likely started reading
the service list. **A late steal is a worse steal than an early one.** The
longer the deck waits, the higher the chance it interrupts something.

**Why first byte is not "sliding to three words".** Two reasons, both from code
already in the repo:

1. `src/app/api/memory/summary/route.ts` **pulls the first chunk before the
   headers go out** — its own header says so, because that is what keeps the 204
   fallback available. So the first byte the browser sees is a real model chunk,
   not a header flush. The gap to the second chunk is one token-stream tick.
2. **The cached path does not stream at all.** `text()` returns the whole body in
   one `NextResponse`. A returning querent — the common case for anyone who has a
   summary at all — arrives at a *complete* paragraph.

And the streaming case is not a defect here, it is the effect: the route's header
argues that watching the words arrive "reads as the reader speaking". Arriving on
a panel that is filling in is better theatre than arriving at a finished block of
prose. Sliding on the first byte is what makes the querent present for it.

**Revisit if:** the observed gap between chunk 1 and chunk 2 is routinely over
~600ms. Recorded in `## Open questions`.

### D-V5-3. Height: a measured reserve on the summary panel, and the deck grows exactly once

Two panels of different heights on one horizontal track. The three options:

| | Behaviour | Cost |
|---|---|---|
| A. `align-items: stretch`, no reserve | Deck = tallest panel at every instant | **Grows on every chunk.** Six reflows of the service list while the summary streams. Rejected. |
| B. Deck tracks the active panel (JS + `ResizeObserver`) | No dead space ever | Deck height changes on **every swipe**, so the service list moves under the querent's own thumb, repeatedly. Also adds the JS layout machinery VD17 exists to avoid. Rejected. |
| **C. `align-items: stretch` + a `min-height` reserve on the summary panel** | Deck = max(bio, reserve). Changes **once**, at first byte, simultaneously with the slide. | Up to ~2–3 lines of trailing space under the shortest bio, and only for a querent who has read today. **Chosen.** |

The reserve is **measured, not guessed**, and expressed in lines of the existing
`.bio` register (16px / 1.5 = 24px), stepped by a `@container` query because the
chars-per-line figure is a function of the panel's inline size. Task 12 runs
`_swipefit.html` and writes the measured numbers into the stylesheet header the
way `Fan.module.css` carries its derivation.

The reserve is sized to the **typical** summary, not to the 45-word theoretical
maximum. A rare over-length one crosses the `min-height` and grows the deck one
more time — one extra reflow for an outlier is a much better trade than three
permanent empty lines under every bio. That trade is the whole reason it is
`min-height` and not `height`.

**With one panel there is no reserve and no summary panel, so the deck is exactly
as tall as the bio.** The M14 layout is unchanged, which is the property Task 12
asserts numerically.

**`SUMMARY_MAX_WORDS` cannot be imported.** W7-D14 put `server-only` on
`src/lib/prompt/**` and `src/lib/clientBoundary.test.ts` fences it. The number is
an *input to a derivation written in a comment*, not a runtime import. Do not
"fix" this by re-exporting it from a shared module — that is a prompt-layer module
reaching the browser bundle for a CSS constant.

### D-V5-4. Semantics: two labelled `group`s. No tabs, no `aria-hidden`, no live region.

- **Not a tab list.** A tab list promises arrow-key selection and one tab stop for
  the whole set. This is a scroll container; the scroll position is the state, and
  a `role="tablist"` that does not manage focus the way APG describes is worse than
  no role.
- **The off-screen panel is NOT `aria-hidden`.** The brief flags that two panels
  read as continuous prose, and that is real — but `aria-hidden` on the inactive
  panel would make the summary **permanently unreachable** to a screen reader,
  because a VoiceOver swipe moves to the next element, it does not scroll a snap
  container sideways. The fix for "continuous prose" is a **name on each panel**,
  not hiding one: `<div role="group" aria-label="…">` makes them two announced,
  distinct things. Both stay in the accessibility tree, both are readable, neither
  runs into the other.
- **`role="group"`, not `<section aria-label>`.** A named `<section>` is a
  `region` landmark, and a reader bio is not a landmark. `group` names without
  promoting.
- **No `aria-roledescription`.** There is no Indonesian word for "carousel" that
  helps anybody, and an untranslated English one in the `id` catalog is worse than
  the plain `group`.
- **No `aria-live`, and the auto-slide is not announced.** W5's rule, unchanged and
  restated here because a deck that moves itself is exactly where someone reaches
  for a live region: the summary is ambient background about the querent's own
  history, and interrupting whatever they are reading to announce it is the
  accessibility equivalent of the callback tic.
- **`DaySummary`'s `<p>` drops its own `aria-label`.** The name moves up one level
  to the panel, so there is exactly one naming layer. Its header records this and
  says what to do if the component is ever mounted outside a deck.
- **The dots are real `<button>`s, and they are the guaranteed keyboard path.**
  VD17 says scroll-snap gives keyboard behaviour for free; that is only true where
  the browser makes a scroll container focusable, which Firefox does, Chrome does
  in recent versions, and Safari does not. The dots close that gap with two
  ordinary buttons and no `tabindex` gymnastics.

### D-V5-5. `reader.panel_swiped` is fired by `ReaderDeck`, never by `SwipeDeck`

`SwipeDeck` is generic; V6 and V7 may mount it. A generic component that fires a
reader-specific event name is a component nobody can reuse. `SwipeDeck` exposes
`onPanelChange(key, source)`; `ReaderDeck` turns that into the event.

`source` is `'auto' | 'user'` and it is the whole reason the auto-slide is
measurable at all. The name is fixed by roadmap §6 and the word "swiped" is a
little wrong for the automatic case — `source` is what disambiguates it, and
renaming a name the roadmap fixed is worse than the imprecision.

---

## 1. What changes, file by file

**New:**

```
src/lib/swipeDeck.ts                  pure
src/lib/swipeDeck.test.ts             unit
src/components/SwipeDeck.tsx          'use client', generic
src/components/SwipeDeck.module.css
src/components/ReaderDeck.tsx         'use client', the mount
src/components/ReaderDeck.module.css  holds `.bio`, moved from the page
public/cards/_swipefit.html           gitignored. getBoundingClientRect.
public/cards/_swipeshot.html          gitignored. Drives the real page.
```

**Modified:**

```
src/app/[reader]/page.tsx             two children become one
src/app/[reader]/page.module.css      `.bio` deleted (moves to ReaderDeck)
src/components/DaySummary.tsx         split into a hook and a paragraph
src/components/DaySummary.module.css  header rewritten; the left rule goes
src/lib/analytics/events.ts           + `reader.panel_swiped`, 44 -> 45
src/lib/i18n/locales/id.ts            + 1 key
src/lib/i18n/locales/en.ts            + 1 key
```

**Not touched, deliberately:** `src/app/layout.tsx` (V4's header slot lives
there — see `## Interfaces I need`), anything under `src/lib/prompt/**`,
`src/lib/db/**`, `src/lib/memory/**`, and `/api/memory/summary`. **No prompt text
changes, so `npm run smoke` is unaffected and does not need re-running.**

---

## 2. Tasks

Every npm command in this plan is prefixed with the Node 24 export. It is not
optional; the default `node` on this machine is 20.11.1.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
```

---

### Task 1 — `panelIndexAt`, failing test first

**Step 1.** Create `src/lib/swipeDeck.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { panelIndexAt } from './swipeDeck';

describe('panelIndexAt', () => {
  it('rounds to the nearest panel, because a snap container settles between them', () => {
    expect(panelIndexAt(0, 390, 2)).toBe(0);
    expect(panelIndexAt(194, 390, 2)).toBe(0);
    expect(panelIndexAt(196, 390, 2)).toBe(1);
    expect(panelIndexAt(390, 390, 2)).toBe(1);
  });

  it('clamps, because iOS rubber-banding reports a negative and an over-scrolled left', () => {
    expect(panelIndexAt(-40, 390, 2)).toBe(0);
    expect(panelIndexAt(1200, 390, 2)).toBe(1);
  });

  it('answers 0 for a container that has not laid out yet', () => {
    // clientWidth is 0 between mount and first layout, and x/0 is Infinity.
    expect(panelIndexAt(0, 0, 2)).toBe(0);
    expect(panelIndexAt(100, 0, 0)).toBe(0);
  });
});
```

**Step 2.** Run it, watch it fail on the missing module.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- swipeDeck
```

**Step 3.** Create `src/lib/swipeDeck.ts` with the header and `panelIndexAt` only
(the full file lands in Task 2; write just enough to go green).

**Step 4.** `npm test -- swipeDeck` — green.

**Step 5.** Commit.

```sh
git add src/lib/swipeDeck.ts src/lib/swipeDeck.test.ts
git commit -m "V5: panelIndexAt, the scroll position -> panel index maths

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 — `shouldAutoSlide`, the whole policy, failing test first

**Step 1.** Append to `src/lib/swipeDeck.test.ts`:

```ts
import { shouldAutoSlide, type AutoSlideInput } from './swipeDeck';

const base: AutoSlideInput = {
  arrived: 'summary',
  panelKeys: ['bio', 'summary'],
  alreadySlidTo: new Set<string>(),
  interacted: false,
  focusIsElsewhere: false,
};

describe('shouldAutoSlide', () => {
  it('slides when a second panel arrives and nobody has touched anything', () => {
    expect(shouldAutoSlide(base)).toBe(true);
  });

  it('does not slide when there is nothing to slide to', () => {
    expect(shouldAutoSlide({ ...base, arrived: null })).toBe(false);
    expect(shouldAutoSlide({ ...base, panelKeys: ['bio'] })).toBe(false);
  });

  it('does not slide to panel 0, which is already showing', () => {
    expect(shouldAutoSlide({ ...base, arrived: 'bio' })).toBe(false);
  });

  it('does not slide to a key that is not in the deck', () => {
    expect(shouldAutoSlide({ ...base, arrived: 'persona' })).toBe(false);
  });

  it('FIRES EXACTLY ONCE. The summary re-renders on every chunk.', () => {
    expect(shouldAutoSlide({ ...base, alreadySlidTo: new Set(['summary']) })).toBe(false);
  });

  it('never steals a scroll the querent started', () => {
    expect(shouldAutoSlide({ ...base, interacted: true })).toBe(false);
  });

  it('never moves the page out from under a keyboard user who has gone elsewhere', () => {
    expect(shouldAutoSlide({ ...base, focusIsElsewhere: true })).toBe(false);
  });
});
```

**Step 2.** `npm test -- swipeDeck` — fails.

**Step 3.** Write the complete `src/lib/swipeDeck.ts`:

```ts
/**
 * The two decisions the swipe deck makes, as pure functions.
 *
 * WHY THEY ARE HERE AND NOT IN THE COMPONENT. This project has no jsdom, no
 * Testing Library and no Playwright, and it must not acquire any of them --
 * Chromium cannot launch in this WSL image. So the only part of a client
 * component `npm test` can reach is the part that does not touch React or the
 * DOM. `src/lib/draw.ts`'s `togglePick` is the precedent: the interesting
 * decision lives in a pure function beside the component, the component is the
 * thin part, and the harness under `public/cards/` covers the rest.
 *
 * The policy in `shouldAutoSlide` is the thing most likely to be quietly broken
 * by a later change -- every one of its five falsy branches is a rule somebody
 * would remove as redundant.
 */

/**
 * Which panel a scroll container has settled on.
 *
 * ROUNDS, because a snap container reports every intermediate position while
 * the momentum decays, and the answer wanted here is "which one will it land
 * on". CLAMPS, because iOS rubber-banding reports a negative `scrollLeft` at
 * the left edge and an over-scrolled one at the right, and `children[-1]` is
 * `undefined`.
 *
 * THIS ARITHMETIC ASSUMES NO GAP BETWEEN PANELS. `SwipeDeck.module.css` has no
 * `gap` on the track for exactly this reason, and says so.
 */
export function panelIndexAt(scrollLeft: number, panelWidth: number, count: number): number {
  if (panelWidth <= 0 || count <= 0) return 0;
  const i = Math.round(scrollLeft / panelWidth);
  return Math.min(count - 1, Math.max(0, i));
}

export type AutoSlideInput = {
  /** The key of a panel that has just appeared, or null. */
  arrived: string | null;
  panelKeys: readonly string[];
  /** Keys this deck has already auto-slid to, ever. */
  alreadySlidTo: ReadonlySet<string>;
  /** Has the querent touched this deck -- pointer, wheel, key or dot? */
  interacted: boolean;
  /** Is focus on something that is neither the body nor inside the deck? */
  focusIsElsewhere: boolean;
};

/**
 * May the deck move itself?
 *
 * FIVE WAYS TO SAY NO AND ONE TO SAY YES, and the asymmetry is the design. An
 * unrequested scroll is an interruption; the default is not to interrupt.
 *
 *   - nothing arrived, or the deck has one panel: there is no motion to make.
 *   - the arrival is panel 0: it is already on screen. This also catches a key
 *     that is not in the deck at all (`indexOf` -> -1), which is why the check
 *     is `< 1` and not `=== 0`.
 *   - ALREADY SLID. The summary streams, so `ReaderDeck` re-renders on every
 *     chunk and the effect that calls this runs again each time. Without this
 *     the deck would re-scroll on every token, pinning the querent to the
 *     summary panel and making it impossible to swipe back until the stream
 *     ended. This is the single most important line in the file.
 *   - INTERACTED. Stealing a scroll the querent started is strictly worse than
 *     not sliding: they have expressed an intention and the app has overruled
 *     it. Once true it is never reset.
 *   - FOCUS IS ELSEWHERE. A keyboard user who has tabbed to a service link has
 *     also expressed an intention, and scrolling a region they are not in
 *     moves the page under them for no reason they can see.
 */
export function shouldAutoSlide(i: AutoSlideInput): boolean {
  if (!i.arrived) return false;
  if (i.panelKeys.length < 2) return false;
  if (i.panelKeys.indexOf(i.arrived) < 1) return false;
  if (i.alreadySlidTo.has(i.arrived)) return false;
  if (i.interacted) return false;
  if (i.focusIsElsewhere) return false;
  return true;
}
```

**Step 4.** `npm test -- swipeDeck` — green. Then `npm run typecheck`.

**Step 5.** Commit.

```sh
git add src/lib/swipeDeck.ts src/lib/swipeDeck.test.ts
git commit -m "V5: shouldAutoSlide -- five ways to say no, one to say yes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 — the one new catalog key, Indonesian first

**Step 1.** In `src/lib/i18n/locales/id.ts`, in the `picker.*` block next to
`'picker.reader.portraitAlt'`:

```ts
  /*
   * V5. The name of the BIO PANEL inside the reader swipe deck.
   *
   * The summary panel reuses `memory.summary.a11yLabel`, which already names its
   * reader -- so the two panels announce as two different things, which is the
   * whole reason they are named at all (D-V5-4). Neither panel is aria-hidden.
   */
  'picker.reader.bio.a11yLabel': 'Tentang {name}',
```

**Step 2.** Run the typecheck and watch `en.ts` go red with TS2739 naming the key
— that is I2 working, and it is the checklist.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
```

**Step 3.** Add to `src/lib/i18n/locales/en.ts`, in the same relative position:

```ts
  'picker.reader.bio.a11yLabel': 'About {name}',
```

**Step 4.** Green typecheck, and the catalog tests:

```sh
npm run typecheck
npm test -- i18n
```

`catalog.test.ts` checks three things that matter here: identical key sets,
identical placeholders (`{name}` in both), and that the English value is not
byte-identical to the Indonesian. All three pass.

**Step 5.** Commit.

---

### Task 4 — `reader.panel_swiped` in the taxonomy

**Step 1.** In `src/lib/analytics/events.ts`, add the name to `EVENT_NAMES` under
`— navigation and choice —`:

```ts
  'reader.viewed',
  'reader.chosen',
  'reader.panel_swiped',
  'service.chosen',
```

**Step 2.** `npm run typecheck` — `_EveryNameHasProps` fails, because the name has
no prop shape. That guard is doing its job.

**Step 3.** Add the shape next to `'reader.chosen'` in `EventMap`:

```ts
  'reader.panel_swiped':       { reader_id: string; panel: 'bio' | 'summary'; source: 'auto' | 'user' };
```

Three notes for whoever reads this in six months:

- **No free text, rule 1.** Nothing here is a word the querent wrote or the model
  generated. `panel` is a closed union of two machine tokens, not a label.
- **`panel` is a key, not an index.** Rule 3 says ids are ids. An index would
  silently change meaning the day a third panel is inserted before the summary.
- **`source: 'auto'` is not redundant with the event name.** The roadmap fixed the
  name as `panel_swiped`; the automatic slide is not a swipe, and `source` is the
  only thing that lets a query separate "the app moved" from "the querent moved".
  The ratio of the two is the number that says whether D-V5-2 was the right call.

**Step 4.** `npm run typecheck` — green. `npm test -- analytics`.

> The header comment on `NAME_SET` says "a 44-element array". Eight workstreams
> are each adding names and reconciliation checks the total reaches 59. **Leave
> that comment alone**; fixing it to 45 here guarantees a conflict with the other
> seven plans and a wrong number in six of them.

**Step 5.** Commit.

---

### Task 5 — `SwipeDeck.module.css`, complete

Create `src/components/SwipeDeck.module.css`:

```css
/*
 * ============================================================================
 * SWIPE DECK GEOMETRY -- N panels on one horizontal scroll-snap track.
 * ============================================================================
 *
 * VD17: CSS scroll-snap, no carousel library and no drag handler. The project
 * has no runtime UI dependencies and must not acquire one for two panels. What
 * the platform gives for free here is momentum, the snap itself, pointer
 * cancellation, and -- in Firefox and recent Chrome -- keyboard scrolling. What
 * it does NOT give is a position indicator or a Safari keyboard path; the dots
 * below are both.
 *
 * ---------------------------------------------------------------------------
 * THE ONE PIECE OF ARITHMETIC IN HERE, AND WHY THERE IS NO `gap`
 * ---------------------------------------------------------------------------
 * `panelIndexAt()` in src/lib/swipeDeck.ts computes the settled panel as
 * `round(scrollLeft / clientWidth)`. That identity holds only while each panel
 * is exactly the track's width and there is nothing between them. A `gap` of
 * even 1px makes panel i sit at `i * (width + gap)`, so the rounding drifts by
 * a whole panel at i = width/gap and the dots start disagreeing with the page.
 *
 *   NO GAP. NO PADDING ON THE TRACK. NO BORDER ON THE TRACK.
 *
 * Separation between panels is unnecessary because only one is ever visible.
 * If a future deck wants peeking neighbours, it must also stop using
 * `panelIndexAt` and read `offsetLeft` instead -- change both or neither.
 *
 * ---------------------------------------------------------------------------
 * `overscroll-behavior-inline: contain` IS NOT COSMETIC ON AN IPHONE
 * ---------------------------------------------------------------------------
 * Without it, a right-swipe that starts at scrollLeft 0 falls through to
 * Safari's edge back-gesture and navigates the querent off the picker. The deck
 * spends most of its life at scrollLeft 0, so this is the common case, not the
 * edge case. It cannot be checked in WSL; it is the item on the real-iPhone
 * list.
 *
 * ---------------------------------------------------------------------------
 * SCROLLBAR HIDDEN, DOTS MANDATORY
 * ---------------------------------------------------------------------------
 * A visible horizontal scrollbar under a paragraph on a desktop browser reads
 * as a layout bug. Hiding it removes the only mouse-and-eyes affordance, so the
 * dots are not decoration: they are the replacement, and they are rendered
 * whenever there is more than one panel and never when there is one.
 *
 * ---------------------------------------------------------------------------
 * REDUCED MOTION AND ?still=1
 * ---------------------------------------------------------------------------
 * `scroll-behavior: smooth` is declared only under
 * `prefers-reduced-motion: no-preference`, and the JS passes an explicit
 * `behavior` too, because a JS `scrollTo({behavior})` overrides the CSS and the
 * component must not depend on which one wins.
 *
 * `html[data-still]` (globals.css, the screenshot hook) kills transitions and
 * animations -- it does NOT kill `scroll-behavior: smooth`, which is neither.
 * A headless capture would otherwise photograph the deck mid-glide. The rule
 * below is the missing half of that hook.
 */

.deck {
  /*
   * DECLARES THE CONTAINER AND PAINTS NOTHING. The @container queries that size
   * the summary reserve live in ReaderDeck.module.css, on a DESCENDANT of this
   * element -- which is the only place they resolve against this box. A query
   * (or a `cqw`) in the declarations of the element that DECLARES
   * `container-type` resolves against the nearest ANCESTOR container instead.
   * Same trap, same split, as CardBack's `.back` / `.plate`.
   */
  container-type: inline-size;
  width: 100%;
}

.scroller {
  display: flex;
  /* See the header. Do not add one. */
  gap: 0;

  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior-inline: contain;

  /*
   * The panels' `offsetLeft` is read to compute the scroll target, and
   * `offsetLeft` is measured from the offsetParent's padding box. Making the
   * track the offsetParent is what makes `scrollTo({ left: panel.offsetLeft })`
   * mean what it says, at any scroll position.
   */
  position: relative;

  scrollbar-width: none;
}

.scroller::-webkit-scrollbar {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  .scroller {
    scroll-behavior: smooth;
  }
}

:global(html[data-still]) .scroller {
  scroll-behavior: auto;
}

.panel {
  /* Exactly the track's width. `min-width: 0` because a flex item's default
     `min-width: auto` refuses to shrink below its longest unbreakable word,
     which on a narrow phone is enough to widen the track and break the
     `scrollLeft / clientWidth` identity above. */
  flex: 0 0 100%;
  min-width: 0;
  scroll-snap-align: start;
  /* A hard flick past a panel is a panel the querent never saw. With two panels
     this is nearly unreachable; it is here for the three-panel reuse. */
  scroll-snap-stop: always;
}

/* --- the dots -------------------------------------------------------------
 *
 * Rendered only when there is more than one panel. NOT hidden when there is
 * one -- a hidden row still occupies 28px and moves the service list, which is
 * the M14 empty state arriving by another route.
 *
 * NO NEW TOKENS. `--gold-border` is the hairline the chips, the banner and the
 * summary rule already use; `--gold-pale` is the summary's own ink. A 6px
 * circle needs a 50% radius, which is a shape and not a value -- `--radius-chip`
 * is 2px and would give two tiny squares.
 *
 * 44 x 28 HIT AREA AROUND A 6px DOT. 44 on the horizontal because that is the
 * axis where two adjacent targets can be mis-tapped, 28 on the vertical because
 * this row is a position indicator sitting under a paragraph, not a control bar
 * -- `.back` in the page stylesheet is 44 tall and is a primary control. A
 * mis-tap here costs nothing: it scrolls to a panel you can already point at.
 */
.dots {
  display: flex;
  justify-content: center;
  margin-top: 2px;
}

.dot {
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  width: 44px;
  height: 28px;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.dot::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--gold-border);
  transition: background-color var(--dur) var(--ease-card), border-color var(--dur) var(--ease-card);
}

.dot[aria-current='true']::before {
  background: var(--gold-pale);
  border-color: var(--gold-pale);
}

.dot:focus-visible {
  outline: 1px solid var(--gold-border);
  outline-offset: -6px;
  border-radius: var(--radius-chip);
}
```

Commit.

---

### Task 6 — `SwipeDeck.tsx`, complete

Create `src/components/SwipeDeck.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { panelIndexAt, shouldAutoSlide } from '@/lib/swipeDeck';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import styles from './SwipeDeck.module.css';

/**
 * Two or more panels on one horizontal snap track (V5, VD17).
 *
 * GENERIC ON PURPOSE. It knows nothing about readers, summaries, fetching or
 * analytics: it takes panels, it scrolls, and it reports. `ReaderDeck` owns all
 * of that, and V6/V7 can mount this without inheriting any of it.
 *
 * THE CALLER DECIDES HOW MANY PANELS THERE ARE, and that is the M14 contract:
 * with one panel this renders one unadorned `<div role="group">` inside a track
 * that cannot scroll and NO dots, which is visually and dimensionally identical
 * to rendering the child directly. There is no empty second panel and no
 * placeholder, ever. See `ReaderDeck` and D-V5-1.
 *
 * IT MOVES ITSELF AT MOST ONCE PER KEY, and only when nobody has touched
 * anything -- `shouldAutoSlide()` in `src/lib/swipeDeck.ts` holds the whole
 * policy and is the only part of this file that is unit-tested.
 *
 * NEITHER PANEL IS `aria-hidden` (D-V5-4). Hiding the off-screen one would make
 * the summary permanently unreachable to a screen reader, because a VoiceOver
 * swipe moves to the next element rather than scrolling a snap container
 * sideways. Each panel is a NAMED `group` instead, which is what stops the two
 * from reading as one run of prose. There is no live region: the summary is
 * ambient, and announcing an automatic slide would be the accessibility
 * equivalent of the callback tic W5 warns about.
 */

export type SwipePanel = {
  /** Stable, machine-side. Also the value reported to `onPanelChange`. */
  key: string;
  /** The panel's accessible name, and its dot's label. Already localized. */
  label: string;
  node: ReactNode;
};

export type PanelChangeSource = 'auto' | 'user';

export type SwipeDeckProps = {
  panels: SwipePanel[];
  /**
   * A panel that has JUST APPEARED and should be shown without being asked for.
   * Honoured at most once per distinct key, and never once the querent has
   * touched the deck. `null` (the default) means never move on your own.
   */
  arrivedPanel?: string | null;
  onPanelChange?: (key: string, source: PanelChangeSource) => void;
};

export function SwipeDeck({ panels, arrivedPanel = null, onPanelChange }: SwipeDeckProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduce = usePrefersReducedMotion();

  /* Refs, not state, for every one of these: none of them should re-render
     anything, and `interacted` in particular must survive the re-render that
     the summary's next chunk causes. */
  const interacted = useRef(false);
  const slidTo = useRef<Set<string>>(new Set());
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReported = useRef(0);

  /* The current props, reachable from an effect that must not depend on them.
     `panels` is a fresh array on every render -- listing it as a dependency
     would re-run the auto-slide effect on every streamed chunk. */
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const notify = useRef(onPanelChange);
  notify.current = onPanelChange;

  const many = panels.length > 1;

  const goTo = useCallback(
    (index: number, source: PanelChangeSource) => {
      const el = scroller.current;
      if (!el) return;
      const target = el.children[index] as HTMLElement | undefined;
      if (!target) return;
      /*
       * `offsetLeft` and not `index * clientWidth`: the track is
       * `position: relative`, so a panel's offsetLeft is its position inside the
       * track's padding box, independent of the current scroll. It is correct
       * even mid-glide, which `index * clientWidth` also is -- but offsetLeft
       * stays correct if a future deck ever gains a gap, and the failure mode of
       * the other one is silent.
       *
       * An explicit `behavior` because a JS value overrides the stylesheet's,
       * and this component must not depend on which of the two wins.
       */
      el.scrollTo({ left: target.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
      lastReported.current = index;
      setActive(index);
      const key = panelsRef.current[index]?.key;
      if (key) notify.current?.(key, source);
    },
    [reduce],
  );

  /* Any of these means the querent has an intention. Once true, never false. */
  const markInteracted = useCallback(() => {
    interacted.current = true;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const keys = panelsRef.current.map((p) => p.key);
    const focusIsElsewhere =
      document.activeElement !== null &&
      document.activeElement !== document.body &&
      !el.contains(document.activeElement);

    if (
      !shouldAutoSlide({
        arrived: arrivedPanel,
        panelKeys: keys,
        alreadySlidTo: slidTo.current,
        interacted: interacted.current,
        focusIsElsewhere,
      })
    ) {
      return;
    }

    const index = keys.indexOf(arrivedPanel as string);
    slidTo.current.add(arrivedPanel as string);

    /*
     * TWO FRAMES, AND NO CLEANUP. Both halves of that are load-bearing.
     *
     * TWO FRAMES because the panel being scrolled to was appended in this very
     * commit: the first frame is where it has been laid out, the second is where
     * its first chunk of text has painted. Scrolling in the effect body targets
     * an element with no width yet.
     *
     * NO `cancelAnimationFrame` IN A CLEANUP, even though every lint instinct
     * says to add one. THE SUMMARY STREAMS: the second chunk lands ~50ms later,
     * `ReaderDeck` re-renders, this effect's cleanup runs, and it would cancel
     * the frame before it ever fired. The effect then re-runs and finds the key
     * already in `slidTo`, so the deck NEVER SLIDES AT ALL -- silently, with no
     * error and nothing in the log. A stray frame after unmount is harmless
     * because `goTo` returns early on a null ref.
     */
    requestAnimationFrame(() => requestAnimationFrame(() => goTo(index, 'auto')));
  }, [arrivedPanel, goTo]);

  /*
   * The settled position, debounced. A snap scroll fires a scroll event per
   * frame for the whole decay; only the resting place is a fact worth
   * recording, and only a CHANGE in it is worth reporting.
   */
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const index = panelIndexAt(el.scrollLeft, el.clientWidth, panelsRef.current.length);
      setActive(index);
      if (index === lastReported.current) return;
      lastReported.current = index;
      const key = panelsRef.current[index]?.key;
      /*
       * 'user' unconditionally. The automatic path reports itself inside `goTo`
       * and sets `lastReported` before its own scroll events arrive, so its
       * settle is filtered out by the equality check above and cannot be
       * double-counted as a swipe.
       */
      if (key) notify.current?.(key, 'user');
    }, 120);
  }, []);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  return (
    <div className={styles.deck}>
      <div
        ref={scroller}
        className={styles.scroller}
        onScroll={onScroll}
        onPointerDown={markInteracted}
        onTouchStart={markInteracted}
        onWheel={markInteracted}
        onKeyDown={markInteracted}
      >
        {panels.map((panel) => (
          /* `role="group"`, not `<section aria-label>`: a named section is a
             `region` LANDMARK, and a reader's bio is not a landmark. `group`
             names without promoting. */
          <div key={panel.key} role="group" aria-label={panel.label} className={styles.panel}>
            {panel.node}
          </div>
        ))}
      </div>

      {many && (
        <div className={styles.dots}>
          {panels.map((panel, i) => (
            <button
              key={panel.key}
              type="button"
              className={styles.dot}
              aria-label={panel.label}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => {
                markInteracted();
                goTo(i, 'user');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

Run:

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test -- clientBoundary
```

`clientBoundary.test.ts` asserts no client component imports `@/lib/prompt/**` or
`@/lib/i18n/catalog`. This file imports neither. It also counts client components
with `expect(CLIENT.length).toBeGreaterThan(8)` — that number only goes up.

Commit.

---

### Task 7 — split `DaySummary` into a hook and a paragraph

**Step 1.** Rewrite `src/components/DaySummary.tsx`. The fetch body is unchanged
byte for byte — this is a move, not a rewrite, and the diff should show that.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId } from '@/lib/analytics/track.client';
import { todayKey } from '@/lib/storage';
import styles from './DaySummary.module.css';

/**
 * What this reader remembers about the querent's day (W5 §5.4), as a hook and a
 * paragraph.
 *
 * SPLIT BY V5, AND THE M14 CONTRACT MOVED UP ONE LEVEL RATHER THAN AWAY. This
 * used to be one component that returned `null` until the first byte and
 * nothing at all if there was nothing to say -- no skeleton, no reserved
 * height, no "you haven't read today" -- because roadmap §5 is explicit that an
 * empty state destroys the effect: it announces that the feature exists and
 * that this user has not earned it.
 *
 * That rule is UNCHANGED and is now enforced by `ReaderDeck`, which asks
 * `useDaySummary()` and builds a ONE-panel deck while the text is empty. A
 * second panel is never rendered blank, so there is still no empty state -- and
 * a deck with one panel has no dots and no affordance, so a first-time visitor
 * still never knows the component was here.
 *
 * WHY THE SPLIT AT ALL: the deck has to know whether a second panel exists
 * BEFORE deciding what to render, and a component that answers that by
 * returning `null` cannot be asked. The state had to be lifted; nothing else
 * about it changed.
 *
 * WHY IT IS STILL A CLIENT COMPONENT. An `await`ed database read plus a possible
 * model call in `src/app/[reader]/page.tsx` BLOCKS THE FIRST BYTE, and roadmap
 * §6 forbids that regardless of how the route renders. (The old canary --
 * `/thessaly` listed as prerendered -- died with W6, which made every route ƒ
 * for `<html lang>`. Plan §8 said to expect it.) So this still mounts empty and
 * fills in.
 *
 * IT STREAMS, unlike `FrequencyLine`. The endpoint sends 45 words in the
 * reader's own voice and watching them arrive reads as the reader speaking.
 * V5 leans on that: the deck slides on the FIRST BYTE so the querent is present
 * for it, not after `done` (D-V5-2).
 */
export function useDaySummary(readerId: string): string {
  const [text, setText] = useState('');

  useEffect(() => {
    /*
     * Aborted on unmount. StrictMode mounts, unmounts and remounts every effect
     * in development, and each request here can cost a model call on a route
     * whose entire design is about not paying for one twice.
     */
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/memory/summary?reader=${encodeURIComponent(readerId)}&date=${todayKey()}`,
          {
            headers: { [SESSION_HEADER]: getSessionId() },
            signal: controller.signal,
          },
        );

        // 204 is the common answer and is not a failure: nothing read today.
        if (res.status !== 200 || !res.body) return;

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let acc = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += value;
          /*
           * Set the accumulated string rather than appending in the updater.
           * StrictMode double-invokes updaters, and `setText(t => t + value)`
           * would duplicate every chunk in development -- the same class of
           * mistake as the side-effect-in-updater trap CLAUDE.md records for
           * the fan.
           */
          setText(acc);
        }
      } catch {
        /*
         * Silence, covering the abort and a real failure alike. There is no
         * error copy for this component by design (M14), so W6 has no string to
         * translate and there is no decision to make here. Whatever arrived
         * before the failure stays on screen; the endpoint stores it too.
         */
      }
    })();

    return () => controller.abort();
  }, [readerId]);

  return text;
}

/**
 * The paragraph. NOT NAMED -- and that is deliberate, not an omission.
 *
 * This used to carry `aria-label={t('memory.summary.a11yLabel', ...)}`, because a
 * paragraph that appears seconds after load with no heading is disorienting.
 * That is still true and the name still exists; it moved to the panel that wraps
 * this, so there is exactly ONE naming layer instead of a group and a paragraph
 * announcing the same sentence twice. The catalog key is unchanged and
 * `ReaderDeck` passes it.
 *
 * IF YOU EVER MOUNT THIS OUTSIDE A DECK, name it at the mount. `t()` is not
 * called here any more precisely so that the caller cannot forget to.
 */
export function DaySummary({ text }: { text: string }) {
  /* Belt and braces. `ReaderDeck` never builds a summary panel for empty text,
     so this is unreachable -- and it is the M14 rule stated where somebody
     grepping for it will find it. */
  if (!text) return null;
  return <p className={styles.summary}>{text}</p>;
}
```

**Step 2.** Rewrite the header of `src/components/DaySummary.module.css` and drop
the left rule:

```css
/*
 * The per-day reader summary, inside the reader swipe deck (W5 §5.4, reworked
 * by V5).
 *
 * NO NEW VALUES. This is the `.bio` register in `ReaderDeck.module.css` -- same
 * family, same size, same line height -- with `--gold-pale` for the ink. The
 * reader is still speaking at this point in the page and the summary is the
 * same voice as the bio, so matching that register rather than inventing one is
 * the whole design.
 *
 * THE LEFT RULE IS GONE, AND THAT IS THE POINT OF THE DECK. It existed to stop
 * the summary reading as a continuation of the bio when the two were stacked
 * paragraphs -- "without a mark they read as one paragraph that changed its
 * mind halfway through". They are no longer stacked and are never on screen
 * together, so the mark is separating things that cannot touch. Removing it also
 * makes both panels exactly the same text width, which is what lets the height
 * reserve in ReaderDeck.module.css be derived once instead of twice. The ink
 * still differs, which is enough to say "this is about you, today".
 *
 * NO EMPTY STATE AND NO RESERVED HEIGHT FOR AN ABSENT SUMMARY (M14). The panel
 * is not built until there is text, so this rule set never applies to an empty
 * element. The height reserve that keeps the deck from growing per chunk lives
 * on the PANEL, in ReaderDeck.module.css, and only exists once there is a
 * summary to reserve for.
 */
.summary {
  font-family: var(--font-body), Georgia, serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--gold-pale);
  margin: 0;
}
```

**Step 3.** `npm run typecheck` — `src/app/[reader]/page.tsx` now fails on the
changed `DaySummary` signature. Expected; Task 9 fixes it. Do not commit red;
carry Tasks 7–9 to one commit, or stub the page mount now and finish in Task 9.

---

### Task 8 — `ReaderDeck.module.css` and `ReaderDeck.tsx`

**Step 1.** Create `src/components/ReaderDeck.module.css`:

```css
/*
 * ============================================================================
 * THE READER DECK'S HEIGHT -- derived, not guessed. Read this before changing
 * `--summary-lines`, because a smaller number is not a tidier number.
 * ============================================================================
 *
 * THE PROBLEM. Two panels of different heights on one horizontal track, one of
 * which arrives incrementally. Three ways to size the track:
 *
 *   A. tallest panel, no reserve   -> the deck GROWS ON EVERY STREAMED CHUNK
 *                                     and the service list reflows six times.
 *   B. the active panel's height   -> the deck changes height on EVERY SWIPE,
 *      (JS + ResizeObserver)          so the service list moves under the
 *                                     querent's own thumb, repeatedly. Also
 *                                     the JS layout machinery VD17 exists to
 *                                     avoid.
 *   C. tallest panel + a RESERVE   -> the deck changes height exactly ONCE, at
 *      on the summary panel           first byte, at the same instant as the
 *                                     slide, and never again.
 *
 * C is chosen. `FrequencyLine`'s header records that "the list does not jump"
 * was verified by screenshot precisely because it is easy to believe and easy
 * to get wrong; C is the only one of the three where the claim is true for the
 * whole life of the page.
 *
 * WHAT IT COSTS. When there are two panels, the bio panel gains trailing space
 * equal to (reserve - its own height). Measured by _swipefit.html; the numbers
 * are in the table below. It is paid only by a querent who has already read
 * today -- for everyone else there is one panel, no reserve, and a deck exactly
 * as tall as the bio, which is byte-identical to what shipped before V5.
 *
 * ---------------------------------------------------------------------------
 * THE DERIVATION
 * ---------------------------------------------------------------------------
 * The panel's only input is its container's inline size, which is what makes
 * this exact rather than approximate (CLAUDE.md's verification tier 4).
 *
 *   shell content width  = viewport - 32px (16px padding each side), capped 520
 *   panel text width     = shell content width  (no gap, no panel padding --
 *                          the summary's left rule was removed for exactly this)
 *   line box             = 16px x 1.5 = 24px, the `.bio` register
 *
 * THE RESERVE IS SIZED TO THE TYPICAL SUMMARY, NOT THE 45-WORD CEILING.
 * `SUMMARY_MAX_WORDS` is 45 and lives in src/lib/prompt/summary.ts, which is
 * `server-only` (W7-D14) and CANNOT be imported here -- it is an input to this
 * comment, not to the code. Do not "fix" that by re-exporting it: that is a
 * prompt module reaching the browser bundle for a CSS constant.
 *
 * Sizing to 45 words would put the reserve at 9-10 lines and leave three empty
 * lines under Thessaly's four-line bio at every width. Sizing to the observed
 * typical length leaves at most two, and an over-length outlier crosses the
 * `min-height` and grows the deck one extra time. One extra reflow for an
 * outlier beats permanent dead space for everyone. THAT is why it is
 * `min-height` and not `height`.
 *
 * PROVISIONAL NUMBERS, replaced by Task 12's measurement:
 *
 *   typical summary        260 chars   (from `npm run smoke -- --summary`)
 *   longest bio            261 chars   (margaret, id)
 *   shortest bio           157 chars   (thessaly, id)
 *   mean advance          ~6.7px       Cormorant Garamond Light @16px
 *   ragged-right fill     ~0.93
 *
 *   width  text px  chars/line  summary lines  longest bio  shortest bio
 *   320      288       40           7              7            4
 *   360      328       46           6              6            4
 *   375      343       48           6              6            4
 *   390      358       50           6              6            4
 *
 * So: 6 lines, stepping to 7 below 340. Dead space under the SHORTEST bio is
 * then 2 lines (48px) at 360-390 and 3 lines (72px) at 320, and ZERO under the
 * longest bio at every width.
 *
 *   MEASURED <date>: _swipefit.html said <fill in>. <Keep or correct the two
 *   line counts here and say which.>
 *
 * @container AND NOT @media, because the query must follow the DECK's inline
 * size and not the viewport's -- V6 may mount a deck in a narrower column, and
 * _swipefit.html measures in iframes where the two happen to agree and would
 * therefore never catch the difference. `.deck` in SwipeDeck.module.css
 * declares `container-type: inline-size`; this file queries it from a
 * descendant, which is the only place the query resolves against that box.
 */

.bio {
  /* MOVED VERBATIM from src/app/[reader]/page.module.css. Not restyled. The
     bio is now inside the deck, so its rule belongs to the deck. */
  font-family: var(--font-body), Georgia, serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-warm);
  margin: 0;
}

.summaryPanel {
  --summary-lines: 6;
  min-height: calc(var(--summary-lines) * 16px * 1.5);
}

@container (max-width: 339px) {
  .summaryPanel {
    --summary-lines: 7;
  }
}
```

**Step 2.** Create `src/components/ReaderDeck.tsx`:

```tsx
'use client';

import { useCallback } from 'react';
import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { DaySummary, useDaySummary } from './DaySummary';
import { SwipeDeck, type PanelChangeSource, type SwipePanel } from './SwipeDeck';
import styles from './ReaderDeck.module.css';

/**
 * The reader's bio and today's summary, side by side (V5, roadmap §1.5).
 *
 * THIS IS WHERE THE M14 CONTRACT IS ENFORCED. `panels` has ONE entry until the
 * summary's first byte, so a querent who has not read today gets one panel, no
 * dots, no affordance and a deck exactly as tall as the bio -- indistinguishable
 * from the stacked layout that shipped before V5, which is the point. A deck
 * that rendered two panels and left the second blank would be precisely the
 * empty state roadmap §5 forbids: it announces that the feature exists and that
 * this user has not earned it.
 *
 * `arrivedPanel` IS 'summary' FROM THE FIRST BYTE ONWARD, NOT ONLY ON THE
 * TRANSITION. It is derived from the text rather than latched, and `SwipeDeck`
 * is what makes it fire once -- its `slidTo` set. Latching it here as well would
 * be two mechanisms for one rule, and the one nobody tests would rot.
 *
 * WHY FIRST BYTE AND NOT `done`: D-V5-2. Short version -- a late steal is worse
 * than an early one, the route pulls the first chunk before the headers so the
 * first byte is real prose, and the cached path (the common one for anyone who
 * HAS a summary) is not streamed at all and arrives whole.
 *
 * `bio` IS PASSED IN, RESOLVED. It is DATA, not copy: `reader.bio` is a
 * `Localized<string>` in readers.json, and the page already picks the locale's
 * side of it. Copy comes from `useT()` here, as everywhere -- no locale prop is
 * drilled.
 */
export function ReaderDeck({
  readerId,
  readerName,
  bio,
}: {
  readerId: string;
  readerName: string;
  bio: string;
}) {
  const t = useT();
  const text = useDaySummary(readerId);

  const panels: SwipePanel[] = [
    {
      key: 'bio',
      label: t('picker.reader.bio.a11yLabel', { name: readerName }),
      node: <p className={styles.bio}>{bio}</p>,
    },
  ];

  if (text) {
    panels.push({
      key: 'summary',
      // The name that used to sit on DaySummary's <p>. Same key, one layer up.
      label: t('memory.summary.a11yLabel', { reader: readerName }),
      node: (
        <div className={styles.summaryPanel}>
          <DaySummary text={text} />
        </div>
      ),
    });
  }

  const onPanelChange = useCallback(
    (key: string, source: PanelChangeSource) => {
      /*
       * `track()` returns void and is NEVER awaited (CLAUDE.md). The client
       * import, not `@/lib/analytics/track`, which would drag node:async_hooks
       * and next/server into the browser bundle and fail the build.
       *
       * The cast is safe and narrow: this deck's keys are the two literals
       * above, and the taxonomy declares exactly those two.
       */
      track('reader.panel_swiped', {
        reader_id: readerId,
        panel: key as 'bio' | 'summary',
        source,
      });
    },
    [readerId],
  );

  return (
    <SwipeDeck
      panels={panels}
      arrivedPanel={text ? 'summary' : null}
      onPanelChange={onPanelChange}
    />
  );
}
```

---

### Task 9 — rewire the page, delete the old `.bio`

**Step 1.** In `src/app/[reader]/page.tsx`, replace the bio paragraph and the
`DaySummary` mount (and their comment block) with:

```tsx
      {/* The reader's bio and, when there is one, what this reader remembers
          about today -- two panels of one swipe deck (V5, roadmap §1.5).

          IT RENDERS ONE PANEL FOR A QUERENT WHO HAS NOT READ TODAY, which is
          the common case and must stay the cheapest: no dots, no affordance,
          and a deck exactly as tall as the bio. There is no empty second panel,
          ever (M14).

          STILL A CLIENT COMPONENT, and the reason is the one that outlived W6's
          prerendering canary: an awaited DB read plus a possible model call
          HERE blocks the first byte of the page, and roadmap §6 forbids that
          whether or not the route is static. The three readers and their
          services must render before any memory feature resolves. */}
      <ReaderDeck readerId={reader.id} readerName={reader.name} bio={reader.bio[t.locale]} />
```

Update the imports: drop `DaySummary`, add
`import { ReaderDeck } from '@/components/ReaderDeck';`.

**Step 2.** Delete the `.bio` rule from `src/app/[reader]/page.module.css` (it now
lives in `ReaderDeck.module.css`).

> **`.shell` has `gap: 18px`, and it now has one fewer child when a summary is
> present.** Before V5 the bio and the summary were two children with 18px
> between them; now they are one. That is the intended visual change — the two
> are alternatives, not neighbours — but note it, because the space between the
> banner and the eyebrow shrinks by 18px + the summary's height for a querent who
> has read today, and someone comparing screenshots will see it.

**Step 3.**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test
npm run build
```

`npm run build` is not optional here (CLAUDE.md's TypeScript trap) and it also
runs `audit:secrets`, which must stay green: nothing in V5 reads a
`NEXT_PUBLIC_*` var or embeds prompt prose. If the build dies with
`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`, that is the
AAAA-lookup trap — **retry the build**, do not debug the code.

**Step 4.** Commit Tasks 7–9 together (they are one compiling unit).

```sh
git add src/components/DaySummary.tsx src/components/DaySummary.module.css \
        src/components/ReaderDeck.tsx src/components/ReaderDeck.module.css \
        src/components/SwipeDeck.tsx src/components/SwipeDeck.module.css \
        'src/app/[reader]/page.tsx' 'src/app/[reader]/page.module.css'
git commit -m "V5: the reader panel becomes a swipe deck

The bio and today's summary are two panels of one CSS scroll-snap track.
One panel until the first byte, because a blank second panel IS the empty
state M14 forbids. The deck slides itself once, never after the querent has
touched it, and never smoothly under prefers-reduced-motion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 — `_swipeshot.html`: does it slide, exactly once, and only when allowed

Create `public/cards/_swipeshot.html` (gitignored by `public/cards/_*.html`).
Modelled on `_sumshot.html` for the session and the stub, and on `_dev-events.html`
for the hydration wait and the assertions.

```html
<!doctype html>
<meta charset="utf-8" />
<title>JMTarot reader deck — auto-slide, driven</title>
<!--
  V5. DRIVE the real service picker and check the deck's behaviour, not its
  looks. LOCAL DEVELOPMENT ONLY, gitignored.

  WHAT IT ANSWERS, and none of these is visible in a screenshot:
    1. empty  -- a 204 leaves ONE panel, NO dots, and a deck whose height equals
                 the bio paragraph's. This is the M14 assertion and it is the
                 most important one in the file.
    2. auto   -- a streamed summary appends a second panel and the deck scrolls
                 to it EXACTLY ONCE. Counted from `reader.panel_swiped` bodies
                 posted to /api/events, not from scrollLeft, because scrollLeft
                 cannot tell one slide from two.
    3. guard  -- the querent scrolls the deck BEFORE the stub resolves; the deck
                 must stay where they put it and must not report a 'auto'.
    4. back   -- a real PointerEvent on dot 0 returns to the bio and reports
                 'user'.

  WAIT FOR HYDRATION, NOT `load` (CLAUDE.md). `load` fires when the SSR HTML has
  parsed, before React attaches its delegated listener -- a real click on a real
  button then does nothing, which reads as a dead component. Poll for the
  `__reactFiber$` key. This is the opposite of _slotfit.html's rule, and both are
  right: that harness only MEASURES server-rendered markup; this one DISPATCHES.

  THE STUB IS INSTALLED ON `load`, NOT AFTER HYDRATION, because the component's
  fetch fires in its mount effect and would beat a later patch.

  Usage:
    open http://localhost:3001/cards/_swipeshot.html?case=empty
    open .../_swipeshot.html?case=auto
    open .../_swipeshot.html?case=guard
    open .../_swipeshot.html?case=back
  Needs DEV_PASSWORD_LOGIN=1 and `npm run db:seed`.
-->
```

The script must:

1. `POST /api/auth/dev-session` with `{username:'miftah'}`; fail loudly on 404
   with the `DEV_PASSWORD_LOGIN=1` hint.
2. Create a **390px** iframe pointed at `/margaret`.
3. On `load`, patch `win.fetch`:
   - `/api/memory/summary` → 204 for `case=empty`; otherwise a `ReadableStream`
     that enqueues three chunks with a `win.setTimeout(r, 400)` between them,
     **after an initial 1200ms delay** so `case=guard` has a window in which to
     interact first.
   - `/api/events` → record the parsed body into an array, then delegate to the
     real fetch so nothing is swallowed.
4. Poll for hydration: `Object.keys(node).some(k => k.startsWith('__reactFiber$'))`
   on the deck's scroller. 15s ceiling; report "timed out waiting for hydration".
5. Per case:
   - **empty**: after 3s, assert `panels.length === 1`, no `[class*="dots"]`,
     and `deck.getBoundingClientRect().height === bioParagraph.height` within
     0.5px. Assert zero `reader.panel_swiped` events.
   - **auto**: poll until `scroller.scrollLeft > 0`; assert it settles at
     `scroller.clientWidth` (±1); assert `panels.length === 2` and two dots;
     wait a further 3s past the stream's end and assert **exactly one**
     `reader.panel_swiped` with `source:'auto'` and `panel:'summary'` — one, not
     one-per-chunk, which is the `slidTo` guard and the no-`cancelAnimationFrame`
     rule both being checked at once.
   - **guard**: at 400ms — before the stub's first byte — set
     `scroller.scrollLeft = 0` via a real `PointerEvent('pointerdown')` dispatched
     at the scroller (that is what sets `interacted`, and it is the honest input,
     unlike setting the ref). Then wait out the stream and assert
     `scroller.scrollLeft === 0` and **zero** `source:'auto'` events.
   - **back**: run `auto`, then dispatch `pointerdown`/`pointerup`/`click` at
     `dots[0]`; assert `scrollLeft` returns to 0 and one
     `{panel:'bio', source:'user'}` was posted.
6. Print PASS/FAIL per case, in the `_slotfit.html` register.

**Read the chosen elements, not the first thing that matches.** The scroller is
`main div[class*="scroller"]`; the panels are its `[role="group"]` children.
`_dev-events.html`'s note applies: a harness reading the wrong element is worse
than no harness.

Run all four cases. Commit the plan's findings into the CSS header if anything
surprises you; the harness itself is gitignored and is not committed.

---

### Task 11 — verify the once-only guard by NEGATIVE CONTROL

The `auto` case passes whether or not `slidTo` works, if the deck happens to be
at the target already. So break it on purpose, exactly as W7 did for its gate
timing test:

1. Comment out the `slidTo.current.add(...)` line in `SwipeDeck.tsx`.
2. Re-run `?case=auto`. It must now report **more than one** `source:'auto'` event
   (one per streamed chunk).
3. Restore the line. Re-run. Exactly one.

Do the same for the no-cleanup rule: add a
`return () => cancelAnimationFrame(...)` to the auto-slide effect and confirm
`?case=auto` starts reporting **zero** slides — that is the silent failure the
comment describes. Then remove it.

Record both results in the commit message. Do not skip this: an assertion that
cannot fail is an assertion nobody should trust.

---

### Task 12 — `_swipefit.html`: the geometry, measured

Create `public/cards/_swipefit.html`, modelled directly on `_slotfit.html`
(including its `load` + two-`requestAnimationFrame` wait, which is the right rule
here — this harness only measures, it dispatches nothing).

Grid: **4 widths (320 / 360 / 375 / 390) × 2 locales × 3 readers × 2 states.**
The `present` state stubs `/api/memory/summary` with a **worst-case** body: 45
Indonesian words assembled from the longest plausible vocabulary, so the reserve
is measured against the ceiling and not against a lucky sample.

For each cell, read with `getBoundingClientRect`:

| measurement | assertion |
|---|---|
| panel width vs scroller `clientWidth` | equal within 0.5px, **both panels** — this is the `panelIndexAt` identity |
| scroller `scrollWidth` | exactly `n × clientWidth` — proves there is no gap |
| deck height, `empty` state | equal to the bio `<p>`'s height within 0.5px — **the M14 assertion** |
| deck height, `present` state | equal at every scroll position; scroll to panel 1 and re-measure |
| summary panel rendered lines | `height / 24` — report; FAIL if it exceeds `--summary-lines` at the typical body, NOTE if it exceeds only at the worst-case body |
| bio dead space | `deckHeight − bioHeight`, reported per reader/locale/width |

FAIL/NOTE discipline from `_slotfit.html`: overflow and a moving deck height are
failures; dead space is a **note** with the number, because it is the accepted
cost of D-V5-3 and a harness that reports red for the app as designed is a
harness people stop running.

Then:

1. Take the measured chars-per-line and the measured typical summary length
   (`npm run smoke -- --summary` prints six real ones — take the longest).
2. Write the real numbers into `ReaderDeck.module.css`'s header table, replacing
   `PROVISIONAL NUMBERS` with `MEASURED <date>`, and correct `--summary-lines`
   and the `@container` breakpoint if the measurement disagrees.
3. **If the dead space under the shortest bio exceeds 3 lines (72px) at any width
   ≥ 360**, drop `--summary-lines` by one and accept the extra growth step for
   long summaries. Write down which you chose and why.

Commit the stylesheet change.

---

### Task 13 — look at it

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:up && npm run dev     # http://localhost:3001

PORT=3001 tools/shot.sh '/cards/_sumshot.html?reader=thessaly&state=empty'   500 900 /tmp/deck-empty.png
PORT=3001 tools/shot.sh '/cards/_sumshot.html?reader=thessaly&state=present' 500 900 /tmp/deck-present.png
PORT=3001 tools/shot.sh '/cards/_sumshot.html?reader=margaret&state=present' 500 900 /tmp/deck-margaret.png
```

`_sumshot.html` already stubs both states at a real 390px in an iframe and needs
no change — it drives `/{reader}` and patches the same endpoint. Read all three
PNGs. **`tools/shot.sh` at `--window-size=375` would be a lie** — Windows clamps a
Chrome window to ~500px, so a narrow shot merely crops a 500px layout. 500 is the
honest width for it; 390 comes from the iframe inside.

What to look for, in order:
1. `deck-empty` must be indistinguishable from `git stash`'s version of the page
   with no summary. Diff them if unsure.
2. `deck-present`: does the trailing space under Thessaly's four-line bio read as
   breathing room or as a hole? This is the one judgement Task 12's numbers
   cannot make.
3. Are the two dots quiet enough? They should be findable and not noticed.

Add `&still=1` to the iframe src inside `_sumshot.html` if a capture lands
mid-glide — and if it does, the `html[data-still] .scroller` rule in
`SwipeDeck.module.css` is not working and that is a bug, not a workaround.

---

### Task 14 — the full gate

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test
npm test -- i18n
npm test -- clientBoundary
npm run build
```

Not run, and why: `npm run smoke` (no prompt text changed — V5 touches no file
under `src/lib/prompt/**`), `npm run test:integration` (no query module, no
schema, no migration).

**The ten-second check that is not automatable:** stop Postgres
(`npm run db:down`), reload `/margaret`. The endpoint 204s, the deck renders one
panel, the page is exactly as it was, and nothing appears in the log but
`[analytics] …`. That is W4's requirement and V5 must not have broken it.

---

## Schema deltas

**None.** V5 adds no table, no column, no migration and no query module. It reads
`/api/memory/summary`, which W5 built and which is unchanged.

## Event deltas

One name, taking the taxonomy from 44 to 45. Reconciliation checks the eight
workstreams reach 59.

```ts
'reader.panel_swiped': { reader_id: string; panel: 'bio' | 'summary'; source: 'auto' | 'user' };
```

- **No free text** (`sanitizeProps()` rule 1). `panel` is a closed two-value
  union of machine tokens, not a label and not a translated string; `source` is a
  closed two-value union. `events` rows survive account erasure with `user_id`
  nulled and there is nothing here that identifies anybody.
- **Bounded cardinality** (rule 2). Four combinations, forever.
- **A key, not an index** (rule 3). An index silently changes meaning the day a
  third panel is inserted.
- **Fired by `ReaderDeck`, never by `SwipeDeck`** (D-V5-5), so V6/V7 can mount the
  deck without inheriting a reader-specific event.
- **The query it exists for:** `source='auto'` count vs `source='user'` count.
  If almost nobody ever swipes back to the bio, the deck is a slower way of
  showing the summary and D-V5-2 should be revisited. If the `auto` count is far
  below the `memory.summary_shown` count, the interaction guards are firing more
  than expected and the deck is not sliding when it should.

## Interfaces I export

For V6 (`ReadingView`, history) and V7 (the share page), who may want the same
deck:

```ts
// src/components/SwipeDeck.tsx  -- 'use client'
export type SwipePanel = { key: string; label: string; node: ReactNode };
export type PanelChangeSource = 'auto' | 'user';
export type SwipeDeckProps = {
  panels: SwipePanel[];
  arrivedPanel?: string | null;
  onPanelChange?: (key: string, source: PanelChangeSource) => void;
};
export function SwipeDeck(props: SwipeDeckProps): JSX.Element;

// src/lib/swipeDeck.ts  -- PURE, importable anywhere
export function panelIndexAt(scrollLeft: number, panelWidth: number, count: number): number;
export type AutoSlideInput = { /* see the file */ };
export function shouldAutoSlide(i: AutoSlideInput): boolean;

// src/components/DaySummary.tsx  -- 'use client'
export function useDaySummary(readerId: string): string;   // '' until first byte
export function DaySummary(props: { text: string }): JSX.Element | null;
```

Four rules for a reuser:

1. **You supply the panel list, and its length is your M14 contract.** `SwipeDeck`
   will never render a placeholder for a panel you did not give it.
2. **Every panel needs a `label`**, already localized. It names the panel's
   `role="group"` and its dot.
3. **`SwipeDeck` fires no events.** Take `onPanelChange` and fire your own.
4. **Do not add a `gap` to the track** without also replacing `panelIndexAt`.
   The stylesheet header says why.

## Interfaces I need

**From V4 (the account shell), and this is the only real collision:**

- **V4 mounts `AccountButton` top-right on every page, including `/[reader]`.**
  V5 owns `src/app/[reader]/page.tsx` (§8) and rewrites two of its children.
  **The two must not both edit that file.** V5's change is confined to the block
  between `</div>` (the banner wrap) and `<Eyebrow>`. If V4's button goes in
  `src/app/layout.tsx` or a shared header component — which is what "the app-wide
  header slot" implies — there is no conflict at all. **V4 should confirm it is
  not adding a child to `[reader]/page.tsx`.** V5 does not touch `layout.tsx`.
- **`.shell` in `src/app/[reader]/page.module.css`** keeps its `.back` link at
  top-left. V5 deletes only `.bio` from that file. If V4 needs a positioning
  context for a top-right button, adding `position: relative` to `.shell` is
  V4's edit and does not conflict with the deletion.
- **The account menu is presumably an overlay or a sheet.** A CSS scroll-snap
  container underneath an open sheet can capture a horizontal drag that was
  meant for the sheet. V5 sets `overscroll-behavior-inline: contain` on the
  track, which stops the deck's own overscroll leaking outward but does not stop
  the deck from receiving a touch. If V4's sheet is not `position: fixed` with a
  backdrop that swallows pointer events, it should be.
- **`LocaleSwitch` moving into the menu (R1)** is invisible to V5. The deck's
  copy comes from `useT()` and re-renders with the provider like everything else.
  Note that switching locale re-renders `ReaderDeck` with a new `bio` string but
  does **not** remount it, so `slidTo` survives — the deck will not re-slide after
  a language switch, which is correct.

**From nobody else.** V5 depends on no other workstream (§8 build order: "V2, V4
and V5 in parallel"), and no other workstream depends on V5 except optionally
through `SwipeDeck`.

**Shared files V5 touches, where a merge conflict is expected and normal:**
`src/lib/analytics/events.ts` (one name, one shape) and both catalogs (one key).

## Open questions

1. **Does the trailing space under a short bio read as a hole?** Task 12 gives
   the number (2 lines at ≥360, 3 at 320); Task 13 gives the judgement, and it is
   the one thing here that cannot be settled numerically. The fallback is one
   fewer reserve line and one extra growth step for long summaries. **The
   fallback that must NOT be reached for is vertically centring the bio** —
   centring makes the bio drift downward at the same instant the deck slides
   sideways, and two motions at once is not this app's register.
2. **First byte vs `done` (D-V5-2)** is decided but not measured. If the observed
   chunk-1-to-chunk-2 gap on `glm-4.6` routinely exceeds ~600ms, the querent
   arrives at three words and waits, and the answer changes to "slide on the
   first chunk that completes a sentence". Nothing in V5's structure would need
   to change: `arrivedPanel` would derive from a different predicate on `text`.
3. **Reduced motion jumps rather than not moving, and that is arguable.** The
   precedent chosen is `FanGrid`: a reduced-motion user gets the state change
   without the animation, not a smaller feature. The counter-case — that an
   instantaneous, unrequested jump is *more* disorienting than a glide — is real,
   and the alternative would be not to auto-slide at all and let the two dots be
   the whole affordance. Only a person who uses the setting can settle it.
4. **Should `reader.panel_swiped` carry `panel_count`?** With two panels it is a
   constant. If V6 mounts a three-panel deck it stops being one, and adding a
   prop later means every historic row is missing it. Left off; V6 decides.
5. **`overscroll-behavior-inline: contain` and Safari's back gesture** cannot be
   verified in WSL. It goes on the real-iPhone list alongside `100dvh`, the
   safe-area insets and Add to Home Screen.
6. **Nothing here has been seen on a real device**, and a horizontal snap track
   next to a vertically scrolling page is exactly the interaction where a phone
   disagrees with a desktop browser. Same list.

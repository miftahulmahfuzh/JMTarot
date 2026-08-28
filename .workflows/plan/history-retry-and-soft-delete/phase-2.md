# Phase 2: Soft delete — the swipe gesture and the row

**Plan set:** `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md`
**Analysis:** `20260828-145716-GEV5_code_analyzer.md`
**Depends on:** Phase 1
**Difficulty:** NORMAL
**Package:** `src/app/history`, `src/lib/history`

---

## Goal

A horizontal swipe on a `/history` row reveals a trash control; pressing it opens a
confirmation sheet; confirming issues `DELETE /api/history/<id>` and, on a 2xx, the row
leaves the list. The gesture logic lives in a pure module `npm test` can reach, a tap still
opens the reading, and the destructive action is reachable with a keyboard and nothing else.
Nothing in this phase touches the database, the delete route, or anything retry-related.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts.

**Creates:**
- `src/lib/history/swipe.ts` — `REVEAL_WIDTH`, `DIRECTION_SLOP`, `OPEN_AT`,
  `FLICK_PX_PER_MS`, `RUBBER_BAND`, `MAX_OVERDRAG`, `clampOffset`, `beginDrag`,
  `advanceDrag`, `endDrag`, types `SwipeAxis`, `SwipeDrag`, `SwipeRelease`. **PURE** — no
  React, no `server-only`, no DOM types, no `process.env`, imports nothing.
- `src/lib/history/swipe.test.ts` — the unit suite for the above.
- `src/lib/analytics/events.ts` — event name `'history.item_deleted'` and its prop shape.
- `src/lib/analytics/events.test.ts:129` — **the ceiling moves 76 -> 77, with its register
  entry.** **RECONCILED, AND IT WAS A GAP IN BOTH PLANS AS WRITTEN:** the taxonomy is exactly
  AT its ceiling on this base (`EVENT_NAMES.length === 76`, `toBeLessThanOrEqual(76)` — both
  re-measured by the reconciler), so `history.item_deleted` is the name that moves it and this
  phase is the only phase that adds a name. **Phase 4 must not touch that test** — it widens
  `reading.retried`'s prop shape and adds no name, so the count does not move from its side.
  See Step 6b.
- Eight message keys in **both** catalogs: `history.item.delete.aria`,
  `history.item.delete.heading`, `history.item.delete.body1`, `history.item.delete.body2`,
  `history.item.delete.cancel`, `history.item.delete.confirm`,
  `history.item.delete.working`, `history.item.delete.failed`.

**Signature changes:**
- `HistoryItemRow({ item, today })` -> `HistoryItemRow({ item, today, open, onOpenChange, onDeleted })`
  (`src/app/history/HistoryItemRow.tsx:30`). The only caller is `HistoryBrowser`.

**Deletes:** nothing.
**Renames:** nothing.

**The exact request I send to Phase 1's route** — this is the whole cross-phase surface:

```
DELETE /api/history/<item.id>
  x-jm-session:    <getSessionId()>          // SESSION_HEADER
  x-jm-local-date: <today>                   // LOCAL_DATE_HEADER, 'YYYY-MM-DD'
  signal:          AbortController, 25s      // REQUIRED by Phase 1's route header
  (no body, no content-type, no credentials option — same-origin cookie by default)
```

**Statuses I branch on:** exactly two branches — `response.ok` (any 2xx; Phase 1 says 204)
and everything else. There is **no per-status handling**: a 401, a 404, a 503, a thrown fetch
and a 25s abort all render `history.item.delete.failed`, leave the sheet open and leave the row
in the list.

**The 25s bound is not optional and is not mine to choose away** (reconciled). Phase 1's route
declares `maxDuration = 20` and its header states in terms that a bigger server budget is only
safe paired with a bound on the caller — `POST /api/locale`'s lesson. 25 > 20 so the client
never aborts a request the server would have answered. **An abort takes the same failure branch
as everything else**, which is a deliberate departure from Phase 1's handoff suggestion of
"hide optimistically and re-fetch": this component holds no optimistic state, and hiding a row
on an unknown outcome is the false *"it's gone"* the confirmed-removal design exists to refuse.
The route is idempotent, so the resolution is one more tap.

**Requires (from Phase 1):**
1. `DELETE /api/history/[id]` exists and answers **2xx** for a successful delete **and for
   an already-deleted or unknown-to-this-user reading** (the idempotent answer Phase 1's plan
   promises, per `readingWithCards`'s no-oracle rule). If Phase 1 ships a 404 for the
   already-deleted case instead, this component tells the querent the delete failed when it
   did not — one wasted tap on an idempotent route, which is the *safe* direction
   (`DeleteAccount`'s ruling) but is not what either plan says. **RECONCILER: CONFIRMED 2xx.** Phase 1's route
   answers **204 with an empty body** for all four outcomes — deleted now, already deleted, not
   yours, never existed — and its contract test asserts there is no JSON body on that path,
   because a distinguishable answer is the existence oracle `readingWithCards` refuses. This
   branch is correct as written.
2. Phase 1's read filters have landed, so a deleted reading is gone from
   `readingsForDay`/`historyDays` and a reload agrees with what this component removed.
3. The route revokes share links in the same transaction — the copy in
   `history.item.delete.body1` states that consequence to the querent and is only honest if
   Phase 1 does it.

**Leaves alone (owned by others):**
- `src/lib/db/**` (Phase 1) — this phase issues one `fetch` and imports no query module.
- `src/app/api/history/[id]/route.ts` (Phase 1).
- `src/lib/reading/retryable.ts`, `flush.ts`, `/api/reading/retry/**` (Phase 3).
- `src/app/history/[id]/HistoryDetail.tsx` (Phase 4).

**Shared-file handoffs — what these three files look like when I am done** (Phase 4 also
edits all three; quote them from here, not from `origin/main`):

| File | After this phase |
|---|---|
| `src/lib/analytics/events.ts` | `EVENT_NAMES` is **77**. The `// — history (V6) —` group has four entries, `history.item_deleted` last. **`reading.retried` ALREADY EXISTS on this base** (`events.ts:79`, shape `{ reader_id: string; service_id: string; attempt: number }`, fired by `Draw.tsx:680`) — Phase 4 folds in **nothing**, and the plan index's "fold in `reading.retried`" line **has been corrected by the reconciler**. Phase 4 widens that existing shape (`surface`, `reading_id`, `prior_status`, `age_days`) rather than adding a name, so **77 is the final total** and this phase owns the ceiling move that gets there (Step 6c). |
| `src/app/history/HistoryItemRow.tsx` | Rewritten (below). **RECONCILED: PHASE 4 MAKES ZERO EDITS TO THIS FILE AND TO ITS `.module.css`.** This phase owns both outright. Phase 4's retry hint turned out to be a change to the VALUE of `history.item.unfinished` — the paragraph this file already renders on exactly the `!item.hasBody` rows, which is exactly the retry predicate — so there is no second element and no marked insertion point to honour. **Keep rendering that key, and keep the paragraph non-interactive:** it is inside the `<Link>` *and* inside the swipe surface, so a nested `<button>` there would swallow both the tap and the drag. One place to press stays `/history/[id]`. |
| `src/lib/i18n/locales/{id,en}.ts` | The V6 history block gains the eight `history.item.delete.*` keys, placed immediately after `history.item.shared` and before `history.detail.back`. Phase 4's `history.retry.*` keys go **after `history.detail.noBody`**, so the two phases do not collide on one line. |

---

## Files

| File | Action | What changes |
|---|---|---|
| `src/lib/history/swipe.ts` | create | the pure gesture machine |
| `src/lib/history/swipe.test.ts` | create | loop 1 for the machine |
| `src/app/history/HistoryItemRow.tsx` | rewrite | swipe surface, tray, trash control, confirm sheet, the delete fetch |
| `src/app/history/HistoryItemRow.module.css` | rewrite | the tray, the slider, the sheet |
| `src/app/history/HistoryBrowser.tsx` | modify | `openId`, `daysNonce`, `setTray`, `removeItem`, three new props on the row (`:19`, `:57-88`, `:115`, `:148-157`) |
| `src/lib/analytics/events.ts` | modify | one name at `:135`, one prop shape at `:668` |
| `src/lib/analytics/events.test.ts` | modify | `:129` the ceiling 76 -> 77, plus the register entry above it |
| `src/lib/i18n/locales/id.ts` | modify | eight keys after `:908` |
| `src/lib/i18n/locales/en.ts` | modify | eight keys after `:469` |

---

## Implementation Steps

### Step 1: The pure gesture machine

**File:** `src/lib/history/swipe.ts` (new)

**Change:** the whole decision — direction lock, offset, rubber band, tap-vs-drag, and
where the tray settles — as pure functions over plain numbers. `src/lib/swipeDeck.ts` is
the **shape** copied (a policy module beside a thin component, because this project has no
jsdom and no Testing Library); none of its code is reused, because that module is about a
scroll-snap container and this is a transform on a fixed track.

**Code:**

```ts
/**
 * The swipe-to-reveal machine for one `/history` row. PURE — plain numbers in,
 * plain numbers out. No React, no DOM types, no `server-only`, no imports.
 *
 * WHY IT IS HERE AND NOT IN THE COMPONENT. `src/lib/swipeDeck.ts` carries the
 * long version: this project has no jsdom, no Testing Library and no
 * Playwright, so the only part of a client component `npm test` can reach is
 * the part that touches neither React nor the DOM. `swipeDeck.ts` is the SHAPE
 * this file copies and NOT a module it reuses — that one asks which panel a
 * scroll-snap container settled on, which is a different mechanic with
 * different failure modes.
 *
 * THE ONE THING A LATER CHANGE WILL BREAK is the direction lock. Every rule in
 * `advanceDrag` exists because the alternative is a row that either refuses to
 * open or eats the page's vertical scroll, and neither of those looks like a
 * bug in this file.
 */

/**
 * How far the row slides left, in px, when the tray is open.
 *
 * IT IS ALSO THE TRAY'S WIDTH, and `HistoryItemRow.module.css` derives its
 * `--tray` from this number rather than declaring 88 twice. 88 is not a taste
 * value: the trash control fills the tray, the row is at least 90px tall (three
 * 66px thumbs plus 12px of padding top and bottom), and 88x90 clears the 44px
 * iOS minimum on both axes with room to spare. `PublicShare`'s 36px button is
 * already a known defect in this repo and a second one must not ship.
 */
export const REVEAL_WIDTH = 88;

/**
 * How far a pointer must travel before the machine commits to an axis.
 *
 * BELOW THIS THE GESTURE IS STILL A TAP, and that is the only definition of a
 * tap this file has: `axis === 'none'` at release. A separate tap threshold was
 * drafted and dropped — two thresholds create a dead band where a gesture is
 * neither a tap nor a drag, and 7px of finger wobble during a tap is extremely
 * common on glass.
 */
export const DIRECTION_SLOP = 8;

/** Past halfway, a release settles open. */
export const OPEN_AT = REVEAL_WIDTH / 2;

/**
 * A flick this fast decides the settle regardless of where the row got to.
 *
 * Without it a short, fast leftward flick — the gesture people actually make —
 * settles closed because it never reached `OPEN_AT`, and the row reads as
 * broken. Sign convention: POSITIVE is leftward, i.e. opening.
 */
export const FLICK_PX_PER_MS = 0.5;

/** How much of an overdrag past `REVEAL_WIDTH` is shown. */
export const RUBBER_BAND = 0.35;

/** And the ceiling on it, so a 400px drag does not tear the row off the screen. */
export const MAX_OVERDRAG = 28;

export type SwipeAxis = 'none' | 'x' | 'y';

export type SwipeDrag = {
  /** Where the pointer went down. */
  readonly startX: number;
  readonly startY: number;
  /** Where the tray was at pointer-down: 0 closed, `REVEAL_WIDTH` open. */
  readonly baseOffset: number;
  readonly axis: SwipeAxis;
  /** The current slide, in px. `0 <= offset <= REVEAL_WIDTH + MAX_OVERDRAG`. */
  readonly offset: number;
  /** The RUNNING MAXIMUM distance in either axis. Never decreases. */
  readonly travel: number;
  readonly lastX: number;
  readonly lastAt: number;
  /** px per ms, positive leftward. */
  readonly velocity: number;
};

export type SwipeRelease =
  /** The pointer never committed to an axis. The caller decides what a tap means. */
  | { kind: 'tap' }
  | { kind: 'settle'; open: boolean };

/**
 * Clamp a raw slide into what may be painted.
 *
 * NO RUBBER BAND AT THE CLOSED END, DELIBERATELY. Dragging a closed row to the
 * RIGHT is either the start of a page gesture or a mis-swipe; giving it visual
 * feedback tells the querent there is something to find in that direction, and
 * there is not.
 */
export function clampOffset(raw: number): number {
  if (raw <= 0) return 0;
  if (raw <= REVEAL_WIDTH) return raw;
  return REVEAL_WIDTH + Math.min(MAX_OVERDRAG, (raw - REVEAL_WIDTH) * RUBBER_BAND);
}

/** Pointer down. `openNow` is the row's settled state, not a guess. */
export function beginDrag(x: number, y: number, at: number, openNow: boolean): SwipeDrag {
  const baseOffset = openNow ? REVEAL_WIDTH : 0;
  return {
    startX: x,
    startY: y,
    baseOffset,
    axis: 'none',
    offset: baseOffset,
    travel: 0,
    lastX: x,
    lastAt: at,
    velocity: 0,
  };
}

/**
 * Pointer move. Returns a NEW drag; it never mutates the one it is given.
 *
 * THE AXIS LOCK IS STICKY AND THAT IS THE POINT. Once the gesture has been
 * judged vertical the row stops responding for the rest of the sequence, so a
 * flick down a long list cannot leave a trail of half-open rows behind it. The
 * caller pairs this with `touch-action: pan-y`, which is what keeps the page's
 * own scroll native while we still receive the moves.
 *
 * VELOCITY IS CARRIED THROUGH A DUPLICATE SAMPLE. Browsers routinely emit a
 * final `pointermove` at the same x as the previous one; recomputing from it
 * would report 0 px/ms at the end of a fast flick and settle the row closed.
 */
export function advanceDrag(drag: SwipeDrag, x: number, y: number, at: number): SwipeDrag {
  const dx = x - drag.startX;
  const dy = y - drag.startY;
  const travel = Math.max(drag.travel, Math.abs(dx), Math.abs(dy));

  let axis = drag.axis;
  if (axis === 'none' && travel >= DIRECTION_SLOP) {
    axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }

  const elapsed = Math.max(1, at - drag.lastAt);
  const moved = x !== drag.lastX;
  const velocity = axis === 'x' && moved ? (drag.lastX - x) / elapsed : drag.velocity;

  // Leftward is dx < 0, and leftward opens -- hence the subtraction.
  const offset = axis === 'x' ? clampOffset(drag.baseOffset - dx) : drag.offset;

  return { ...drag, axis, offset, travel, lastX: x, lastAt: at, velocity };
}

/**
 * Pointer up. What did that sequence mean?
 *
 * `axis === 'none'` IS THE WHOLE DEFINITION OF A TAP. A vertical drag is never
 * a tap — the querent was scrolling the page — and it settles the row back to
 * wherever it started rather than to closed, because they did not touch it.
 */
export function endDrag(drag: SwipeDrag): SwipeRelease {
  if (drag.axis === 'none') return { kind: 'tap' };
  if (drag.axis === 'y') return { kind: 'settle', open: drag.baseOffset >= OPEN_AT };
  if (drag.velocity >= FLICK_PX_PER_MS) return { kind: 'settle', open: true };
  if (drag.velocity <= -FLICK_PX_PER_MS) return { kind: 'settle', open: false };
  return { kind: 'settle', open: drag.offset >= OPEN_AT };
}
```

**Impact:** nothing imports it yet. Adds one file to the unit project.

---

### Step 2: The unit suite for the machine

**File:** `src/lib/history/swipe.test.ts` (new)

**Change:** loop 1. Every branch of `advanceDrag` and `endDrag`, plus the two rules a later
edit is most likely to remove as redundant (the sticky axis lock and the velocity carry).

**Code:**

```ts
import { describe, expect, it } from 'vitest';

import {
  advanceDrag,
  beginDrag,
  clampOffset,
  DIRECTION_SLOP,
  endDrag,
  FLICK_PX_PER_MS,
  MAX_OVERDRAG,
  OPEN_AT,
  REVEAL_WIDTH,
  type SwipeDrag,
} from './swipe';

/** A whole gesture, as a list of (x, y, t) samples after the pointer-down. */
function gesture(
  from: { x: number; y: number; at: number; open: boolean },
  moves: ReadonlyArray<[number, number, number]>,
): SwipeDrag {
  let drag = beginDrag(from.x, from.y, from.at, from.open);
  for (const [x, y, at] of moves) drag = advanceDrag(drag, x, y, at);
  return drag;
}

describe('clampOffset', () => {
  it('refuses to move right of closed, with no rubber band', () => {
    expect(clampOffset(0)).toBe(0);
    expect(clampOffset(-40)).toBe(0);
  });

  it('is the identity inside the tray', () => {
    expect(clampOffset(1)).toBe(1);
    expect(clampOffset(REVEAL_WIDTH)).toBe(REVEAL_WIDTH);
  });

  it('rubber-bands past the tray and caps the overdrag', () => {
    expect(clampOffset(REVEAL_WIDTH + 20)).toBeCloseTo(REVEAL_WIDTH + 7, 5);
    expect(clampOffset(REVEAL_WIDTH + 4000)).toBe(REVEAL_WIDTH + MAX_OVERDRAG);
  });
});

describe('the direction lock', () => {
  it('calls a gesture under the slop a tap, wobble and all', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [197, 302, 16],
      [201, 299, 32],
      [200, 300, 48],
    ]);
    expect(drag.axis).toBe('none');
    expect(drag.offset).toBe(0);
    expect(endDrag(drag)).toEqual({ kind: 'tap' });
  });

  it('locks to y on a vertical drag and never moves the tray', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [200, 320, 16],
      [200, 380, 32],
    ]);
    expect(drag.axis).toBe('y');
    expect(drag.offset).toBe(0);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  /*
   * THE STICKY RULE. Without it, a flick down a long list that drifts sideways
   * halfway through leaves a trail of half-open rows behind it -- which looks
   * like the page is broken rather than like one gesture was ambiguous.
   */
  it('stays locked to y even when the pointer later travels far in x', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [200, 320, 16],
      [80, 340, 32],
      [40, 360, 48],
    ]);
    expect(drag.axis).toBe('y');
    expect(drag.offset).toBe(0);
  });

  it('locks to x when the horizontal component wins at the slop', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [200 - DIRECTION_SLOP - 1, 302, 16],
    ]);
    expect(drag.axis).toBe('x');
    expect(drag.offset).toBe(DIRECTION_SLOP + 1);
  });
});

describe('where a release settles', () => {
  it('settles closed short of halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [180, 300, 100],
      [200 - (OPEN_AT - 14), 300, 400],
    ]);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  it('settles open past halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [180, 300, 100],
      [200 - (OPEN_AT + 16), 300, 400],
    ]);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: true });
  });

  it('opens on a short fast flick that never reached halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [188, 300, 12],
      [176, 300, 24],
    ]);
    expect(drag.offset).toBeLessThan(OPEN_AT);
    expect(drag.velocity).toBeGreaterThanOrEqual(FLICK_PX_PER_MS);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: true });
  });

  it('closes on a rightward flick even from a mostly-open row', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: true }, [
      [212, 300, 12],
      [224, 300, 24],
    ]);
    expect(drag.offset).toBeGreaterThan(OPEN_AT);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  it('closes when an open row is dragged back past halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: true }, [
      [230, 300, 120],
      [260, 300, 420],
    ]);
    expect(drag.offset).toBe(REVEAL_WIDTH - 60);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  it('reports a tap on an open row, so the caller can swallow it', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: true }, [[202, 301, 20]]);
    expect(endDrag(drag)).toEqual({ kind: 'tap' });
  });

  /*
   * THE VELOCITY CARRY. Browsers emit a final `pointermove` at the previous x
   * routinely; recomputing from it reports 0 px/ms at the end of a fast flick
   * and settles the row closed under the querent's finger.
   */
  it('keeps the flick velocity through a duplicate final sample', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [188, 300, 12],
      [176, 300, 24],
      [176, 300, 40],
    ]);
    expect(drag.velocity).toBeGreaterThanOrEqual(FLICK_PX_PER_MS);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: true });
  });
});
```

**Impact:** `npm test` gains one file. No behaviour change anywhere.

---

### Step 3: The row — swipe surface, tray, trash control, confirm sheet

**File:** `src/app/history/HistoryItemRow.tsx:1-89` (full replacement)

**Change:** wrap the existing `<Link>` in a two-layer swipe surface. The three hard
constraints are answered as follows, and each answer is written into the file:

- **(a) the drag is read from a REF.** `dragRef` holds the machine's state; every handler
  reads it directly and `setOffset` is called with a plain value. No side effect ever runs
  inside a `setState` updater — `Fan.tsx:158-176` is the postmortem.
- **(b) a horizontal drag must not navigate, a tap must.** `pointerup` always precedes
  `click`, in every browser, for both mouse and touch. So `endDrag`'s verdict is parked in
  `releaseRef` on pointer-up and the `<Link>`'s own `onClick` calls `e.preventDefault()`
  when it reads `'drag'`. **Cancelling the default is the mechanism, not conditionally
  rendering the anchor** — swapping the element out mid-gesture tears the DOM from under an
  in-flight pointer sequence and the click never fires at all. `draggable={false}` plus an
  `onDragStart` preventDefault is the second half: an `<a>` is natively draggable, and on a
  mouse a native HTML5 drag replaces the pointermove stream entirely.
- **(c) the trash control clears 44px.** It fills an 88px tray over a row that is at least
  90px tall, with an explicit `min-height: 44px` as a belt.

**The destructive affordance is a CONFIRM, not an UNDO, and the reason is structural.** An
undo needs a restore path; the plan's scope says in as many words *"Restoring a deleted
reading. No UI, no route, no grace period."* Phase 1 builds `softDeleteReading` and nothing
that reverses it. The only way to build an undo against that is to hold the DELETE back for
a few seconds client-side — and a held request that the querent navigates away from silently
never happens, which for a feature about somebody's embarrassment is the worst outcome
available. So: two taps, and the second control is **worded differently and is in a
different place on the screen**, which is `DeleteAccount`'s rule verbatim ("there is no
position on screen where tapping twice in the same place deletes"). The sheet is
structurally that component's — same scrim, same `rise`, same Tab trap, same
reduced-motion kill switch, same **focus restore to a ref we own** rather than to
`document.activeElement`, which is the Safari trap: Safari does not focus a `<button>` when
it is tapped, so `activeElement` at open time is `<body>` on the one platform this app is
built for.

**Code:**

```tsx
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
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
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
```

**Impact:** the row's props change, so `HistoryBrowser` must be edited in the same commit
(Step 4). No other file imports `HistoryItemRow`.

---

### Step 4: The row's stylesheet

**File:** `src/app/history/HistoryItemRow.module.css:1-108` (full replacement)

**Change:** the existing rules are kept byte-for-byte from `.cards` down; what is added is
`.swipe`, `.slider`, `.tray`, `.trash`, `.trashMark`, and the sheet. `--tray` is derived
from `REVEAL_WIDTH` by hand and both places say so.

**Code:**

```css
/*
 * The row, its swipe surface and its confirmation sheet.
 *
 * `--tray` MUST EQUAL `REVEAL_WIDTH` IN `src/lib/history/swipe.ts`. There is no
 * mechanism that keeps them in step — a CSS module cannot import a constant —
 * so they are written down together and each names the other. The failure mode
 * is a tray that stops short of the row's edge or overshoots it, which looks
 * like a rendering bug and is a units bug.
 *
 * THE SHEET BLOCK IS STRUCTURALLY `DeleteAccount.module.css` AND THAT
 * DUPLICATION IS DELIBERATE FOR NOW. One modal idiom in this app, two copies of
 * it; extracting a shared sheet component is a refactor across `/account` and
 * `/history` and belongs in its own change, not inside a delete feature.
 * No new token is introduced — `--danger` already exists and this is its second
 * consumer.
 */

.row {
  margin: 0;
}

/*
 * The clipping box. The tray is `position: absolute` inside it, so it
 * contributes ZERO to layout width at any viewport — which is why loop 4's
 * numbers for this row are unchanged by the whole feature.
 *
 * `touch-action: pan-y` IS THE LOAD-BEARING DECLARATION. It hands vertical
 * scrolling to the browser, natively, while still delivering the horizontal
 * pointermove stream to us. Without it a horizontal drag competes with the
 * page's own scroll and the row judders; with `none` instead, the list stops
 * scrolling under a thumb that starts on a row, which is every thumb.
 */
.swipe {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-card);
  touch-action: pan-y;
}

/*
 * OPAQUE, OR THE TRAY SHOWS THROUGH. `.link`'s own background is a 1.5% white
 * wash designed to sit over the page's backdrop; over an 88px control it is a
 * smear. `--canvas` is the page's own ground colour and not a new value.
 *
 * `user-select: none` is a real trade: it costs selecting the question text
 * with a mouse. A drag across the row that paints a selection instead of moving
 * the row reads as broken, and the question is one clamped line on a phone.
 */
.slider {
  position: relative;
  z-index: 1;
  background: var(--canvas);
  border-radius: var(--radius-card);
  transition: transform 220ms var(--ease-card);
  user-select: none;
  -webkit-user-select: none;
}

/* Mid-gesture the transform must follow the finger exactly; a transition here
   makes the row lag behind by a fifth of a second, which feels like weight. */
.slider[data-dragging='true'] {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .slider {
    transition: none;
  }
}

/*
 * UNDER the slider in paint order, AFTER it in DOM order. z-index decides what
 * is seen, DOM order decides what Tab reaches — so the destructive control is
 * painted behind the row and is reached after the link, never before it.
 */
.tray {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  display: flex;
  /* = REVEAL_WIDTH in src/lib/history/swipe.ts. */
  width: 88px;
}

/*
 * FILLS THE TRAY. 88px wide over a row that is at least 90px tall (three 66px
 * thumbs plus 12px of padding top and bottom), so both axes clear the 44px iOS
 * minimum with room. The `min-height` is a belt: `PublicShare`'s 36px button is
 * already a known defect in this repo and a second one must not ship.
 *
 * OUTLINED, NEVER FILLED, matching `DeleteAccount`'s confirm button. A filled
 * red block behind every row would make the brightest thing on the page a
 * control nobody asked to see.
 */
.trash {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0;
  color: var(--danger);
  background: rgba(163, 66, 58, 0.1);
  border: 1px solid var(--danger);
  border-radius: var(--radius-card);
  cursor: pointer;
}

.trash:hover {
  background: rgba(163, 66, 58, 0.2);
}

.trash:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--gold-border);
}

.trashMark {
  width: 24px;
  height: 24px;
}

.link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--gold-hairline);
  border-radius: var(--radius-card);
  background: rgba(255, 255, 255, 0.015);
}

.link:hover {
  border-color: var(--gold-border);
  background: var(--gold-wash);
}

.link:focus-visible {
  outline: 2px solid var(--gold-border);
  outline-offset: 2px;
}

.cards {
  display: flex;
  gap: 4px;
  flex: none;
}

/*
 * CardFace is `position: absolute; inset: 0`, so it needs a sized, positioned
 * parent. 44x66 keeps 2:3 exactly, and three of them plus two 4px gaps is 140px
 * -- which leaves ~190px of text column inside a 375px shell.
 */
.thumb {
  position: relative;
  width: 44px;
  height: 66px;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  /* Or the clamped question refuses to shrink the flex item and pushes the
     time off the right edge. */
  min-width: 0;
  flex: 1;
}

.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.service {
  font-family: var(--font-display), serif;
  font-size: var(--fs-card-name);
  letter-spacing: var(--ls-card-title);
  color: var(--gold-text);
}

.time,
.reader {
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-button);
  text-transform: uppercase;
  color: var(--faint);
}

.time {
  flex: none;
  white-space: nowrap;
}

.question {
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: 16px;
  color: var(--muted);
  margin: 2px 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.unfinished {
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: 14px;
  color: var(--faint);
  margin: 2px 0 0;
}

.shared {
  flex: none;
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-button);
  text-transform: uppercase;
  color: var(--gold);
}

/* --- the confirmation sheet ---------------------------------------------- */

/* 1000, the same rung as AccountMenu and DeleteAccount. Nothing else on
   `/history` is above the page. */
.scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(10, 8, 18, 0.94);
  backdrop-filter: blur(6px);
  animation: fade 200ms ease-out;
}

.sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  /* `position: fixed` and portalled, so body's safe-area padding does not reach
     it. Without this the buttons sit under the home indicator in standalone
     mode. */
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
  background: var(--canvas);
  /* Gold here would make it look like the account menu. */
  border-top: 1px solid var(--danger);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  animation: rise 260ms var(--ease-card);
}

.sheet:focus,
.sheet:focus-visible {
  outline: none;
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

.grip {
  width: 36px;
  height: 3px;
  margin: 0 auto 12px;
  border-radius: var(--radius-chip);
  background: var(--gold-hairline);
}

.sheetTitle {
  margin: 0 0 10px;
  font-family: var(--font-display), serif;
  font-weight: 400;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-section-label);
  text-transform: uppercase;
  color: var(--danger);
  text-align: center;
}

.sheetBody {
  margin: 0 0 10px;
  font-family: var(--font-body), Georgia, serif;
  font-size: var(--fs-hint);
  line-height: 1.45;
  color: var(--text-warm);
}

.sheetBody:last-of-type {
  margin-bottom: 4px;
}

.sheetFailed {
  margin: 6px 0 0;
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: var(--fs-hint);
  color: var(--danger);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.cancel,
.confirm {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 44px floor. `AccountMenu`'s `.close` records that 14px of padding plus a
     10px Cinzel line box measures 43.99. Same fix, same reason. */
  min-height: 44px;
  padding: 14px 12px;
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-button);
  text-transform: uppercase;
  border-radius: var(--radius-chip);
  cursor: pointer;
}

/* THE SAFE BUTTON IS THE PRIMARY-STYLED ONE, so the control a thumb goes to by
   habit is the one that keeps the reading. */
.cancel {
  color: var(--button-text);
  background: var(--gold-wash);
  border: 1px solid var(--gold-border);
}

.cancel:hover:not(:disabled) {
  background: var(--gold-wash-strong);
}

.confirm {
  color: var(--danger);
  background: transparent;
  border: 1px solid var(--danger);
}

.confirm:hover:not(:disabled) {
  color: var(--gold-pale);
  background: rgba(163, 66, 58, 0.16);
}

.cancel:focus-visible,
.confirm:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--gold-border);
}

.cancel:disabled,
.confirm:disabled {
  cursor: default;
}
```

**Impact:** no other file imports this module.

---

### Step 5: The list — one open tray, the confirmed removal, the day strip

**File:** `src/app/history/HistoryBrowser.tsx`

Four edits. `todayKey()` stays out of render: nothing added below reads a clock, and
`today` is still the state an effect set.

**5a. The import line** (`:19`):

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
```

is unchanged — `useCallback` and `useRef` are already imported.

**5b. Two pieces of state**, inserted after `const [load, setLoad] = useState<Load>({ status: 'idle' });`
(`:41`):

```tsx
  /**
   * ONE TRAY AT A TIME, AND THE LIST OWNS WHICH.
   *
   * A row cannot know that another row was swiped, so with the state held per
   * row three trays sit open at once and a tap closes only the one it landed
   * on. Holding it here is also what makes "swipe a second row" close the
   * first, which is the behaviour every list with this gesture has.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * Bumped when a day empties, to refetch the strip. See `removeItem`.
   */
  const [daysNonce, setDaysNonce] = useState(0);
```

**5c. The days effect gains one dependency** (`:88`). The body is unchanged; only the
dependency array and one comment:

```tsx
  // Step 2: which days have anything. Fetched on mount, and again when a delete
  // empties the selected day -- see `removeItem` for why a refetch and not a
  // splice. `viewedFired` keeps `history.viewed` firing exactly once across both.
  useEffect(() => {
    if (!today) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/history/days', {
          headers: { [SESSION_HEADER]: getSessionId(), [LOCAL_DATE_HEADER]: today },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { days: string[] };
        setDays(body.days);
        if (!viewedFired.current) {
          viewedFired.current = true;
          track('history.viewed', {
            day_count: body.days.length,
            has_any: body.days.length > 0,
            /*
             * `document.referrer` is a URL and would be free text; the ORIGIN
             * comparison is a boolean dressed as an enum, which is rule 2 of the
             * taxonomy. V4's menu link is same-origin; a bookmark is not.
             */
            source: sameOrigin(document.referrer) ? 'menu' : 'direct',
          });
        }
      } catch {
        /* The list's own error state covers the page; a dead days-strip is
           survivable, and `days` staying null keeps the empty state honest. */
      }
    })();
    return () => controller.abort();
  }, [today, daysNonce]);
```

**5d. Two callbacks**, inserted after `choose` (`:136`):

```tsx
  /**
   * Which row's tray is open. Both updaters are PURE — nothing decides anything
   * inside them, which is the rule `Fan.tsx` paid for.
   */
  const setTray = useCallback((id: string, open: boolean) => {
    setOpenId((current) => (open ? id : current === id ? null : current));
  }, []);

  /**
   * A CONFIRMED REMOVAL, NEVER AN OPTIMISTIC ONE — AND THAT IS A DEPARTURE
   * WORTH READING BEFORE IT IS "FIXED" BACK.
   *
   * `HistoryItemRow`'s sheet issues the DELETE and calls this only after a 2xx,
   * so there is nothing to revert and no revert path exists. The optimistic
   * version was considered and refused: the route is a WRITE, and a write is one
   * of the few things likely to be the request that wakes a suspended Neon
   * compute, so "gone" would be on screen for seconds before the server had
   * agreed and could then be un-said. For a feature whose entire purpose is
   * somebody's embarrassment, a false "it's gone" is the one lie that must not
   * be told.
   *
   * THE DAY STRIP IS REFETCHED RATHER THAN SPLICED, AND ONLY WHEN THE DAY JUST
   * EMPTIED. `days` is `historyDays(db, user.id, HISTORY_DAY_LIMIT)` — a LIMITED
   * window — so removing one day can pull an older one INTO it, and only the
   * server knows which. A splice would silently shorten the strip by one for
   * ever. One extra indexed read of the querent's own rows, at most once per
   * emptied day, on a route that is deliberately not rate limited (H12).
   */
  const removeItem = useCallback(
    (id: string) => {
      setOpenId((current) => (current === id ? null : current));
      if (load.status !== 'ok') return;
      const items = load.items.filter((i) => i.id !== id);
      setLoad({ status: 'ok', items });
      if (items.length === 0) setDaysNonce((n) => n + 1);
    },
    [load],
  );
```

**5e. The list** (`:148-157`):

```tsx
      {load.status === 'ok' && load.items.length > 0 ? (
        <>
          <p className={styles.count}>{t.plural('history.count', load.items.length)}</p>
          <ol className={styles.list}>
            {load.items.map((item) => (
              <HistoryItemRow
                key={item.id}
                item={item}
                today={today}
                open={openId === item.id}
                onOpenChange={setTray}
                onDeleted={removeItem}
              />
            ))}
          </ol>
        </>
      ) : null}
```

**Impact:** when the last reading of a day is deleted, the list falls through to
`<Empty selected={selected} days={days} onChoose={choose} />`. `emptyState(days, selected)`
answers `'never'` only when `days` is `[]`, so a querent with other days sees the correct
`history.empty.day` state while the refetched strip lands. No new empty state is needed.

---

### Step 6: Fold in the event

**File:** `src/lib/analytics/events.ts`

**6a. The name**, in the `// — history (V6) —` group at `:132-135`:

```ts
  // — history (V6) —
  'history.viewed',
  'history.filtered',
  'history.item_opened',
  /*
   * THE 77th NAME, AND THE ONLY ONE ADDED FOR THE DELETE FEATURE. The
   * accounting this file's rule demands:
   *
   *   CONSIDERED, REJECTED  widening `history.item_opened` with an `action`
   *            prop instead of a new name. Opening and deleting have different
   *            denominators, and a merged name would make "how many readings
   *            were opened" require a `props->>'action'` predicate on every
   *            existing query — silently changing what two months of rows mean.
   *   DROPPED  `history.delete_cancelled` (the sheet opened, then Batal).
   *            v0.4.0's `revealed` precedent: a look-and-close changes no
   *            decision.
   *   DROPPED  a `status` prop, which `history.item_opened` carries. Whether a
   *            deleted reading had finished is recoverable by joining `readings`
   *            on `reading_id`, and the retry feature is the thing that answers
   *            the question it would have asked.
   *   FOLDED OUT  nothing. `history.filtered` was the candidate — it has fired
   *            since V6 and nothing reads it weekly — but a delete that empties
   *            a day makes the strip MORE interesting, not less, and dropping a
   *            name to keep a total round is how a taxonomy loses its history.
   *
   * `reading.retried` was ALREADY on this list before this change (see `— the
   * reading —` above); the retry work folds in no name.
   */
  'history.item_deleted',
```

**6b. The prop shape**, in the map after `'history.item_opened'` (`:664-667`):

```ts
  /**
   * ONE ROW, DELETED BY ITS OWNER.
   *
   * NO FREE TEXT (rule 1), and this event is the one where that rule is doing
   * real work: the feature exists because somebody asked an embarrassing
   * question, so the question itself is the last thing that may appear here.
   * `question_length` is a length and `0` means there was no question — the same
   * shape `reading.completed.choice_length` already has for an absent value.
   *
   * `had_share_link` IS `shared_at`, WHICH MEANS "WAS EVER PUBLIC" AND NOT "IS
   * PUBLIC NOW". V7 leaves that column non-null after a revoke on purpose, and
   * the honest reading of this prop is therefore *the querent deleted something
   * they had once shared* — which, given the motive, is the most interesting
   * thing this event records.
   *
   * `via` IS HOW THE TRAY CAME TO BE OPEN, and it is the one prop that could not
   * be recovered from the tables. A gesture nobody finds is the single way this
   * feature fails silently: `swipe` near zero against a live `keyboard` count
   * means the swipe is undiscoverable, and no query over `readings` can see it.
   *
   * `age_days` uses `dayOffset(today, item.localDate)` — the querent's own
   * calendar day on both sides, never `created_at`.
   */
  'history.item_deleted':      { reading_id: string; reader_id: string; service_id: string;
                                 age_days: number; had_share_link: boolean;
                                 question_length: number; via: 'swipe' | 'keyboard' };
```

**Impact:** `EVENT_NAMES` goes **76 -> 77** (measured on this base with
`sed -n '/^export const EVENT_NAMES/,/^\] as const/p' src/lib/analytics/events.ts | grep -cE "^\s+'"`).
The union is closed, so a typo at the call site is a compile error. `sanitizeProps` needs no
change: every value is a scalar.

**6c. THE CEILING — AND `npm test` IS RED UNTIL THIS LANDS.**

**File:** `src/lib/analytics/events.test.ts:129`

**RECONCILED — THIS SUB-STEP WAS MISSING FROM THIS PLAN AND IS NOT OPTIONAL.** The reconciler
re-measured both numbers on this base: `EVENT_NAMES.length` is **76** and the assertion is
`toBeLessThanOrEqual(76)`. **The taxonomy is exactly AT its ceiling**, so 6a takes it to 77 and
`events.test.ts` fails on the very next `npm test` unless this moves with it, in the same
commit. **That is `[R1]`'s trap arriving for the third time** — the roadmap said 67 while the
file held 70, the group chat found the cap already binding, and the same thing has happened
again here.

**And the ceiling is not a number to bump, it is a register to revisit** — that is the whole
reason the assertion is written as a bound rather than an equality. The accounting is already
written out in full in 6a's comment (one considered-and-rejected widening, two dropped names,
nothing folded out and why). Transcribe it here as this release's entry, in the shape the four
entries above it use.

FIND:

```ts
  it('stays inside the fixed name budget', () => {
    expect(EVENT_NAMES.length).toBeGreaterThanOrEqual(44);
    expect(EVENT_NAMES.length).toBeLessThanOrEqual(76);
  });
```

REPLACE:

```ts
  /*
   * ── 76 -> 77, THE `/history` DELETE (2026-08-28), AND THE CAP WAS BINDING ───
   *
   * **ONE NAME FOR TWO FEATURES, AND THE SECOND FEATURE ADDED NONE.** The
   * `/history` work shipped a soft delete and a retry in one plan set:
   *
   *   LANDED, one:   `history.item_deleted`.
   *   FOLDED, one:   the retry, into `reading.retried`'s EXISTING shape —
   *                  `surface: 'draw' | 'history'`, plus `reading_id`,
   *                  `prior_status` and `age_days`. The name has existed since
   *                  the draw screen's error panel and is already fired from
   *                  `Draw.tsx`; a `history.reading_refilled` was drafted and
   *                  dropped because it would have put the refill OUTSIDE
   *                  `where name = 'reading.retried'`, which is the query that
   *                  answers "how often does anybody retry at all". Same
   *                  argument that folded `chat.message_blocked` into
   *                  `moderation.refused.surface`.
   *   DROPPED, two:  `history.delete_cancelled` (a look-and-close changes no
   *                  decision — the `revealed` precedent) and a merge of the
   *                  delete into `history.item_opened` with an `action` prop,
   *                  which would have silently changed what two months of
   *                  "readings opened" rows mean.
   *   FOLDED OUT:    nothing. `history.filtered` was the candidate and was kept:
   *                  a delete that empties a day makes the strip MORE
   *                  interesting, and dropping a name to keep a total round is
   *                  how a taxonomy loses its history.
   *
   * **`[R1]` FOR THE THIRD TIME: THE CAP WAS ALREADY AT ITS CEILING WHEN THIS
   * WORK OPENED** — 76 names against a 76 bound — so `history.item_deleted` went
   * red on this line and not in the diff that added it. Both the plan index and
   * the analysis said "fold in `reading.retried`" believing it was new; it was
   * not, and reading THIS register rather than the plan is what caught it.
   */
  it('stays inside the fixed name budget', () => {
    expect(EVENT_NAMES.length).toBeGreaterThanOrEqual(44);
    expect(EVENT_NAMES.length).toBeLessThanOrEqual(77);
  });
```

**Impact:** `npm test -- events` goes green again. **Phase 4 must not touch this file**: it adds
no name, so 77 still holds from its side.

---

### Step 7: The copy — Indonesian first

**File:** `src/lib/i18n/locales/id.ts`, immediately after `'history.item.shared'` (`:908`)

Write these, run `npm run typecheck`, and let TS2739 name the eight missing English strings.
That red is the feature (I3), not a nuisance.

```ts
  /*
   * ── Deleting one reading ─────────────────────────────────────────────────
   *
   * THE COPY MAY NOT PROMISE PERMANENCE AND MAY NOT PROMISE A RESTORE, and
   * those are two different traps. The row is KEPT — it is a soft delete, for
   * the operator and for `/admin` — so "permanen" would be false. And there is
   * no restore UI, no route and no grace period, so "kamu bisa memulihkannya"
   * would be worse than false. `dari sini` is the sentence that is true in both
   * directions.
   *
   * `body1` NAMES THE SHARE LINK, which is the one consequence the querent
   * cannot see from this screen: the delete revokes every live `/s/<slug>` for
   * this reading in the same transaction. Given that the whole feature exists
   * because somebody is embarrassed, a live public URL surviving the delete is
   * the failure that matters, and saying so is what makes the promise checkable.
   *
   * `Batal` and `Ya, hapus bacaan ini` DUPLICATE `account.delete.*`'s words on
   * purpose rather than reusing its keys. `AccountMenu`'s ruling: a shared key
   * is how one edit silently changes two screens, and these two sheets will
   * diverge the first time either one is reworded.
   */
  'history.item.delete.aria': 'Hapus bacaan ini',
  'history.item.delete.heading': 'Hapus bacaan ini',
  'history.item.delete.body1':
    'Bacaan ini akan hilang dari Jejakmu — kartunya, pertanyaanmu, dan teksnya. Tautan yang pernah kamu bagikan untuk bacaan ini juga berhenti bekerja.',
  'history.item.delete.body2': 'Tidak ada cara untuk mengembalikannya dari sini.',
  'history.item.delete.cancel': 'Batal',
  'history.item.delete.confirm': 'Ya, hapus bacaan ini',
  'history.item.delete.working': 'Menghapus…',
  'history.item.delete.failed': 'Belum berhasil. Coba lagi sebentar lagi.',
```

**File:** `src/lib/i18n/locales/en.ts`, immediately after `'history.item.shared'` (`:469`)

```ts
  // See id.ts for why this copy names the share link and refuses both
  // "permanent" and any promise of a restore.
  //
  // `Keep it`, NOT `Cancel` — `account.delete.cancel`'s ruling: on a
  // destructive sheet the safe button says what it DOES.
  'history.item.delete.aria': 'Delete this reading',
  'history.item.delete.heading': 'Deleting this reading',
  'history.item.delete.body1':
    'This reading goes from your history — the cards, your question and the text. Any link you shared for it stops working too.',
  'history.item.delete.body2': 'There is no way to bring it back from here.',
  'history.item.delete.cancel': 'Keep it',
  'history.item.delete.confirm': 'Yes, delete this reading',
  'history.item.delete.working': 'Deleting…',
  'history.item.delete.failed': 'That did not go through. Try again in a moment.',
```

**No entry is added to `length.test.ts`'s `TIGHT` table, and that is a decision rather than
an omission.** That table is for keys in a `nowrap` or fixed-width box. `.aria` never
renders as text at all (it is the icon button's accessible name); the two sheet buttons are
`flex: 1` and wrap freely, exactly like `account.delete.cancel` / `.confirm`, which are also
absent from `TIGHT`. The two body paragraphs are prose in a 520px sheet.

`catalog.test.ts`'s `SAME_ON_PURPOSE` needs no entry either: every English value above
differs from its Indonesian counterpart.

**Impact:** `npm test -- i18n` covers the key parity and the identity check.

---

## Verification

**Build:** `export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH && npm run typecheck && npm run build`
(`build` is not optional — the TypeScript 5.x trap; retry it once if it dies on
`@vercel/turbopack-next/internal/font/google/font`, which is the AAAA trap and not this code.)

**Tests:** `npm test` — expect **3681 + N** passing, where N is this phase's new cases.
`npm test -- swipe` for the machine alone; `npm test -- i18n` for the catalogs;
**`npm test -- events` for the taxonomy — it is RED until Step 6c moves the ceiling
76 -> 77, which is that assertion doing its job rather than a broken test;**
`npm test -- clientBoundary` for the fence (nothing added imports `@/lib/db/**`, and
`swipe.ts` imports nothing at all). **No integration test in this phase** — nothing here
touches the database. `npm run test:integration` must still pass unchanged.

**Loop 1 (Vitest) — the machine.** `src/lib/history/swipe.test.ts`. This is the only loop
that can see the direction lock, the flick threshold and the velocity carry, and it is the
one that will still be running in three months.

**Loop 4 (fixed-width container + `getBoundingClientRect`) — THE loop for width.** Two
measurements, both after `tools/e2e/setup.sh` once and `tools/e2e/run.sh launch`:

1. Closed, at 320/360/390 — the claim is that **the feature changes nothing**, because the
   tray is `position: absolute` inside an `overflow: hidden` box and contributes zero to
   layout width:
   ```sh
   E2E_BASE=http://localhost:3001 tools/seo/fit.sh /history 'main'
   ```
   Expect `rootOverflows: false` and an empty `offenders` array at all three widths, exactly
   as on `origin/main`. Run it on both revisions and diff.

2. Open, at 320 — the row has slid 88px left and its last 88px are clipped. Force the state
   and re-measure:
   ```sh
   tools/e2e/run.sh goto /history
   tools/e2e/run.sh eval "
     (() => {
       const main = document.querySelector('main');
       main.style.width = '320px'; main.style.maxWidth = '320px';
       const s = document.querySelector('[class*=slider]');
       s.style.transition = 'none';
       s.style.transform = 'translateX(-88px)';
       void main.offsetWidth;
       const over = [...main.querySelectorAll('*')]
         .filter((el) => el.scrollWidth > el.clientWidth + 1)
         .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]
                      + ' ' + el.scrollWidth + '>' + el.clientWidth);
       const tray = document.querySelector('[class*=tray]').getBoundingClientRect();
       return JSON.stringify({ rootOverflows: main.scrollWidth > main.clientWidth + 1,
                               offenders: over.slice(0, 8),
                               tray: { w: tray.width, h: tray.height } });
     })()
   "
   ```
   Expect `rootOverflows: false`, `tray.w === 88` and `tray.h >= 90`. **`tray.h >= 44` is
   the constraint; 90 is what it should actually measure.** The `.question` clamp is what
   absorbs the lost 88px, and `-webkit-line-clamp: 1` already handles it.

**Loop 5 (real Chrome over CDP) — tap versus drag, and the focus restore.** This is the
loop that answers "does the UI agree with what it sends", which is exactly the question
constraint (b) raises. It **cannot** give a phone width (`innerWidth` is 500 whatever
`--width` says) and is not used for one here.

- Dispatch a real horizontal `Input` drag across a row (down, ~6 moves to −70px, up) and
  assert `location.pathname` is still `/history` **and** that the tray is revealed. Then a
  real tap in the same place and assert the pathname became `/history/<uuid>`.
- Dispatch a real vertical drag starting on a row and assert the tray did not move.
- With the tray open, `.click()` the trash button programmatically — **a programmatic click
  does not focus a button, which is the Safari trap loop 5 CAN reproduce** — then Escape,
  and assert `document.activeElement` is the trash button and not `<body>`. That is the one
  assertion protecting the `returnFocusTo` ref against being "simplified" to
  `document.activeElement`.
- Patch the iframe/page `fetch` and confirm the confirm button issues exactly
  `DELETE /api/history/<uuid>` with the two headers and **no body**, and that the row leaves
  the list only after the response.

**Loop 6 (a real iPhone against a Vercel preview) — the only loop for the feel.** Does the
swipe compete with the list's vertical scroll under a thumb; does `touch-action: pan-y` hold;
is 88px reachable one-handed; does the sheet clear the home indicator in standalone mode.
None of loops 1–5 can answer any of those and the plan should not pretend otherwise.

**Manual check:** stop the database (`npm run db:down`) and open `/history`. The list shows
`history.error`, no row renders, and nothing about the swipe is reachable — unchanged from
today. Then with the database up, confirm a delete, reload, and confirm the row is still
gone (that is the only check that proves Phase 1's read filters and this component agree).

**Exit criteria:**
1. A horizontal swipe on a row reveals an 88x≥90 trash control at 320, 360 and 390, measured
   with loop 4, and the row's closed-state fit numbers are byte-identical to `origin/main`.
2. A tap opens `/history/<id>`; a horizontal drag does not navigate; a vertical drag scrolls
   the page and leaves every tray shut — all three asserted with loop 5.
3. Tab reaches the trash control after the link, arriving on it reveals the tray, Enter opens
   the sheet, and Escape returns focus to the trash control.
4. Confirming issues one `DELETE /api/history/<id>`; on 2xx the row leaves the list and a
   reload agrees; on anything else the row stays and the sheet says so.
5. `history.item_deleted` lands in `events` with seven scalar props and no free text.
6. `npm run typecheck`, `npm test`, `npm run test:integration` and `npm run build` are green.

---

## Handoffs

- **`reading.retried` is already declared** (`events.ts:79`, `{ reader_id, service_id, attempt }`,
  fired by `Draw.tsx:680`). **Phase 4 folds in nothing** and the plan index's Phase 4 line
  should be corrected by the reconciler. If Phase 4 needs `reading_id` on it, that is a
  widening of an existing shape and `EVENT_NAMES` stays at 77.
- **A shared bottom-sheet component.** `DeleteAccount.module.css`'s scrim/sheet/actions block
  is now duplicated in `HistoryItemRow.module.css`, and the Tab trap and focus restore are
  duplicated in TSX. Extracting one `<Sheet>` is the right refactor and it crosses `/account`
  and `/history`; it does not belong inside a delete feature. **Left deliberately, in the
  spirit of §6 file ownership.**
- **`user-select: none` on `.slider`** costs selecting the question text with a mouse. Noted
  as a trade rather than fixed; the alternative is a mouse drag painting a selection instead
  of moving the row.
- **The `--tray: 88px` / `REVEAL_WIDTH = 88` pair has no mechanism keeping it in step.** A CSS
  module cannot import a constant. Both places name the other. If a third consumer appears,
  it is worth a test that greps the stylesheet for the number the module exports.
- **A "delete" affordance on `/history/[id]`.** Out of scope by the plan ("one row, one
  gesture") and untouched. If it is ever wanted, it reuses this sheet and this event with
  `via` gaining a third value.
- **Phase 4's retry hint is a STRING, not an element, and Phase 4 makes ZERO edits to
  `HistoryItemRow.tsx` or its `.module.css`** (reconciled). It amends the VALUE of
  `history.item.unfinished` in both catalogs — the paragraph this file already renders on
  exactly the `!item.hasBody` rows. **So: keep rendering that key, keep the paragraph
  non-interactive** (it is inside the `<Link>` and inside the swipe surface), and expect no
  further edit to this file from any phase.

---

## Rollback

`git revert` of this phase's commit, alone. Nothing here changes the schema, no migration
runs, and no route is added — this phase only *calls* Phase 1's route. After the revert the
row is the `<Link>` it was, `DELETE /api/history/[id]` is live but unreachable from the UI,
readings already soft-deleted stay soft-deleted and stay invisible (Phase 1's filters own
that), and `history.item_deleted` rows already in `events` become rows for a name the closed
union no longer contains — which is inert: `events.name` is a text column, nothing joins on
the union, and the rows remain queryable.

The one thing to check before reverting is that `EVENT_NAMES` goes back to 76 **and that
`events.test.ts`'s ceiling goes back to 76 with it** — the two move together or the suite goes
red on a revert, which is the confusing direction to fail in. **RECONCILED: Phase 4 adds no
name and never touches that test**, so it widens `reading.retried`'s shape and is untouched by
this revert; if some later work has added a name after `history.item_deleted`, take this as a
patch revert rather than a whole-commit one.

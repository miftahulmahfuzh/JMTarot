# Package: `src/app/history` (the history surface, V6)

**Location**: `src/app/history`
**Last Updated**: 2026-08-28
**Documentation Created**: 2026-08-28

## Overview

The querent's own past readings: `/history` lists them by day, `/history/[id]`
reconstructs one draw exactly as it was, read-only (VD14). Since Phase 2 of the
history-retry-and-soft-delete plan a row also carries a **swipe-to-reveal delete**,
which is the first destructive control this surface has ever had.

This is a Next.js App Router route package — server components, client components
and CSS modules, not a library. Its pure logic deliberately lives one directory
over in `src/lib/history/**` (`dates.ts`, `empty.ts`, `swipe.ts`, `types.ts`),
because this project has no jsdom, no Testing Library and no Playwright: the only
part of a client component `npm test` can reach is the part that touches neither
React nor the DOM.

**Key responsibilities:**
- Render the day filter and the selected day's list, entirely client-side.
- Reconstruct one past reading, server-rendered, with a client-side translation.
- Own the swipe gesture, the confirm sheet and the one `DELETE` call per row.
- Keep `todayKey()` off the render path — the whole shape of `HistoryBrowser`.

**THE ROUTE IS GATED BY `src/middleware.ts` and `isPublic()` must never learn it.**
Nothing in this package re-checks the session except `[id]/page.tsx`, which does so
defensively with `notFound()` rather than a redirect.

## Exported API

Everything here is a React component. Nothing in this package is imported outside
it except through the router.

### `HistoryPage` (default export, `page.tsx`) — server component

```tsx
export default async function HistoryPage(): Promise<JSX.Element>
```

**Reads nothing.** Roadmap §6's non-negotiable, plus a stronger argument on its
own: the default filter is *today in the querent's zone* and the server cannot
compute it (`toISOString()` rolls over at 07:00 in Jakarta). Paints the title, the
hint, `AccountButton surface="history" showLanguage={localeSwitcherEnabled()}`,
`ChatButton`, the `← Beranda` link, and mounts `HistoryBrowser`.

`showLanguage` is resolved **here** because `LOCALE_SWITCHER` carries no
`NEXT_PUBLIC_` prefix and would inline as `undefined` inside a client component.

### `HistoryBrowser` (`HistoryBrowser.tsx`) — `'use client'`, no props

Owns four pieces of state that matter, and one nonce:

| State | Meaning |
| --- | --- |
| `today: string \| null` | Set by an effect, never during render. Everything downstream waits on it. |
| `selected: string \| null` | The filtered day. Seeded from `?date=` via `isHistoryDate`. |
| `days: string[] \| null` | `null` until the strip request lands — **not** the same as `[]`, see `emptyState`. |
| `openId: string \| null` | **One tray at a time, and the list owns which.** |
| `daysNonce: number` | Bumped when a day empties, to refetch the strip. |

Three callbacks:

- `choose(date, via)` — sets the filter, fires `history.filtered`, and updates the
  URL with `window.history.replaceState`, never `router.replace` (H13).
- `setTray(id, open)` — `setOpenId` with a **pure** updater. Swiping a second row
  closes the first, which a row cannot do on its own.
- `removeItem(id)` — **a CONFIRMED removal, never an optimistic one.** Called only
  after `ConfirmSheet` has seen a 2xx. Filters the item out, and when the day is
  now empty bumps `daysNonce` so the strip is **refetched rather than spliced**.

### `HistoryItemRow` (`HistoryItemRow.tsx`) — `'use client'`

```ts
export type HistoryItemRowProps = {
  item: HistoryItem;
  today: string;
  open: boolean;                              // list-owned; one tray at a time
  onOpenChange: (id: string, open: boolean) => void;
  onDeleted: (id: string) => void;            // only after a 2xx, never optimistically
};
```

Renders cards first (the cards are what the querent remembers), then service, time,
reader, the question clamped to one line, an `unfinished` note when `!hasBody`
(H5 shows `failed` and `aborted`), and a `Dibagikan` marker from `sharedAt`.
**No prose** — the list payload carries no `body` and no `gist` (H10).

Three internal helpers, none exported: `ConfirmSheet` (portalled `role="dialog"`,
issues the request), and `TrashMark` (an inline SVG; there is no icon dependency in
this project and there must not be one).

### `DateFilter` (`DateFilter.tsx`) — `'use client'`

```tsx
DateFilter({ today, selected, days, onChoose })
```

A scroll-snap strip of days that **actually have readings** (newest first, capped at
`DAY_CHIP_LIMIT`), plus a native `<input type="date">` bounded by the oldest reading
and today. **Today is always the first chip**, even when empty: a strip whose
selected item is not in it reads as broken. No date-picker dependency, ever.

### `HistoryDetailPage` (default export, `[id]/page.tsx`) — server component

**One awaited read, deliberately**, against `/history`'s zero: here the reading *is*
the page. Uses `readingWithCards`, `getProfile`, `getTranslation`, and
`await getLocale()` rather than `user.locale`. A reading that is not yours and one
that does not exist **both 404**, indistinguishably, or a uuid guess becomes an
existence oracle. `blocked` readings 404 too.

Every database call is wrapped so `logHistoryFailure` sees the error and Next never
logs the driver's own — measured: an uncaught throw here printed postgres.js's whole
statement and its bound parameters.

### `HistoryDetail` (`[id]/HistoryDetail.tsx`) — `'use client'`

The thin wrapper that owns the **translation and nothing else**; everything visual is
`ReadingView` (VD10). Also mounts `AttachReadingLink` and `ShareFooter`.

## The swipe (Phase 2)

The gesture machine is `src/lib/history/swipe.ts` — pure, zero imports, 14 unit
cases — and this package is its only caller.

```
REVEAL_WIDTH = 88      DIRECTION_SLOP = 8     OPEN_AT = 44
FLICK_PX_PER_MS = 0.5  RUBBER_BAND = 0.35     MAX_OVERDRAG = 28
clampOffset(raw) · beginDrag(x, y, at, openNow) · advanceDrag(drag, x, y, at) · endDrag(drag)
```

Four rules this package exists to obey, each of which produced a working-looking
alternative:

1. **The drag is read from a `ref`, never from inside a `setState` updater.**
   StrictMode double-invokes updaters, so a handler called from inside one fires
   twice and cancels itself out — the bug that left `Fan.tsx` completely dead in
   development while working in production. Every updater in this package is pure.
2. **The row is one large `<Link>`, so the anchor's own `onClick` calls
   `preventDefault()` on a drag.** `pointerup` always precedes `click`, so the pure
   machine's verdict is parked in `releaseRef`. Conditionally rendering the anchor
   instead would tear the DOM out from under an in-flight pointer sequence and the
   click would never fire at all. `draggable={false}` is the other half.
3. **The trash control clears 44px on both axes** — 88 wide, ≥90 tall, plus an
   explicit `min-height: 44px` floor in the CSS. `PublicShare`'s 36px button is
   already a known defect in this repo and a second one must not ship.
4. **`--tray` in `HistoryItemRow.module.css` MUST EQUAL `REVEAL_WIDTH`.** There is
   no import from CSS to TypeScript; the symptom of a drift is a tray that stops
   short of the row's edge or overshoots it.

`touch-action: pan-y` on `.swipe` is the load-bearing declaration: it hands vertical
scrolling back to the platform while we still receive the moves. The tray is **after
the slider in DOM order and under it in paint order** — z-index decides what is seen,
DOM order decides what Tab reaches, so the destructive control is painted behind the
row and reached *after* the link.

The trash button is **permanently tabbable**, and focusing it opens the tray. That is
the non-touch path. `if (open) return` inside `onFocus` is what keeps
`history.item_deleted.via` honest, because Chrome focuses a button on click and
Safari does not focus one at all. There is deliberately **no `onBlur`**.

## The confirm, and why there is no undo

An undo needs a restore path and there is none. The only way to fake one is to hold
the `DELETE` back for a few seconds — a held request the querent can walk away from,
which for a feature that exists *because* somebody is embarrassed is the worst
failure available. So: two taps, the second in a different place and worded
differently (`DeleteAccount`'s rule — there is no position on screen where tapping
twice deletes a reading).

`ConfirmSheet` issues the request itself:

```
DELETE /api/history/<id>
  headers: x-jmt-session, x-jmt-local-date
  AbortController, 25_000 ms
```

- **25s and not 20s, on purpose.** The route declares `maxDuration = 20`; the client
  bound must be *longer*, so it never aborts a request the server would still have
  answered. What it bounds is the case where no answer is coming at all.
- **Exactly two branches on the response: `ok`, and everything else.** A 401, a 404,
  a 503 and a thrown fetch are one outcome to a querent. The route is idempotent, so
  pressing again costs nothing.
- **An abort takes the ordinary failure branch.** A timeout means UNKNOWN — and
  hiding a row on an unknown outcome is exactly the false *"it's gone"* this design
  refuses. The resolution is one more tap, not a guess.
- **Focus restore goes to a ref we own** (`returnFocusTo`), never
  `document.activeElement`: Safari does not focus a `<button>` when it is tapped, so
  `activeElement` at open time is `<body>` on the one platform this app is built for.
- The effect focuses **the dialog**, not the first control — focusing a button puts
  `:focus-visible` on it in Chrome, which reads as "this one is selected" on a
  destructive sheet. The Tab trap's `active === sheet` branch is the entry case and
  is not redundant with `!contains`.
- The **safe** button is primary-styled and first in the Tab order; the destructive
  one is outlined and never autofocused, or Enter deletes a reading.

## Data flow

```
/history (server, reads nothing)
   └─ HistoryBrowser (client)
        ├─ effect 1: todayKey()  ──────────────► today
        │            ?date= validated by isHistoryDate ──► selected
        ├─ effect 2: GET /api/history/days   ──► days       [deps: today, daysNonce]
        │            first landing fires history.viewed (once; StrictMode guard)
        ├─ effect 3: GET /api/history?date=  ──► load.items [deps: selected, today]
        ├─ DateFilter  ── onChoose ──► selected + history.filtered + replaceState
        └─ HistoryItemRow[]
             ├─ pointerdown/move/up ──► swipe.ts ──► offset, open
             ├─ tap ──► <Link> /history/<id> + history.item_opened
             └─ trash ──► ConfirmSheet ──► DELETE /api/history/<id>
                            └─ 2xx ──► history.item_deleted ──► onDeleted
                                          └─ removeItem: splice list,
                                             bump daysNonce IF the day emptied

/history/<id> (server, ONE awaited read)
   └─ HistoryDetail (client) ── POST /api/translate ──► ReadingView
```

**Why the strip is refetched and not spliced:** `days` comes from
`historyDays(db, user.id, HISTORY_DAY_LIMIT)` — a *limited* window — so removing one
day can pull an older one into it, and only the server knows which. A splice would
silently shorten the strip by one for ever. One extra indexed read of the querent's
own rows, at most once per emptied day, on a route that is deliberately not rate
limited (H12).

## Dependencies

### Internal
- `@/lib/history/types` — `HistoryItem`, `ReadingDetail`. **Declared there, not in
  `queries/history.ts`**, because `clientBoundary.test.ts` forbids any `@/lib/db/`
  specifier in a `'use client'` file and its regex does not know the `type` keyword.
- `@/lib/history/swipe` — `REVEAL_WIDTH`, `SwipeDrag`, `beginDrag`, `advanceDrag`,
  `endDrag`.
- `@/lib/history/dates` — `isHistoryDate`, `dayOffset`, `DAY_CHIP_LIMIT`.
- `@/lib/history/empty` — `emptyState`. The two-empty-states decision, tested
  without a DOM.
- `@/lib/analytics/track.client` + `@/lib/analytics/localdate` — the four events and
  the two headers. **Never `@/lib/analytics/track` in a client component.**
- `@/lib/i18n/LocaleProvider` (`useT`), `@/lib/i18n/t` (`getT`, `getLocale`),
  `@/lib/i18n/format` (`formatLocalDate`, `formatTime`), `@/lib/i18n/resolve`.
- `@/lib/storage` — `todayKey()`.
- `@/data/{deck,readers,services}` — `cardById`, `readerById`, `serviceById`.
- `@/components/{CardFace,ReadingView,ShareFooter,AccountButton,ChatButton,AttachReadingLink}`.
- Server-only, `[id]/page.tsx` alone: `@/lib/auth/server`, `@/lib/db/client`,
  `@/lib/db/queries/{history,profile,translations}`, `@/app/api/history/log`.

### External
`next/link`, `next/navigation`, `react`, `react-dom` (`createPortal`). Nothing else
— no gesture library, no date picker, no icon set.

## Reverse dependencies

Nothing imports this package; it is reached through the router. The paths are named
by `src/middleware.ts` (gated, never in `isPublic()`), `AccountButton`,
`AttachReadingLink`, `StagedAttachment`, `ShareFooter`, `s/[slug]/not-found.tsx`,
`api/share/route.ts`, `api/chat/{read,messages}/route.ts`, `chat/page.tsx`,
`lib/chat/proactive/onTick.ts`, `lib/memory/gist.generate.ts` and
`lib/analytics/flush.ts`.

Its API counterparts are `GET /api/history`, `GET /api/history/days`
(`maxDuration = 15` each) and `DELETE /api/history/[id]` (`maxDuration = 20`,
`runtime = 'nodejs'`, 204 on success, 400 on a malformed uuid, 503 on a driver
error, and idempotent by design — `softDeleteReading`'s return value is discarded
precisely because the difference between "just deleted" and "already gone" is an
oracle).

## Analytics

Four client-fired events (H11 — history routes carry no `withAnalytics` and are not
rate limited): `history.viewed`, `history.filtered`, `history.item_opened` and, new
in Phase 2, **`history.item_deleted`** with a seven-scalar prop shape —
`reading_id`, `reader_id`, `service_id`, `age_days`, `had_share_link`,
`question_length`, `via`. `EVENT_NAMES` moved 76 → 77.

`had_share_link` is `sharedAt !== null`, which stays non-null after a revoke: it
means **was ever public**, and that is the fact worth having here.
`question_length` is a length and never the text — no free text in `events.props`,
ever.

## Concurrency

React effects and `fetch`, no workers. Every request in this package is bound:
each effect owns an `AbortController` and aborts on cleanup, and the delete has a
25s timer on top. An abort is a normal path — StrictMode, and every filter change —
so `controller.signal.aborted` is checked before setting an error state.

`viewedFired` is a ref, not state, because StrictMode double-invokes effects and
`history.viewed` must fire once. `started` in `HistoryDetail` does the same job for
a path where **each run is a model call**.

## Error handling

No thrown errors reach a user. The list has an explicit `error` state; a dead
days-strip is survivable and leaves `days` at `null`, which keeps the empty state
honest. `[id]/page.tsx` wraps its reads so `logHistoryFailure` logs the class and
never the driver error. `ConfirmSheet` collapses every non-2xx into one sentence and
leaves the row in the list.

A row referencing a reader or service that no longer exists returns `null` — a gap
in a list, not a crash on a rendered page. **Every hook runs before that guard.**

## Performance

Two requests on mount, one per filter change, one per emptied day. The list payload
carries no prose, which is bytes as well as a VD8 obligation. The slider transition
is 220ms `var(--ease-card)` and is set to `none` while `data-dragging` is on — the
transform must follow the finger exactly — and again under
`prefers-reduced-motion`. Card thumbs are `CardFace size="thumb"` (240×360 WebP).

## Gotchas

- **Do not "simplify" `today` into `useState(() => todayKey())`.** It reads
  `new Date()`, differs between server render and hydration, and React cannot patch
  an attribute mismatch. Same class as `shuffleDeck()` in an initialiser.
- **`days === null` is not `days === []`.** The first is "we do not know yet"; the
  second is "this querent has never taken a reading". `emptyState` depends on it.
- **`open` is a prop, not row state.** The settled position follows the prop and is
  guarded on `dragRef.current`, so a re-render mid-gesture cannot snap the row back
  under the finger.
- **An open tray swallows the next tap.** iOS's own rule: while a destructive
  control is exposed the row is not a link, it is a thing to put away.
- **Phase 4's retry hint goes in the `unfinished` paragraph, as TEXT.** That
  paragraph is inside the `<Link>` and inside the swipe surface, so an interactive
  control there would swallow both the tap and the drag. One place to press stays
  `/history/[id]`.
- The delete copy says neither *"permanen"* nor offers a restore: the row is kept for
  the operator, so "permanent" would be false, and there is no restore UI, so
  offering one would be worse. *"from here"* is the precise, honest sentence.

## Notes

**Phase 2 of 4.** Phase 1 (`P1-DB-A000`, committed `3c7801e`) landed
`readings.deleted_at` / `reading_cards.deleted_at`, `softDeleteReading`, sixteen read
filters and the `DELETE` route — its documentation is
`src/lib/db/.workflows/package_readme.md` and is not this package's to maintain.
Phases 3 and 4 (retry) are not yet done and will touch `HistoryItemRow`'s
`unfinished` branch and `/history/[id]`.

Open, carried from V6: the question is rendered in the list and a history list gets
scrolled in public (V6 open question 1); the swipe and the sheet are unmeasured on a
real phone, which is loop 6 and the only loop that can answer a gesture on glass.

# Package: `src/app/history` (the history surface, V6)

**Location**: `src/app/history`
**Last Updated**: 2026-08-28
**Documentation Created**: 2026-08-28

## Overview

The querent's own past readings: `/history` lists them by day, `/history/[id]`
reconstructs one draw exactly as it was. Since Phase 2 of the
history-retry-and-soft-delete plan a row also carries a **swipe-to-reveal delete**,
which is the first destructive control this surface has ever had, and since Phase 4
`/history/[id]` carries **`Coba ulang`** — the refill control for a reading that
never got prose.

**VD14 IS NARROWLY AMENDED, NOT REPEALED.** The page is still read-only about the
*draw*: the hand, the question, the reader, the service and the locale are all
immutable, and the refill re-streams prose over the same cards in the same language.
**Retryability is `body IS NULL`, never a status list** — `isRetryable` in
`src/lib/reading/retryable.ts` is the predicate, and `queries/history.ts`'s
`readingsForDay` header was corrected in this phase to say so.

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
- Own the refill: the `Coba ulang` press, the streamed body, and the exhaustive
  status branching against `POST /api/reading/retry/[id]`.
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

The thin wrapper that owns the **translation and, since Phase 4, the refill** —
nothing else. Everything visual is `ReadingView` (VD10). Also mounts
`AttachReadingLink`, `ShareFooter` and, on a refusal, `RefusalNotice`.

**TWO ASYNC SOURCES OF PROSE, AND TWO LINES KEEP THEM APART.** V2's translation
streams the body this reading *already has*; the refill streams a body into a reading
that never had one. Both write this component's state.

1. **`needs` IS COMPUTED FROM THE SERVER PROP `reading`, NEVER FROM THE REFILLED
   VIEW.** A refilled row has a body, so deriving it from the view would start a
   translation of prose that arrived seconds ago in the language already on screen.
2. **THERE IS NO `router.refresh()` IN THIS FILE AND THERE MUST NEVER BE.** The only
   mention of it is the prohibition in the header comment. Two independent reasons:
   a refresh makes `reading.body` non-null, which makes `needs` true, which sets the
   translation effect off against the refill; and the retry route writes its row
   inside the response's own `defer()`, so a refresh at stream end races that write
   and repaints `history.detail.noBody` over prose the querent just watched arrive.
   `useRouter` is imported for exactly one thing: `router.replace('/login')` on a 401.

`RetryState` is a six-member union — `idle`, `running{painted}`, `done`, `error`,
**`stale`** and `blocked{payload}` — and `stale` being its own member rather than an
`error` with different copy is the whole point: the control is *removed*, not
re-offered.

### `refillView` (exported from `[id]/HistoryDetail.tsx`) — PURE

```ts
export function refillView(
  reading: ReadingViewData,
  refill: Refill | null,
  viewer: Locale,
): { view: ReadingViewData; prose: ReadingProse | null }
```

**THIS IS WHERE `ReadingView`'s RULE 4 SURVIVES THE REFILL, AND IT IS EXPORTED AND
UNIT-TESTED FOR EXACTLY THAT REASON** — rule 4 is the renderer's invariant rather
than the caller's discipline, and the refill is the one path that hands the renderer
a body the server did not send. The component itself is unreachable from the unit
project, so a seven-case truth table in `[id]/HistoryDetail.test.ts` holds it,
asserted **through the real `resolveProse`** rather than by restating its rules.

- **It returns `{ kind: 'as-written' }` on a language mismatch and NEVER
  `{ kind: 'original' }`.** `resolveProse` treats `original` identically to an
  omitted prop, so returning it would put Indonesian prose in the English app
  through the very function written to prevent that. It never returns `translated`
  either: nothing was translated.
- **The body moves onto a COPY of the reading, not just into the `prose` prop.**
  `resolveProse` short-circuits to `unavailable` whenever `reading.body === null`
  whatever the caller passed, so a refill handed in through `prose` alone paints
  nothing at all. The copy claims `status: 'ok'` — the same claim `Draw.tsx` makes
  when its stream ends normally — and falls back to the stored `choice`, so a refill
  with no marker does not erase a verdict the row already carried.
- `refill === null` returns the reading by **identity**, so nothing re-renders before
  a press.

### The refill request, and the order of its branches

```
POST /api/reading/retry/<id>            (runtime nodejs, maxDuration 60)
  headers: content-type, x-jmt-session, x-jmt-local-date
  body: '{}'    ← NO picks and NO question; the route reads both from the row
  AbortController; aborted on unmount and on a second press
```

| Status | Outcome |
| --- | --- |
| 401 | `auth.session_expired` + `router.replace('/login')`. Nothing to show. |
| 429 | `reading.rate_limited` with **`limit: 'unknown'`** — the browser is deliberately not told which ceiling it hit — plus the rate-limit copy. |
| 403 + `moderation_blocked` | `RefusalNotice`, mounted **above** `ReadingView`. |
| 404, 409 | **`stale`. Terminal, and the control is removed.** |
| everything else (500/503, no body) | the generic `reading.failed` branch; pressing again is correct. |

- **THE 403 BRANCH MUST STAY ABOVE THE `!res.ok` CHECK** (verified in this phase at
  line 303 against 334). Below it, a refusal is swallowed as `http_403` and shows
  "could not start" — losing the clause link, the crisis resources and any sign the
  app made a decision. `403` is also what middleware gives an un-onboarded caller, so
  the **body** is the discriminator and anything else 403-shaped falls through.
- **A REFUSAL ON A RETRY IS A CORRECT OUTCOME.** The question was classified once,
  possibly months ago, and the classifier is allowed to have moved. The row is left
  untouched, so the control comes back.
- **404 AND 409 ARE ANSWERS, NOT FAILURES.** 404 collapses five causes (absent, not
  yours, blocked, soft-deleted, not a uuid); 409 means the row is no longer retryable,
  most likely because another tab refilled it. Deliberately not distinguished on
  screen — the route does not tell us which, on purpose.
- **500 and 503 stay in the generic branch on purpose**: transient, row untouched.
- **The locale comes off `x-reading-locale` through `isLocale()`, defaulting to
  `reading.locale`** on an absent or malformed header, which is what the route's own
  comment instructs every client to do — and is the branch that carries the whole
  feature if the header is ever dropped.
- **Prose is painted while streaming ONLY when it is already in the viewer's
  language.** Rule 4 forbids showing foreign prose with no translation, and there is
  no translation of something that does not exist yet, so the mismatch case is
  delivered whole behind `history.retry.otherLanguage` and picked up as a cached
  translation on the next view.
- The choice marker is stripped with `splitChoiceMarker(wire, …)` over the text
  accumulated **so far** and validated client-side against the same stored question,
  because rendering the model's unvalidated word would put model-controlled text in a
  highlighted box.

### `[id]/HistoryDetail.module.css`

New in Phase 4. `.retryBlock`, `.retry`, `.waiting`, `.hint`, `.otherLanguage`,
`.error`. **Tokens only** — no new hex value, font size or easing curve.

- **`.retry` IS `ReadingPanel.module.css`'s `.retry` VALUE FOR VALUE, AND THE
  DUPLICATION IS DELIBERATE.** One act, one shape; but two call sites is not a
  pattern yet, and hoisting it would make every future change to either screen a
  change to both.
- **PLUS AN EXPLICIT `min-height: 44px`.** The padding gets there today, which is
  exactly how `PublicShare`'s button ended up at 36px — a recorded defect on
  twenty-three pages. A number that has to be true belongs in the stylesheet, not in
  a sum somebody has to redo after changing a font size.
- `.waiting` carries a `breathe` keyframe with a `prefers-reduced-motion` opt-out: it
  has to hold a screen for a whole generation on a cold Neon compute without reading
  as a hang.
- **`attachSurface.test.ts` was re-pinned from `attachable(reading)` to
  `attachable(view)`** in this phase, because both footer conditions deliberately
  moved to the refilled `view` — gating on the server prop would refuse *Bahas di
  grup* on a reading the querent just watched arrive.

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
   └─ HistoryDetail (client)
        ├─ needs = reading.locale !== viewer && reading.body !== null   [SERVER PROP]
        │     └─ POST /api/translate ──► prose
        └─ isRetryable(status, hasBody, cardCount) ──► Coba ulang
              └─ POST /api/reading/retry/<id>
                   ├─ 401 ──► /login          429 ──► error copy
                   ├─ 403+moderation_blocked ──► RefusalNotice (ABOVE ReadingView)
                   ├─ 404 | 409 ──► stale (control removed)
                   └─ 200 ──► x-reading-locale ──► stream ──► refill
                                 └─ refillView(reading, refill, viewer)
                                      ├─ view  (body, locale, status: 'ok', choice)
                                      └─ prose ('as-written' on a mismatch, else null)
                                            └─ shownProse = refillProse ?? prose
   ──► ReadingView
```

`canRetry` is computed **from the server row, not from `view`**, so a successful
refill takes the button away for the life of the page without a refetch.
`cardCount` is required rather than decoration: a `blocked` reading has
`body IS NULL` and no `reading_cards` rows, so `hasBody` alone would admit it.
`deletedAt` is deliberately **not** passed — `readingWithCards` already filtered it
server-side, and hardcoding `null` would be this file asserting a fact it cannot
observe.

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
- `@/lib/history/dates` — `isHistoryDate`, `dayOffset` (also `reading.retried`'s
  `age_days`), `DAY_CHIP_LIMIT`.
- `@/lib/reading/retryable` — `isRetryable`. The predicate, shared with the route.
- `@/lib/reading/choice` — `splitChoiceMarker`, `validateChoice`, for the refill
  stream. The same two functions `Draw.tsx` uses.
- `@/lib/chat/attachmentView` — `attachable`, now called on `view`.
- `@/lib/i18n/locale` — `isLocale`, to narrow `x-reading-locale`.
- `@/lib/moderation/types` — `RefusalPayload` (client-importable by design).
- `@/lib/history/empty` — `emptyState`. The two-empty-states decision, tested
  without a DOM.
- `@/lib/analytics/track.client` + `@/lib/analytics/localdate` — the four `history.*`
  events, the refill's six reused ones, and the two headers. **Never `@/lib/analytics/track` in a client component.**
- `@/lib/i18n/LocaleProvider` (`useT`), `@/lib/i18n/t` (`getT`, `getLocale`),
  `@/lib/i18n/format` (`formatLocalDate`, `formatTime`), `@/lib/i18n/resolve`.
- `@/lib/storage` — `todayKey()`.
- `@/data/{deck,readers,services}` — `cardById`, `readerById`, `serviceById`.
- `@/components/{CardFace,ReadingView,ShareFooter,AccountButton,ChatButton,
  AttachReadingLink,RefusalNotice}`.
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
oracle). Since Phase 4 it also calls **`POST /api/reading/retry/[id]`**
(`runtime = 'nodejs'`, `maxDuration = 60` — it is a whole generation), which is
`src/app/api/reading/**`'s to document.

## Analytics

Four `history.*` client-fired events (H11 — history routes carry no `withAnalytics`
and are not rate limited): `history.viewed`, `history.filtered`, `history.item_opened` and, new
in Phase 2, **`history.item_deleted`** with a seven-scalar prop shape —
`reading_id`, `reader_id`, `service_id`, `age_days`, `had_share_link`,
`question_length`, `via`. `EVENT_NAMES` moved 76 → 77.

`had_share_link` is `sharedAt !== null`, which stays non-null after a revoke: it
means **was ever public**, and that is the fact worth having here.
`question_length` is a length and never the text — no free text in `events.props`,
ever.

**Phase 4 added ZERO event names.** The refill reuses six existing ones and widens
one prop shape: `reading.retried` gained `surface: 'draw' | 'history'`, `reading_id`,
`prior_status` (a literal union, because `events.ts` has no imports by rule) and
`age_days`. `Draw.tsx`'s existing call site took the four props as the compile fix —
`reading_id: null` and `prior_status: null` there, which are **not gaps**: a
draw-screen retry mints an id that does not exist when the button is pressed, and
there is no stored row to have had a status.

- **`prior_status` IS THE ONE MEASUREMENT THIS FEATURE OWES ITSELF.** Retryability is
  `body IS NULL`, so from the screen `aborted` (walked away) and `failed` (the stream
  died) are indistinguishable — and they are different products.
- **`attempt` MEANS SOMETHING SLIGHTLY DIFFERENT ON EACH SURFACE and that is written
  down rather than normalised**: presses within one draw there, presses within one
  page view here. Nothing persists it; group by `reading_id` for the true total.
- The refill also fires `reading.completed` with `source: 'client'` on the **same
  `reading_id`** as the server's copy — `reading.retried` with `surface: 'history'`
  is what makes the second row on one id identifiable — plus
  `reading.aborted { reason: 'user' }` on unmount or a second press,
  `reading.failed`, `reading.rate_limited` and `auth.session_expired`.
- **No `track()` on the refusal branch.** The server already emitted
  `moderation.refused` with the source, the category and the confidence bucket; a
  client copy would double every row in the one table whose counts decide whether the
  gate is too tight.

## Concurrency

React effects and `fetch`, no workers. Every request in this package is bound:
each effect owns an `AbortController` and aborts on cleanup, and the delete has a
25s timer on top. An abort is a normal path — StrictMode, and every filter change —
so `controller.signal.aborted` is checked before setting an error state.

`viewedFired` is a ref, not state, because StrictMode double-invokes effects and
`history.viewed` must fire once. `started` in `HistoryDetail` does the same job for
a path where **each run is a model call**.

The refill has its own `retryAbort` ref: a second press aborts the first, and an
unmount-only effect (`[]`, deliberately) aborts on leaving the page — which is what
turns the catch into `reading.aborted { reason: 'user' }` rather than a failure. The
`scrollIntoView` effect is keyed on `retry.kind` and not on the payload, so a second
refusal for the same reason does not re-scroll a page the querent has since moved.

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
- **The retry hint is in the `unfinished` paragraph as TEXT, and that is where it
  stays.** That paragraph is inside the `<Link>` and inside the swipe surface, so an
  interactive control there would swallow both the tap and the drag. `Coba ulang`
  lives on `/history/[id]` and the list only says *"Open it to try again"* —
  `history.item.unfinished` was amended in Phase 4 to say exactly that.
- **Do not add `router.refresh()` to `HistoryDetail`, in any branch.** It looks like
  the obvious way to make a refilled page consistent and it is the one change that
  sets the translation effect against the refill *and* races the route's own
  `defer()` write.
- **Do not reorder the status branches.** The `403 + moderation_blocked` check above
  `!res.ok`, and `404`/`409` before it, are load-bearing; each collapses into the
  generic error if moved.
- **`refillView` must never return `{ kind: 'original' }`.** It reads as "the prose is
  fine as it is" and `resolveProse` treats it as an omitted prop, which is rule 4
  breached through the function written to hold it.
- The delete copy says neither *"permanen"* nor offers a restore: the row is kept for
  the operator, so "permanent" would be false, and there is no restore UI, so
  offering one would be worse. *"from here"* is the precise, honest sentence.

## Notes

**THE PLAN SET IS COMPLETE — Phase 4 of 4 (`P1-AH-A001`).** Phase 1
(`P1-DB-A000`, committed `3c7801e`) landed `readings.deleted_at` /
`reading_cards.deleted_at`, `softDeleteReading`, sixteen read filters and the
`DELETE` route; Phase 2 the swipe gesture; Phase 3 the retry predicate, the writer
and `POST /api/reading/retry/[id]`. The first and third live in
`src/lib/db/.workflows/package_readme.md` and `src/app/api/**` and are not this
package's to maintain.

**Still open, and none of it should be read as done:**

- **Phase 3's 200 path is unmeasured live** — the local LLM key is expired — so
  **`x-reading-locale` has never been observed on the wire.** The `isLocale()`
  fallback to `reading.locale` is what makes that survivable, not verified.
- **Loop 4 has not been run** for the width of `history.retry.otherLanguage` at
  320/360/390.
- **Loop 6 (a real iPhone) has not been run**, and it owns four questions this
  package cannot answer from WSL: the 44px button on glass, thumb reach at the bottom
  of a long scroll, whether the pulsing `.waiting` label reads as progress or as a
  hang on a cold Neon compute, and where the refusal's `scrollIntoView` actually
  lands.
- Carried from V6 and Phase 2: the question is rendered in the list and a history
  list gets scrolled in public (V6 open question 1); the swipe and the confirm sheet
  are unmeasured on a real phone — the same loop 6, the only one that can answer a
  gesture on glass.

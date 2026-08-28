# Plan: `/history` — retry an unfinished reading, and delete a reading

**Slug:** `history-retry-and-soft-delete`
**Date:** 2026-08-28
**Analysis:** `20260828-145716-GEV5_code_analyzer.md`
**Worktree:** `~/.worktrees/jmtarot/history-retry-and-soft-delete`
**Branch:** `feature/history-retry-and-soft-delete` (base: `origin/main` @ `8931a09`)
**Cards:** [#11](https://github.com/miftahulmahfuzh/JMTarot/issues/11) (retry), [#12](https://github.com/miftahulmahfuzh/JMTarot/issues/12) (delete)
**Phases:** 4
**Status:** complete — all 4 phases landed (2026-08-28)
**Reconciled:** 2026-08-28 — two rounds. Round 1: 18 conflicts found, 18 resolved. Round 2
(verification of round 1's four moved contracts): 2 further conflicts found and resolved,
0 open questions. **Round 2 re-measured all three of round 1's measured claims and all three
hold** — `wc -c CLAUDE.md` = 142,385 with Phase 4's edit arithmetically net zero (+131 / −131,
extracted and counted byte-for-byte); `EVENT_NAMES.length` = 76 with `events.test.ts:129`
asserting `toBeLessThanOrEqual(76)`; `git status --porcelain` clean but for the three untracked
artifacts.

---

## Why

Miftah's request, verbatim:

> 1. pull data from neon prod. there are 3 "Bacaan ini tidak selesai" this is a good
>    opportunity, we should add a button to "Coba ulang" , so this empty reading can be
>    "refilled" .
> 2. in history item list, make it so user can "swipe left" the item to show trash icon.
>    clicking it will delete the card reading item (just soft delete in db). sometimes user
>    asked some embarassing questions in the past, and they definitely need a way to delete
>    their readings

The second sentence of (2) is the specification, not the motivation. **The feature is about
somebody's embarrassment, not about disk.** That is what makes the share-link revocation, the
day-summary clear and the W5 recall exclusion load-bearing: a "delete" that leaves the question
quotable in a future reading's prompt, describable in a day summary a reader writes, or readable
at a `/s/<slug>` in the group chat they are embarrassed about, has not deleted anything.

---

## Scope

**In scope**

- `readings.deleted_at` and `reading_cards.deleted_at`, one migration, and the read filters that
  make them mean something on every surface a querent or a stranger can reach.
- `DELETE /api/history/[id]`, revoking every live share link for the reading **and clearing every
  day summary written about it** in the same transaction.
- A swipe-left gesture on the `/history` row revealing a trash control, with a non-touch path.
- `POST /api/reading/retry/[id]`, regenerating prose **in place** over the stored draw, for a
  reading with `body IS NULL`.
- A `Coba ulang` control on `/history/[id]`.
- Both locales' copy, **one folded event name and one widened prop shape**, and the notes/doc
  edits the two rulings require.

**Out of scope, and why**

- **Retrying a reading that HAS prose.** VD14 stands for that case unamended — regenerating
  prose the querent already read makes their memory and the app's disagree. See Invariant 6.
- **Restoring a deleted reading.** No UI, no route, no grace period. The row is kept for the
  operator; from the querent's side the deletion is final. The copy must not imply otherwise.
- **Hiding deleted readings from `/admin`.** The operator's panels count what happened; a
  deletion is a thing that happened. `/admin/users/[id]` shows counts and no text (`[R15]`), so
  no question text is exposed by leaving those queries alone.
- **A bulk delete, a "delete all", or a delete on `/history/[id]`.** One row, one gesture.
- **Changing `readings.shared_at`.** It stays non-null after a delete for the same reason it
  stays non-null after a revoke: "was this ever public" is a different question.
- **Changing `readings.locale` on a retry.** See Invariant 7 — settled in reconciliation.
- **Hard-deleting anything, including `translations` rows for a deleted reading's body.**
  Nothing can reach them, and removing them would be the one place this feature destroys data.
- **Any `CLAUDE.md` growth that is not net-neutral.** See Invariant 9.

---

## Invariants

Every phase must hold all of these. They are ranked by what breaks if they are lost.

1. **The tree builds and both test projects pass at the end of every phase.**
   `npm run typecheck`, `npm test`, `npm run test:integration` — **run separately**;
   `npm run test:all` fails 12–22 of V9's limiter tests as a known harness race.
   `npm run build` is not optional (the TypeScript 5.x trap).

2. **A deleted reading is invisible on every surface a querent or a stranger can reach, and the
   enforcement is a `WHERE` predicate, never a filter in JavaScript.** `readingWithCards` makes
   ownership a predicate for exactly this reason: the only failure mode is a null.

3. **No driver error from any path that runs a `readings` query is ever logged raw.**
   `logHistoryFailure` on the history paths; the delete and retry routes get the same treatment.
   A postgres error quotes its bound parameters and `readings.question` is one of them.
   **The `surface` union is `'list' | 'days' | 'detail' | 'delete' | 'retry'` and Phase 1 lands
   all five in one edit** — one line, one owner.

4. **`events.props` carries no free text.** A new event carries ids, enums and lengths. Never a
   question, never a body, never a card list as an array (`sanitizeProps` drops arrays silently).

5. **`EVENT_NAMES` GOES 76 -> 77, AND THE CEILING GOES WITH IT.** Re-measured on this base:
   `EVENT_NAMES.length` is **76** and `events.test.ts:129` asserts
   `toBeLessThanOrEqual(76)` — **the taxonomy is exactly AT its ceiling**, so the one new name
   turns the suite red until the register is revisited. **Phase 2 adds the only new name
   (`history.item_deleted`) and owns the ceiling move and its register entry. Phase 4 adds NO
   name** — `reading.retried` already exists (`events.ts:79`, props `:367`, fired by
   `Draw.tsx:680`) and Phase 4 widens its prop shape instead. Phases 1 and 3 touch `events.ts`
   not at all.

6. **Retry is defined by `body IS NULL`, never by a status list.** `partial` rows have prose and
   are never retryable. This is the entire amendment to VD14 and it must not widen. `blocked`
   rows are refused separately: they have `body IS NULL` and **no `reading_cards` rows at all**,
   which is why the predicate also takes a `cardCount`.

7. **A retry keeps `readings.id`, never touches `reading_cards`, and NEVER MOVES
   `readings.locale`.** Same hand, same positions, same reversals, **same language**. It must
   also never touch `user_id`, `reader_id`, `service_id`, `question`, `local_date`, `session_id`,
   `created_at`, `shared_at` or `gist`.

   > **`locale` was named on neither side of this invariant in the draft, and that was the gap
   > Phase 4 found.** It is settled: **immutable.** `readings.locale` records the language the
   > prose came out in, so a retry regenerates in it whatever the querent's UI says now — the
   > route splits `readLocale` (prompt, Lotus block, recall chain, mid-stream notice, gist) from
   > `viewLocale` (the 429, the 500, the refusal payload). `ReadingRefill` carries no `locale`
   > field, so the column cannot move even by mistake, and the route sends
   > `x-reading-locale` so the client can check rather than assume. **A row whose `locale`
   > disagreed with its `body` would break V2's translation of that reading permanently:**
   > `ReadingView`'s rule 4 keys off exactly that column, and `translations` has no
   > `source_hash` that could catch a language swap.

8. **A retry spends every budget a fresh reading spends**, in the same order, and is refused the
   same way. `hit` → `refusalsExhausted` → `hitGlobal` → `reserveModelCall('interactive')`.

9. **`CLAUDE.md` edits are net-neutral, and PHASE 4 IS THE ONLY PHASE THAT EDITS IT.** A ruling
   added there compresses or moves one out in the same commit. Phase 4 binds both rulings —
   including Phase 1's — at **exactly net zero**: +131 bytes in `## History (V6)`, −131 in the
   W4 `events.ts` bullet, **142,385 before and after** (`wc -c`, re-measured by the reconciler;
   Python's `len()` reads ~700 lower because the em-dashes are multi-byte). New evidence,
   measurements and postmortems go in `docs/workstream-notes.md`.

10. **`schema.ts` has one owner.** A phase needing a column writes it in its own
    `## Schema deltas` section; Phase 1 is the only phase that edits `schema.ts`.

11. **One owner per file region, and later phases quote the post-change tree.**
    `src/lib/db/queries/history.ts` is touched by three phases and each owns a disjoint region:
    Phase 1 the drizzle import + six read filters + `softDeleteReading`; Phase 3 `refillReading`,
    appended **after** Phase 1's tail; Phase 4 the single stale comment at `:323`.

---

## Phases

| # | Title | Package | Files | Depends on | Difficulty | Plan | TaskID |
|---|-------|---------|-------|-----------|------------|------|--------|
| 1 ✅ | Soft delete — schema, read filters, delete route | `src/lib/db`, `src/app/api/history` | 13 | — | HARD | `.workflows/plan/history-retry-and-soft-delete/phase-1.md` | `P1-DB-A000` |
| 2 ✅ | Soft delete — the swipe gesture and the row | `src/app/history`, `src/lib/history`, `src/lib/analytics` | 9 | 1 | NORMAL | `.workflows/plan/history-retry-and-soft-delete/phase-2.md` | `P1-AH-A000` |
| 3 ✅ | Retry — the predicate, the writer, the endpoint | `src/lib/reading`, `src/lib/db/queries`, `src/lib/analytics`, `src/app/api/reading` | 6 | **1 (HARD: `refillReading`'s `WHERE` names `readings.deletedAt`, and `log.ts`'s union must already carry `'retry'` — Phase 3 does not compile without Phase 1)** | HARD | `.workflows/plan/history-retry-and-soft-delete/phase-3.md` | `P1-LR-A000` |
| 4 ✅ | Retry — the `Coba ulang` control, copy, docs | `src/app/history/[id]`, `src/lib/i18n`, `src/lib/analytics`, `docs` | 11 | **3 (HARD: imports `isRetryable`, calls the retry route) — and 2, SOFT: Phase 2 must have moved `events.test.ts`'s ceiling, or `npm test` is red for a reason that is not in this phase's diff** | NORMAL | `.workflows/plan/history-retry-and-soft-delete/phase-4.md` | `P1-AH-A001` |

<The TaskID column is filled in by /implement when it creates the tasks.>

**The two phases can be worked in either order within a pair, but not across one.** 1 → 2 is the
delete; 1 → 3 → 4 is the retry. Phase 2 and Phase 3 are independent of each other and both need
Phase 1. **Phase 4 must land after Phase 2** even though it depends on Phase 3's code: the
`events.test.ts` ceiling is exactly binding, and Phase 2 is the phase that moves it.

### Phase 1 — Soft delete: schema, read filters, delete route

**Owns:**
- The `## Schema deltas`: `readings.deleted_at timestamptz null` and
  `reading_cards.deleted_at timestamptz null`, **and no index** (argued: the predicate eliminates
  almost nothing, the heap fetch is already paid on `reading_cards_user_date_card_idx`, and a
  partial index would be write amplification on the hottest write table in the schema).
  **`reading_cards` carries the column denormalized on purpose** — `cardCounts` and
  `readingsInWindow` select from that table with no join, and the file's header defends that
  single-table plan with a measurement (0.12ms over 45,000 rows). An `exists` sub-select there
  would undo it.
- Migration `0016_v14-readings-soft-delete.sql` via `generate` + `migrate`, and its `meta`
  entries.
- `softDeleteReading(db, userId, readingId)` in `queries/history.ts`: one transaction that
  **revokes the share links, clears the day summaries, then flags the cards, then flags the
  reading** — in that order, so a failure in a statement that actually removes something aborts
  the delete rather than leaving a reading marked deleted with a live public URL. V8's
  `redactForUser` ordering is the precedent, and the boundary is proved by a trigger test.
- **`clearDaySummaries(db, userId, localDate, readingId)` in `queries/summary.ts`** — scope this
  phase added beyond its brief, and the reconciler accepted it. **`isStale` fires on a source id
  it has not seen and never on one that has GONE**, so filtering `readingsOnDay` is necessary and
  not sufficient: without this, a querent deletes an embarrassing reading and the reader keeps
  recounting their day with it in, for ever. Keyed on `$1 = any(source_reading_ids)`, so a
  summary generated before the reading was taken is untouched.
- The read filters — **sixteen functions across five query modules**, `isNull(readings.deletedAt)`
  or `isNull(readingCards.deletedAt)` added to the existing `and(...)`, no `exists` anywhere:
  `recentReadings`, `readingsOnLocalDate`, `recallableReadings`, `readingsForDay`, `historyDays`,
  `readingWithCards` (history.ts); `cardCounts`, `readingsInWindow` (frequency.ts);
  `readingsOnDay` (summary.ts); `ownsShareableReading`, `shareableReadingSource`,
  `publicReadingQuery` (share.ts); `readingCountAllTime`, `topCardAllTime`, `topReaderAllTime`,
  `recentReadingIds` (allTime.ts).
- **The two documented decisions the draft left open are both YES**, each stated on the function:
  `readingsOnDay` filters (a day summary is prose a reader writes about your day, and writing
  about a reading you just deleted is the feature failing — and it needs `clearDaySummaries`
  beside it), and all four `allTime` reads filter (`/account` is the querent's own view of
  themselves; `recentReadingIds` filtering is also what moves `personaInputHash` so the persona
  regenerates by the ordinary mechanism).
- `src/app/api/history/log.ts:22` — **the whole `surface` union, all five values including
  `'retry'`**, which is Phase 3's surface. One line, one owner.
- `DELETE /api/history/[id]/route.ts`: `requireUser()`, uuid validation, `runtime = 'nodejs'`,
  `maxDuration = 20` (this is a **write** on a path that can wake a suspended Neon compute),
  `logHistoryFailure('delete', err)` on the catch, and **204 with no body for all four
  outcomes** — deleted now, already deleted, not yours, never existed — per `readingWithCards`'s
  no-oracle rule.
- Integration tests: a deleted reading vanishes from all four history reads, from
  `recallableReadings`, from `readingsOnDay`, from the frequency counts and from the public share
  read; its share links are revoked; the day summary that named it is gone and one that did not
  survives; a second delete is a no-op that does not move the timestamp; a failing flag leaves
  the share link live.

**Does not touch:** any component, any i18n catalog, **`events.ts` and `events.test.ts`**, the
reading route, `persistReading`, `src/lib/history/types.ts`, `docs/**`, **`CLAUDE.md`**.

**Exit criteria:** the migration applies on a fresh `db:nuke` + `db:up` + `db:migrate`;
`softDeleteReading` is proven by integration test to remove the reading from every listed read,
to kill its share links and to clear the summaries that named it; `EVENT_NAMES` is still 76;
nothing in the UI calls the route and the app behaves exactly as before.

### Phase 2 — Soft delete: the swipe gesture and the row

**Owns:**
- `src/lib/history/swipe.ts` — **PURE**, no React, no DOM types beyond plain numbers, imports
  nothing. The gesture state machine: `REVEAL_WIDTH`, `DIRECTION_SLOP`, `OPEN_AT`,
  `FLICK_PX_PER_MS`, rubber band, `beginDrag` / `advanceDrag` / `endDrag`. This is the part
  `npm test` can reach. `src/lib/swipeDeck.ts` is the precedent for the **shape**, **not** a
  module to reuse — that is a scroll-snap track and a different mechanic.
- `HistoryItemRow.tsx` + `.module.css`, **outright — Phase 4 makes zero edits to either**: the
  swipe container, the revealed trash control, the confirm sheet, and the non-touch path (the
  trash button is permanently tabbable and focusing it opens the tray). Three constraints from
  the codebase: the drag is read from a **ref**, never from inside a `setState` updater
  (StrictMode double-invokes updaters — the bug that killed the fan in development); the row is
  one large `<Link>`, so a horizontal drag must not navigate while a tap still must; and the
  trash control clears **44px** (`PublicShare`'s 36px button is already a known defect and a
  second one must not ship). The sheet takes its opener as a **prop**, never
  `document.activeElement` — Safari does not focus a `<button>` when it is tapped.
- **The delete request, with a 25s `AbortController`** — required by Phase 1's route header,
  which declares `maxDuration = 20`: a bigger server budget is only safe paired with a bound on
  the caller. 25 > 20 so the client never aborts a request the server would have answered.
- `HistoryBrowser.tsx`: `openId` (one tray at a time, and the list owns which), `daysNonce`, and
  **`removeItem` — A CONFIRMED REMOVAL, NEVER AN OPTIMISTIC ONE.** *This is a deliberate
  departure from the draft index's "optimistic removal, the failure revert", and the
  reconciler accepted the argument:* the route is a WRITE and a write is one of the few things
  likely to be the request that wakes a suspended Neon compute, so "gone" would be on screen for
  seconds before the server had agreed and could then be un-said. **For a feature whose entire
  purpose is somebody's embarrassment, a false "it's gone" is the one lie that must not be
  told.** There is therefore no revert path and none is wanted; an abort or any non-2xx leaves
  the row in place and the sheet open, and the route's idempotence makes a second press free.
  The day strip is **refetched rather than spliced** when a day empties, because `historyDays` is
  a LIMITED window and only the server knows which older day moved into it.
- `events.ts`: **fold in `history.item_deleted`** — `reading_id`, `reader_id`, `service_id`,
  `age_days`, `had_share_link`, `question_length`, `via`. **The 77th name**, with the register
  entry (considered and rejected: an `action` prop on `history.item_opened`; dropped:
  `history.delete_cancelled` and a `status` prop; folded out: nothing, and why).
- **`events.test.ts:129` — the ceiling 76 -> 77.** Not optional: the taxonomy is exactly AT 76
  on this base, so `npm test -- events` is red until this lands in the same commit.
- Both catalogs, eight `history.item.delete.*` keys. Indonesian first in `id.ts`, and let the red
  typecheck name the missing English strings — that is the feature, not a nuisance. The copy may
  promise neither permanence (the row is kept) nor a restore (there is none), and it **names the
  share link**, which is the one consequence the querent cannot see from that screen.

**Does not touch:** `src/lib/db/**`, the API route (Phase 1 built it), anything retry-related,
`HistoryDetail.tsx`, `docs/**`, `CLAUDE.md`.

**Exit criteria:** a swipe reveals the control at 320/360/390 measured with loop 4
(`tools/seo/fit.sh`'s technique — fixed-width container plus `getBoundingClientRect`); the
gesture is unit-tested through the pure machine; a tap still opens the reading and an open tray
swallows the next tap instead of navigating; the destructive action is reachable by keyboard;
`EVENT_NAMES.length === 77` and `npm test -- events` is green.

### Phase 3 — Retry: the predicate, the writer, the endpoint

**Owns:**
- `src/lib/reading/retryable.ts` — **PURE, a LEAF**: no `server-only`, no `process.env`, no
  `@/lib/db`, one type-only import of `@/data/types`. `choice.ts` is the shape to copy. It
  answers "may this reading be retried" from `{ status, hasBody, cardCount, deletedAt? }` and
  nothing else, so the client and the server ask the same question of the same function.
  **`cardCount` is required** (a `blocked` reading has `body IS NULL` and no card rows, so
  `hasBody` alone would admit it and `buildPrompt` would throw on `picks[0]`); **`deletedAt` is
  optional precisely so a browser omits it** — `HistoryItem` and `ReadingDetail` carry no such
  field and must not gain one.
- `refillReading(db, userId, readingId, row)` in `queries/history.ts` — an **UPDATE** appended
  **after Phase 1's `softDeleteReading`**, guarded in the `WHERE` on
  `id = $ AND user_id = $ AND body IS NULL AND deleted_at IS NULL AND status <> 'blocked'`,
  returning the row count. **The guard in the `WHERE` is what makes a double-submit and a race
  safe; a read-then-write is not.** `ReadingRefill` names the nine columns a retry may move —
  and **`locale` is not one of them** (Invariant 7).
- A writer beside `persistReading` in `flush.ts` (**not** a change to `persistReading`, whose
  `23505` catch would silently swallow the whole retry). Same `withRetry` treatment, same
  optional-handle-last convention.
- `POST /api/reading/retry/[id]/route.ts`. It reuses **the whole pipeline** from `/api/reading` —
  the four budgets in order, `gateReading` (which primes the stream; deleting the priming looks
  like a tidy-up and doubles every reading's latency), `teeReading`, `splitChoiceMarker` +
  `validateChoice`, `recordCall`, `extractGist`, `mintOnReadingCompleted` — with four differences
  the plan states explicitly:
  1. the picks come from `reading_cards`, not from the body; the request carries **no picks at
     all**, so a tampered client cannot re-draw;
  2. the question comes from `readings.question` (already sanitized — `sanitizeQuestion` is
     idempotent, there is a property test) and is re-gated;
  3. the write is `refillReading`, not `insertReading`;
  4. **two locales, and they are not interchangeable**: `readLocale` for everything that touches
     the prose, `viewLocale` for everything the querent reads as chrome right now.
  `maxDuration = 60` and `runtime = 'nodejs'`, matching `/api/reading`. The source row is loaded
  **before** the budgets, deliberately, because `ctx.locale` must be the reading's.
- The HTTP contract Phase 4 builds against: `200` streaming with `x-reading-id` **and
  `x-reading-locale`**; `401`; `403` + `moderation_blocked`; `404 not_found` (five causes,
  indistinguishable); `409 not_retryable`; `429` with a `retry-after` that is not the window
  length; `500`; `503 unavailable`.
- The `llm_calls` consequence, recorded on the route: a retried reading carries **two**
  `op: 'reading'` rows for one `reading_id`, and `readingCostsFor` folds every
  `reading_id`-bearing row with no `op` predicate. Both attempts were paid for, so the sum is
  arguably right; it is written down rather than silently changed.
- Integration tests: a `failed` reading with intact `reading_cards` is refilled over the same
  card ids, positions and reversals; the immutable columns are asserted unchanged (including
  `locale`); a reading with prose is refused; a deleted reading is refused; a blocked reading is
  refused; a second concurrent retry writes once.

**Does not touch:** any component, any catalog, `events.ts`, `events.test.ts`,
**`src/app/api/history/log.ts`** (Phase 1 landed the whole union — this phase only calls
`logHistoryFailure('retry', err)`), `queries/history.ts:323`, `docs/**`, `CLAUDE.md`.

**Exit criteria:** the endpoint refills a seeded empty reading end to end against the
integration database, refuses every ineligible case with the right status, leaves the row
untouched when the second attempt also fails, and never moves `readings.locale`.

### Phase 4 — Retry: the `Coba ulang` control, copy, docs

**Owns:**
- `HistoryDetail.tsx`, rewritten: the retry control and the stream that fills it, plus
  `refillView` — **exported and unit-tested, because rule 4 is held by that function and not by
  this component's discipline.** `resolveProse` short-circuits on `reading.body === null`, so a
  refill cannot arrive through the `prose` prop and has to become a copy of the reading; a refill
  in the viewer's language paints, one in the other language gets an explicit
  `{ kind: 'as-written' }` and the `otherLanguage` notice. **No `router.refresh()`**, so the
  translation effect and the refill can never fight.
  `Draw.tsx:241-530` is the reference for consuming the response — **every status Phase 3 emits
  is branched on**: 401 → `/login`; 429 → `reading.rate_limited` + the rate-limit copy; **403 +
  `moderation_blocked` → `RefusalNotice`, and that branch MUST stay above the `!res.ok` check**
  or a moderation refusal is swallowed as `http_403` and loses the clause link and the crisis
  resources; **404 and 409 → a terminal `stale` state that takes the control away and asks for a
  reload**; 500 and 503 → the generic `reading.failed` branch, which is correct because both are
  transient and the row is untouched.
- `events.ts`: **widen `reading.retried`'s prop shape** — `surface: 'draw' | 'history'`,
  `reading_id`, `prior_status`, `age_days` — with the fold ledger. **The name already exists and
  this phase adds none**; a `history.reading_refilled` was drafted and dropped because it would
  have put the refill outside `where name = 'reading.retried'`.
- `src/app/[reader]/[service]/Draw.tsx:678-686` — four props at the existing `reading.retried`
  call. **A compile fix, out of the phase's nominal package and edited anyway**, because widening
  the shape breaks that call site. Nobody else in this plan set touches `Draw.tsx`.
- Both catalogs: `history.retry.action` / `.hint` / `.waiting` / `.otherLanguage` / `.stale` —
  **five keys, and six strings with the amendment** — Indonesian first, **plus an amendment to
  `history.item.unfinished`'s value**. **The edit anchors on `'history.item.unfinished'` and
  never on a line range: Phase 2 has already inserted eight `history.item.delete.*` keys into
  the same block** (conflict 19) — which is the
  whole of the list-row hint. **`!item.hasBody` is already exactly the retry predicate**, so the
  row already renders a line on precisely the retryable set; it just did not say what to do next.
  One place to press, and no second control on a row that now also carries a destructive gesture.
- **The doc edits, which are part of the work and not paperwork:**
  - `src/lib/db/queries/history.ts:323` — *"They render with a 'this reading did not finish' line
    and no retry (VD14)"* is now false and is edited, not deleted.
  - `docs/plans/2026-07-27-history.md` — VD14's narrow amendment (`:111`) and open question 7
    (`:3046`) answered, with a pointer to where.
  - `docs/workstream-notes.md`, V6's section — the VD14 amendment, the `body IS NULL` boundary,
    the delete rules, and every measurement this work produces.
  - **`CLAUDE.md` — the only edit in the plan set, at exactly net zero.** Two rulings bound
    (retry is `body IS NULL` not a status list; a delete revokes every share link **and clears
    the day summaries written about it**, in one transaction, before the flag), displacing the
    stale `67 names` count in the W4 `events.ts` bullet. **+131 / −131; 142,385 bytes before and
    after.**

**Does not touch:** `src/lib/db/**` except the one comment at `queries/history.ts:323`, any API
route, `HistoryItemRow.tsx` and its `.module.css`, `HistoryBrowser.tsx`, `swipe.ts`,
**`events.test.ts`**.

**Exit criteria:** the control appears on exactly the readings `isRetryable` admits and on no
others; pressing it streams prose into the page and a reload shows the stored version; a refusal
renders `RefusalNotice` above the reading and not a generic error; a 409 or 404 takes the control
away rather than looping; a viewer in the other locale never sees raw foreign prose from a
refill; both catalogs typecheck; this phase moves `EVENT_NAMES.length` by zero;
`wc -c CLAUDE.md` reads **142,385**, unchanged.

---

## Reconciliation Log

Twenty conflicts, all resolved by editing the plan files — eighteen in round 1, two more found
in round 2's verification pass and marked **ROUND 2**. **Every number below was re-measured
in the worktree by the reconciler** rather than carried over from a planner's report, and round
2 re-measured round 1's three load-bearing numbers independently rather than trusting the prose.

| # | Conflict | Kind | Resolution |
|---|---|---|---|
| 1 | `logHistoryFailure`'s `surface` union widened by **two phases on one line** — Phase 1 `'delete'`, Phase 3 `'retry'`. Phase 1 cited `:26`, Phase 3 cited `:22`. | Duplicate work / file collision | **Phase 3 was right about the line: the signature is at `log.ts:22`.** Phase 1's cite corrected in two places. **Phase 1 lands the whole five-value union in one edit** (earlier phase owns the region), with a header paragraph saying `'retry'` is the sharpest of the five because `readingWithCards` selects `question` AND `body`. **Phase 3 now edits that file not at all** — its Files table row reads `no edit` and its `Signature changes` section reads `NONE`. |
| 2 | `queries/history.ts` edited by **three** phases; Phases 1 and 3 both added `isNull` to line 5; Phase 3 quoted `:533` as the append point, which is `origin/main`'s EOF. | File collision / later phase quotes pre-change state | **One owner per region.** Phase 1: line 5's `isNull` + six read filters + `softDeleteReading`. Phase 3's Step 3 change (a) rewritten to *"NOTHING TO DO — the token is already there, do not re-add it"*, and change (c) rewritten to **append after Phase 1's `softDeleteReading`, at the NEW end of file, under its own banner** — with a note not to split Phase 1's banner from the function it labels. Phase 4 owns only `:323`. Phase 3's `Requires` now names Phase 1's two sibling imports (`./share`, `./summary`) and tells it not to reorder them. |
| 3 | **Does `refillReading` update `readings.locale`?** Invariant 7 named it on neither side. Phase 4 raised it; Phase 3 did not answer it in its contract. | Gap / contract drift | **Resolved: IMMUTABLE, and the prose is regenerated in it.** Phase 3's implementation already did the right thing (`ReadingRefill` has no `locale` field; the route splits `readLocale` from `viewLocale`) but never said so in its contract — so it was invisible to Phase 4. **Invariant 7 in this index now names `locale` on the must-not-touch side, with the reason**; Phase 3's contract carries the ruling as a block quote; Phase 4's `runRetry` comment is rewritten from *"the one assumption this file makes"* to a statement of the contract. The failure avoided: a row whose `locale` disagrees with its `body` breaks V2's translation of that reading permanently (`ReadingView` rule 4 keys off exactly that column; `translations` has no `source_hash`). |
| 4 | Phase 4 read an `x-reading-locale` response header that **Phase 3's contract did not provide**. | Unmet assumption | **Granted — Phase 3's route now sends `x-reading-locale: <readings.locale>`** and its contract table lists it. Phase 4's claim to be "correct either way" was **checked against its code and is true**: it reads the header, validates with `isLocale`, and falls back to `reading.locale`. The header is added anyway because **a client asserting a server property it cannot observe is how the two drift**, and the route is one incautious `await getLocale()` away from making the assertion false. Phase 4 keeps the fallback: a proxy stripping unknown headers is not a reason to paint foreign prose. |
| 5 | Phase 4's `requires` named only **401 / 429 / 403**; Phase 3 also emits **404, 409, 500, 503**. | Contract drift | Phase 4 gains a terminal **`{ kind: 'stale' }`** state and a new key `history.retry.stale` in both catalogs. **404 and 409 are ANSWERS, not failures** — the generic *"could not start"* copy beside a live button is an invitation to press it for ever — so they take the control away and ask for a reload. **500 and 503 stay in the generic `!res.ok` branch on purpose**: transient, row untouched, pressing again is correct, and `http_500` / `http_503` is the classifier that tells them apart. **Verified: the `403` + `moderation_blocked` branch sits ABOVE the `!res.ok` check** in Phase 4's code, as it must. |
| 6 | **CLAUDE.md — a direct contradiction.** Phase 4 did byte arithmetic for a net-neutral edit and stated Phases 1–3 must add nothing; Phase 1's handoff claimed a ruling of its own. | Duplicate work | **Phase 4 owns CLAUDE.md outright, and has absorbed Phase 1's ruling in full** — including the half Phase 4's draft had dropped, that the delete also **clears the day summaries written about the reading** (`isStale` cannot see a removed source id, so the read filter alone leaves a reader's paragraph standing for ever). **Re-measured with `wc -c` in the worktree:** file 142,385; W4 bullet 501 → 370 (−131); V6 block 1,718 → **1,849** (+131, not the draft's 1,793). **NET ZERO, file unchanged at 142,385** — net-neutral in the strict sense the rule asks for. Phase 1's handoff now says explicitly that it writes no CLAUDE.md line; Phase 4's verification asserts 142,385, not 142,329. |
| 7 | The index's Phase 4 line said **"fold in `reading.retried`"**. It already exists. | Gap in the index | **Confirmed against source: `events.ts:79`, props at `:367`, fired by `Draw.tsx:680`.** All three planners found this independently. **The index is corrected**: Phase 4 adds zero names and **widens the prop shape** (`surface`, `reading_id`, `prior_status`, `age_days`); Phase 2 adds the only new name. Invariant 5 rewritten to say so. |
| 8 | **`events.test.ts:129`'s ceiling was owned by NOBODY**, and it is exactly binding. | Gap / broken-build phase | **Re-measured: `EVENT_NAMES.length` is 76 and the assertion is `toBeLessThanOrEqual(76)`.** Phase 2's new name takes it to 77, so `npm test -- events` goes **red** the moment Phase 2 lands — and Phase 2's plan had no step for it, while Phase 4's plan told Phase 2 to do something Phase 2 could not see. **Added Phase 2 Step 6c**, with the full register entry in the shape the four entries above it use (`[R1]`'s ritual: revisit the register, do not bump the number). Phase 4 restated as never touching that file. Phase 2's verification and rollback both now name the ceiling. |
| 9 | Phase 4's `isRetryable` call **omitted the required `cardCount`** and **passed the optional `deletedAt`**. Its `requires` block declared a third, different signature. | Contract drift / broken build | Both fixed. `cardCount: reading.cards.length` added (`ReadingViewData` = `ReadingDetail` carries `cards`); **`deletedAt` omitted entirely.** Phase 4's `requires` block now quotes Phase 3's actual `RetryCandidate`. Phase 3's handoff carries the exact call. |
| 10 | `retryable()`'s `deletedAt` had **no wire source** — Phase 1 handed the decision to Phase 3, Phase 3 made it optional, Phase 4 hardcoded `null`. | Unmet assumption | **Resolved by omission, and the reasoning was checked against every caller Phase 4 actually has** — there is exactly one, on `/history/[id]`, whose row came through `readingWithCards`, which filters `deleted_at IS NULL`. So the component does not exist for a deleted reading. **The optional property is the signature not inviting a caller to pass what it cannot know**; hardcoding `null` would be the browser asserting a server fact. `refillReading`'s `WHERE` covers the window between the read and the write. **`HistoryItem` gains no field**, per Phase 1's ruling. |
| 11 | Phase 2 **departed from the index**: removal is CONFIRMED, not optimistic, so there is no revert-on-failure. | Contract drift (plan vs index) | **Accepted, and the index's Phase 2 boundary is rewritten to match.** The argument stands: the route is a WRITE that can wake a suspended Neon compute, so an optimistic "gone" would be on screen before the server agreed and could then be un-said — and for a feature whose purpose is somebody's embarrassment, **a false "it's gone" is the one lie that must not be told.** The index no longer says "optimistic removal, the failure revert". |
| 12 | Phase 1 required an **`AbortController` on Phase 2's client**; Phase 2's `confirm()` had none. | Unmet assumption | **Added: a 25s bound, `clearTimeout` in a `finally`.** 25 > the route's `maxDuration = 20`, so the client never aborts a request the server would still have answered. **Phase 1's handoff bullet is amended**: it originally said to hide the row optimistically on an abort and re-fetch, which contradicts conflict 11's accepted design. An abort now takes Phase 2's ordinary failure branch — the route is idempotent, so **the resolution is one more tap, not a guess.** |
| 13 | Phase 2 reserved a **marked insertion point inside `HistoryItemRow.tsx`** for Phase 4's retry hint; Phase 4 decided the hint is a **string change** and makes zero edits to that file. | Duplicate work | **Phase 4's call wins and Phase 2 owns both files outright.** `!item.hasBody` is already exactly the retry predicate, so the row already renders a line on precisely the retryable set. Phase 2's handoff table row and its handoff bullet are rewritten: keep rendering `history.item.unfinished`, keep the paragraph non-interactive (it is inside the `<Link>` *and* the swipe surface), and expect no further edit from any phase. Phase 4's `Leaves alone` records that the reservation was removed. |
| 14 | The index's Phase 1 boundary **omitted `clearDaySummaries`** in `queries/summary.ts` — scope Phase 1 added beyond its brief. | Gap in the index | **Accepted and folded into the index**, with the argument: `isStale` fires on a source id it has not seen and **never on one that has GONE**, so filtering `readingsOnDay` is necessary and not sufficient. Also folded into the CLAUDE.md ruling (conflict 6) and into `## Scope` and `## Why`. |
| 15 | Phase 3's contract table named the request headers **`x-jmt-session` / `x-jmt-local-date`**. | Contract drift | **The constants are `x-jm-session` and `x-jm-local-date`** (`src/lib/analytics/localdate.ts:24,27`). Corrected in Phase 3. Phase 2 had them right and both clients use the constants, so no code was at risk — but Phase 4 builds against Phase 3's table. |
| 16 | Phase 1 cited `allTime.ts:35` for the drizzle import. | Line-number drift | It is `:36`. Corrected in the step header and the Files table. The `FIND` text was exact, so no edit was at risk. |
| 17 | The index's dependency column did not reflect that **Phase 3 does not compile without Phase 1**. | Ordering | **The table now names every hard dependency and why**: Phase 3 needs `readings.deletedAt` *and* `log.ts`'s `'retry'` member; Phase 4 needs Phase 3's `isRetryable` and route, **and a soft dependency on Phase 2** for the `events.test.ts` ceiling — without which `npm test` is red for a reason that is not in Phase 4's diff. |
| 18 | Impact point 9, `src/lib/history/types.ts`, was **owned by no phase**. | Gap | **Deliberate, and now recorded rather than silent.** Phase 1 rules that `HistoryItem` and `ReadingDetail` gain **no field** — a deleted reading never reaches a client, so there is nothing to render about it — and conflict 10 removed the only pressure to add one. **No phase edits that file.** |
| 19 | **ROUND 2.** Phase 4's catalog steps replaced `id.ts:904-916` and `en.ts:468-475` **by line range**, and the replacement blocks re-emit `'history.item.shared'` followed immediately by `'history.detail.back'`. **Phase 2 lands first and inserts its eight `history.item.delete.*` keys in exactly that gap**, so applying Phase 4 literally would have deleted all eight. | File collision / later phase quotes pre-change state | **Mechanics fixed, no decision changed.** Steps 7 and 8 now **anchor on `'history.item.unfinished'` and never on a line range**, each block carries a placeholder line marking where Phase 2's keys stay, and the header of each step says why. Phase 4's Files table cells and its `Leaves alone` note say the same. The two phases' regions were always disjoint *in intent* — the index already said so — but the instruction was written against `origin/main`'s line numbers, which Phase 2 moves. **`id.ts` owns the key set, so the failure would not have been silent:** `en.ts` goes red as a superset and every `t('history.item.delete.…')` in `HistoryItemRow` renders the key. |
| 20 | **ROUND 2.** Phase 4's Files table still said *"four `history.retry.*` keys"* and *"the same five strings"*, counts written before round 1 created the fifth key `history.retry.stale`. Its Interface Contract, its Step 7/8 code, both catalogs and this index all said five. | Contract drift (residue of round 1's move 3) | Corrected to **five `history.retry.*` keys** (named individually, `.stale` marked as the one reconciliation added) and **six strings** including the `history.item.unfinished` amendment. The step headers already read *"amend one string, add five"* and needed no change. |

**Impact-point coverage, all 21 rows walked.** Every row is owned by exactly one phase, except
the three that are genuinely shared and now have disjoint regions: `queries/history.ts` (1 / 3 /
4), `events.ts` (2 adds the name, 4 widens a shape), and the two catalogs (2 adds
`history.item.delete.*`, 4 adds `history.retry.*` and amends `history.item.unfinished`). **Row 9
(`src/lib/history/types.ts`) is owned by nobody by decision** — see conflict 18. **Two files
outside the impact table are edited and are recorded here rather than discovered later:**
`src/lib/analytics/events.test.ts` (Phase 2, conflict 8) and
`src/app/[reader]/[service]/Draw.tsx` (Phase 4, the compile fix — and nobody else touches it).

**Round 2's verification pass, in full.** Round 1 reported `contract_changed: true` and named
four things that moved after the dependent plans were written. Each was walked to ground in the
plan files: (1) `logHistoryFailure`'s union — **no plan still shows the three-member form as
something to write**; Phase 1 lands all five at `log.ts:22`, Phase 3's Files row reads `no edit`
and its `Signature changes` reads `NONE`, and its handoff item 3 carries the RESOLVED
annotation (items 1 and 2 gained the same annotation in round 2, because item 2 still read
*"both add `isNull` to the drizzle import at line 5"* against a resolution that gives that token
to Phase 1 alone — a duplicate specifier is a compile error, not a merge). (2) `x-reading-locale`
is emitted in Phase 3's **route code**, not only in its contract table, inside the `200`
response's `headers` object, and Phase 4 reads it, validates with `isLocale` and falls back to
`reading.locale`. (3) `history.retry.stale` and `{ kind: 'stale' }` are present in **all** of
Phase 4's key list, its state union, its `404 || 409` branch, its render, `id.ts` and `en.ts` —
only the Files table's count was stale (conflict 20). (4) **Every `isRetryable` / `retryable`
call site in every plan passes `cardCount`**, and Phase 4's single call omits `deletedAt` as
conflict 10 requires. Also re-confirmed: Phase 2 owns `HistoryItemRow.tsx` and its `.module.css`
outright with Phase 4 making zero edits to either; **exactly one phase** edits
`events.test.ts`'s ceiling (Phase 2) and **exactly one** edits `Draw.tsx` (Phase 4); and the two
`events.ts` regions are disjoint and stay valid after Phase 2's insertions, which sit below
Phase 4's `:79` and `:367`.

**Build-green check, re-run after the edits.** Phase 1 is additive and self-contained. Phase 2
compiles on Phase 1 and its one red test is fixed inside its own commit. Phase 3 needs Phase 1's
column and union, which `depends_on: [1]` records. Phase 4 needs Phase 3's exports and route, and
Phase 2's ceiling move. **No dependency points forward. No symbol is deleted anywhere in this
plan set**, so there is no deleted-then-used class of conflict to resolve.

---

## Phase 3 landing notes (2026-08-28)

**Three things the plan did not anticipate, recorded here rather than discovered by Phase 4.**

1. **Two files outside the plan set's file table were edited, both required, and neither was on
   any non-touch list:** `src/lib/llm/callClass.test.ts` and `src/lib/llm/flagCoverage.test.ts`.
   `POST /api/reading/retry/[id]` is a new `streamReading()` call site **and** a new model call
   site, and both registries assert their table is **exactly** the set of call sites — so the
   phase does not go green without registering it. Registered as `op: 'reading'` /
   `reserveModelCall('interactive')` in `STREAM_CALLS`, and in the `EXEMPT` (no-flag) table on the
   same product ruling as `/api/reading` — *a retry is a reading* — **explicitly not as a fourth
   member of the admin-only class**, which would have triggered that class's owed
   `ADMIN_MODEL_CALLS_ENABLED` collapse. This joins `events.test.ts` (Phase 2) and `Draw.tsx`
   (Phase 4) in the ledger of files edited outside the impact table.

2. **The 200 path is UNMEASURED live, and it is an environment fact rather than a defect:** the
   local `LLM_API_KEY` is expired and z.ai answers `401 token expired or incorrect`. Measured live
   against a real dev server and real Postgres: 401 with no session; 405 on GET; `404 not_found`
   for an absent uuid, a non-uuid (`banana`), **another user's fully-retryable reading** and a
   soft-deleted reading; `409 not_retryable` for a reading that has prose; **the no-oracle rule
   proven on one row** — the same id answered 409 while live and 404 once soft-deleted; **a start
   failure writes nothing** — after the failed model call the row still had `body IS NULL`,
   `status = 'failed'`, `model = 'seed'`, still retryable; and **the viewer half of the locale
   split** — with `readings.locale = 'id'` the 500 came back Indonesian for the `id` UI and English
   for `?lang=en`, so `tView` follows the viewer. **Still unmeasured: the prose half (that
   generated text follows `readLocale`) and the `x-reading-locale` header**, both of which exist
   only on the 200 path — so manual checks 3, 4 and 7 of Phase 3's Verification section are **not
   satisfied by measurement** and need a working key. Phase 4 reads that header, validates it with
   `isLocale` and falls back to `reading.locale`; conflict 4's fallback is doing real work.

3. **Environment drift found while running the loops. `CLAUDE.md` was NOT edited — Phase 4 owns it
   and Invariant 9 makes every edit there net-neutral — so this is filed here for that phase:**
   - `~/tools/node-v24.18.0-linux-x64` **does not exist.** Installed Node is **v22.23.1** and is
     the default on PATH, so CLAUDE.md's `export PATH=~/tools/node-v24…` line is a silent no-op.
   - **Port 3000 is not taken any more** — `npm run dev` bound 3000, not 3001 — while `AUTH_URL`
     still says 3001.
   - **`npm run db:up` fails.** `docker-compose.yml` hardcodes `127.0.0.1:5432:5432`, 5432 is held
     by an unrelated process, and this worktree's `.env.local` expects **5442**. Worked around with
     a scratchpad-only compose override (`ports: !override ['127.0.0.1:5442:5432']`); **nothing in
     the repo was changed.** Postgres is currently up on 5442, which is what `.env.local` wants.

*Also recorded on the route rather than fixed, as the plan directs:* a retried reading carries
**two** `op: 'reading'` rows in `llm_calls` for one `reading_id`, and `readingCostsFor` folds them.


## Open Questions

**None.** Every conflict the planners raised, every one found in round 1's ledger walk, and
both found in round 2's verification pass, was resolved in the plan files themselves.
`/implement` has nothing to stop and ask about.

*One cosmetic non-conflict, recorded so it is not re-raised:* Phase 4's Interface Contract
summarises the widened `reading.retried` shape with `prior_status: ReadingStatus | null`, while
its Step 4 code correctly spells the literal union `'ok' | 'partial' | 'failed' | 'aborted' |
'blocked' | null`. **The code is the authority and is right** — `events.ts` is the closed
taxonomy and takes **no imports**, so a `ReadingStatus` import there would breach that rule.
The contract line is shorthand and was left alone.

*Three things are recorded as deliberately not done rather than as open questions, because each
has a stated owner-less reason in a plan file:* `translations` rows for a deleted reading's body
survive (nothing can reach them, and removing them would be the only place this feature destroys
data); there is no retention sweep over `readings.deleted_at`; and `GET /api/persona` and both
`/api/memory/*` routes still 500 rather than 204 when the database is down — noticed again while
reading these routes, unrelated to this work, and already recorded twice in the notes.

## Rollback

**Per phase.** Phases 2, 3 and 4 are `git revert` of their own commits — none of them changes
the schema.

**Phase 1 is the one with a database side.** The migration is **additive only** (two nullable
columns), so reverting the code leaves two unused columns and nothing breaks: every query that
learned the predicate goes back to not knowing it, and rows with `deleted_at` set become
visible again. **That is the honest rollback and it is also the risk** — a revert un-deletes
readings somebody asked to delete. If that matters at the time, revert in two steps: take out
`src/app/api/history/[id]/route.ts` and Phase 2's caller first, which stops any new deletion, and
leave the read filters in place so the existing ones stay deleted.

**Three cross-phase notes the reconciliation added:**

- **Phase 2's revert must take `events.test.ts`'s ceiling back to 76 with `EVENT_NAMES`.** The
  two move together or the suite goes red on a revert, which is the confusing direction to fail
  in.
- **Phase 4's revert un-binds a CLAUDE.md ruling about code that is still live** — the delete
  half of the V6 ruling is Phase 1's work. Prefer a patch revert that keeps the `docs/` and
  `CLAUDE.md` hunks; the rulings are true whether or not the button is on screen, and the stale
  `67 names` fix is worth keeping either way.
- **Phase 3's revert leaves `'retry'` declared in `log.ts`'s union with no caller.** That
  compiles and is harmless; narrow it only if Phase 1 is being reverted too.

**Do not write a down-migration that drops the columns.** `drizzle-kit push` is banned, a
destructive migration still deploys ahead of the code that tolerates it, and the 2026-07-28
outage is what that rule was bought with.

## Next

    /implement -f HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md

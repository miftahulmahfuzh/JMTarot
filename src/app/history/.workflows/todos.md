# Todos: history

**Package Path**: `src/app/history`
**Package Code**: AH
**Last Updated**: 2026-08-28 16:22:00
**Total Active Tasks**: 2

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 1
- Completed: 0

---

## Active Tasks

### [P0] Critical

### [P1] High
- [ ] **P1-AH-A000** Phase 2: Soft delete — the swipe gesture and the row
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `src/lib/history/swipe.ts` — PURE, imports nothing, the gesture state machine (`REVEAL_WIDTH`, `DIRECTION_SLOP`, `OPEN_AT`, `FLICK_PX_PER_MS`, rubber band, `beginDrag` / `advanceDrag` / `endDrag`), the part `npm test` can reach; `HistoryItemRow.tsx` + `.module.css` outright, with Phase 4 making zero edits to either — the swipe container, the revealed trash control, the confirm sheet and the non-touch path, under three codebase constraints (the drag is read from a ref and never inside a `setState` updater; a horizontal drag must not navigate the row's `<Link>` while a tap still must; the trash control clears 44px) and a sheet that takes its opener as a prop, never `document.activeElement`; the delete request with a 25s `AbortController` (25 > the route's `maxDuration = 20`); `HistoryBrowser.tsx`'s `openId`, `daysNonce` and `removeItem` as a CONFIRMED removal, never an optimistic one — a false "it's gone" is the one lie this feature must not tell — with the day strip refetched rather than spliced; `events.ts` folding in `history.item_deleted` as the 77th name with its register entry; `events.test.ts:129` moving the ceiling 76 → 77 in the same commit; eight `history.item.delete.*` keys in both catalogs, Indonesian first, promising neither permanence nor a restore and naming the share link. Does not touch `src/lib/db/**`, the API route, anything retry-related, `HistoryDetail.tsx`, `docs/**` or `CLAUDE.md`. **Exit criteria**: a swipe reveals the control at 320/360/390 measured with loop 4; the gesture is unit-tested through the pure machine; a tap still opens the reading and an open tray swallows the next tap instead of navigating; the destructive action is reachable by keyboard; `EVENT_NAMES.length === 77` and `npm test -- events` is green.
  - **Unblocked**: 2026-08-28 — P1-DB-A000 landed (the `DELETE /api/history/[id]` route and the read filters it calls into)
  - **Status**: open
  - **Plan Set**: `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md` (phase 2 of 4)
  - **Depends on**: P1-DB-A000
  - **Plan**: `.workflows/plan/P1-AH-A000.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked
- [ ] **P1-AH-A001** Phase 4: Retry — the `Coba ulang` control, copy, docs
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `HistoryDetail.tsx` rewritten — the retry control and the stream that fills it, plus `refillView`, exported and unit-tested because `ReadingView`'s rule 4 is held by that function and not by the component's discipline, with no `router.refresh()` so the translation effect and the refill can never fight; every status Phase 3 emits is branched on (401 → `/login`; 429 → the rate-limit copy; 403 + `moderation_blocked` → `RefusalNotice`, and that branch MUST stay above the `!res.ok` check; 404 and 409 → a terminal `stale` state that takes the control away; 500 and 503 → the generic `reading.failed` branch); `events.ts` widening `reading.retried`'s prop shape with `surface`, `reading_id`, `prior_status`, `age_days` and adding NO name; the four-prop compile fix at `Draw.tsx:678-686`; five `history.retry.*` keys and six strings in both catalogs, Indonesian first, anchored on `'history.item.unfinished'` and never on a line range because Phase 2 has already inserted eight keys into the same block; and the doc edits that are part of the work — `queries/history.ts:323`'s now-false comment, `docs/plans/2026-07-27-history.md` (VD14's narrow amendment and open question 7), `docs/workstream-notes.md` V6, and the plan set's only `CLAUDE.md` edit at exactly net zero (+131 / −131, 142,385 bytes before and after). Does not touch `src/lib/db/**` except that one comment, any API route, `HistoryItemRow.tsx` and its `.module.css`, `HistoryBrowser.tsx`, `swipe.ts` or `events.test.ts`. **Exit criteria**: the control appears on exactly the readings `isRetryable` admits and on no others; pressing it streams prose into the page and a reload shows the stored version; a refusal renders `RefusalNotice` above the reading and not a generic error; a 409 or 404 takes the control away rather than looping; a viewer in the other locale never sees raw foreign prose from a refill; both catalogs typecheck; this phase moves `EVENT_NAMES.length` by zero; `wc -c CLAUDE.md` reads 142,385, unchanged.
  - **Blocked by**: P1-LR-A000 (HARD — imports `isRetryable`, calls the retry route) and P1-AH-A000 (SOFT — Phase 2 must have moved `events.test.ts`'s ceiling, or `npm test` is red for a reason that is not in this phase's diff)
  - **Status**: blocked
  - **Plan Set**: `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md` (phase 4 of 4)
  - **Depends on**: P1-LR-A000 (hard), P1-AH-A000 (soft)
  - **Plan**: `.workflows/plan/P1-AH-A001.md`

---

## Completed Tasks

---

## Archive

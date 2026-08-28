# Todos: history

**Package Path**: `src/app/history`
**Package Code**: AH
**Last Updated**: 2026-08-28 17:02
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 2

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

- [x] **P1-AH-A001** Phase 4: Retry — the `Coba ulang` control, copy, docs
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `HistoryDetail.tsx` rewritten — the retry control and the stream that fills it, plus `refillView`, exported and unit-tested because `ReadingView`'s rule 4 is held by that function and not by the component's discipline, with no `router.refresh()` so the translation effect and the refill can never fight; every status Phase 3 emits is branched on (401 → `/login`; 429 → the rate-limit copy; 403 + `moderation_blocked` → `RefusalNotice`, and that branch MUST stay above the `!res.ok` check; 404 and 409 → a terminal `stale` state that takes the control away; 500 and 503 → the generic `reading.failed` branch); `events.ts` widening `reading.retried`'s prop shape with `surface`, `reading_id`, `prior_status`, `age_days` and adding NO name; the four-prop compile fix at `Draw.tsx:678-686`; five `history.retry.*` keys and six strings in both catalogs, Indonesian first, anchored on `'history.item.unfinished'` and never on a line range because Phase 2 has already inserted eight keys into the same block; and the doc edits that are part of the work — `queries/history.ts:323`'s now-false comment, `docs/plans/2026-07-27-history.md` (VD14's narrow amendment and open question 7), `docs/workstream-notes.md` V6, and the plan set's only `CLAUDE.md` edit at exactly net zero (+131 / −131, 142,385 bytes before and after). Does not touch `src/lib/db/**` except that one comment, any API route, `HistoryItemRow.tsx` and its `.module.css`, `HistoryBrowser.tsx`, `swipe.ts` or `events.test.ts`. **Exit criteria**: the control appears on exactly the readings `isRetryable` admits and on no others; pressing it streams prose into the page and a reload shows the stored version; a refusal renders `RefusalNotice` above the reading and not a generic error; a 409 or 404 takes the control away rather than looping; a viewer in the other locale never sees raw foreign prose from a refill; both catalogs typecheck; this phase moves `EVENT_NAMES.length` by zero; `wc -c CLAUDE.md` reads 142,385, unchanged.
  - **Unblocked**: 2026-08-28 — P1-LR-A000 landed (the `retryable()` / `isRetryable()` LEAF, `refillReading`, `refillReadingRow` and `POST /api/reading/retry/[id]`), so the HARD dependency is satisfied. **Two files outside the plan set's file table were edited by Phase 3 and Phase 4 should know**: `src/lib/llm/callClass.test.ts` and `src/lib/llm/flagCoverage.test.ts` — the retry route is a new `streamReading()` call site and a new model call site, and both registries assert their table is EXACTLY the set of call sites, so it had to be registered (`op: 'reading'` / `reserveModelCall('interactive')` in `STREAM_CALLS`, and `EXEMPT` on the same ruling as `/api/reading`, "a retry is a reading" — explicitly not a fourth member of the admin-only class). **Phase 3's 200 path is UNMEASURED live** because the local `LLM_API_KEY` is expired, so `x-reading-locale` and the `readLocale` half of the locale split have not been observed on the wire; Phase 4 reads that header and falls back to `reading.locale`, which is the branch that was designed for exactly this. Original dependency note: (HARD — imports `isRetryable`, calls the retry route). **The SOFT dependency on P1-AH-A000 is SATISFIED as of 2026-08-28: Phase 2 landed and moved `events.test.ts`'s ceiling to 77.** Phase 4 must therefore NOT touch `events.test.ts` — it widens `reading.retried`'s existing prop shape and adds no name.
  - **Status**: completed
  - **Plan Set**: `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md` (phase 4 of 4)
  - **Depends on**: P1-LR-A000 (hard), P1-AH-A000 (soft)
  - **Plan**: `.workflows/plan/P1-AH-A001.md`
  - **Completed**: 2026-08-28 17:02
  - **Method**: /do
  - **Files**: src/app/history/[id]/HistoryDetail.tsx, src/app/history/[id]/HistoryDetail.module.css, src/app/history/[id]/HistoryDetail.test.ts, src/lib/analytics/events.ts, src/app/[reader]/[service]/Draw.tsx, src/lib/i18n/locales/id.ts, src/lib/i18n/locales/en.ts, src/lib/db/queries/history.ts, src/components/attachSurface.test.ts, docs/plans/2026-07-27-history.md, docs/workstream-notes.md, CLAUDE.md
  - **Verification**: `npm run typecheck` clean; `npm test` 3758 passed in 198 files, 0 failed; `npm run build` clean (`audit-secrets: clean`, `/api/reading/retry/[id]` present in the route table); `wc -c CLAUDE.md` 142,385 before and 142,385 after — net zero by the byte; `EVENT_NAMES.length` = 77, unique 77, and `events.test.ts` not in the diff; `HistoryDetail.test.ts` 7/7 (refillView's truth table asserted through the real `resolveProse`); zero edits to `HistoryItemRow.tsx`, its `.module.css`, `HistoryBrowser.tsx`, `src/lib/history/swipe.ts` or any API route
  - **Deviation**: one file outside the phase's table was edited — `src/components/attachSurface.test.ts` pinned `attachable(reading)` by regex and went red, because the phase deliberately moves both footer conditions to the refilled `view` (gating on the server prop would refuse *Bahas di grup* on a reading the querent just watched arrive). The assertion was re-pinned to `attachable(view)` with the reason written into the test — **not loosened to accept either**.
  - **Deferred, recorded not done**: Phase 3's `200` path is still unmeasured live (the local `LLM_API_KEY` is expired), so `x-reading-locale` has never been seen on the wire — the client reads it through `isLocale()` and falls back to `reading.locale`, which is the branch designed for exactly this; loop 4 has not been run for the width of `history.retry.otherLanguage` at 320/360/390; loop 6 (a real iPhone) has not been run — the 44px button on glass, thumb reach at the bottom of a long scroll, whether the pulsing label reads as progress or as a hang on a cold Neon compute, and where the refusal's `scrollIntoView` lands.

- [x] **P1-AH-A000** Phase 2: Soft delete — the swipe gesture and the row
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `src/lib/history/swipe.ts` — PURE, imports nothing, the gesture state machine (`REVEAL_WIDTH`, `DIRECTION_SLOP`, `OPEN_AT`, `FLICK_PX_PER_MS`, rubber band, `beginDrag` / `advanceDrag` / `endDrag`), the part `npm test` can reach; `HistoryItemRow.tsx` + `.module.css` outright, with Phase 4 making zero edits to either — the swipe container, the revealed trash control, the confirm sheet and the non-touch path, under three codebase constraints (the drag is read from a ref and never inside a `setState` updater; a horizontal drag must not navigate the row's `<Link>` while a tap still must; the trash control clears 44px) and a sheet that takes its opener as a prop, never `document.activeElement`; the delete request with a 25s `AbortController` (25 > the route's `maxDuration = 20`); `HistoryBrowser.tsx`'s `openId`, `daysNonce` and `removeItem` as a CONFIRMED removal, never an optimistic one — a false "it's gone" is the one lie this feature must not tell — with the day strip refetched rather than spliced; `events.ts` folding in `history.item_deleted` as the 77th name with its register entry; `events.test.ts:129` moving the ceiling 76 → 77 in the same commit; eight `history.item.delete.*` keys in both catalogs, Indonesian first, promising neither permanence nor a restore and naming the share link. Does not touch `src/lib/db/**`, the API route, anything retry-related, `HistoryDetail.tsx`, `docs/**` or `CLAUDE.md`. **Exit criteria**: a swipe reveals the control at 320/360/390 measured with loop 4; the gesture is unit-tested through the pure machine; a tap still opens the reading and an open tray swallows the next tap instead of navigating; the destructive action is reachable by keyboard; `EVENT_NAMES.length === 77` and `npm test -- events` is green.
  - **Unblocked**: 2026-08-28 — P1-DB-A000 landed (the `DELETE /api/history/[id]` route and the read filters it calls into)
  - **Status**: completed
  - **Plan Set**: `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md` (phase 2 of 4)
  - **Depends on**: P1-DB-A000
  - **Plan**: `.workflows/plan/P1-AH-A000.md`
  - **Completed**: 2026-08-28 16:27
  - **Method**: /do
  - **Files**: src/lib/history/swipe.ts, src/lib/history/swipe.test.ts, src/app/history/HistoryItemRow.tsx, src/app/history/HistoryItemRow.module.css, src/app/history/HistoryBrowser.tsx, src/lib/analytics/events.ts, src/lib/analytics/events.test.ts, src/lib/i18n/locales/id.ts, src/lib/i18n/locales/en.ts
  - **Verification**: `npm run typecheck` clean; `npm test` 3740 passed in 196 files; `npm run test:integration` 668 passed in 47 files; `npm run build` clean (audit-secrets clean); `EVENT_NAMES.length` re-counted on disk = 77
  - **Deviation**: the plan's `ConfirmSheet` signature wrote `React.RefObject<HTMLButtonElement | null>` without importing React; implemented as a `type RefObject` named import from `react`. Same type, compiles.
  - **Deferred, recorded not done**: loop 4 (fixed-width fit at 320/360/390), loop 5 (real Chrome CDP — tap-vs-drag, focus restore, the fetch shape) and loop 6 (a real iPhone, for the feel of the gesture and the sheet's safe-area clearance). None are runnable from this session.

---

## Archive

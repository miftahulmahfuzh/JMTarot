# Todos: reading

**Package Path**: `src/lib/reading`
**Package Code**: LR
**Last Updated**: 2026-08-28 15:58:59
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 0

---

## Active Tasks

### [P0] Critical

### [P1] High
- [ ] **P1-LR-A000** Phase 3: Retry — the predicate, the writer, the endpoint
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `src/lib/reading/retryable.ts` — PURE, a LEAF (no `server-only`, no `process.env`, no `@/lib/db`, one type-only import of `@/data/types`), answering "may this reading be retried" from `{ status, hasBody, cardCount, deletedAt? }`, with `cardCount` required (a `blocked` reading has no card rows) and `deletedAt` optional so a browser omits it; `refillReading(db, userId, readingId, row)` appended after Phase 1's `softDeleteReading` in `queries/history.ts`, an UPDATE guarded in the `WHERE` on `body IS NULL AND deleted_at IS NULL AND status <> 'blocked'` (the guard in the WHERE is what makes a double-submit and a race safe); a writer beside `persistReading` in `flush.ts`, never a change to `persistReading` whose `23505` catch would swallow the retry; `POST /api/reading/retry/[id]/route.ts` reusing the whole `/api/reading` pipeline with four stated differences (picks come from `reading_cards` and the request carries none; the question comes from `readings.question` and is re-gated; the write is `refillReading`; `readLocale` and `viewLocale` are not interchangeable), `maxDuration = 60`, `runtime = 'nodejs'`; the HTTP contract Phase 4 builds against (200 + `x-reading-id` + `x-reading-locale`, 401, 403 `moderation_blocked`, 404 `not_found`, 409 `not_retryable`, 429, 500, 503 `unavailable`); the recorded `llm_calls` consequence of two `op: 'reading'` rows per `reading_id`; the integration tests. Retry is defined by `body IS NULL`, never a status list, and a retry never moves `readings.locale`. Does not touch any component, catalog, `events.ts`, `events.test.ts`, `src/app/api/history/log.ts`, `queries/history.ts:323`, `docs/**` or `CLAUDE.md`. **Exit criteria**: the endpoint refills a seeded empty reading end to end against the integration database, refuses every ineligible case with the right status, leaves the row untouched when the second attempt also fails, and never moves `readings.locale`.
  - **Unblocked**: 2026-08-28 — P1-DB-A000 landed (HARD — `refillReading`'s `WHERE` names `readings.deletedAt`, and `log.ts`'s `surface` union must already carry `'retry'`; Phase 3 does not compile without Phase 1)
  - **Status**: open
  - **Plan Set**: `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md` (phase 3 of 4)
  - **Depends on**: P1-DB-A000
  - **Plan**: `.workflows/plan/P1-LR-A000.md`


### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked
---

## Completed Tasks

---

## Archive

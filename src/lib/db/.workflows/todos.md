# Todos: db

**Package Path**: `src/lib/db`
**Package Code**: DB
**Last Updated**: 2026-08-28 16:22:00
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1

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

- [x] **P1-DB-A000** Phase 1: Soft delete — schema, read filters, delete route
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the `## Schema deltas` (`readings.deleted_at` and `reading_cards.deleted_at`, both `timestamptz null`, denormalized on `reading_cards` on purpose and with no index), migration `0016_v14-readings-soft-delete.sql` via `generate` + `migrate`; `softDeleteReading(db, userId, readingId)` in `queries/history.ts` as one transaction that revokes share links, clears day summaries, flags the cards, then flags the reading, in that order; `clearDaySummaries` in `queries/summary.ts` (accepted scope beyond the brief — `isStale` never fires on a source id that has GONE); the read filters, sixteen functions across five query modules (`history.ts`, `frequency.ts`, `summary.ts`, `share.ts`, `allTime.ts`), as `isNull(...deletedAt)` inside the existing `and(...)` and never an `exists`; the whole five-value `surface` union at `src/app/api/history/log.ts:22` including Phase 3's `'retry'`; `DELETE /api/history/[id]/route.ts` with `requireUser()`, uuid validation, `runtime = 'nodejs'`, `maxDuration = 20`, `logHistoryFailure('delete', err)`, and 204 with no body for all four outcomes (no oracle); the integration tests. Does not touch any component, catalog, `events.ts`/`events.test.ts`, the reading route, `persistReading`, `src/lib/history/types.ts`, `docs/**` or `CLAUDE.md`. **Exit criteria**: the migration applies on a fresh `db:nuke` + `db:up` + `db:migrate`; `softDeleteReading` is proven by integration test to remove the reading from every listed read, to kill its share links and to clear the summaries that named it; `EVENT_NAMES` is still 76; nothing in the UI calls the route and the app behaves exactly as before.
  - **Status**: completed
  - **Plan Set**: `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md` (phase 1 of 4)
  - **Depends on**: none
  - **Plan**: `.workflows/plan/P1-DB-A000.md`
  - **Completed**: 2026-08-28 16:22
  - **Method**: /do
  - **Files**: src/lib/db/schema.ts, src/lib/db/migrations/0016_v14-readings-soft-delete.sql, src/lib/db/migrations/meta/_journal.json, src/lib/db/migrations/meta/0016_snapshot.json, src/lib/db/queries/history.ts, src/lib/db/queries/frequency.ts, src/lib/db/queries/summary.ts, src/lib/db/queries/share.ts, src/lib/db/queries/allTime.ts, src/app/api/history/log.ts, src/app/api/history/[id]/route.ts, src/lib/db/queries/history.softDelete.integration.test.ts, src/app/api/history/[id]/route.contract.test.ts

---

## Archive

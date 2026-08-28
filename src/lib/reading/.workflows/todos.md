# Todos: reading

**Package Path**: `src/lib/reading`
**Package Code**: LR
**Last Updated**: 2026-08-28 16:55
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

- [x] **P1-LR-A000** Phase 3: Retry — the predicate, the writer, the endpoint
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `src/lib/reading/retryable.ts` — PURE, a LEAF (no `server-only`, no `process.env`, no `@/lib/db`, one type-only import of `@/data/types`), answering "may this reading be retried" from `{ status, hasBody, cardCount, deletedAt? }`, with `cardCount` required (a `blocked` reading has no card rows) and `deletedAt` optional so a browser omits it; `refillReading(db, userId, readingId, row)` appended after Phase 1's `softDeleteReading` in `queries/history.ts`, an UPDATE guarded in the `WHERE` on `body IS NULL AND deleted_at IS NULL AND status <> 'blocked'` (the guard in the WHERE is what makes a double-submit and a race safe); a writer beside `persistReading` in `flush.ts`, never a change to `persistReading` whose `23505` catch would swallow the retry; `POST /api/reading/retry/[id]/route.ts` reusing the whole `/api/reading` pipeline with four stated differences (picks come from `reading_cards` and the request carries none; the question comes from `readings.question` and is re-gated; the write is `refillReading`; `readLocale` and `viewLocale` are not interchangeable), `maxDuration = 60`, `runtime = 'nodejs'`; the HTTP contract Phase 4 builds against (200 + `x-reading-id` + `x-reading-locale`, 401, 403 `moderation_blocked`, 404 `not_found`, 409 `not_retryable`, 429, 500, 503 `unavailable`); the recorded `llm_calls` consequence of two `op: 'reading'` rows per `reading_id`; the integration tests. Retry is defined by `body IS NULL`, never a status list, and a retry never moves `readings.locale`.
  - **Unblocked**: 2026-08-28 — P1-DB-A000 landed
  - **Status**: done
  - **Plan Set**: `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md` (phase 3 of 4)
  - **Depends on**: P1-DB-A000
  - **Plan**: `.workflows/plan/P1-LR-A000.md`
  - **Completed**: 2026-08-28 16:55
  - **Method**: /do
  - **Files**: src/lib/reading/retryable.ts, src/lib/reading/retryable.test.ts, src/lib/db/queries/history.ts, src/lib/db/queries/history.refill.integration.test.ts, src/lib/analytics/flush.ts, src/app/api/reading/retry/[id]/route.ts, src/lib/llm/callClass.test.ts, src/lib/llm/flagCoverage.test.ts
  - **Verification**: typecheck clean; `npm run build` clean (audit-secrets clean, `/api/reading/retry/[id]` present in the route manifest); `npm test` 3751 tests in 197 files; `npm run test:integration` 678 tests in 48 files. The two projects were run SEPARATELY, never `test:all`.
  - **Note — two files edited outside the plan's file table, both REQUIRED**: `src/lib/llm/callClass.test.ts` and `src/lib/llm/flagCoverage.test.ts`. The new route is a new `streamReading()` call site and a new model call site, and both registries assert their table is EXACTLY the set of call sites — so the phase does not go green without registering it. Registered as `op: 'reading'` / `reserveModelCall('interactive')` in `STREAM_CALLS`, and in the `EXEMPT` (no-flag) table on the same product ruling as `/api/reading` ("a retry is a reading"), explicitly NOT as a fourth member of the admin-only class. Neither file was on the non-touch list. Phase 4 should be aware.
  - **Note — the happy path is UNMEASURED live, and that is an environment fact rather than a defect**: the local `LLM_API_KEY` is EXPIRED (z.ai answers `401 token expired or incorrect`). What WAS measured live against a real dev server and real Postgres: 401 with no session; 405 on GET; `404 not_found` for an absent uuid, a non-uuid (`banana`), another user's fully-retryable reading and a soft-deleted reading; `409 not_retryable` for a reading that has prose; **the no-oracle rule proven on one row** — the same id answered 409 while live and 404 once soft-deleted; **a start failure writes NOTHING** — after the failed model call the row still had `body IS NULL`, `status = 'failed'`, `model = 'seed'`, still retryable; and **the viewer half of the locale split** — with `readings.locale = 'id'` the 500 came back Indonesian for the `id` UI and English for `?lang=en`, so `tView` follows the viewer. STILL UNMEASURED: the prose half (that generated text follows `readLocale`, not `viewLocale`) and the `x-reading-locale` header, both of which exist only on the 200 path. **Manual checks 3, 4 and 7 of the plan's Verification section are therefore not satisfied by measurement** and need a working LLM key.
  - **Note — environment drift found; `CLAUDE.md` was NOT edited, because Phase 4 owns the docs**: (a) `~/tools/node-v24.18.0-linux-x64` does not exist — installed Node is v22.23.1 and is the default on PATH, so CLAUDE.md's `export PATH=…node-v24…` line is a silent no-op; (b) port 3000 is not taken any more — `npm run dev` bound 3000, not 3001, while `AUTH_URL` still says 3001; (c) `npm run db:up` FAILS — `docker-compose.yml` hardcodes `127.0.0.1:5432:5432`, 5432 is held by an unrelated process, and this worktree's `.env.local` expects 5442. Worked around with a scratchpad-only compose override (`ports: !override ['127.0.0.1:5442:5432']`); nothing in the repo was changed. Postgres is currently UP on 5442, which is what `.env.local` wants.
  - **Note — recorded on the route rather than fixed, as the plan directs**: a retried reading carries TWO `op: 'reading'` rows in `llm_calls` for one `reading_id`, and `readingCostsFor` folds them.

---

## Archive

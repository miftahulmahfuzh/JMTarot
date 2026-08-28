# Phase 3: Retry — the predicate, the writer, the endpoint

**Plan set:** `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md`
**Analysis:** `20260828-145716-GEV5_code_analyzer.md`
**Depends on:** Phase 1 (`readings.deleted_at` must exist; `refillReading`'s guard reads it)
**Difficulty:** HARD
**Package:** `src/app/api/reading/retry`, `src/lib/reading`, `src/lib/db/queries`, `src/lib/analytics`

---

## Goal

A reading stored with `body IS NULL` can be regenerated **in place**, over its own stored
draw, at `POST /api/reading/retry/[id]`. The row keeps its `id` and every column that
identifies it; only the generated columns move. Retryability is one pure function that the
server and (in Phase 4) the client both call, so the button and the endpoint can never
disagree about which readings offer it.

Nothing in the UI calls this endpoint when the phase lands. That is Phase 4.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts.

### Creates

- `src/lib/reading/retryable.ts` — new module. Exports:
  - `type RetryCandidate = { status: ReadingStatus; hasBody: boolean; cardCount: number; deletedAt?: Date | string | null }`
  - `type RetryRefusal = 'deleted' | 'blocked' | 'has_body' | 'no_cards'`
  - `type RetryVerdict = { ok: true } | { ok: false; reason: RetryRefusal }`
  - `function retryable(r: RetryCandidate): RetryVerdict`
  - `function isRetryable(r: RetryCandidate): boolean`
- `src/lib/reading/retryable.test.ts` — unit.
- `src/lib/db/queries/history.ts`:
  - `type ReadingRefill = { status: ReadingStatus; body: string | null; choice: string | null; verdict: YesNo | null; model: string; promptVersion: string; latencyMs: number | null; tokenInput: number | null; tokenOutput: number | null }`
  - `async function refillReading(db: DbOrTx, userId: string, readingId: string, row: ReadingRefill): Promise<number>` — returns the number of rows updated (`0` or `1`).
- `src/lib/analytics/flush.ts`:
  - `type ReadingRefillRow = ReadingRefill` (re-export, mirroring `ReadingRow`)
  - `async function refillReadingRow(userId: string, readingId: string, row: ReadingRefill, injected?: DbOrTx): Promise<boolean>`
- `src/app/api/reading/retry/[id]/route.ts` — `POST`, `runtime = 'nodejs'`, `maxDuration = 60`.
- `src/lib/db/queries/history.refill.integration.test.ts`.

### Signature changes

**NONE. RECONCILED.** This phase planned to widen `logHistoryFailure`'s `surface` union with
`'retry'` (`src/app/api/history/log.ts:22`) while Phase 1 widened the same line with
`'delete'`. **One line, two owners, is how a merge silently drops one of them**, so the
reconciler assigned the whole edit to the earlier phase: **Phase 1 lands
`'list' | 'days' | 'detail' | 'delete' | 'retry'` in one edit**, with the paragraph explaining
why `'retry'` is the sharpest of the five (`readingWithCards` selects `question` AND `body`).

**This phase makes NO edit to `src/app/api/history/log.ts`.** It imports the helper and calls
`logHistoryFailure('retry', err)` against a union that already admits the value. If Phase 1
has not landed, this does not compile — which is already true of `refillReading`, and is what
`depends_on: [1]` records.

### Deletes / Renames

None.

### Requires (from earlier phases)

- **Phase 1**: `readings.deletedAt` exists on the Drizzle table object and in the database
  (migration `0016`). `refillReading`'s `WHERE` names it.
- **Phase 1**: `readingWithCards` filters `deleted_at is null`. The retry route loads its
  source row through that function, so the filter is what makes a deleted reading
  indistinguishable from an absent one at the route.
- **Phase 1**: `history.ts`'s drizzle import line (line 5) gains `isNull`. **RECONCILED:
  PHASE 1 IS THE SOLE OWNER OF THAT TOKEN.** When this phase opens the file, line 5 already
  reads
  `import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';`
  — **do not re-add it**; Step 3's change (a) is a no-op and is retained only so a reader knows
  the token is expected to be there.
- **Phase 1**: `src/app/api/history/log.ts:22` already reads
  `surface: 'list' | 'days' | 'detail' | 'delete' | 'retry'`. This phase calls it and edits the
  file not at all.
- **Phase 1**: `queries/history.ts` ends with `SoftDeleteOutcome` + `softDeleteReading`.
  **`refillReading` is appended AFTER those**, at the new end of file. Phase 1 also inserts two
  sibling imports (`./share`, `./summary`) below the `../schema` block — do not remove or
  reorder them.

### The public HTTP contract (Phase 4 builds against exactly this)

| | |
|---|---|
| **Path** | `/api/reading/retry/[id]` where `[id]` is `readings.id` |
| **Method** | `POST` |
| **Request body** | **NONE.** The handler never calls `request.json()`. A body sent anyway is not read and is not an error. This is invariant 7's enforcement: the picks come from `reading_cards` and a tampered client cannot re-draw. |
| **Request headers** | `x-jm-session` (`SESSION_HEADER`) and `x-jm-local-date` (`LOCAL_DATE_HEADER`) — **the constants are `x-jm-*`, not `x-jmt-*`; corrected by the reconciler against `src/lib/analytics/localdate.ts:24,27`.** Both optional, both handled exactly as `/api/reading` handles them. No `content-type` needed, and one sent anyway is ignored. |

| Status | Body | Meaning |
|---|---|---|
| `200` | `text/plain; charset=utf-8`, chunked prose | Generating. Headers: `cache-control: no-store`, `x-accel-buffering: no`, `x-reading-id: <the reading's own id>`, **`x-reading-locale: <readings.locale>`** (added by the reconciler at Phase 4's request — see the locale note below). |
| `401` | `{ "error": "Unauthorized" }` | No session. `requireUser()`'s shape verbatim. |
| `403` | `{ "error": "Onboarding required" }` | `requireUser()`'s onboarding gate. |
| `403` | `{ "error": "moderation_blocked", ... }` | **W7 refused the question on re-gate.** `gated.payload`. Header `x-reading-id`. **Phase 4's client must branch on the BODY before `!res.ok`**, exactly as `Draw.tsx:336` does, or the refusal is swallowed as `http_403` and loses the clause link and the crisis resources. |
| `404` | `{ "error": "not_found" }` | The reading does not exist, is not yours, is `blocked`, is soft-deleted, or the id is not a uuid. **All five are indistinguishable, deliberately** — `readingWithCards`'s no-oracle rule. |
| `409` | `{ "error": "not_retryable" }` | It exists and is yours, and it may not be retried: it already has prose, or its stored draw is unusable. Not an oracle — the client can already see `hasBody`. |
| `429` | `{ "error": "<localised>" }` | Any of the four budgets. `retry-after` header, seconds, never zero, **never the window length.** All four answer identically on purpose. |
| `500` | `{ "error": "<localised>" }` | `ReadingStartError` — the model call died before the moderation verdict. Nothing was written to the wire. |
| `503` | `{ "error": "unavailable" }` | The driver failed loading the source row. `logHistoryFailure('retry', err)`. |

`x-reading-id` on a retry is **the id that was passed in the path**, so Phase 4 already knows
it before the request. It is sent anyway, so the client's own `reading.completed` loss
detector works identically to the draw screen's.

**`x-reading-locale` — AND THE ANSWER TO THE OPEN QUESTION PHASE 4 RAISED.**

> **DOES A RETRY MOVE `readings.locale`? NO. IT IS IMMUTABLE, AND THE PROSE IS REGENERATED IN
> IT.** The plan index's invariant 7 listed `locale` in neither the changed set nor the
> must-not-touch set, which was a real gap; the reconciler has added it to the must-not-touch
> side, and this route is where that is enforced. `ReadingRefill` (Step 3) has no `locale`
> field, so `refillReading` cannot write the column even by mistake, and the route's `readLocale`
> / `viewLocale` split (Step 6's header) is what keeps the PROSE in `source.locale` while the
> chrome — the 429, the 500, the refusal payload — follows the querent's UI. **A retry from an
> English UI of an Indonesian reading produces Indonesian prose.** The alternative was a row
> whose `locale` disagreed with its `body`, which breaks V2's translation of that reading
> permanently: `ReadingView`'s rule 4 keys off exactly that column, and `translations`'
> staleness is `updated_at` against the source with no `source_hash` to catch a language swap.

The header exists so **Phase 4 does not have to take that on trust.** It is one line
(`'x-reading-locale': readLocale`), it is the value `refillView` needs to decide whether to
paint or to show the `otherLanguage` notice, and Phase 4 already falls back to
`reading.locale` when it is absent or malformed — so the two agree with or without it. It is
sent because **a client asserting a server property it cannot observe is how the two drift**,
and because the assertion is one `await getLocale()` away from becoming false if somebody
later "simplifies" this route towards `/api/reading`'s shape.

### Leaves alone (owned by others)

- `src/lib/analytics/events.ts` — Phase 4. **This route fires NO new event name.**
- `src/app/history/**` and every component — Phases 2 and 4.
- `src/lib/i18n/locales/*` — Phases 2 and 4.
- `src/lib/db/schema.ts` — Phase 1 only.
- Every read filter in `queries/{history,frequency,summary,share,allTime}.ts` — Phase 1.
- `src/lib/db/queries/history.ts:323`'s *"and no retry (VD14)"* comment — Phase 4.

---

## Findings the reconciler must act on — ALL FOUR RESOLVED

> **RECONCILED 2026-08-28.** Every finding below was verified against the tree and acted on.
> The resolutions, in one line each:
>
> 1. **`reading.retried` already exists** — confirmed (`events.ts:79`, props `:367`,
>    `Draw.tsx:680`). **Phase 4 adds no name and widens the shape instead**; the plan index's
>    "fold in `reading.retried`" line was wrong and has been corrected. **Phase 2 adds the only
>    new name and owns the ceiling move 76 -> 77 in `events.test.ts:129`** — which neither plan
>    had, and the taxonomy is exactly AT 76 on this base, so it is a red suite, not a nicety.
> 2. **`queries/history.ts` is edited by three phases** — Phase 1 (filters + `softDeleteReading`
>    + the `isNull` token), Phase 3 (`refillReading`, appended AFTER Phase 1's tail), Phase 4
>    (the one comment at `:323`). Distinct regions, ordered, one owner each. Step 3 above is
>    rewritten to quote the post-Phase-1 file.
> 3. **`log.ts`'s union goes to Phase 1 entirely**, all five values in one edit. This phase
>    edits that file not at all.
> 4. **The hard dependency on Phase 1 stands** and is now in the index's dependency column.

**1. `reading.retried` ALREADY EXISTS. Phase 4's "fold it in" premise is false.**

`src/lib/analytics/events.ts:79` carries the name in `EVENT_NAMES`, `:367` carries its props
(`{ reader_id: string; service_id: string; attempt: number }`), and `Draw.tsx:680` already
fires it — that is the draw screen's *try again* after a failed reading. So:

- **`EVENT_NAMES` does not move for `reading.retried`.** Phase 4's plan says "state the new
  total and what was considered"; there is nothing to fold and the total is unchanged.
- The existing shape carries **no `reading_id` and no `source`/`surface`**, so as it stands a
  history retry and a draw-screen retry are indistinguishable in the data. Widening the props
  is an `events.ts` edit and therefore Phase 4's call, not this phase's.
- **This route deliberately fires nothing new.** Phase 4 decides whether the history retry
  reports through the existing name (client-side, as `Draw.tsx` does) or through a widened
  one. The insertion point on the server, if Phase 4 wants it there, is immediately after
  `track('reading.requested', …)` in Step 6 below.

`history.item_deleted` (Phase 2) genuinely does not exist — verified.

**2. Two files are shared with Phase 1.** `src/lib/db/queries/history.ts` (Phase 1 adds read
filters and `softDeleteReading`; this phase appends `refillReading` and its type) and
`src/app/api/history/log.ts` (both widen one union). Both merges are additive.

---

## Files

| File | Action | What changes |
|---|---|---|
| `src/lib/reading/retryable.ts` | create | the pure predicate, a LEAF beside `choice.ts` |
| `src/lib/reading/retryable.test.ts` | create | unit coverage of all five branches |
| `src/lib/db/queries/history.ts` | modify | `+ReadingStatus, YesNo` on the `@/data/types` import (line 6); `ReadingRefill` + `refillReading` appended at the **new** end of file, **after Phase 1's `softDeleteReading`**. **`isNull` on line 5 is Phase 1's and is already there — do not re-add it.** |
| `src/lib/db/queries/history.refill.integration.test.ts` | create | the guard, proven |
| `src/lib/analytics/flush.ts` | modify | `refillReadingRow` beside `persistReading` (`:355-374`); import line `:22` gains two names |
| `src/app/api/history/log.ts` | **no edit** | **RECONCILED: Phase 1 lands the whole five-value union.** This phase only calls `logHistoryFailure('retry', err)`. |
| `src/app/api/reading/retry/[id]/route.ts` | create | the endpoint |

---

## Implementation Steps

### Step 1: The pure predicate

**File:** `src/lib/reading/retryable.ts` (new)
**Change:** A LEAF beside `choice.ts` — no `server-only`, no `process.env`, no `@/lib/db`, one
type-only import of `@/data/types` (which has no imports of its own). It runs in the browser
for Phase 4's control and on the server for the route, and that is the only reason the two
cannot disagree.

**Code:**

```ts
/**
 * May this reading be retried?
 *
 * PURE, NO `server-only`, NO `process.env`, NO `@/lib/db`. `choice.ts` beside it is
 * the shape this copies and the reason is the same: **one function, two callers.**
 * Phase 4's `Coba ulang` control asks this question of a `HistoryItem` in the
 * browser; `POST /api/reading/retry/[id]` asks it of a `ReadingDetail` on the
 * server. A button that offers a retry the endpoint then refuses is the whole
 * failure this module exists to prevent, and the only way to prevent it is for
 * there to be one answer.
 *
 * ── RETRYABILITY IS `body IS NULL`. IT IS NOT A STATUS LIST. ─────────────────
 *
 * `ReadingStatus` is `'ok' | 'partial' | 'failed' | 'aborted' | 'blocked'`, and
 * `tee.ts` records `aborted` when the querent navigated away and `failed` when the
 * stream died. **From the row's point of view those two are the same thing and the
 * querent cannot tell them apart** — `/history` renders one line,
 * `history.item.unfinished`, for both. A status list here would make the button
 * mean something the screen does not say, and the first person to add `'partial'`
 * to it would start regenerating prose somebody has already read.
 *
 * `partial` HAS PROSE. It is a reading that stopped mid-sentence, and the
 * `[Bacaan terputus…]` notice it renders deliberately never reached
 * `readings.body`. VD14 stands for it unamended: regenerating it would make the
 * querent's memory of what they were told and the app's disagree. **`hasBody` is
 * therefore the whole rule, and this must not widen.**
 *
 * ── THE THREE THINGS BESIDES `hasBody`, AND WHY EACH IS NOT A WIDENING ───────
 *
 *   - `deletedAt`   somebody asked for this to be gone. Regenerating it is the
 *                   opposite of that. (Belt only: the route reads its source
 *                   through `readingWithCards`, which filters deleted rows, and
 *                   `refillReading`'s `WHERE` filters them again. This is the
 *                   copy the CLIENT can check, and the client has no `WHERE`.)
 *   - `blocked`     W7 refused the question. A blocked reading has `body IS NULL`
 *                   and **no `reading_cards` rows at all** (reconciliation R7), so
 *                   the `body IS NULL` rule alone would call it retryable and the
 *                   route would try to re-read a draw that does not exist. It is
 *                   also the one row whose `question` holds text the classifier
 *                   flagged — W7 redacts the same words from `moderation_flags` at
 *                   30 days, and feeding them back to a model on demand undoes
 *                   that. This is `readingsForDay`'s security-adjacent filter, in
 *                   a second place.
 *   - `cardCount`   there is nothing to re-read without the hand. Structurally
 *                   implied by `blocked` today; asserted anyway, because the
 *                   alternative is `buildPrompt` throwing on `picks[0]`.
 *
 * ── WHY IT RETURNS A REASON AND NOT A BOOLEAN ────────────────────────────────
 *
 * The reason is for LOGS AND CODE PATHS, never for the wire. The route answers
 * `deleted` and `blocked` with the same 404 an absent reading gets — a
 * distinguishable "exists but you may not" turns a uuid guess into an existence
 * oracle, which is `readingWithCards`'s rule. `isRetryable` is the boolean for a
 * caller that only renders a button.
 */
import type { ReadingStatus } from '@/data/types';

/**
 * The smallest thing that can answer the question.
 *
 * Structurally satisfied by `HistoryItem` (which carries `hasBody` and `cards`) and
 * by `ReadingDetail` after one `hasBody: body !== null` — so neither caller has to
 * build a bespoke object, and neither can pass a shape carrying prose into the
 * browser. `deletedAt` is optional because the two shapes that reach the client do
 * not carry it and must not: a deleted reading never reaches them at all.
 */
export type RetryCandidate = {
  status: ReadingStatus;
  /** `readings.body is not null`. THE RULE. */
  hasBody: boolean;
  /** `reading_cards` rows for this reading. Zero means there is no draw. */
  cardCount: number;
  /** Phase 1's column. Absent means "the caller cannot see it", not "it is null". */
  deletedAt?: Date | string | null;
};

/** Never rendered, never sent. For a log line and for choosing a status code. */
export type RetryRefusal = 'deleted' | 'blocked' | 'has_body' | 'no_cards';

export type RetryVerdict = { ok: true } | { ok: false; reason: RetryRefusal };

/**
 * Ordered most-fundamental first, so the reason names the strongest fact about the
 * row rather than the first clause somebody happened to write.
 */
export function retryable(r: RetryCandidate): RetryVerdict {
  if (r.deletedAt != null) return { ok: false, reason: 'deleted' };
  if (r.status === 'blocked') return { ok: false, reason: 'blocked' };
  if (r.hasBody) return { ok: false, reason: 'has_body' };
  if (r.cardCount <= 0) return { ok: false, reason: 'no_cards' };
  return { ok: true };
}

/** For a caller that only decides whether to render a control. */
export function isRetryable(r: RetryCandidate): boolean {
  return retryable(r).ok;
}
```

**Impact:** Nothing imports it yet except its test and, in Step 6, the route.

---

### Step 2: The unit test for the predicate

**File:** `src/lib/reading/retryable.test.ts` (new)
**Change:** Cover every branch, and pin the two rules that would otherwise be widened by
somebody who thinks they are being helpful.

**Code:**

```ts
/**
 * The retry predicate.
 *
 * Two of these tests are NEGATIVE CONTROLS on rules stated in prose elsewhere, and
 * they are the point of the file: `partial` is never retryable although it is not
 * `ok`, and `failed`/`aborted` are BOTH retryable although only one of them is a
 * failure. A status list would break the first; a status list containing only
 * `failed` would break the second.
 */
import { describe, expect, it } from 'vitest';
import { isRetryable, retryable, type RetryCandidate } from './retryable';

const base: RetryCandidate = {
  status: 'failed',
  hasBody: false,
  cardCount: 3,
  deletedAt: null,
};

describe('retryable', () => {
  it('allows a failed reading with no prose and a stored draw', () => {
    expect(retryable(base)).toEqual({ ok: true });
    expect(isRetryable(base)).toBe(true);
  });

  /**
   * `aborted` MEANS THE QUERENT NAVIGATED AWAY and `failed` means the stream died.
   * `/history` renders one line for both because the querent cannot tell them
   * apart, and this is what stops the button disagreeing with that line.
   */
  it('allows an aborted reading on exactly the same terms', () => {
    expect(retryable({ ...base, status: 'aborted' })).toEqual({ ok: true });
  });

  /**
   * THE VD14 BOUNDARY. `partial` is prose that stops mid-sentence; the querent has
   * read it. Regenerating it would make their memory and the app's disagree, which
   * is VD14 verbatim and is NOT amended by this feature.
   */
  it('refuses a partial reading, which has prose', () => {
    expect(retryable({ ...base, status: 'partial', hasBody: true })).toEqual({
      ok: false,
      reason: 'has_body',
    });
  });

  it('refuses a completed reading', () => {
    expect(retryable({ ...base, status: 'ok', hasBody: true })).toEqual({
      ok: false,
      reason: 'has_body',
    });
  });

  /**
   * A blocked reading has `body IS NULL` and no card rows at all, so the
   * `body IS NULL` rule ALONE would call it retryable. Its `question` is text W7's
   * classifier flagged.
   */
  it('refuses a blocked reading even though it has no prose', () => {
    expect(retryable({ ...base, status: 'blocked', cardCount: 0 })).toEqual({
      ok: false,
      reason: 'blocked',
    });
  });

  it('refuses a soft-deleted reading before anything else', () => {
    expect(retryable({ ...base, deletedAt: new Date() })).toEqual({
      ok: false,
      reason: 'deleted',
    });
    // A string, because the column arrives as one through some paths.
    expect(retryable({ ...base, deletedAt: '2026-08-28T00:00:00Z' })).toEqual({
      ok: false,
      reason: 'deleted',
    });
  });

  /** `deletedAt` absent is "the caller cannot see it", never "it is set". */
  it('treats an absent deletedAt as not deleted', () => {
    const { deletedAt: _omitted, ...withoutTheField } = base;
    expect(retryable(withoutTheField)).toEqual({ ok: true });
  });

  it('refuses a reading with no stored draw', () => {
    expect(retryable({ ...base, cardCount: 0 })).toEqual({ ok: false, reason: 'no_cards' });
  });
});
```

**Impact:** Runs in the fast `unit` project. No database.

---

### Step 3: `refillReading` — the guarded UPDATE

**File:** `src/lib/db/queries/history.ts`

**Change (a): NOTHING TO DO — RECONCILED.** Line 5 already reads

```ts
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
```

because **Phase 1 owns that token**, having added it for its own sixteen read filters. **Do not
re-add `isNull`.** This paragraph is kept rather than deleted so that a reader who opens the
file and finds the token already there knows it is expected and not somebody else's stray edit.
If it is absent, Phase 1 has not landed and nothing in this phase compiles anyway
(`refillReading`'s `WHERE` names `readings.deletedAt`).

**Change (b):** line 6, the `@/data/types` import gains two names. **This one IS this phase's**
— Phase 1 does not touch line 6:

```ts
import type { Locale, ReaderId, ReadingStatus, ServiceId, YesNo } from '@/data/types';
```

**Change (c): append at the NEW end of the file — which is not `:533` any more.**

**RECONCILED, AND THIS IS AN ORDERING FACT RATHER THAN A LINE NUMBER.** On `origin/main` the
file is 532 lines and ends with `readingWithCards`. **After Phase 1 it ends with
`SoftDeleteOutcome` and `softDeleteReading`**, under a
`// ---- The delete ----` banner, and it has acquired two sibling imports (`./share`,
`./summary`) below the `../schema` block. So:

- **Append `ReadingRefill` + `refillReading` AFTER `softDeleteReading`**, at the true end of
  file, under their own banner. Do not insert between `readingWithCards` and the delete block —
  splitting Phase 1's banner from the function it labels is the diff nobody reviews correctly.
- `UUID_RE` is still declared at `:283` and is in scope. Phase 1 uses it too; it is not
  redeclared.
- The two sibling imports are Phase 1's and stay. **A third is a decision, not a habit**, and
  this phase needs none.

**Code:**

```ts
/**
 * The columns a retry is allowed to move. THIS LIST IS THE INVARIANT.
 *
 * Nine columns, and what is ABSENT is the specification: `id`, `user_id`,
 * `reader_id`, `service_id`, `question`, `locale`, `local_date`, `session_id`,
 * `created_at`, `shared_at` and `gist` are all missing on purpose.
 *
 *   - the first eight identify the reading. A retry is the SAME reading, which is
 *     what keeps every FK pointing at it — `reading_cards`, `llm_calls`,
 *     `chat_messages.attached_reading_id`, `chat_runs.trigger_reading_id`,
 *     `translations.entity_id`, `share_links.entity_id` — valid and pointing at the
 *     thing the querent retried.
 *   - `locale` in particular: `readings.locale` is the language the PROSE CAME OUT
 *     IN, and the retry regenerates in that same language whatever the querent's UI
 *     is set to now. Moving it would make V2's translation of this reading stale
 *     against a body that was never in the language the column claims.
 *   - `shared_at` is "was this ever public", which a regeneration does not change.
 *   - `gist` is written separately by `setReadingGist`, from inside `extractGist`,
 *     for the same reason it is not part of `insertReading`: it does not exist yet
 *     when the prose is stored.
 *
 * `body: null` IS A LEGITIMATE VALUE HERE and is the retry-failed-again case: the
 * row keeps `body IS NULL`, so it stays retryable, which is exactly the promise the
 * screen makes. The status, timing and token columns still move, so the row records
 * the SECOND attempt rather than the first. **The first attempt's token counts are
 * overwritten and are not lost** — `llm_calls` keeps a row per attempt.
 */
export type ReadingRefill = {
  status: ReadingStatus;
  body: string | null;
  choice: string | null;
  verdict: YesNo | null;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
  tokenInput: number | null;
  tokenOutput: number | null;
};

/**
 * Fill in the prose of a reading that has none. **The only UPDATE path `readings`
 * has besides `setReadingGist`.**
 *
 * ── THE GUARD IS IN THE `WHERE`, AND THAT IS THE WHOLE DESIGN ────────────────
 *
 * Four predicates, and none of them may move into JavaScript:
 *
 *   `id = $` `user_id = $`  ownership as a PREDICATE, `readingWithCards`'s rule.
 *                           Fetching and then comparing owners is one forgotten
 *                           `if` away from overwriting a stranger's reading.
 *   `body is null`          THE RULE (invariant 6). A read-then-write cannot hold
 *                           it: two presses of `Coba ulang`, or one press and one
 *                           lost-ack retry, both read `null`, both generate, and
 *                           **the second overwrites prose the querent is already
 *                           reading on screen.** In the `WHERE` the loser updates
 *                           zero rows and says so.
 *   `deleted_at is null`    Phase 1's column. A reading somebody deleted while the
 *                           stream was in flight must not come back with fresh
 *                           prose. The route also cannot SEE a deleted reading
 *                           (`readingWithCards` filters it), so this is the belt to
 *                           that brace — and it is the one that covers the window
 *                           between the read and the write.
 *   `status <> 'blocked'`   a blocked reading has `body IS NULL` and no cards, so
 *                           `body is null` alone would admit it. Same
 *                           security-adjacent filter `readingsForDay` carries.
 *
 * **RETURNS A ROW COUNT, NOT A BOOLEAN OR A ROW.** `0` is a normal outcome and not
 * an error: somebody else won, or it is no longer eligible. The caller decides what
 * that means; nothing here throws for it.
 *
 * NO `updatedAt`. `readings` has no such column (see `schema.ts:319-428`), so the
 * `$onUpdate()` trap does not apply — but note it did not apply because the column
 * is absent, not because Drizzle handled it. If anyone adds one, it must be set by
 * hand in every upsert, and here it would be set by `db.update()` correctly.
 *
 * A MALFORMED UUID IS A ZERO, NOT A DRIVER ERROR. `where id = 'banana'` raises
 * SQLSTATE `22P02`, and an unhandled one puts the failing statement in the platform
 * log. Same `UUID_RE` guard, same reason, as `readingWithCards`.
 */
export async function refillReading(
  db: DbOrTx,
  userId: string,
  readingId: string,
  row: ReadingRefill,
): Promise<number> {
  if (!UUID_RE.test(readingId)) return 0;

  const updated = await db
    .update(readings)
    .set({
      status: row.status,
      body: row.body,
      choice: row.choice,
      verdict: row.verdict,
      model: row.model,
      promptVersion: row.promptVersion,
      latencyMs: row.latencyMs,
      tokenInput: row.tokenInput,
      tokenOutput: row.tokenOutput,
    })
    .where(
      and(
        eq(readings.id, readingId),
        eq(readings.userId, userId),
        isNull(readings.body),
        isNull(readings.deletedAt),
        ne(readings.status, 'blocked'),
      ),
    )
    /*
     * `returning` RATHER THAN THE DRIVER'S ROW COUNT. postgres.js exposes a count
     * and Drizzle's shape for it differs between dialects; one id back is the same
     * round trip and reads the same on every driver.
     */
    .returning({ id: readings.id });

  return updated.length;
}
```

**Impact:** `readings` gains an update path it did not have. Nothing calls it until Step 5.
**It depends on Phase 1's `readings.deletedAt` and does not compile without it.**

---

### Step 4: The integration test for the guard

**File:** `src/lib/db/queries/history.refill.integration.test.ts` (new)
**Change:** Prove the four `WHERE` predicates and prove the immutable columns are immutable.

**Code:**

```ts
/**
 * `refillReading`'s guard, against a real Postgres.
 *
 * ITS OWN FILE RATHER THAN AN APPENDIX TO `history.v6.integration.test.ts`, which
 * is about the three READS and shares a fixture built for them. This is about one
 * WRITE and every assertion is about what did NOT change.
 *
 * ── ON "TWO CONCURRENT RETRIES WRITE ONCE" ───────────────────────────────────
 *
 * `withRollback` runs a test inside ONE transaction on ONE connection, so a true
 * race cannot be staged here — two connections would need `resetDb()` and a
 * committing test. What IS staged is the double-submit, which is the same
 * predicate resolving the same way: the second call sees the first call's effect
 * and its `body is null` clause fails. **That is the mechanism a real race
 * resolves with**, and it is the one worth pinning; a two-connection test would
 * assert the same `0` at ten times the cost.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readingCards, readings, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { ReadingStatus } from '@/data/types';
import type { Tx } from '@/lib/db/types';
import { and, eq } from 'drizzle-orm';
import { insertReading, refillReading, type ReadingRefill } from './history';

afterAll(closeTestDb);

const DAY = '2026-08-28';

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

/** An unfinished reading with a real three-card draw, unless told otherwise. */
async function unfinished(
  tx: Tx,
  userId: string,
  o: { body?: string | null; status?: ReadingStatus; cards?: [number, boolean, number][] } = {},
): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: 'thessaly',
      serviceId: 'spread3',
      locale: 'id',
      model: 'first-attempt',
      promptVersion: 'id-v1.aaaaaaaa',
      localDate: DAY,
      question: 'apakah aku harus pindah kerja?',
      status: o.status ?? 'failed',
      body: o.body === undefined ? null : o.body,
    },
    (o.cards ?? [
      [16, false, 0],
      [9, true, 1],
      [6, false, 2],
    ]).map(([cardId, reversed, position]) => ({ cardId, reversed, position })),
  );
  return row.id;
}

const FILL: ReadingRefill = {
  status: 'ok',
  body: 'Kartu-kartu berbicara tentang perpindahan.',
  choice: null,
  verdict: null,
  model: 'second-attempt',
  promptVersion: 'id-v1.bbbbbbbb',
  latencyMs: 1234,
  tokenInput: 900,
  tokenOutput: 300,
};

describe('refillReading', () => {
  it('fills a failed reading and moves ONLY the generated columns', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-ok');
      const id = await unfinished(tx, user);

      const [before] = await tx.select().from(readings).where(eq(readings.id, id));

      expect(await refillReading(tx, user, id, FILL)).toBe(1);

      const [after] = await tx.select().from(readings).where(eq(readings.id, id));

      // What moved.
      expect(after.body).toBe(FILL.body);
      expect(after.status).toBe('ok');
      expect(after.model).toBe('second-attempt');
      expect(after.promptVersion).toBe('id-v1.bbbbbbbb');
      expect(after.latencyMs).toBe(1234);
      expect(after.tokenInput).toBe(900);
      expect(after.tokenOutput).toBe(300);

      /*
       * WHAT DID NOT MOVE. Invariant 7, column by column. `created_at` is in the
       * list because a bumped one would reorder the querent's history around a
       * retry, which is the sort of thing nobody notices until they do.
       */
      expect(after.id).toBe(before.id);
      expect(after.userId).toBe(before.userId);
      expect(after.readerId).toBe(before.readerId);
      expect(after.serviceId).toBe(before.serviceId);
      expect(after.question).toBe(before.question);
      expect(after.locale).toBe(before.locale);
      expect(after.localDate).toBe(before.localDate);
      expect(after.sessionId).toBe(before.sessionId);
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
      expect(after.sharedAt).toBe(before.sharedAt);
      // The gist is written by `setReadingGist`, never by this.
      expect(after.gist).toBe(before.gist);
    });
  });

  /** INVARIANT 7. Same hand, same positions, same reversals — untouched rows. */
  it('never touches reading_cards', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-cards');
      const id = await unfinished(tx, user);

      const read = () =>
        tx
          .select({
            cardId: readingCards.cardId,
            reversed: readingCards.reversed,
            position: readingCards.position,
            localDate: readingCards.localDate,
          })
          .from(readingCards)
          .where(eq(readingCards.readingId, id))
          .orderBy(readingCards.position);

      const before = await read();
      expect(before).toEqual([
        { cardId: 16, reversed: false, position: 0, localDate: DAY },
        { cardId: 9, reversed: true, position: 1, localDate: DAY },
        { cardId: 6, reversed: false, position: 2, localDate: DAY },
      ]);

      await refillReading(tx, user, id, FILL);
      expect(await read()).toEqual(before);
    });
  });

  it('refuses a reading that already has prose', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-hasbody');
      const id = await unfinished(tx, user, { body: 'sudah ada prosa', status: 'partial' });

      expect(await refillReading(tx, user, id, FILL)).toBe(0);

      const [row] = await tx.select().from(readings).where(eq(readings.id, id));
      expect(row.body).toBe('sudah ada prosa');
      expect(row.status).toBe('partial');
      expect(row.model).toBe('first-attempt');
    });
  });

  it('refuses a soft-deleted reading', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-deleted');
      const id = await unfinished(tx, user);
      await tx.update(readings).set({ deletedAt: new Date() }).where(eq(readings.id, id));

      expect(await refillReading(tx, user, id, FILL)).toBe(0);

      const [row] = await tx.select().from(readings).where(eq(readings.id, id));
      expect(row.body).toBeNull();
    });
  });

  it('refuses a blocked reading, which also has no prose', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-blocked');
      const id = await unfinished(tx, user, { status: 'blocked', cards: [] });

      expect(await refillReading(tx, user, id, FILL)).toBe(0);

      const [row] = await tx.select().from(readings).where(eq(readings.id, id));
      expect(row.body).toBeNull();
      expect(row.status).toBe('blocked');
    });
  });

  /** Indistinguishably: a zero, exactly as for a reading that does not exist. */
  it("refuses another user's reading", async () => {
    await withRollback(async (tx) => {
      const owner = await makeUser(tx, 'dev:refill-owner');
      const stranger = await makeUser(tx, 'dev:refill-stranger');
      const id = await unfinished(tx, owner);

      expect(await refillReading(tx, stranger, id, FILL)).toBe(0);

      const [row] = await tx.select().from(readings).where(eq(readings.id, id));
      expect(row.body).toBeNull();
    });
  });

  /**
   * THE DOUBLE SUBMIT. The second call's `body is null` clause fails against the
   * first call's effect, so it updates nothing and the prose on screen is not
   * replaced. Same predicate a real two-connection race resolves with.
   */
  it('writes once for two attempts', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-twice');
      const id = await unfinished(tx, user);

      const first = await refillReading(tx, user, id, FILL);
      const second = await refillReading(tx, user, id, {
        ...FILL,
        body: 'bacaan kedua yang berbeda',
        model: 'third-attempt',
      });

      expect([first, second]).toEqual([1, 0]);

      const [row] = await tx.select().from(readings).where(eq(readings.id, id));
      expect(row.body).toBe(FILL.body);
      expect(row.model).toBe('second-attempt');
    });
  });

  /**
   * A FAILED RETRY LEAVES THE ROW RETRYABLE. `body` stays null, so the guard still
   * matches next time — which is the promise the screen makes.
   */
  it('leaves the row retryable when the retry also produced nothing', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-failed-again');
      const id = await unfinished(tx, user);

      expect(
        await refillReading(tx, user, id, {
          ...FILL,
          status: 'failed',
          body: null,
          latencyMs: null,
          tokenInput: null,
          tokenOutput: null,
        }),
      ).toBe(1);

      const [row] = await tx.select().from(readings).where(eq(readings.id, id));
      expect(row.body).toBeNull();
      expect(row.status).toBe('failed');
      // Still eligible.
      expect(await refillReading(tx, user, id, FILL)).toBe(1);
    });
  });

  it('answers a malformed uuid with zero and no driver error', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-badid');
      await expect(refillReading(tx, user, 'banana', FILL)).resolves.toBe(0);
    });
  });

  /** A reading that does not exist is the same zero as one that is not yours. */
  it('answers an absent reading with zero', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:refill-absent');
      expect(
        await refillReading(tx, user, '00000000-0000-4000-8000-000000000000', FILL),
      ).toBe(0);
    });
  });
});
```

> The `and` import is used by the fixture helpers in the file as written above only via
> `eq`; if the final code does not reference `and`, drop it from the import — the linter
> will say so.

**Impact:** Adds ~11 integration tests. Needs `npm run db:up` and Phase 1's migration applied
to `jmtarot_test` (`npm run db:test:reset && npm run db:migrate` against `TEST_DATABASE_URL`).

---

### Step 5: `refillReadingRow` — the writer beside `persistReading`

**File:** `src/lib/analytics/flush.ts`
**Change (a):** line 22, the import gains two names:

```ts
import {
  insertReading,
  refillReading,
  type ReadingCardInput,
  type ReadingRefill,
} from '@/lib/db/queries/history';
```

**Change (b):** insert immediately after `persistReading` (`:374`) and before `touchLastSeen`.

**Code:**

```ts
/** Mirrors `ReadingRefill`, for symmetry with `ReadingRow`. One shape, one owner. */
export type ReadingRefillRow = ReadingRefill;

/**
 * The retry's write. **A SECOND WRITER, NOT A CHANGE TO `persistReading`.**
 *
 * ── WHY `persistReading` CANNOT DO THIS ──────────────────────────────────────
 *
 * It inserts, and its retry loop catches SQLSTATE `23505` and returns — "already
 * written by a lost-ack attempt", which is exactly right for its own case. Run
 * against an existing `readings.id` that catch fires on the FIRST attempt,
 * **silently writes nothing, and returns normally.** The retry would appear to
 * succeed, the querent would watch prose arrive on screen, and a reload would show
 * the same empty reading. Nothing would log. That is why this is a separate
 * function rather than a branch inside that one.
 *
 * ── WHAT IT SHARES WITH IT, DELIBERATELY ─────────────────────────────────────
 *
 *   - `withRetry`, because the failure policy is `persistReading`'s and not
 *     `flushEvents`': a lost row here is the querent's own prose, not a dashboard.
 *   - the optional handle LAST, because this is a WRITER and not a query module.
 *     Rule 1 of `queries/**` is handle-FIRST; these two conventions are opposites
 *     on purpose and `contract.test.ts` only enforces the query-module one.
 *   - `handle()`'s **dynamic** `import('@/lib/db/client')`. A static import pulls in
 *     `server-only`, which throws under Vitest and would take `sanitizeProps`'s unit
 *     tests down with it.
 *
 * ── AND THE ONE THING IT DOES NOT SHARE: NO `enabled()` GATE ─────────────────
 *
 * `persistReading` opens with `if (!enabled()) return`. This does not, and the
 * reason is worth stating so nobody "harmonises" it: `ANALYTICS_ENABLED` silences
 * the analytics WRITE PATH, and a fresh reading's row is genuinely part of that
 * path. **A refill is the querent's own prose being restored into a row they are
 * looking at**, and it has no metric character at all. Leaving the gate off also
 * makes the function directly callable from the integration suite.
 *
 * **It changes nothing operationally today and that is stated rather than hidden:**
 * the retry route calls this from inside `defer()`, and `defer()` returns early on
 * the same variable — so with `ANALYTICS_ENABLED=0` a retry streams to the screen
 * and stores nothing, exactly as a fresh reading already does. The switch must not
 * be set in production, which CLAUDE.md already says for `LOTUS_STUB`'s reasons.
 *
 * ── THE RETURN VALUE, AND ITS ONE AMBIGUITY ──────────────────────────────────
 *
 * `true` means one row was updated. `false` means the guard did not match, and it
 * cannot distinguish two cases: somebody else won the race, or **this call's own
 * first attempt committed and lost its acknowledgement**, so the retry found the
 * row already filled. That ambiguity is the exact counterpart of `persistReading`'s
 * `23505` catch — there, a lost ack is indistinguishable from a duplicate and is
 * treated as success; here it is indistinguishable from a lost race and is treated
 * as a no-op. **Neither is a data error**: in both cases the row holds prose. The
 * only cost is one log line that may be about a write that actually landed.
 */
export async function refillReadingRow(
  userId: string,
  readingId: string,
  row: ReadingRefill,
  injected?: DbOrTx,
): Promise<boolean> {
  const updated = await withRetry(
    async () => refillReading(await handle(injected), userId, readingId, row),
    { label: 'readings.refill', context: { readingId, userId } },
  );

  if (updated === 1) return true;

  /*
   * NOT `logFailure`, WHICH SAYS "failed". A zero here is a legitimate outcome —
   * the guard is doing its job — and labelling it a failure would train whoever
   * reads these lines to ignore the ones that are. `undefined` means `withRetry`
   * gave up and has ALREADY logged through `logFailure`, so it is not logged twice.
   *
   * IDS ONLY, never the row: `ReadingRefill.body` is the reading.
   */
  if (updated === 0) {
    console.warn('[readings] refill guard unmatched', JSON.stringify({ readingId, userId }));
  }
  return false;
}
```

**Impact:** `flush.ts` gains one export and one query import. No existing behaviour changes.

---

### Step 6: The endpoint

**File:** `src/app/api/reading/retry/[id]/route.ts` (new)

**Change (a): NOTHING TO DO — RECONCILED.** This step used to widen
`src/app/api/history/log.ts:22` with `'retry'` while Phase 1 widened the same line with
`'delete'`. **Phase 1 now lands the whole union in one edit**, so when this phase opens the
file line 22 already reads

```ts
export function logHistoryFailure(
  surface: 'list' | 'days' | 'detail' | 'delete' | 'retry',
  err: unknown,
): void {
```

> **Do not edit that file.** Import the helper and call it. It is imported cross-directory
> already (`src/app/history/[id]/page.tsx` uses it), so reaching it from
> `api/reading/retry/` is precedented rather than novel — and a fourth copy of the "never log
> the driver error" logic is exactly what its own header warns against. If `'retry'` is not in
> the union, Phase 1 has not landed and nothing in this phase compiles anyway.

**Change (b):** the route.

**Code:**

```ts
/**
 * POST /api/reading/retry/[id] — regenerate the prose of a reading that has none.
 *
 * **THIS IS `/api/reading` WITH THREE DIFFERENCES AND NOTHING ELSE.** Everything
 * below is in the same order as `src/app/api/reading/route.ts` and for the same
 * reasons; where a comment there explains a line, it is not repeated here. Read
 * that file before editing this one. The three differences:
 *
 *   1. **THE PICKS COME FROM `reading_cards`, NOT FROM THE REQUEST.** This handler
 *      never calls `request.json()` — the request carries NO BODY AT ALL. Same
 *      hand, same positions, same reversals (invariant 7), and a tampered client
 *      cannot re-draw. `/api/reading` accepts card ids because the querent is
 *      drawing; here the draw already happened and is on file.
 *   2. **THE QUESTION COMES FROM `readings.question` AND IS RE-GATED.** It was
 *      classified once, before the first attempt, and it is classified again.
 *      Skipping the gate would regenerate a stored question with no gate — and,
 *      far worse in practice, `gateReading` is also what PRIMES the reading
 *      stream. Deleting the priming looks like a tidy-up, breaks nothing, logs
 *      nothing, and doubles every reading's latency forever. The column is already
 *      sanitized; `sanitizeQuestion` is idempotent (there is a property test), so
 *      calling it again cannot change what the classifier or the model sees.
 *   3. **THE WRITE IS `refillReadingRow`, NOT `persistReading`.** The latter
 *      inserts, and its `23505` catch would swallow the whole retry silently.
 *
 * ── THE `llm_calls` CONSEQUENCE, RECORDED RATHER THAN FIXED ──────────────────
 *
 * **A RETRIED READING CARRIES TWO `op: 'reading'` ROWS FOR ONE `reading_id`.**
 * `readingCostsFor` folds every `reading_id`-bearing row with **no `op` predicate**,
 * so `/admin`'s cost for a retried reading becomes the SUM of both attempts. Both
 * attempts were paid for, so the sum is arguably the right number — it is written
 * down here rather than silently changed, because the alternative is somebody
 * "fixing" that query later and quietly under-reporting spend. The two rows differ
 * by `created_at` and by `local_date`: the second is dated the day of the retry.
 *
 * A `reading.requested` and a `reading.completed` are likewise emitted a second
 * time for the same `reading_id`. That doubles a top-line count for the rare
 * retried reading, and the instrument for subtracting it is `reading.retried` —
 * which Phase 4 owns, on whichever side it decides to fire it.
 *
 * ── THE TWO LOCALES, AND WHY THERE ARE TWO ───────────────────────────────────
 *
 * `readings.locale` is IMMUTABLE (VD7): it records the language the prose came out
 * in, and this route must not move it. So the rule on this file is:
 *
 *   `tRead` / `readLocale`  everything that touches the PROSE — the prompt, the
 *                           Lotus block, the recall chain, the mid-stream notice,
 *                           the gist. A retry of an Indonesian reading is
 *                           Indonesian, whatever the querent's UI says now.
 *   `tView` / `viewLocale`  everything the querent reads as CHROME right now — the
 *                           429, the 500, and the moderation refusal payload. The
 *                           gate also takes the view locale because `locale` there
 *                           is the UI preference and not a claim about what
 *                           language the question is in (W7-D3: both locales'
 *                           blocklists run under both locales anyway).
 *
 * Getting this backwards gives an English sentence in the middle of Indonesian
 * prose, or an Indonesian refusal to somebody using the English app.
 *
 * ── WHAT `ANALYTICS_ENABLED=0` DOES HERE ─────────────────────────────────────
 *
 * `defer()` returns early, so the prose streams to the screen and is never stored —
 * **identical to what a fresh reading already does under that flag**, which is why
 * no second mechanism was built for it. It must not be set in production.
 */
import { NextResponse, after } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { getProvider } from '@/lib/llm';
import { buildPrompt } from '@/lib/prompt/build';
import { getLotusBlock, scheduleLotusRefresh } from '@/lib/prompt/lotus.generate';
import { sanitizeQuestion } from '@/lib/prompt/sanitize';
import { tFor } from '@/lib/i18n/catalog';
import { getLocale } from '@/lib/i18n/t';
import { hit, hitGlobal, hitRefusal, refusalsExhausted } from '@/lib/ratelimit';
import { recordCall } from '@/lib/llm/ledger';
import { reserveModelCall } from '@/lib/llm/meter';
import { gateReading } from '@/lib/moderation/gate';
import { recordModerationFlag } from '@/lib/moderation/log';
import { refillReadingRow, touchLastSeen } from '@/lib/analytics/flush';
import { extractGist } from '@/lib/memory/gist.generate';
import { mintOnReadingCompleted } from '@/lib/chat/proactive/onReading';
import { recallChain } from '@/lib/memory/chain';
import { detectCallback } from '@/lib/prompt/memory';
import { retryable } from '@/lib/reading/retryable';
import { splitChoiceMarker, validateChoice } from '@/lib/reading/choice';
import {
  LOCAL_DATE_HEADER,
  SESSION_HEADER,
  parseLocalDate,
  validSessionId,
} from '@/lib/analytics/localdate';
import { teeReading, type ReadingOutcome } from '@/lib/analytics/tee';
import { defer, track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import { readingWithCards } from '@/lib/db/queries/history';
import { CARDS, effectiveYesNo } from '@/data/deck';
import { serviceById } from '@/data/services';
import { logHistoryFailure } from '../../../history/log';

export const runtime = 'nodejs';

/** `/api/reading`'s, for `/api/reading`'s reasons. See its header. */
export const maxDuration = 60;

/** How long the after() callback waits for the stream before storing what arrived. */
const STREAM_TIMEOUT_MS = Number(process.env.ANALYTICS_STREAM_TIMEOUT_MS ?? 45_000);

export async function POST(
  request: Request,
  ctxParams: { params: Promise<{ id: string }> },
) {
  const startedAt = performance.now();

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id: readingId } = await ctxParams.params;

  const sessionId = validSessionId(request.headers.get(SESSION_HEADER));
  const localDate = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER));

  const viewLocale = await getLocale();
  const tView = tFor(viewLocale);

  /*
   * THE SOURCE ROW, BEFORE THE ANALYTICS SCOPE AND BEFORE THE BUDGETS.
   *
   * **THIS ORDERING IS A DELIBERATE DEPARTURE FROM `/api/reading`, WHICH VALIDATES
   * AFTER THE FOUR BUDGETS.** Two reasons, and invariant 8 is untouched by either —
   * it constrains the four budgets relative to each other and says a retry that
   * REACHES THE MODEL spends all four, which it does:
   *
   *   1. `ctx.locale` has to be the READING's locale (see the header) and that is
   *      not knowable until this read has happened. Building the analytics scope
   *      with the wrong locale and correcting it later is not possible — the store
   *      is captured once.
   *   2. H12's rule. `/api/history` deliberately charges no budget for browsing
   *      your own past, because "reading your own history costs you a reading" is a
   *      worse outcome than the thing a limit would protect against. Pressing a
   *      button on a reading that turns out to be finished is the same kind of act,
   *      and it is one indexed read against the querent's own row.
   *
   * `readingWithCards` makes ownership a PREDICATE and returns null for "does not
   * exist", "not yours", "blocked" and — after Phase 1 — "deleted", identically. A
   * malformed uuid is a null and not a driver error.
   */
  let source;
  try {
    source = await readingWithCards(db, user.id, readingId);
  } catch (err) {
    /*
     * NEVER `console.error(err)`. `readingWithCards` selects `question` AND `body`,
     * and a postgres error quotes the failing statement with its bound parameters.
     */
    logHistoryFailure('retry', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  if (!source) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }

  /*
   * THE PREDICATE, THE SAME ONE PHASE 4'S BUTTON ASKS. `deletedAt` is not passed
   * because `readingWithCards` has already filtered it and `ReadingDetail` does not
   * carry the column; the absent field means "the caller cannot see it", and
   * `refillReading`'s `WHERE` is what covers the window between here and the write.
   */
  const verdictOnRow = retryable({
    status: source.status,
    hasBody: source.body !== null,
    cardCount: source.cards.length,
  });
  if (!verdictOnRow.ok) {
    /*
     * `blocked` NEVER REACHES HERE — `readingWithCards` filters it — so this branch
     * answers `has_body` and `no_cards`. Both are 409 and not 404: the client can
     * already see `hasBody`, so saying so leaks nothing, and a 404 for a reading it
     * has open on screen would read as a bug rather than as a refusal.
     */
    return NextResponse.json(
      { error: 'not_retryable' },
      { status: 409, headers: { 'cache-control': 'no-store' } },
    );
  }

  /*
   * THE STORED DRAW, IN SLOT ORDER. `readingWithCards` already orders by position;
   * sorting again makes the invariant local to the place that depends on it.
   */
  const picks = source.cards
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.cardId, reversed: c.reversed }));

  const reader = source.readerId;
  const service = source.serviceId;
  const svc = serviceById(service);

  /*
   * THE STORED DRAW HAS TO BE USABLE. None of this can be caused by the client —
   * it is a property of a row written months ago by a service definition that may
   * since have changed its card count — so it is the same 409 and not a 400.
   * `buildPrompt` would otherwise throw on `picks[0]`, or, worse, describe a
   * three-card spread that has one card in it.
   */
  if (
    !svc ||
    picks.length !== svc.cardCount ||
    new Set(picks.map((p) => p.id)).size !== picks.length ||
    picks.some((p) => !CARDS[p.id])
  ) {
    return NextResponse.json(
      { error: 'not_retryable' },
      { status: 409, headers: { 'cache-control': 'no-store' } },
    );
  }

  /** THE READING'S OWN LANGUAGE. Immutable (VD7). Never `viewLocale`. */
  const readLocale = source.locale;
  const tRead = tFor(readLocale);

  const ctx: AnalyticsContext = {
    userId: user.id,
    sessionId,
    /*
     * THE READING'S LOCALE, NOT THE VIEWER'S, AND THE TWO CAN DIFFER ON THIS ROUTE
     * ALONE. `ctx.locale` becomes `llm_calls.locale` and `events.locale`, and every
     * event this handler fires is ABOUT the reading — so the honest value is the
     * language the tokens were spent in. A retry from an English UI of an
     * Indonesian reading spends Indonesian tokens.
     */
    locale: readLocale,
    /*
     * TODAY, NOT THE READING'S DAY, AND THE ASYMMETRY WITH `locale` ABOVE IS
     * DELIBERATE. `local_date` answers "when did this cost land" — it is what puts
     * the retry in today's `/admin` panels, which is where an operator would look
     * for it. `readings.local_date` is untouched and still says when the draw
     * happened; the two columns answer two questions.
     */
    localDate: localDate.date,
  };

  return withAnalytics(ctx, async () => {
    if (localDate.source === 'fallback') {
      track('analytics.local_date_fallback', {
        reason: localDate.reason,
        received: localDate.received,
        // `'reading'`, because a retry IS a reading. A new surface value would be
        // an events.ts edit, which this phase does not own.
        surface: 'reading',
      });
    }

    /*
     * THE FOUR BUDGETS, IN `/api/reading`'S ORDER, WITH `/api/reading`'S COPY
     * (invariant 8). All four answer identically on purpose: telling the querent
     * WHICH ceiling they hit tells a prober which one to work around. The EVENT
     * distinguishes them, because that is server-side.
     */
    const tooManyRequests = (
      retryAfterSeconds: number,
      limit: 'user' | 'refusal' | 'global' | 'daily',
    ) => {
      track('reading.rate_limited', {
        reader_id: reader,
        service_id: service,
        retry_after_s: retryAfterSeconds,
        limit,
      });
      return NextResponse.json(
        { error: tView('reading.error.rateLimit') },
        { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
      );
    };

    const [perUser, probing] = await Promise.all([hit(user.id), refusalsExhausted(user.id)]);
    if (!perUser.ok) return tooManyRequests(perUser.retryAfterSeconds, 'user');
    if (probing) return tooManyRequests(probing.retryAfterSeconds, 'refusal');

    const perFleet = await hitGlobal();
    if (!perFleet.ok) return tooManyRequests(perFleet.retryAfterSeconds, 'global');

    /*
     * `interactive`, because somebody is watching a spinner — the same class the
     * draw screen reserves. A retry is not deferred work: a person pressed a
     * button and is looking at the result.
     */
    const quota = await reserveModelCall('interactive');
    if (!quota.ok && quota.tier === 'hard') {
      return tooManyRequests(quota.retryAfterSeconds, 'daily');
    }

    /*
     * THE LOTUS BLOCK, IN THE READING'S LANGUAGE. Non-fatal; null is normal.
     * Fetched fresh rather than reconstructed from the first attempt, because the
     * querent may have edited or cleared an onboarding answer since — and
     * `/privacy` clause 3 promises a cleared answer stops reaching a prompt.
     */
    const lotus = await getLotusBlock(user.id, readLocale);

    /*
     * THE CHAIN BLOCK. Two departures from `/api/reading`, both stated:
     *
     *   - `excludeReadingId` is passed. `recallableReadings` already excludes this
     *     row (its `body is not null` filter), so this is belt — but the belt is
     *     free and the brace is a filter somebody could reasonably change.
     *   - `localDate` is the READING'S OWN DAY, not today's. The block is prompt
     *     input for prose that will be dated to that day, and a reading dated
     *     3 August referring to something that happened on 28 August reads as
     *     impossible.
     *
     * **A KNOWN AND ACCEPTED LIMITATION:** `recallableReadings` bounds
     * `local_date >=` and has no UPPER bound, so a retry of an old reading can
     * still recall a NEWER one. Closing it means an upper bound inside
     * `recallableReadings`, which is Phase 1's file and would change `/api/reading`
     * for no benefit. Recorded rather than fixed.
     */
    const memory = await recallChain({
      userId: user.id,
      currentCardIds: picks.map((p) => p.id),
      currentHasQuestion: Boolean(sanitizeQuestion(source.question)),
      localDate: source.localDate,
      excludeReadingId: readingId,
      locale: readLocale,
    });

    let prompt;
    try {
      prompt = buildPrompt({
        reader,
        service,
        picks,
        question: source.question,
        locale: readLocale,
        context: { lotus: lotus && lotus.summary ? lotus : null, memory },
      });
    } catch (err) {
      // Safe: this error came from prompt assembly over card data, not from a
      // database driver and not from the classifier path.
      console.error('retry prompt build failed', err);
      track('reading.failed', {
        reading_id: readingId,
        reader_id: reader,
        service_id: service,
        stage: 'prompt',
        chars_before_failure: 0,
        error_kind: 'build_failed',
        source: 'server',
      });
      return NextResponse.json({ error: tView('reading.error.badRequest') }, { status: 400 });
    }

    /*
     * THE SAME NAME `/api/reading` FIRES, FOR THE SAME READING ID, A SECOND TIME.
     * See the header: this doubles a top-line count for the rare retried reading,
     * and `reading.retried` is the instrument for subtracting it. **Phase 4 owns
     * that event; if it decides to fire it server-side, HERE is the line to put it
     * on.**
     */
    track('reading.requested', {
      reading_id: readingId,
      reader_id: reader,
      service_id: service,
      card_count: picks.length,
      has_question: source.question !== null,
      question_length: source.question?.length ?? 0,
      lotus_present: Boolean(lotus && lotus.summary),
      memory_block_present: memory !== null,
      prompt_version: prompt.promptVersion,
    });

    if (memory) {
      track('memory.chain_offered', {
        reading_id: readingId,
        recalled_count: memory.recalled.length,
        reason: memory.reason,
        repeat_card_id: memory.repeatCardIds[0] ?? null,
        repeat_count: memory.repeatCardIds.length,
      });
    }

    if (!lotus || lotus.stale) {
      after(() => scheduleLotusRefresh(user.id));
    }

    /*
     * THE READING'S LANGUAGE, NOT THE VIEWER'S. This string is enqueued into the
     * PROSE STREAM by `teeReading`, so it has to be in the same language as the
     * sentences around it. Resolved here because `start(controller)` has no request
     * context; `tRead` is a closure over a locale captured above.
     */
    const interrupted = tRead('reading.error.midStream');

    /*
     * THE STORED QUESTION, RE-SANITIZED. `sanitizeQuestion` is idempotent (property
     * test), so this cannot differ from what `readings.question` holds — which is
     * what makes `validateChoice`'s substring guarantee checkable against the
     * stored row rather than against a string that existed only in this handler.
     *
     * It is passed to the gate, and `buildPrompt` sanitizes internally from the
     * same source, so the classifier and the model see byte-identical text. That
     * equality is the classic bypass when it breaks.
     */
    const cleanQuestion = sanitizeQuestion(source.question);

    const modelStartedAt = performance.now();

    let gated;
    try {
      gated = await gateReading({
        question: cleanQuestion,
        /*
         * THE VIEWER'S LOCALE. `locale` here is the UI preference and not a claim
         * about the question's language — W7-D3: both locales' blocklists run under
         * both locales. It also selects the refusal payload's copy, and a refusal is
         * chrome the querent reads right now.
         */
        locale: viewLocale,
        /*
         * **AND THIS CALL PRIMES THE STREAM.** `gateReading` issues the provider
         * request with `iterator.next()` and races the classifier against it.
         * Nothing here may be reordered to "check first, then start".
         */
        start: (signal) => getProvider().streamReading(prompt, { signal }),
      });
    } catch (err) {
      // Safe: this is the READING call's error, whose request body is the system
      // prompt and the card list — not the classifier's, whose body is the question.
      console.error('retry failed before the moderation verdict', err);
      track('reading.failed', {
        reading_id: readingId,
        reader_id: reader,
        service_id: service,
        stage: 'connect',
        chars_before_failure: 0,
        error_kind: 'start_failed',
        source: 'server',
      });
      return NextResponse.json({ error: tView('reading.error.start') }, { status: 500 });
    }

    const verdict = gated.verdict;

    if (verdict.source === 'timeout') {
      track('moderation.timeout', {
        failed_open: !verdict.blocked,
        reason: 'timeout',
        surface: 'reading',
        reader_id: reader,
        service_id: service,
      });
    }
    if (!verdict.blocked && verdict.category !== null) {
      track('moderation.allowed_flagged', {
        category: verdict.category,
        confidence_bucket: bucket(verdict.confidence),
        surface: 'reading',
        reader_id: reader,
        service_id: service,
      });
    }

    if (verdict.category !== null) {
      const flagQuestion = cleanQuestion;
      /*
       * `after()` AND NOT `defer()`, for `/api/reading`'s reason: `defer()`'s queue
       * parks on the stream settling, and a refusal has no stream.
       */
      after(() =>
        recordModerationFlag({
          userId: user.id,
          question: flagQuestion,
          verdict,
          locale: viewLocale,
          action: verdict.blocked ? 'blocked' : 'allowed_flagged',
        }),
      );
    }

    if (gated.blocked) {
      /*
       * **A REFUSAL ON RETRY IS A CORRECT OUTCOME AND CHANGES NOTHING ON THE ROW.**
       * No write: the reading keeps `body IS NULL` and stays retryable, and its
       * `status` is not moved to `blocked` — that value means "W7 refused the
       * question at draw time and there is no draw", which is not what happened
       * here. The record that matters is the `moderation_flags` row above.
       *
       * `after()` and not a bare `void`: a floating promise in a serverless
       * function may be frozen before it resolves, and W7-D13's anti-oracle control
       * would silently stop recording. Not `defer()`, because an analytics kill
       * switch must not be able to disable a security control.
       */
      after(() => hitRefusal(user.id));

      track('moderation.refused', {
        source: gated.verdict.source,
        category: gated.verdict.category,
        confidence_bucket: bucket(gated.verdict.confidence),
        surface: 'reading',
        reader_id: reader,
        service_id: service,
      });

      return NextResponse.json(gated.payload, {
        status: 403,
        headers: { 'cache-control': 'no-store', 'x-reading-id': readingId },
      });
    }

    const { stream, done } = teeReading(gated.stream, {
      startedAt,
      failureNotice: interrupted,
    });

    defer(async () => {
      const outcome = await Promise.race([done, streamTimeout()]);

      /*
       * THE CHOICE MARKER COMES OFF ONCE, BEFORE ANYTHING READS THE BODY, AND
       * `prose` IS WHAT EVERY LINE BELOW USES. A marker in `readings.body` would be
       * quoted back at the querent by W5's chained reading as if the reader had
       * said it, and `extractGist` and `detectCallback` would both scan it.
       * `done: true`, because the stream is over and nothing may be held back.
       */
      const split = splitChoiceMarker(outcome.body, true, cleanQuestion);
      const prose = split.body;
      const choice = validateChoice(split.choice, cleanQuestion);
      const choiceOutcome =
        split.choice === null ? 'none' : choice === null ? 'invalid' : 'valid';

      if (outcome.firstTokenMs !== null) {
        track('reading.first_token', { reading_id: readingId, latency_ms: outcome.firstTokenMs });
      }

      if (outcome.status === 'ok' || outcome.status === 'partial') {
        track('reading.completed', {
          reading_id: readingId,
          reader_id: reader,
          service_id: service,
          latency_ms: outcome.firstTokenMs ?? -1,
          total_ms: outcome.totalMs,
          chars: outcome.chars,
          token_input: outcome.usage.inputTokens,
          token_output: outcome.usage.outputTokens,
          truncated: outcome.truncated,
          status: outcome.status,
          source: 'server',
          choice: choiceOutcome,
          choice_length: split.choice?.length ?? 0,
        });
      } else if (outcome.status === 'aborted') {
        track('reading.aborted', {
          reading_id: readingId,
          chars_before_abort: outcome.chars,
          reason: 'user',
          source: 'server',
        });
      } else {
        track('reading.failed', {
          reading_id: readingId,
          reader_id: reader,
          service_id: service,
          stage: 'stream',
          chars_before_failure: outcome.chars,
          error_kind: outcome.errorKind ?? 'unknown',
          source: 'server',
        });
      }

      /*
       * THE WRITE. Nine columns and no others — see `ReadingRefill`.
       *
       * `verdict` is RE-DERIVED from the stored draw rather than carried over, and
       * it is byte-identical by construction because `reading_cards` did not move.
       * Deriving it keeps the yes/no rule in one place: `effectiveYesNo()` decides
       * it, the model explains it, and no code path exists that lets a retry
       * inherit a verdict nobody recomputed.
       *
       * `body: prose || null` — '' becomes NULL, so a retry that produced nothing
       * leaves the row exactly as retryable as it was.
       */
      const written = await refillReadingRow(user.id, readingId, {
        status: outcome.status,
        body: prose || null,
        choice,
        verdict:
          service === 'yesno'
            ? effectiveYesNo({ card: CARDS[picks[0].id], reversed: picks[0].reversed })
            : null,
        model: process.env.LLM_MODEL ?? 'unknown',
        promptVersion: prompt.promptVersion,
        latencyMs: outcome.firstTokenMs,
        tokenInput: outcome.usage.inputTokens,
        tokenOutput: outcome.usage.outputTokens,
      });

      /*
       * THE LEDGER ROW, AFTER THE WRITE AND NEVER BEFORE IT. Deferred jobs run in
       * registration order inside one callback, so anything ahead of the row delays
       * it and loses it outright if the platform cuts the invocation short. **A
       * dashboard row may never be in front of the querent's own history.**
       *
       * **THIS IS THE SECOND `op: 'reading'` ROW FOR THIS `reading_id`.** See the
       * file header: `readingCostsFor` sums them with no `op` predicate, both
       * attempts were paid for, and that is recorded rather than changed.
       *
       * Every field comes off `outcome`, which `tee.ts`'s `finish()` snapshotted
       * BEFORE its await on `usage`.
       */
      void recordCall({
        op: 'reading',
        readingId,
        model: process.env.LLM_MODEL ?? 'unknown',
        callClass: 'interactive',
        streamed: true,
        status: outcome.status,
        errorKind: outcome.errorKind,
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        cacheReadTokens: outcome.usage.cachedInputTokens,
        totalMs: Math.round(performance.now() - modelStartedAt),
      });

      /*
       * THE GIST, ONLY IF THE PROSE ACTUALLY LANDED IN THE ROW.
       *
       * **THIS `if` IS THE ONE LINE THIS FILE HAS THAT `/api/reading` DOES NOT, AND
       * IT IS NOT OPTIONAL.** `setReadingGist` updates on `id` alone — it carries no
       * `body is null` guard, because on the insert path there is nothing to race.
       * Here there is: if the refill lost to a concurrent retry, the row holds the
       * OTHER attempt's prose, and writing this attempt's gist over it would leave
       * `readings.gist` describing text that is not in `readings.body`. W5 would
       * then quote a clause the reader never wrote.
       *
       * `extractGist` returns early on a null body anyway, so the guard is only
       * about the `written === false` case.
       */
      if (written) {
        await extractGist({ readingId, body: prose || null, locale: readLocale });
      }

      if (memory && prose) {
        const hitCallback = detectCallback({
          body: prose,
          currentCardIds: picks.map((p) => p.id),
          recalledCardIds: memory.recalled.flatMap((r) => r.cards.map((c) => c.cardId)),
          locale: readLocale,
        });
        if (hitCallback.fired && hitCallback.signal) {
          track('memory.chain_used', { reading_id: readingId, signal: hitCallback.signal });
        }
      }

      await touchLastSeen(user.id);

      /*
       * LAST, AND ONLY WHEN THE ROW ACTUALLY HOLDS THIS ATTEMPT'S PROSE.
       *
       * `chat_runs.trigger_reading_id` is an FK to `readings.id`, which already
       * exists here — so unlike the insert path there is no constraint risk. The
       * guard is about MATERIAL: minting a proactive run about a reading whose
       * prose came from somebody else's concurrent attempt is a chat message about
       * text this invocation never saw.
       *
       * `localDate` IS TODAY'S and `locale` IS THE VIEWER'S: the run happens now, in
       * the room the querent will open, in the language their app is in. Neither is
       * the reading's — this is the one place on this route where the chat's own
       * clock and language win over the reading's.
       */
      if (written) {
        await mintOnReadingCompleted({
          userId: user.id,
          readingId,
          status: outcome.status,
          localDate: localDate.date,
          locale: viewLocale,
        });
      }
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
        /*
         * THE READING'S OWN ID, which the client already knew — it is in the path.
         * Sent anyway so the loss detector works identically to the draw screen's:
         * the client reports its own `reading.completed` against this id through
         * `/api/events`, a different request with a different `after()`.
         */
        'x-reading-id': readingId,
        /*
         * THE LANGUAGE THE PROSE IN THIS BODY IS IN — `readings.locale`,
         * unchanged, never `viewLocale`. Added at Phase 4's request.
         *
         * **IT IS NOT DECORATION AND IT IS NOT REDUNDANT WITH THE STORED ROW.**
         * The client already has `reading.locale` from the server render, so on
         * the happy path this header tells it nothing new — which is exactly the
         * point: it is the CHECK. `refillView` decides from this value whether to
         * paint the streamed prose or to hold it behind the `otherLanguage`
         * notice, and rule 4 is a property of that decision. If somebody later
         * "simplifies" this route towards `/api/reading`'s `await getLocale()`,
         * the prose changes language and this header changes with it, so the
         * client keeps telling the truth instead of painting an Indonesian
         * paragraph into an English app.
         *
         * The client MUST still default to `reading.locale` on an absent or
         * malformed value — a proxy that strips unknown headers is not a reason
         * to show a stranger raw foreign prose.
         */
        'x-reading-locale': readLocale,
      },
    });
  });
}

/** `/api/reading`'s. Buckets, not the number: self-reported confidence is uncalibrated. */
function bucket(confidence: number | null): 'low' | 'medium' | 'high' | null {
  if (confidence === null) return null;
  if (confidence < 0.5) return 'low';
  return confidence < 0.8 ? 'medium' : 'high';
}

/**
 * The backstop for a stream that never settles. `/api/reading`'s, verbatim: the
 * alternative is an `after()` callback holding a paid invocation open until the
 * platform kills it, taking the refill with it.
 */
function streamTimeout(): Promise<ReadingOutcome> {
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          body: '',
          status: 'failed',
          truncated: false,
          firstTokenMs: null,
          totalMs: STREAM_TIMEOUT_MS,
          chars: 0,
          usage: { inputTokens: null, outputTokens: null, cachedInputTokens: null },
          errorKind: 'stream_timeout',
        }),
      STREAM_TIMEOUT_MS,
    ).unref?.();
  });
}
```

**Impact:** One new route. `/api/reading` is untouched. `/chat`, `/history` and `/s/` are
untouched. Nothing in the UI calls this yet.

---

## Verification

**Build:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm run build          # NOT optional — the TypeScript 5.x trap. Retry once on a
                       # Turbopack font-resolution failure (the AAAA trap).
```

**Tests:**

```sh
npm test -- retryable                      # the pure predicate
npm test                                   # the whole unit project, separately
npm run db:up
npm run db:test:reset && npm run db:migrate # 0016 must be in jmtarot_test
npm run test:integration -- history.refill
npm run test:integration                   # the whole project, separately
```

**Never `npm run test:all`** — it fails 12–22 of V9's limiter tests as a known harness race.

**Manual check** (needs `npm run dev` and a seeded row):

1. `npm run db:seed`, then in `npm run db:studio` set one `readings` row's `body` to NULL and
   its `status` to `failed`. Note its id and its `reading_cards`.
2. Sign in through `POST /api/auth/dev-session` (`DEV_PASSWORD_LOGIN=1`), then:
   ```sh
   curl -i -X POST http://localhost:3001/api/reading/retry/<id> \
     -H 'x-jm-local-date: 2026-08-28' \
     -H 'x-jm-session: <32 hex>' \
     --cookie 'authjs.session-token=<from the dev session>'
   ```
   Expect `200`, `x-reading-id: <id>`, and prose streaming.
3. In studio: `body` is non-null, `status` is `ok`, `model`/`prompt_version`/`latency_ms`/
   `token_*` moved, and **`created_at`, `local_date`, `question`, `locale`, `session_id`,
   `shared_at` did not.** `reading_cards` is byte-identical.
4. `select op, count(*) from llm_calls where reading_id = '<id>' group by op` — two
   `reading` rows.
5. Repeat the same curl: expect `409 {"error":"not_retryable"}`.
6. `curl` the same path with a uuid that is not yours: expect `404 {"error":"not_found"}`.
7. **The prose must be in `readings.locale`, not the browser's.** Set the row's `locale` to
   `id`, switch the app to English, retry, and read the result: it must be Indonesian.

**Exit criteria:** the endpoint refills a seeded empty reading end to end against a real
database with the stored hand intact; it refuses a reading with prose, a soft-deleted one, a
blocked one and a stranger's, indistinguishably where it must be; a second attempt that also
produces nothing leaves the row still retryable; `npm run typecheck`, `npm run build`,
`npm test` and `npm run test:integration` are all green; and **no component, catalog or event
name changed.**

---

## Handoffs

**To the reconciler (must be resolved before `/implement`):**

1. **`reading.retried` already exists** (`events.ts:79`, props at `:367`, fired by
   `Draw.tsx:680`). Phase 4's "fold it in and state the new total" is based on a false
   premise: the name is not new and `EVENT_NAMES` does not move for it. Phase 4 must decide
   instead whether to widen its props with `reading_id` and a surface discriminator — the
   current shape cannot tell a history retry from a draw-screen one.
   **RESOLVED: Phase 4 adds ZERO names and widens the shape** — `surface: 'draw' | 'history'`,
   `reading_id`, `prior_status`, `age_days` — and fixes `Draw.tsx:678-686` as a compile fix.
   Phase 2 adds the only new name (`history.item_deleted`) and owns the `events.test.ts:129`
   ceiling move 76 -> 77. This phase touches neither file.
2. **`queries/history.ts` is edited by Phases 1 and 3.** Phase 1: read filters +
   `softDeleteReading`. Phase 3: `ReadingRefill` + `refillReading`, appended at the end.
   **RESOLVED: `isNull` on line 5 is PHASE 1'S EDIT AND IS ALREADY THERE — this phase must NOT
   re-add it** (a duplicate specifier is a compile error, not a merge). See Step 3 change (a),
   which is deliberately kept as a NOTHING-TO-DO rather than deleted. Phase 3 appends after
   Phase 1's `softDeleteReading`, at the NEW end of file. Additive.
3. **`api/history/log.ts`'s `surface` union is widened by Phases 1 (`'delete'`) and 3
   (`'retry'`).** Merged: `'list' | 'days' | 'detail' | 'delete' | 'retry'`.
   **RESOLVED: Phase 1 lands all five in one edit; this phase edits the file not at all** and
   only calls `logHistoryFailure('retry', err)`.
4. **Phase 3 does not compile without Phase 1's `readings.deletedAt`.** `refillReading`'s
   `WHERE` names it. If Phase 1 slips, Phase 3 slips.

**To Phase 4:**

- The HTTP contract is the table under **Interface Contract** above. Build against exactly
  that. In particular: **no request body**, the `403` branch must be tested on the response
  BODY (`error === 'moderation_blocked'`) and must sit ABOVE `!res.ok`, and `204` is not a
  status this route ever returns — a spinner waiting for one waits forever.
- `isRetryable()` from `@/lib/reading/retryable` is what decides whether the control renders.
  **The exact call, reconciled against Phase 4's Step 1** (whose draft omitted `cardCount`,
  which is REQUIRED, and passed `deletedAt`, which is optional and unknowable in a browser):

  ```ts
  isRetryable({
    status: reading.status,
    hasBody: reading.body !== null,
    cardCount: reading.cards.length,
    // no `deletedAt` — see below
  })
  ```

  **`deletedAt` IS OPTIONAL PRECISELY SO A CLIENT DOES NOT PASS IT.** `HistoryItem` and
  `ReadingDetail` carry no such field and must not gain one (Phase 1's ruling: a deleted
  reading never reaches a client). `readingWithCards` filters `deleted_at is null`, so a
  deleted reading 404s before Phase 4's component exists, and `refillReading`'s `WHERE` filters
  it a second time for the window between the read and the write. **Omitting the property is
  the honest call and passing a hardcoded `null` is a caller asserting something it cannot
  observe** — the same class of thing the `x-reading-locale` header exists to avoid.
- **The response carries `x-reading-locale: <readings.locale>`** (added at Phase 4's request).
  Default to `reading.locale` when it is absent or not a `Locale`.
- **A retry does NOT move `readings.locale`.** `ReadingRefill` has no such field. The prose is
  regenerated in the reading's own language whatever the querent's UI says now.
- **`ReadingView`'s rule 4 is not weakened by this.** A refilled reading is in
  `readings.locale`, unchanged, so a viewer in the other locale gets the translating state
  exactly as before — the retry does not create a new class of foreign-locale reading.
- Phase 4 owns the edit to `queries/history.ts:323` (*"and no retry (VD14)"*), which this
  phase deliberately left standing so the two halves of that claim change in one commit.

**Deliberately not done here (out of scope, recorded):**

- **No measurement of a lost refill.** `refillReadingRow` returning `false` logs one line and
  fires no event, because a new event name is Phase 4's to fold. If retries turn out to lose
  races in production, that is the number to add.
- **No upper `local_date` bound on `recallableReadings`.** A retry of an old reading can
  recall a newer one. Phase 1's file; changing it would change `/api/reading` for no benefit.
- **`GET /api/persona` and `/api/memory/*` still 500 when the database is down** rather than
  204. Named in CLAUDE.md as a standing open item; this route answers `503`, which is the
  correct behaviour, and does not fix the other three.
- **No `docs/` or `CLAUDE.md` edit.** Phase 4 owns all of them, including the net-neutral
  `CLAUDE.md` rule.

---

## Rollback

`git revert` of this phase's commits alone. Nothing here changes the schema, no migration is
written, and no existing code path is modified in a way another phase depends on:

- `src/lib/reading/retryable.ts` and its test — new files, nothing else imports them once the
  route is gone (Phase 4 does, so revert Phase 4 first or together).
- `refillReading` / `refillReadingRow` — additive exports with no other callers.
- `api/history/log.ts` — **untouched by this phase** (Phase 1 owns the union), so a revert
  leaves `'retry'` declared with no caller. That compiles and is harmless; narrow it only if
  Phase 1 is being reverted too.
- The route directory is deleted. Any in-flight request 404s, which is the same answer a
  client that has not shipped the control would get anyway.

**The one thing a revert does not undo:** readings already refilled keep their prose. That is
correct — the querent asked for it and read it — and there is deliberately no path to empty a
`readings.body` again.

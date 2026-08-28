# Package: `@/lib/reading`

**Location**: `src/lib/reading`
**Last Updated**: 2026-08-28

## Overview

Two pure decision modules that sit between the model's output and the querent's screen,
and between a stored reading row and the button that offers to regenerate it. Neither
module reads the environment, the database or the session; both are imported by the
BROWSER and by route handlers, and that dual residency is the entire reason the package
exists — a rule that a screen and a server state differently is a rule that will
eventually disagree with itself.

**Key Responsibilities:**
- **`choice.ts`** — parse the `PILIHAN:` protocol marker out of a streaming reading, and
  resolve the model's named option against the question the querent actually typed.
- **`retryable.ts`** — answer "may this reading be retried?" from a small row shape, for
  the endpoint that regenerates prose and the control that renders the button.

**The house rule both files instantiate:** code derives or validates; the model only ever
proposes. `effectiveYesNo()` and `address.ts` are the same rule in other packages.

## Exported API

### `retryable.ts`

Pure LEAF. No `server-only`, no `process.env`, no `@/lib/db` — one **type-only** import of
`@/data/types` (`ReadingStatus`), which has no imports of its own.

#### Types

```ts
export type RetryCandidate = {
  status: ReadingStatus;
  hasBody: boolean;          // `readings.body is not null`. THE RULE.
  cardCount: number;         // `reading_cards` rows. Zero means there is no draw.
  deletedAt?: Date | string | null;  // OPTIONAL: absent means "caller cannot see it"
};

export type RetryRefusal = 'deleted' | 'blocked' | 'has_body' | 'no_cards';

export type RetryVerdict = { ok: true } | { ok: false; reason: RetryRefusal };
```

`cardCount` is **required** and `deletedAt` is **optional**, deliberately and in opposite
directions:

- A `blocked` reading has `body IS NULL` **and no `reading_cards` rows at all**, so
  `hasBody` alone would admit it and `buildPrompt` would then throw on `picks[0]` inside a
  route that has already spent all four budgets. The count is asserted, never assumed.
- `deletedAt` is belt-only on the server (the route filters through `readingWithCards` and
  `refillReading`'s `WHERE` filters again). It is optional precisely so a browser, which
  has no `WHERE`, can omit what it does not know.

#### Functions

```ts
export function retryable(r: RetryCandidate): RetryVerdict
export function isRetryable(r: RetryCandidate): boolean
```

`retryable()` returns **why**, because the route picks a status code from it.
`isRetryable()` is for a caller that only decides whether to render a control.

Clause order is deliberate — most-fundamental fact first, so the reason names the
strongest thing true about the row: `deleted` → `blocked` → `has_body` → `no_cards`.

Thread-safety / purity: total, pure, side-effect free, safe anywhere.

**THE RULE IS `body IS NULL`. IT IS NOT A STATUS LIST.** The two ways of writing it are
not equivalent, and `retryable.test.ts` fences the rule from both sides with two negative
controls:

- `failed` **and** `aborted` are both retryable. `/history` renders one line for both
  (`history.item.unfinished`), so a status list containing only `failed` would make the
  button mean something the screen does not say.
- `partial` **has prose** and is never retryable (VD14, unamended). The
  `[Bacaan terputus...]` notice deliberately never reached `readings.body`, so a partial
  row holds real text the querent already read; retrying overwrites what they came back
  for.

**`RetryRefusal` IS FOR LOGS AND CODE PATHS, NEVER FOR THE WIRE.** `deleted` and `blocked`
are answered with the same 404 an absent reading gets: a reading id reaches the browser,
and a distinguishable "you deleted this" turns a uuid guess into an existence oracle.

### `choice.ts`

Pure, no `server-only`, no `process.env`. Runs in the browser (`Draw.tsx` strips the
marker incrementally as the reading streams) and on the server (`/api/reading` and
`/api/reading/retry/[id]`, in `defer()`, over the finished body). **One function, two
callers** is the only reason the screen and the stored row cannot disagree about where the
prose starts.

#### Constants

| Constant | Value | Purpose |
| --- | --- | --- |
| `CHOICE_MARKER` | `'PILIHAN:'` | The protocol token, **one string in both locales** (R17's call for `<pertanyaan>`/`<riwayat>`). Model-facing vocabulary no querent sees, so it belongs beside the prompt layer and **not** in `src/lib/i18n/locales/*`. Matched case-insensitively, as a whole eight characters including the colon. |
| `CHOICE_MAX_CHARS` | `40` | A box, not a sentence — the rendered element is the one `reading.verdict` uses. |
| `MARKER_SCAN_LIMIT` | `96` | Bounds LATENCY, not correctness: how far into the stream the marker line may run before we stop waiting. |

#### Types

```ts
export type ChoiceSplit = {
  choice: string | null;  // what the model NAMED. **NOT VALIDATED.**
  body: string;           // safe to render or store right now. Grows monotonically.
  pending: boolean;       // leading text could still become a marker line
};
```

#### `splitChoiceMarker`

```ts
export function splitChoiceMarker(
  text: string,
  done = false,
  question?: string | null,
): ChoiceSplit
```

**Takes the whole text so far, not a delta** — which is what makes it pure and idempotent,
and what lets one function serve a browser calling it on every chunk and a server calling
it once at the end. There is no state to carry and nothing to reset between readings.

`done` **is the flush**: at end of stream nothing may be held back, so `pending` is never
true when `done` is.

Two marker positions have been observed live and exactly two are handled:

- **Leading** — stripped unconditionally. A reading does not open with `Pilihan:`, so at
  offset 0 the token cannot collide with prose.
- **Trailing** — stripped **only** when the candidate passes `validateChoice`, which is
  why the third argument exists. `Pilihan: tetap di sini.` is an ordinary Indonesian
  sentence; stripping on shape alone would delete the querent's last paragraph to hide
  eight characters, strictly worse than the bug.
- **Mid-body is not stripped. That is scope, not oversight.**

#### `validateChoice`

```ts
export function validateChoice(choice: string | null, question: string | null): string | null
```

**Returns a slice of `question`, never the model's copy.** That is the whole guarantee and
why the return type is a string rather than a boolean: a caller handed `true` would render
the model's text, and the box would be model-controlled again one refactor later.

Refusals, in order: absent input, over `CHOICE_MAX_CHARS`, empty after trimming outer
punctuation, `MULTI_OPTION` (a comma/semicolon/slash or one of
`atau|ataukah|apa|apakah|or|versus|vs` — a candidate naming more than one option is not a
choice), or not present word-bounded in the question. Bounds use explicit `\p{L}\p{N}`
lookarounds rather than `\b`, which is ASCII-only; they are what stop `aya` matching inside
`ayam`.

Biased towards rejecting: a false rejection costs the box, a false acceptance ships the
report.

## Internal Architecture

### Data flow

**The choice marker (`choice.ts`)**

```
provider stream ─┬─> Draw.tsx        : splitChoiceMarker(acc)        -> renders body, holds `pending`
                 └─> route defer()   : splitChoiceMarker(full, true) -> validateChoice -> readings.choice
```

The marker crosses the wire on purpose. The tempting design puts a transform between the
provider's stream and `teeReading` so it never leaves the server; it cannot work, because
the choice arrives long after the response headers and a server that strips it has no way
left to tell the client what it was. So the failure mode is a chunk-boundary bug rendering
`PILIHAN: Ayam` above a reading, and `choice.test.ts` feeds one body in **every possible
split**.

**The stripped body is what reaches `persistReading`, `refillReadingRow`, `extractGist`
and `detectCallback`.** A marker in `readings.body` would be quoted back at the querent by
W5's chained reading as if the reader had said it.

**The retry verdict (`retryable.ts`)**

```
readingWithCards(row) ──> retryable({status, hasBody, cardCount, deletedAt}) ──> 409 / proceed
history list payload  ──> isRetryable({status, hasBody, cardCount})          ──> render button
                                                    │
                                    refillReading()'s WHERE re-states the same rule in SQL
```

The predicate is advisory in both directions; the authority is
`refillReading`'s `WHERE body IS NULL AND deleted_at IS NULL AND status <> 'blocked'`. The
guard being in the `WHERE` is what makes a double-submit and a race safe — a read-then-write
is not. `retryable()` exists so the button and the endpoint agree *before* that guard fires.

## Dependencies

### Internal
- `@/data/types` — **type-only**, `ReadingStatus`. The only import in `retryable.ts`.
- `choice.ts` has **no imports at all**.

### External / stdlib
None. Both modules are self-contained; `choice.ts` uses only `RegExp` and `String`.

## Reverse Dependencies

### Primary consumers

| Consumer | Uses | Pattern |
| --- | --- | --- |
| `src/app/[reader]/[service]/Draw.tsx` | `splitChoiceMarker`, `validateChoice` | Client, incremental, on every chunk |
| `src/app/api/reading/route.ts` | `splitChoiceMarker`, `validateChoice` | Server, once, inside `defer()` |
| `src/app/api/reading/retry/[id]/route.ts` | `retryable`, `splitChoiceMarker`, `validateChoice` | Server; `retryable()` picks the 409 |

### Secondary consumers

- `src/lib/prompt/services.id.ts`, `services.en.ts` — import `CHOICE_MARKER` so
  `CHOICE_RULE_*` and the parser cannot spell the token differently.
- `src/lib/chat/attachmentBlock.ts` — `splitChoiceMarker` only, to keep a marker out of a
  reading quoted into the chat room.
- `scripts/smoke-llm.ts` — both, for `npm run smoke -- --all --choice`, which is the only
  instrument for the marker's FORMAT.

`retryable.ts` currently has exactly one production consumer. It was written with two in
mind, and the second — the `/history` retry control — is the reason `deletedAt` is optional
and `RetryRefusal` is not renderable.

## Concurrency

**Not applicable. Both modules are pure functions over their arguments**, hold no module
state, and are safe to call from anywhere, concurrently, in any runtime.

## Error Handling

Neither module throws, and neither defines an error type. Every refusal is a value:
`{ ok: false, reason }` from `retryable()`, `null` from `validateChoice`, and a `ChoiceSplit`
with `choice: null` from `splitChoiceMarker`. That is deliberate — both sit on the request
path of a streaming response, where a throw would be a blank page.

## Performance

Allocation: light. `splitChoiceMarker` is called once per stream chunk in the browser and
operates on the accumulated string, so it is O(n) per call and O(n²) over a reading — bounded
in practice by `MARKER_SCAN_LIMIT` for the marker scan and by a reading being a few
kilobytes. `validateChoice` compiles one `RegExp` per call, from an escaped candidate, and
is called at most once per reading.

No benchmark files.

## Usage

### Deciding whether to offer a retry

```ts
const verdict = retryable({
  status: row.status,
  hasBody: row.body != null,
  cardCount: cards.length,
  deletedAt: row.deletedAt,
});
if (!verdict.ok) {
  // 404 for 'deleted' and 'blocked'; 409 for 'has_body' and 'no_cards'.
  // NEVER put `verdict.reason` on the wire.
}
```

### Stripping the marker as it streams

```ts
const { choice, body, pending } = splitChoiceMarker(accumulated, done, question);
if (!pending) render(body);
const verified = validateChoice(choice, question); // a slice of `question`, or null
```

### Gotchas

- **Never render or transmit `RetryRefusal`.** It is a log line and a switch, nothing else.
- **`ChoiceSplit.choice` is unvalidated.** Pass it through `validateChoice` before it
  reaches a screen or a column. The box renders on `/s/<slug>`, which strangers open.
- **Do not "simplify" `retryable()` into a status list.** `partial` and `aborted` are the
  two rows that break it, in opposite directions.
- **`readings.choice` rides on `include_question` in `publicReadingQuery`, in the same
  ternary.** It is a slice of the question, so a link excluding the question and selecting
  this column publishes a fragment of the excluded string through the one field that reads
  as a verdict.
- **The choice is never translated** and renders with no `lang` attribute — it follows the
  question, not the chrome, because translating it would make the substring guarantee
  uncheckable.
- **A marker the model spells differently enough to miss the matcher is invisible** — it
  renders as prose and no event fires. `reading.choice_offered.valid` measures a model that
  named the wrong thing, not one that named it in the wrong shape;
  `npm run smoke -- --all --choice` is the instrument for the second.

## Notes

### Call-site registries (mandatory, and asserted)

`/api/reading/retry/[id]` is a new `streamReading()` call site **and** a new model call
site. Both registries assert their table is EXACTLY the set of call sites, so registration
is not optional:

- `src/lib/llm/callClass.test.ts` — `STREAM_CALLS`, as `op: 'reading'` /
  `reserveModelCall('interactive')`.
- `src/lib/llm/flagCoverage.test.ts` — `EXEMPT`, no kill-switch flag, on the same product
  ruling as `/api/reading`: **a retry is a reading**, and the reading is the backbone that
  gets no flag. It is explicitly **not** a fourth member of the admin-only exempt class,
  which is owed one `ADMIN_MODEL_CALLS_ENABLED` on its next member.

### Recorded rather than fixed

A retried reading carries **two `op: 'reading'` rows in `llm_calls` for one `reading_id`**,
and `readingCostsFor` folds every `reading_id`-bearing row with no `op` predicate — so
`/admin`'s cost for that reading is the SUM of both attempts. Both attempts were paid for,
so the sum is arguably the right number; it is written down so nobody "fixes" that query
later and quietly starts under-reporting spend. `reading.requested` and `reading.completed`
are likewise emitted a second time for the same id; `reading.retried` is the instrument for
subtracting them.

### The write side lives elsewhere, on purpose

`ReadingRefill` and `refillReading()` are in `src/lib/db/queries/history.ts`, and
`refillReadingRow` in `src/lib/analytics/flush.ts` — inserted **between** `persistReading`
and `touchLastSeen`, never as a change to `persistReading`, whose 23505 catch would silently
swallow the retry. `ReadingRefill` carries **no `locale` field**, so a retry cannot move
`readings.locale` even by mistake: `readLocale` (prose, prompt, gist) and `viewLocale`
(chrome the querent reads now) are not interchangeable.

## Documentation Created: 2026-08-28

Initial documentation, written after task **P1-LR-A000** ("Phase 3: Retry — the predicate,
the writer, the endpoint", phase 3 of 4 of `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md`), which
added `retryable.ts` and `retryable.test.ts` to a package that until then held only
`choice.ts`. Verification at that commit: typecheck clean, build clean, unit 3751 tests in
197 files, integration 678 tests in 48 files — **the two projects run separately, never
`test:all`.**

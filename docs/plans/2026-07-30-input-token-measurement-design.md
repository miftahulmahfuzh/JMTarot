# Input tokens are measured, not estimated

**2026-07-30. Design, agreed section by section with Miftah.**

## What this started as, and why it changed

The request was a workaround: *z.ai does not give us the total input tokens, so
calculate them ourselves with something like tiktoken.* That premise is false, and the
probe that disproved it is the most important thing in this document.

**z.ai reports input tokens on the streaming path. `anthropic.ts` reads the wrong SSE
event and throws them away.** The adapter takes `input_tokens` from `message_start`,
where the value is always `0`, and reads only `output_tokens` from `message_delta`,
where the real counts arrive.

Measured 2026-07-30 against `https://api.z.ai/api/anthropic`, `glm-4.6`:

```
FRESH prompt, first send (stream)
  message_start: {"input_tokens":0,"output_tokens":0}
  message_delta: {"input_tokens":1364,"output_tokens":24,"cache_read_input_tokens":0}

SAME prompt, second send (stream)
  message_start: {"input_tokens":0,"output_tokens":0}
  message_delta: {"input_tokens":20,"output_tokens":24,"cache_read_input_tokens":1344}
```

`20 + 1344 = 1364`, exactly. Two further facts fell out of the same probe:

- **z.ai honours prompt caching**, contradicting `types.ts`, `anthropic.ts` and
  `CLAUDE.md`, all of which say it accepts the `cache_control` marker and honours
  nothing. The marker is doing real work.
- **The buffered path was never broken.** `complete()` reads `message.usage.input_tokens`
  from the non-streaming response, which returned `276` in the same session. So
  moderation, gist, lotus and persona rows already carry real input tokens; only the
  three *streaming* sites — readings, the day summary, the streamed translation —
  record NULL.

A tokenizer would therefore have layered an estimate, with an unknown bias, on top of
an exact number we were already being handed. **No new dependency is added.**

## 1. The adapter, and the asymmetry between the two providers

`ReadingUsage` grows a third field:

```ts
export type ReadingUsage = {
  inputTokens: number | null;       // TOTAL, cache reads included
  outputTokens: number | null;
  cachedInputTokens: number | null; // the subset served from cache
};
```

`inputTokens` stays the **total**, so every existing consumer — `tee.ts`,
`persistReading`, `callTotals`, the I/O chart — keeps meaning what it says with no
edit. The cache figure is additional detail, never a replacement.

**THE TRAP THIS WHOLE CHANGE TURNS ON: THE TWO PROVIDERS REPORT CACHING WITH OPPOSITE
SEMANTICS.**

- **Anthropic wire (z.ai):** `input_tokens` **EXCLUDES** cached tokens. The total is
  `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
- **OpenAI wire:** `prompt_tokens` **ALREADY INCLUDES** cached tokens;
  `prompt_tokens_details.cached_tokens` is a breakdown of it. Summing there
  double-counts the cached half.

Each adapter converts to the shared shape itself and **one shared helper cannot do
it.** This gets a header comment in both files, because *"make the two adapters
consistent"* is exactly the tidy-up that silently doubles one provider's input numbers
with a green suite.

The second fix in `anthropic.ts` is the bug itself: read `input_tokens` from
`message_delta`, not `message_start`. `nonZero()` stays, applied to the **total** — a
summed zero still means "reported nothing".

## 2. The ledger, the column, and what NULL now means

Migration `0012`, one nullable column:

```sql
ALTER TABLE "llm_calls" ADD COLUMN "cache_read_tokens" integer;
```

`schema.ts` has one owner (W1), so this lands through the plan's `## Schema deltas`
section rather than a freehand edit. `LlmCallRecord` gains `cacheReadTokens: number |
null`; `usageOrNulls` — **both copies, `ledger.ts`'s and `tee.ts`'s private one** —
returns the third field as `null` on timeout.

**The three states are not decoration:**

| `cache_read_tokens` | Means |
|---|---|
| `NULL` | The provider reported no usage at all — timeout, failed stream, or a provider that does not report caching. |
| `0` | Usage was reported and nothing came from cache. A real measurement. |
| `> 0` | A cache hit of that size. |

That `0` is a genuine value, unlike `input_tokens`, where `nonZero()` maps a reported
zero to NULL because a prompt cannot really cost nothing. Encoding the difference is
what lets a cache-hit rate be computed over the right denominator rather than over
"rows that happened to have a number".

**NO BACKFILL.** Historical rows keep `input_tokens` NULL. `prices.ts`'s reasoning
applies unchanged: those calls really were unmeasured, and a retroactive estimate would
be the `cost_usd` column that file refuses to have. The chart will show input tokens
starting at the deploy and flat-null before it, which is the truth about when we
started measuring.

One consequence to accept: `readings.token_input` starts carrying real numbers, so any
average over that column spans two regimes.

## 3. Pricing — real, but inert today

`ModelPrice` gains one optional field:

```ts
/** USD per 1M tokens served from cache. ABSENT means "priced at the full input rate". */
cachedInputPerMTok?: number;
```

Absent defaulting to the **full** rate is the direction `costUsd`'s own header already
argues for: guessing a generous discount understates, and understating is the failure
that matters. A discount enters the table only when a human has read it off the
provider's pricing page, with `verifiedOn` and `source`, like every other number here.

`costUsd` takes the cached count and splits the input side:

```
(input - cached) * inputPerMTok
  + cached * (cachedInputPerMTok ?? inputPerMTok)
  + output * outputPerMTok
```

The existing null rules are untouched: a null on any side returns null rather than
pricing the rest.

**THIS BUYS NOTHING VISIBLE TODAY, AND SAYING SO IS PART OF THE DESIGN.**
`NOTIONAL_MODEL` is `null`, so `notionalUsd()` returns null whatever it is passed, and
z.ai's rates are all `0`. This is preparation: the day someone fills in a fallback
price, the input half is right rather than roughly 10× high, because the cached
majority of a 1364-token prompt would otherwise be billed at the fresh rate. **The
measurement has to start now; the arithmetic only has to be ready and not wrong.**

Both z.ai rows get `cachedInputPerMTok: 0` explicitly — a subscription charges nothing
either way, and an explicit zero is a statement rather than a default.

**The meter needs no change.** `LLM_WINDOW_CALL_CEILING` counts calls, not tokens.

## 4. The admin surfaces, and correcting the record

**The null-count machinery stays exactly as it is.** `null_input_calls`,
`untokenized`, `tokensNullNote` and the chart footnotes were built to make
half-blindness visible and remain correct — they just start reading near zero instead
of near total. The instrument was right; its input was wrong.

**One new readout on `/admin/tokens`:** a cache-hit rate beside the I/O chart,
`sum(cache_read_tokens) / sum(input_tokens)` over rows where both are non-null. It
earns its place because it is the only thing that will show a prompt-layer change
silently destroying cache locality — which raises real input cost on the fallback while
the token chart barely moves.

**The record correction is the larger half of the work.** *"z.ai reports `input_tokens:
0` and honours no caching"* is asserted in roughly twelve places, and a future session
will trust whichever it reads first:

- `src/lib/llm/types.ts` (×2), `src/lib/llm/anthropic.ts` (×3)
- `src/app/admin/copy.ts`, `src/app/admin/tokens/page.tsx`, `src/app/admin/metrics.test.ts`
- `src/lib/db/queries/admin/metrics.ts` and its integration test
- `docs/analytics-queries.md` (×2), `docs/plans/2026-07-30-llm-ledger.md`
- `CLAUDE.md` — the `ReadingUsage` note and the provider section

Each becomes: **z.ai reports input tokens in `message_delta`, not `message_start`, and
does honour caching — measured 2026-07-30.** Per CLAUDE.md's own rule the evidence and
the probe transcript go to `docs/workstream-notes.md`; CLAUDE.md keeps the rule only.

**The old claim is recorded as corrected, not deleted.** It was measured once and
somebody will otherwise re-derive it from the same `message_start` read.

## 5. Verifying it, and stopping this class of bug recurring

**Loop 1 (Vitest)** carries the semantics. `usage.test.ts` already feeds synthetic SSE
sequences. The two tests that matter are negative controls for the asymmetry:

- **Anthropic:** `message_start {input:0}` then `message_delta {input:20,
  cache_read:1344}` → `inputTokens: 1364`, `cachedInputTokens: 1344`. Asserting `1364`
  and not `20` is the regression test for the bug itself.
- **OpenAI:** `prompt_tokens: 1000, cached_tokens: 800` → `inputTokens: 1000`, **not
  `1800`**. This is the test that fails when somebody later makes the adapters
  "consistent" by summing in both.

Plus: a summed zero still maps to NULL; a timeout returns all three null; `costUsd`
with no `cachedInputPerMTok` prices cache reads at the full rate.

**Loop 2** asserts one `llm_calls` row carries `cache_read_tokens`, and that a
reading's `readings.token_input` is non-null — the second proves the fix reached past
the adapter through `tee.ts` **without editing that file** (R2).

**And a committed probe, which is the real fix.** `scripts/probe-usage.ts`, beside the
existing `probe-moderation.ts`: send one small prompt twice, print
`message_start.usage`, `message_delta.usage` and the sum, for whatever `LLM_PROVIDER`
is configured.

The reason this bug survived a release is not that the original measurement was
careless — it is that it was taken **once, by hand, and written into prose that could
not then be re-checked.** A provider changed its behaviour (or was misread) and eleven
comments went on asserting the old fact with no way to notice. **A number we assert
about a provider needs a way to be re-verified, or it rots silently** — the same
instinct as `prices.ts`'s 365-day tripwire.

No loop 5 or 6: nothing here is visual or touch-dependent.

## Schema deltas

```ts
// llm_calls
cacheReadTokens: integer('cache_read_tokens'),
```

Nullable. No index — it is only ever summed alongside `input_tokens`, which the
existing `local_date` and `op` indexes already serve.

## Out of scope, deliberately

- **No tokenizer, no estimate column.** The numbers are exact; a second, less
  trustworthy number beside an exact one is a liability.
- **No backfill of historical NULLs.**
- **No change to `tee.ts`** beyond its private `usageOrNulls` returning the third field
  (R2 keeps A2 out of that file; this is the minimum that compiles).
- **`cache_creation_input_tokens`** is summed into the total but not stored separately.
  z.ai reported none; Anthropic proper does, and if that provider ever becomes the
  default it deserves its own column and its own price row.

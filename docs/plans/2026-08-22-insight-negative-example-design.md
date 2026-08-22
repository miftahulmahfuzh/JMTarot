# The insight retry, and the check that was refusing correct prose

**Card:** [#2 — Add negative example in the few shot prompt](https://github.com/miftahulmahfuzh/JMTarot/issues/2)
**Date:** 2026-08-22 · round 1
**Files:** `src/lib/admin/insightPrompt.ts`, `src/lib/admin/insight.ts`, and their tests.
No schema delta, no migration, no new environment variable, no copy change.

## 0. What the report was, and what it turned out to be

The report: the `Insight` button answered
*"Model menjawab dengan format daftar atau markdown, bukan paragraf, jadi tidak
disimpan"* ten presses running, and the ask was a negative-example mechanism so the
model could be shown the shape it had just got wrong.

**The ten presses were not the model's habit. They were a deterministic refusal of
correct prose, and it had been live for the whole of A7.** `validateInsight` refuses any
`_` anywhere in the body:

```ts
if (text.includes('*') || text.includes('_')) return { ok: false, reason: 'format' };
```

while `panels.ts` puts `chat_plan`, `chat_turn`, `blog_format` and `llm_calls.user_id`
into the notes of the token and cost panels, `INSIGHT_SYSTEM` rule 2 asks the model to
cite evidence out of that block, and its vocabulary line says technical terms stay
English. So *"panggilan chat_turn naik"* obeys every rule in the prompt and is reported
as markdown. Pressing again cannot help: the same block yields the same vocabulary.

CLAUDE.md predicted the shape of this in `validateInsight`'s own header — *"If the button
starts refusing correct prose, this is the first thing to loosen and the prompt is where
the fix belongs."* Here the **validator** is the wrong half, because `chat_turn` in a
sentence is not a format violation.

Both halves ship: §1 stops the false refusal, §2–§3 add the mechanism the card asked
for, which is what covers the next bad habit rather than this one.

## 1. The underscore rule

`src/lib/admin/insightPrompt.ts`, in `validateInsight`. Replace the one blanket line
with two:

```ts
/**
 * An underscore BETWEEN word characters is an identifier the facts block handed
 * over — `chat_turn`, `llm_calls.user_id`, `input_tokens`. Anywhere else it is
 * markdown emphasis or a stray.
 *
 * **THIS CHECK REFUSED CORRECT PROSE FOR THE WHOLE OF A7's LIFE, AND IT IS THE
 * WHOLE OF CARD #2's REPORT.** `panels.ts` puts op names in its notes and rule 2
 * asks the model to cite them, so the block itself hands over tokens the body was
 * then forbidden to contain. Do not restore the blanket form.
 */
if (/(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])/.test(text)) return { ok: false, reason: 'format' };
if (text.includes('*')) return { ok: false, reason: 'format' };
```

The asterisk stays blanket: no Indonesian prose needs one, and `**tebal**` and a
line-leading `*item` are both already caught anyway. The pipe and the fence stay
blanket — a `|` in a body is a table row copied out of the block.

Cases, asserted by name in the test:

| Body | Verdict |
|---|---|
| `panggilan chat_turn naik tajam` | ok |
| `yang membedakannya llm_calls.user_id` | ok |
| `_miring_` | `format` |
| `**tebal**` | `format` |
| `kata _ kata` | `format` |
| `_kata` | `format` |

## 2. The negative example

**No storage, no wire crossing, no schema.** The rejected text never leaves the server:
`generateInsight` calls, validates, and on a shape failure calls once more with the
rejected body fenced as a wrong example. One press, at most two calls.

The two alternatives were declined and are recorded so they are not re-proposed:

- **Round-tripping the rejected text through the browser** relaxes `route.ts`'s stated
  rule — *"nothing a browser posted reaches a prompt"* — which is W3's completion-route
  rule, and a model prompt is the last place to relax it. It also still needs a second
  press, which is the thing the report is about.
- **Persisting the rejection** buys a queryable record of what the model gets wrong, at
  the cost of a migration and a column of model garbage under a table whose other rows
  are published prose. Worth revisiting only if §2 turns out not to rescue presses.

### 2a. `insightPrompt.ts` — the prompt half, pure

`buildInsightPrompt` gains an optional second argument. `INSIGHT_SYSTEM` is **not**
touched: it stays one stable exported constant, and the wrong example goes in the user
turn, because it is about this attempt rather than about the contract.

```ts
export const REJECTED_OPEN = '<contoh_salah>';
export const REJECTED_CLOSE = '</contoh_salah>';

/** How much of a rejected body is fed back. A `too-long` rejection can be 700+
 *  characters and its SHAPE is what matters, so a prefix carries the whole signal. */
export const MAX_REJECTED_CHARS = 400;

export type RejectedAttempt = {
  body: string;
  reason: 'format' | 'tally' | 'too-long';
};

export function buildInsightPrompt(
  serialized: string,
  rejected?: RejectedAttempt | { body: null; reason: 'empty' },
): { system: string; user: string; maxTokens: number }
```

The user turn becomes the facts block, then — only when a rejection is passed — one
sentence naming what the previous answer did wrong, then the fenced example. One line
per reason, Indonesian, matching the surface (A-D12):

- `format` — it answered with markdown or a list instead of one paragraph
- `tally` — it read the table out loud instead of making a finding
- `too-long` — it wrote past the length the box holds
- `empty` — it returned nothing; **no fence is emitted**, there being no text to show

**A new fence, and the safest one in the project.** What is inside is model output
generated from a machine-built block, so unlike `<terjemahan>` there is no querent
string anywhere upstream of it. The fence is still there, for R17's reason — the tag
carrying the surface should be the one an attacker would guess — and because the next
person to widen the facts block should not have to rediscover why it matters.

### 2b. `insightInputHash` MUST NOT SEE IT

The hash stays over the serialized facts alone. **If the negative example reached it, a
rescued insight would store a hash that never equals the next page load's, and the box
would read stale forever** — the cache would invert into a guarantee of a model call per
view. `insightPrompt.test.ts` asserts the hash is byte-identical with and without a
rejection, which is the test that stops this being re-broken.

### 2c. `insight.ts` — the loop

```
generateInsight(facts, range, opts)
  │
  ├─ cache check (unchanged) ────────────→ no call at all, as today
  │
  ├─ call 1 ─→ validateInsight
  │              ├─ ok                          → generated
  │              └─ format | tally | too-long | empty
  │                     │
  │                     ├─ elapsed guard fails  → failed, FIRST reason
  │                     └─ call 2 with the wrong example
  │                            ├─ ok            → generated
  │                            └─ fails         → failed, SECOND reason
  │
  └─ provider threw (ceiling | failed) ──→ failed, no retry
```

Three rules in it:

1. **No retry on `ceiling` or `failed`.** No text was produced, so there is no example
   to give — and a `ceiling` retry spends quota the limiter has just refused, on the one
   call class that exists to be shed before a querent's reading.
2. **The reported reason is the second attempt's**, being the newer truth. Every value
   already has a sentence in `INSIGHT.error`, so no copy changes.
3. **Both calls keep `op: 'insight'` and `callClass: 'deferred'`.** Two calls are two
   ledger rows and two ceiling decrements, which is honest and is also the instrument —
   see §5.

## 3. The elapsed guard

The retry has to land before the **client** gives up, not the server: the operator
experiences `InsightBox`'s `ABORT_MS`, and a press that dies there is worse than one
reporting `format`, because the abort copy says the work *may* have completed and asks
for a reload — and on this path nothing did.

```ts
/**
 * How long BOTH model calls together may take. **DERIVED FROM `InsightBox`'s
 * `ABORT_MS` OF 45s, NOT CHOSEN** — the composite admin read precedes this and
 * `putInsight` follows it, so the pair must land under that bound with room. The two
 * numbers are ends of one bound: if `ABORT_MS` moves, this moves with it.
 */
const RETRY_BUDGET_MS = 38_000;

const spent = Date.now() - t0;
if (spent * 2 > RETRY_BUDGET_MS) {
  return { kind: 'failed', reason: checked.reason, inputHash };
}
```

Proportional rather than a fixed threshold, so it needs no separate measurement of what
a call costs. A first call slower than ~19s means no retry and exactly today's
behaviour. That is the right degradation: pressing again is cheap; an aborted press is
not, because its outcome is unknown.

A3's ordering is unchanged and stays true:

```
statement_timeout 10s  <  retry budget 38s  <  client abort 45s  <  maxDuration 60s
```

## 4. Tests

`src/lib/admin/insightPrompt.test.ts`

- The six §1 rows, asserted by name.
- `buildInsightPrompt(s)` emits no `<contoh_salah>`; with a rejection it emits exactly
  one, with the reason's sentence, and the body truncated at `MAX_REJECTED_CHARS`.
- `reason: 'empty'` emits the sentence and **no fence**.
- **`insightInputHash` is identical with and without a rejection.** §2b's test.
- `INSIGHT_SYSTEM` is unchanged by any of it.

`src/lib/admin/insight.test.ts`, stubbed provider

- bad-then-good → `generated`, and exactly two calls.
- bad-then-bad → `failed` with the **second** reason.
- a `ModelCeilingError` throw → `failed` / `ceiling`, exactly one call.
- a validation failure with the clock advanced past the budget → `failed` with the
  first reason, exactly one call. The clock is injected, not slept on.
- `unchanged` still makes zero calls.

## 5. How we will know it worked

There is no new event and no new field. The instrument is the ledger that already
records every call:

- **Two `llm_calls` rows with `op: 'insight'` seconds apart, followed by a stored
  insight, is a rescued press.** Visible in query 9 and on `/admin/tokens`.
- **A press that still fails after two calls is the case the prompt has to answer**, and
  it is now distinguishable from the false refusal §1 removed, which it was not before.
- If §1 alone ends the reports, that is the expected outcome and §2 is the guard for
  whatever the model does next.

`op: 'insight'`'s own note stands: pressing the button changes the panel it describes,
and now by two rows rather than one.

## 6. Out of scope, deliberately

- **No third attempt.** Two calls per press is already double, on a class that exists to
  be shed first.
- **No `attempts` field on `InsightResult`.** It would need copy for a distinction the
  operator cannot act on; `llm_calls` carries it.
- **No change to the pipe or fence checks**, and no change to `tally`'s thresholds.
- **No change to `INSIGHT_SYSTEM`.** The prompt is not what was wrong here.

## 7. What changed between this design and the code

Both changes made something testable that the design had left in the impure half. Recorded
rather than folded in silently, because the second one falsifies a comment.

**The retry POLICY moved into `insightPrompt.ts`.** §3 put the elapsed guard in
`insight.ts`. `isRetryableReason`, `retryFitsBudget` and `RETRY_BUDGET_MS` are exported from
the pure module instead, and `insight.ts` holds only the timing (`Date.now()` either side of
the first call) and the loop. This is A7's own split — *"everything worth asserting was put
in this file … the split is the testability"* — and it means the budget arithmetic and the
retryable set are asserted without a clock at all.

**`insight.test.ts` exists, which §4 assumed it could not.** `insightPrompt.test.ts`'s header
claimed `insight.ts` *"HAS NO TEST HERE AND CANNOT"* because it reaches `@/lib/llm` and its
`import 'server-only'`. The premise is true; the conclusion is not — `vi.mock` intercepts the
specifier before the module is evaluated, and `src/lib/translate/translate.test.ts` has relied
on that since V2 on a server-only module reaching the same provider. So the call-count
assertions §4 wanted are real: bad-then-good is one press and two calls, a shed call is one,
and the elapsed guard is driven with `vi.setSystemTime` rather than an injected clock. The
sibling comment was corrected in the same commit.

## 8. Verified

```
npm run typecheck                            clean
npm test                                     194 files, 3719 passed
  └ insight.test.ts + insightPrompt.test.ts  64 passed
```

Before this change the suite was 193 files / 3681 tests, so the delta is one new file and 38
new assertions.

**What no test here can answer:** whether a real `glm-5.2` retry, shown its own bulleted
answer, comes back as a paragraph. That is a live-model question, and the instrument for it is
the one §5 names — two `llm_calls` rows with `op: 'insight'` seconds apart followed by a
stored insight. **§1 is the half that closes the report**, and it is fully mechanical.

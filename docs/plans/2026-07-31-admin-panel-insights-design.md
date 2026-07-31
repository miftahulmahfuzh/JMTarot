# Admin panel insights — design

**2026-07-31. A7.** An `Insight` button on every subpanel of `/admin` (Ringkasan) and
`/admin/tokens` (Token), with the generated prose in a box below it and the time it was
last generated beside the button.

Thirteen panels. Six on Ringkasan, seven on Token.

---

## 1. What the operator sees

Each panel grows one row under its chart (or under its tiles, for the three that are not
charts):

```
[ Insight ]   Terakhir diperbarui 31 Jul 2026, 14.22 WIB
┌────────────────────────────────────────────────────────┐
│ Panggilan naik 34% dibanding 7 hari sebelumnya, dan    │
│ hampir semuanya jatuh pada tiga hari terakhir. …       │
└────────────────────────────────────────────────────────┘
```

Five states, and the empty one is the default:

| state | button | timestamp | box |
| --- | --- | --- | --- |
| never generated | `Insight` | absent | absent |
| generating | `Menyusun…`, disabled | previous, if any | previous, if any |
| have one | `Perbarui insight` | the stored `updated_at` | the prose |
| stored but the numbers moved | `Perbarui insight` | the stored `updated_at` | the prose **plus** a line saying the numbers have changed since |
| failed | `Insight` | unchanged | a sentence naming what happened |

**The stale line is the whole reason `input_hash` exists.** An insight is prose about a
specific set of numbers; the range filter can move underneath it and the row for
`(panel, from, to)` will not exist, so a *different* range simply shows the empty state.
What the hash catches is the same range whose data has since changed — a new day of
calls landing inside a range ending today. Without it the box would keep asserting
yesterday's reading of a chart that has moved, with a timestamp that makes it look
current.

## 2. Where the data comes from, and the rule it obeys

`/admin`'s header states R21: *every number is queried server-side; there is no fetch.*
That survives. **The cached insight is read in the page's own `withAdminRead`**, in one
extra statement alongside the rollup, and arrives at the box as a prop. The only fetch on
these pages is the POST that a button press makes, and it carries no numbers — just
`{ panel, from, to }`.

**The route re-derives the panel's numbers server-side; it never trusts a payload from
the client.** This is W3's rule at the completion route — *the client is trusted to say
what it answered, never that it finished* — applied to a model prompt, which is the one
place a client-supplied string would be most costly to get wrong.

So the route runs the same composite the page ran (`fleetRollup` + `callTotals` for
Ringkasan, the six for Token) and hands it to the panel's renderer.

### The panel registry — `src/app/admin/insight/panels.ts`

```
PANELS: Record<PanelId, {
  page:     '/admin' | '/admin/tokens'
  title:    string          // from copy.ts, so the box and the card agree
  purpose:  string          // one line: what an operator uses this panel for
  render:   (data) => PanelFacts
}>
```

`PanelFacts` is `{ headline: string[]; columns: string[]; rows: (string|number|null)[][];
notes: string[] }` — a small, flat, serializable block.

**It is deliberately NOT a copy of the panel's `TableSpec`.** Reusing the table looked
tempting: `ChartFrame` already requires one (I-13), so every chart card carries a
textual form of itself for free. It was rejected because the table is written for a
screen reader looking at *that chart* and omits, on purpose, the things a model most
needs — the range in days, the previous period's figures, the 280 ceiling, `k`, the
denominators that live in a footnote. The facts block carries those. The cost is a second
spelling of each panel's labels, and §6 is the test that keeps the two sets of panels
from drifting apart in membership.

The three non-chart panels — the quota hero, the KPI row, the cache tile — have a
renderer like any other. They were the reason to build the registry around *facts*
rather than around `ChartFrame`.

## 3. The model call

`src/lib/admin/insight.ts`, server-only, one buffered `complete()`.

- **`op: 'insight'` — a tenth value in `LLMOp`.** CLAUDE.md calls a tenth *"a
  reconciliation question, not an authoring convenience"*; this document is the question
  and Miftah answered it on 2026-07-31. The reason to spend it rather than reuse
  `translation`: the insight button is a **new recurring model call with no querent
  behind it**, and `/admin/tokens`' own *Biaya per keperluan* table is the surface that
  has to be able to say what it costs. Folding it into an existing op would make the
  dashboard hide the cost of its own feature. `OP_ORDER` gains it too — a type-level
  `AssertNever` makes that a compile error rather than a choice.
- **`callClass: 'deferred'`, for `blogAutoTranslate`'s reason exactly.** The operator is
  waiting, so `interactive` looks right and is wrong: `LLM_WINDOW_CALL_CEILING` is
  fleet-wide, and an operator's convenience must be shed before a querent's reading is.
- **No entry in `flags.ts`.** It joins `blogAutoTranslate` in `flagCoverage.test.ts`'s
  `EXEMPT` table, with the same argument: the only `deferred` sites whose caller *is* the
  operator are already shed first by construction, so **the tier is the switch**, and it
  cannot be left off in a dashboard at 2am. With the ceiling reached the button says so
  and the operator reads the chart themselves, which is what they were doing yesterday.
- **The default model.** No `INSIGHT_MODEL` variable. This is analysis over numbers, which
  is the work a cheap model does worst, and the two existing model overrides
  (`TRANSLATION_MODEL`, `PERSONA_MODEL`) both exist to point *at* the reading model rather
  than away from it.

### The prompt

Indonesian, matching every other string on this surface (A-D12). Three rules in the
system half, each of which is a failure that was easy to imagine:

1. **Cite no number that is not in the block.** A dashboard insight that invents a figure
   is worse than no insight, because the operator has no way to tell.
2. **No recommendation that needs data outside the block.** "Consider adding a Redis
   cache" is not a reading of this panel.
3. **2–4 sentences.** Prose, no markdown, no headings, no bullet list.

`validateInsight()` is the mechanical half — empty, over-long, or fenced-in-markdown is a
refusal, not a stored row. It is deliberately weaker than V2's card-name check, and the
design says so rather than implying a guarantee: there is no cheap mechanical test for
"this sentence about a trend is true", and the honest instruments are the timestamp, the
stale line, and the table view sitting directly underneath.

## 4. Storage

One table. **Not per-user**: there is one operator and an insight is about the fleet, not
about who asked.

```sql
CREATE TABLE admin_insights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id    text NOT NULL,
  range_from  date NOT NULL,
  range_to    date NOT NULL,
  body        text NOT NULL,
  input_hash  text NOT NULL,
  model       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_insights_panel_range_uq UNIQUE (panel_id, range_from, range_to)
);
```

`range_from`/`range_to` are `date`, and **`string` in Drizzle, never `mode: 'date'`** —
CLAUDE.md's `local_date` rule. They are already strings everywhere in `range.ts`.

`updated_at` is set **by hand** inside `onConflictDoUpdate`: `$onUpdate()` does not fire
there, and this column is the whole of what the timestamp renders.

There is no `user_id` and therefore nothing for account erasure to reach. The prose is
about aggregate fleet numbers; it contains no querent text by construction, because the
facts block it was generated from has none — the closest thing is the league table's
eight-character id prefixes, which are already what that panel renders on screen.

## 5. No new event name

`EVENT_NAMES` is at exactly 70 and the ceiling is 70. The register was revisited rather
than raised, per `events.test.ts`'s own process:

- **DRAFTED, two:** `admin.insight_generated`, `admin.insight_viewed`.
- **LANDED, none.**

`admin.insight_generated` is a row in `llm_calls` with `op = 'insight'`, and that is the
same argument that dropped `llm.call_recorded` on 2026-07-30: *a fact table and an event
stream recording the same fact is how they drift.* The ledger row carries the model, the
tokens, the duration and the failure — strictly more than the event would have.
`admin.insight_viewed` goes the way of `admin.user_viewed` and `account.answer_revealed`:
a look changes no decision.

So the taxonomy stays at 70 for a feature that touches thirteen panels.

## 6. Tests

| file | what it holds |
| --- | --- |
| `src/lib/admin/insightPrompt.test.ts` | the prompt's three rules are present; `insightInputHash` is stable and order-sensitive; `validateInsight` refuses empty, over-long and markdown-fenced output |
| `src/app/admin/insight/panels.test.ts` | **the registry's keys are exactly the panel ids the two pages mount** — a grep over `page.tsx`, in `callClass.test.ts`'s idiom. A button with no renderer 500s the route; a renderer with no button is dead code that reads as a shipped panel |
| `src/lib/db/queries/admin/insights.integration.test.ts` | the upsert rotates rather than inserting; `updated_at` actually moves; a second range is a second row |
| `src/lib/llm/callClass.test.ts` | the new call site's row |
| `src/lib/llm/flagCoverage.test.ts` | the new `EXEMPT` row |

Everything already-existing keeps binding: `adminSurface.test.ts` gates the route and
demands its verb set, `runtime`, `maxDuration` and the absence of `t()`.

## 6a. What the live run changed

Everything above §6 is the design as written. Two things only a real press could say.

### The button invalidates the panel it describes

An insight is a model call with `op: 'insight'` and today's `local_date`, so the
`llm_calls` row it writes lands **inside any range ending today** — nine of the thirteen
panels and the default filter. Measured on the dev database, 2026-07-31: press
`overview.calls`, reload, and the box read *"Angka di panel ini sudah berubah sejak
insight ini dibuat"* under prose written four seconds earlier, because the total had gone
53 → 54 and the fifty-fourth call **was the press**.

Three fixes; two are worse:

- **Exclude `op: 'insight'` from the metric queries.** Works, and undoes the entire
  argument for spending the tenth `op` — the dashboard has to be able to say what its own
  button costs. Also an edit to `queries/admin/**`, which is A3's by §7.
- **Drop the flag.** Then a settled month's insight can be silently wrong about a range
  that was later corrected, which is the case the flag exists for.
- **Only flag a CLOSED range** — what ships. The question the flag answers is *"has a
  settled period been re-measured since this was written?"*, and a range ending today is
  not settled by anybody's definition: it moves whenever a querent takes a reading, so the
  flag would be noise there even if the button cost nothing. **On a live range the
  timestamp does the work**, which is what it is for.

`today` is threaded from each page rather than read in the helper, because `todayUtc()` is
called once per request at the top of a page and the helper runs during render.

### `unchanged` is a guard, not a hot path

`force` is `true` whenever there is already an insight on screen — the button's word has
changed to *Perbarui insight* by then — so the `unchanged` arm needs a client with no
state and a matching row in the database, which is two tabs or a lost render. It is kept
because it is the correct behaviour for `force: false`, and because a first-press
double-tap is the case it does catch. **The saving that actually matters is the page
reload**, which serves the stored row and reaches no model at all.

### Measured, first press, dev database

| | |
| --- | --- |
| latency, cold | 2.9s |
| latency, second press | 5.0s |
| input / output tokens | 830 / 138 |
| `cache_read_tokens`, 2nd press | 448 of 830 |
| `call_class` | `deferred` |

Prose quality on `overview.quota`, `tokens.trajectory`, `tokens.cache`, `tokens.league`
and `overview.calls` was read by hand; every figure cited was present in the block, and
the quota panel correctly reported the caveat about the counter being a lower bound.

## 7. Known limits, stated rather than hidden

- **Nobody has read a generated insight on the dashboard it describes.** Loop 3 at 1440 is
  the acceptance step for the layout; the prose quality is a human read, once, per panel.
- **`validateInsight` cannot tell whether the sentence is true.** §3.
- **Thirteen buttons is thirteen model calls** if an operator presses all of them, on a
  fleet-wide ceiling of 280 per rolling five hours. `deferred` is what bounds it, and the
  refusal is a sentence.
- **A range ending today goes stale within the hour, and the stale line no longer says
  so.** §6a is the ruling. What replaces it on a live range is the timestamp, and nobody
  has watched an operator use that for a week to see whether it is enough.
- **Nobody has seen the box on a real phone or at 1440.** Loop 3 at 1440 is the layout's
  acceptance step; the 8px of empty space under a button on a panel with no insight
  (`InsightBox.module.css`) was reasoned about, not looked at.
- **`tokens.cache`'s insight suggested inspecting the prompt layer**, which is close to
  rule 2's line. It is grounded — that panel's own `purpose` line names prompt-layer
  changes — but it is the kind of drift worth re-reading after a model change.

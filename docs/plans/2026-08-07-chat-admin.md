<!--
  F7 — The operator's view. v0.7.0, the group chat.

  Read order, per roadmap §0.2:
    docs/plans/2026-08-07-RECONCILIATION-v0.7.0.md  (outranks everything)
    PUBLIC_RELEASE_ROADMAP_v0.7.0.md                (the contract: §2 C-D5/C-D6, §3, §6.2, §7 F7, §11 S10/S11, §12 Q4)
    PUBLIC_RELEASE_ROADMAP_v0.5.0.md                (§2 A-D9/A-D10/A-D11/A-D12/A-D16/A-D18, §4.2, §5 incl. R8-R14, §7, §9)
    docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md  (outranks the v0.5.0 roadmap)
    CLAUDE.md  ## Admin panel insights (A7) · ## The z.ai plan · ## Traps
    docs/plans/2026-07-31-admin-panel-insights-design.md
    docs/plans/2026-07-30-{chart-primitives,analytics-aggregation,llm-ledger}.md  (I-1..I-25, M1..M13, A2-D1..A2-D9)
    docs/workstream-notes.md, sections A3, A4, A5, A7
-->

# F7 — The operator's view: `/admin/chat`, the tokens, and the denominator

**Status:** planning. Nothing here is built.
**Date opened:** 2026-08-07.
**Depends on:** F1 only, for the schema, the two `LLMOp` values and the chat ceiling
accessor. F2 and F3 are *soft* dependencies: three panels read the beat sheet's own
fields, and until F2 lands they render an honest empty state rather than nothing.

---

## 0. What this workstream is, in one paragraph

Miftah's requirement 9 is two sentences that pull in opposite directions and only look
like a contradiction:

> *we also need to track the tokens consumption in the admin system as well… but
> eventhough we want to track the consumption, **DO NOT STINT ON BURNING TOKENS DURING
> CHAT IN THE CHAT GROUP!!*** *… i don't care what price we have to pay for it.*

They are not in tension because **this tab measures, it does not restrain.** There is no
budget control on `/admin/chat`, no cap, no kill switch and no "spend" hero. v0.5.0 §1
already settled the general form of this — *"Not a cost cap or a kill switch. v0.5.0
**observes**"* — and F7 inherits it unchanged. The one restraint in this release lives in
`meter.ts` and `LLM_WINDOW_CHAT_CEILING`, both F1's, and it exists for `C-D6`'s reason
(a chat run must never be why a reading fails), not for money's.

So the tab's job is narrower and more useful: **it is the only continuous measurement of
`C-N1` and `C-N2` once the release has shipped** (roadmap §10.3). `npm run smoke -- --chat`
is read once by a person; the reply-rate panel is read every week by the person deciding
whether the room is alive.

---

## 1. Numbered invariants

Each with its reason and its failure mode. A change contradicting one is a defect.

**`[F7-1]` `/admin/chat` MEASURES; IT NEVER RESTRAINS, AND IT RENDERS NO CONTROL.** No
"pause chat" button, no ceiling editor, no per-user throttle. The flags (`CHAT_ENABLED`,
`CHAT_PROACTIVE_ENABLED`) are environment variables an operator sets in the Vercel
dashboard and `docs/DEPLOY-VERCEL.md` §2d is their runbook. *Failure mode:* a button on
this page is an admin **write** over the querent's experience, which v0.5.0 §9's
non-negotiable 2 forbids in as many words — *"Not a write surface over querent data"* —
and it would answer Miftah's requirement 9 with exactly the stinting he forbade.

**`[F7-2]` EVERY PANEL BUCKETS BY **UTC DAY**, ONE CALENDAR, AND SAYS SO.** `chat_runs`
and `chat_messages` carry `created_at` (`timestamptz`) and no `local_date` — deliberately;
see `## Schema deltas`. `/admin`'s two-bucket problem (`callsByUtcDay` vs
`callsByLocalDate`, and R25's *"a fleet-wide `group by local_date` sums two calendar
systems"*) therefore cannot arise here. *Failure mode:* adding a `local_date` to
`chat_runs` for symmetry re-imports a defect the table does not have, and the chat's
quota panel must be comparable to `callsByUtcDay` anyway, which is bucketed by
`created_at`.

**`[F7-3]` THE REPLY RATE'S DENOMINATOR IS RUNS WHOSE 24-HOUR WINDOW HAS **CLOSED**.** A
proactive run that produced a bubble four hours before the range's right edge has not
failed to get a reply; it has not finished being asked. Such runs are excluded from both
the numerator and the denominator and are reported separately as *menunggu*. *Failure
mode:* including them makes the rate fall every time the operator picks a range ending
today — which is the default filter — so the release's own scorecard would read as
declining on every page load. This is `periodDelta`'s rule (`null`, never `Infinity` or
`100%`) applied to a population instead of to a ratio.

**`[F7-4]` `llm_calls.reading_id` MUST STAY NULL FOR `chat_plan` AND `chat_turn`, AND
THAT IS F7's FENCE EVEN THOUGH F1 WRITES THE ROW.** `readingCostsFor`
(`src/lib/db/queries/admin/readings.ts:258`) and `callsForReading`
(`queries/admin/calls.ts:185`) fold **every** `llm_calls` row carrying a `reading_id` into
one figure labelled *Biaya generasi*, with no `op` predicate — R51's *"generation cost,
not this reading's cost"*, which today means `reading` + `gist`. A chat run has two
plausible reading pointers (`chat_runs.trigger_reading_id`, `chat_messages.attached_reading_id`),
so the temptation to attribute the ledger row to them is real and would be invisible.
*Failure mode:* a reading's cost card silently grows every chat message anybody ever sent
about that reading, under a label that says it is the reading's generation cost. The
negative control is a `chat_turn` row with a `reading_id` in
`readings.integration.test.ts` asserting it is **not** folded — the shape that file
already uses for the `moderation` row at line 212.

**`[F7-5]` FOUR OF THIRTEEN OPS DO NOT MEASURE A READING, AND THE SET IS DECLARED ONCE
WITH A COMPILE GUARD.** `src/lib/admin/ops.ts` (new, PURE, a LEAF) exports
`NON_READING_OPS` and `READING_OPS`, partitioning `LLMOp` with an `AssertNever`-shaped
alias so a **fourteenth** op is a compile error until somebody decides which side it is
on. *Failure mode:* the rule currently lives as prose in four files
(`src/lib/llm/types.ts:158`, `src/lib/analytics/rollup.ts:38-46`,
`docs/analytics-queries.md:566`, `CLAUDE.md` twice) and **three of the four are already
stale** — they say "two" and one says "ten `op` values". A rule restated in prose four
times is a rule that will be wrong in three of them again by v0.8.0.

**`[F7-6]` NOTHING ON THIS PAGE DIVIDES BY A READING COUNT, BECAUSE NOTHING IN THE REPO
DOES YET.** There is no `costPerReading` anywhere; what exists is the *rule* about one.
F7 does not invent the metric in order to fix it. *Failure mode:* shipping a
cost-per-reading tile would force `op` into `PriceableRow`, into
`tokensByBucketAndModel`'s SQL and into `userCostLeague`'s SQL — three edits to A3's
files, breaking six test files — to render a number nobody asked for. See
`## The denominator fix`.

**`[F7-7]` EVERY COST FIGURE RENDERS BESIDE THE COUNT OF CALLS IT COULD NOT PRICE.**
A-D7, and `CostFigure`'s shape (`{ usd, unpricedCalls }`) is what makes it mechanical.
`prices.ts`'s zeros are a **measurement** — `CLAUDE.md`'s `## The z.ai plan`, balance
read as zero on 2026-08-01 — and `NOTIONAL_MODEL` is unset, so today the chat's cost
renders *"belum berharga"* beside a call count. *Failure mode:* rendering `US$0,00`
reads as *we are spending nothing* rather than as *nobody has read a price page*, which
is the sentence `/admin/page.tsx:102` already spends a paragraph on.

**`[F7-8]` `CHAT_MODEL=glm-5.2` MEANS THIS PAGE IS THE FIRST PLACE A NON-ZERO PRICE COULD
APPEAR, AND THE PAGE MUST NOT PRESUME IT.** `prices.ts` carries a `glm-5.2` row at zero,
verified 2026-08-01, for the same plan reason as `glm-4.6`. The models panel's
*belum berharga* count is the instrument that would show a change. *Failure mode:*
"correcting" the zeros because the chat runs a newer model is exactly the inference
`## The z.ai plan` exists to prevent, and it has already been drawn once.

**`[F7-9]` PRESSING `Insight` ON THIS PAGE MOVES EXACTLY ONE PANEL, AND THE EXISTING
STALE RULE ALREADY COVERS IT.** A7 measured that the button's own `llm_calls` row —
`op: 'insight'`, today's `local_date` — lands inside any range ending today, so nine of
thirteen panels described themselves changing. Here, seven of nine panels filter
`op in ('chat_plan','chat_turn')` and are structurally insulated; only `chat.quota`'s
fleet meter counts every call and therefore moves. `statesFor`'s `settled = range.to <
today` guard is unchanged and is still the whole fix. *Failure mode:* re-deriving this as
*"exclude `op:'insight'` from the chat queries"* would be a no-op that reads as a fix, and
`panels.ts:653` already records the exclusion route as rejected for a different reason;
a second, differently-argued exclusion is how the first one gets undone.

**`[F7-10]` A HISTOGRAM'S BARS ALL WEAR ONE SLOT.** Four of the nine panels want a
distribution over more than four categories (beat counts, run statuses, beat intents).
None of them adds a chart primitive and none of them needs a fifth hue: a histogram is a
`StackedBar` with **one segment per row**, and the identity is carried by the row label,
not by colour. Where two categories deserve marking out — `0 beat` in the beats
histogram, `abandoned` in the statuses — a second slot is used. *Failure mode:* colouring
a five-bar histogram by row index is exactly the `series.map((s, i) => CATEGORICAL[i])`
that I-5 makes structurally impossible, and `slotColor` throws above slot 3 rather than
wrapping, so the page would 500 instead of quietly mis-colouring. A-D9's *"a fifth
categorical hue is a reconciliation question, not an authoring convenience"* is not
reopened by this release.

**`[F7-11]` ONE ENTITY DIMENSION PER CHART (I-6), AND WHERE THE ROW AXIS ALREADY CARRIES
ONE, COLOUR CARRIES THE OTHER.** `chat.cast` is three rows (the readers) × three
segments (who the beat was aimed at); the readers are named on the axis and the colour
is the *target*. `READER_SLOT` is therefore deliberately **not** used there. *Failure
mode:* keying colour to the reader and the row to the target gives three one-segment
bars in three colours, which is a legend restating three axis labels — and the question
the panel exists for (does anybody talk to anybody else?) becomes invisible.

**`[F7-12]` `/admin/chat` CARRIES EXACTLY ONE `Hero`, AND IT IS THE PROACTIVE REPLY
RATE.** *Hero is exactly one per view*, and R14 refused notional spend for `/admin`'s
hero on the ground that *"a hero figure needing two disclaimers is a KPI tile"*. The
reply rate needs **one**, and it goes in `sub` where `heroSub` already puts
`calls / ceiling · pct`: `dibalas / terkirim · pct`. The denominator is on screen beside
the number. *Failure mode:* `deps.contract.test.ts:305` currently asserts *"exactly one
Hero across both pages, on /admin"* by naming two files; a third page with a hero passes
that test while silently making the assertion's name a lie. F7 rewrites it to
*at most one per page, `/admin` has one, `/admin/tokens` has none, `/admin/chat` has one*.

**`[F7-13]` NO CHAT MESSAGE BODY, NO NICKNAME AND NO EMAIL REACHES ANY SURFACE F7
BUILDS.** Not on `/admin/chat`, not in a `PanelFacts` block, not in a table cell, not in
a tooltip. `chat_messages.body` is text a person typed, stored in **plaintext** (`C-D20`)
— it is not even behind `FIELD_ENCRYPTION_KEY` the way the six onboarding answers are,
which makes it easier to leak, not safer to show. A length is a number; a body is not.
*Failure mode:* the fleet dashboard's own precedent is `shortId` (`panels.ts:459`),
where even a full uuid was judged more identity than the feature needs.

**`[F7-14]` A `PanelFacts` BLOCK CARRIES ONLY WHAT THE PANEL ALREADY RENDERS, PLUS THE
CAVEATS.** `panels.ts`'s existing rule, and it binds harder here because the subject is
conversation. `insightPrompt.ts`'s fence (`<panel>`) and rule 1 (*cite no number not in
the block*) are unchanged. *Failure mode:* handing a model a sample bubble "for context"
puts a querent's words into a prompt whose output is stored in `admin_insights.body`, a
column with no redaction path.

**`[F7-15]` THE PAGE READS THE CEILINGS THROUGH `_ceilings()`, NEVER `process.env`.**
`adminCopy.test.ts` already bans a literal `280` and `process.env.LLM_WINDOW_CALL_CEILING`
anywhere under `src/app/admin/**`; F7 extends the same fence to
`process.env.LLM_WINDOW_CHAT_CEILING`, and F1 extends `_ceilings()` to return the chat
sub-budget. *Failure mode:* a hardcoded ceiling in a `.tsx` is the number that goes stale
the day the plan tier changes, and `C-D6` consequence 1 says `LLM_WINDOW_CALL_CEILING`
**must be re-derived before this release ships** — so a copy of it would be stale in the
same release that created it.

**`[F7-16]` NO NEW CHART PRIMITIVE, NO NEW HEX, NO NEW DEPENDENCY.** All nine panels
compose `ChartFrame`, `Hero`, `KpiRow`, `StatTile`, `Line`, `StackedBar`, `Meter`,
`TableView`, `Legend`, `Axis`, `ChartHover` and `ChartError`. `src/theme/chart.ts` is
A4's file and is not touched; the two slot orders this page needs are declared in
`src/app/admin/chat/slots.ts` and resolved through `slotFor` from
`@/lib/analytics/rollup`, which is what "the caller resolves the slot" means. *Failure
mode:* v0.5.0 §9's non-negotiable 7, and `chart.contract.test.ts` asserting
`CATEGORICAL[` appears in exactly one place in the repo.

**`[F7-17]` NEVER A DUAL-AXIS CHART (A-D11).** Tokens and cost do not share a frame:
tokens per day is a `Line`, cost is a `StatTile` and a table cell. Calls and latency do
not share a frame. *Failure mode:* it is the single most common charting mistake and
`noDualAxis.test.ts` is a grep over a vocabulary, so the concept arrives by a word.

**`[F7-18]` R21 SURVIVES: THIS PAGE FETCHES NOTHING.** Every number is queried
server-side inside one `withAdminRead`, the range is a GET param, a range change is a
navigation, and the insight box's first frame is server-rendered from the same
transaction. The only request the page ever makes is the one an `Insight` press causes.
*Failure mode:* a `/api/admin/chat/[metric]` route is precisely the unowned route R21
struck once already.

**`[F7-19]` THE PAGE DECLARES `runtime = 'nodejs'` AND `maxDuration = 30`, CALLS
`requireAdminPage()` ITSELF, AND ANSWERS 404.** §4.2 and A-D2, inherited whole; the
layout is not trusted to gate. Failure renders `ChartError`, never a 500. *Failure mode:*
*"every admin request is a cold one, because there is one admin and no warm instance"* —
§4.2 calls this the single most likely live failure in v0.5.0 and it did not stop being
true.

**`[F7-20]` NO DRIVER ERROR IS LOGGED FROM ANY PATH THAT RUNS A CHAT QUERY.** Roadmap
§9's non-negotiable 6, and it binds F7 hardest of anyone: a postgres error quotes the
failing statement **and its bound parameters**, and this tree's queries touch a table
whose `body` column is a person's conversation. The page's one `catch` returns
`ChartError` and logs nothing — the shape `/admin/tokens/page.tsx` already uses.

**`[F7-21]` ADMIN COPY IS INDONESIAN, HARDCODED, AND NEVER IN THE I18N CATALOG (A-D12).**
No `t()`, no `getT()`, no `tFor()`, no `@/lib/i18n/*` import other than the named
`locale` exception, which F7 does not need. `token`, `input`, `output`, `p95`, `op`,
`model`, `beat`, `run` and `trigger` stay English as terms of art. *Failure mode:* the
grep in `adminCopy.test.ts` and `adminSurface.test.ts` is **the whole enforcement**, not
a belt.

**`[F7-22]` F7 DECLARES NO NEW EVENT NAME.** `admin.page_viewed` with
`page: '/admin/chat'` is the whole instrumentation, exactly as A4 and A5 did. A-D18's
folding rule and `C-D14`'s restatement of it both apply, and F1 owns `events.ts` for this
release. *Failure mode:* `admin.chat_viewed` would be `admin.user_viewed` again, which
was dropped because *"opening a page changes no decision"*.

---

## 2. The panels

Nine, on one page, in this order. Each is a `ChartFrame` (opaque `--chart-surface`, R8)
carrying a required `TableSpec` (I-13) and an `InsightBox`. The chart **form is chosen
before its colours** (A-D9/A-D10/A-D11, §5.3's ladder); where the honest form is a table,
the panel's chart is small and the table is the point.

Ranges below are the parsed `{ from, to }` from `RangeFilter`, compared against
`created_at` in UTC — `[F7-2]`. `CHAT_OPS` is `('chat_plan','chat_turn')`.

---

### P1 · `chat.reply` — **Balasan proaktif** · THE SCORECARD

**The question.** `C-N2f`, verbatim: *did the querent answer a message they did not ask
for, within 24 hours?* This is the closest this project can get to *"proactive feels
alive"*, and roadmap §10.3 names it the only continuous measurement of the release.

**Position.** First on the page, above the fold, carrying the page's one `Hero`
(`[F7-12]`).

**The query** — `proactiveReplyRate(db, range)`:

```sql
with delivered as (
  select r.id,
         r.trigger,
         r.user_id,
         max(m.created_at) as last_bubble_at
    from chat_runs r
    join chat_messages m on m.run_id = r.id and m.author <> 'user'
   where r.trigger <> 'user_message'
     and r.created_at >= $from::date
     and r.created_at <  ($to::date + 1)
   group by r.id, r.trigger, r.user_id
),
judged as (
  select d.trigger,
         -- THE WINDOW MUST HAVE CLOSED. [F7-3]
         (d.last_bubble_at + interval '24 hours') <= now() as settled,
         exists (
           select 1 from chat_messages u
            where u.user_id = d.user_id
              and u.author  = 'user'
              and u.created_at >  d.last_bubble_at
              and u.created_at <= d.last_bubble_at + interval '24 hours'
         ) as replied
    from delivered d
)
select trigger,
       count(*) filter (where settled)                as delivered,
       count(*) filter (where settled and replied)    as replied,
       count(*) filter (where not settled)            as pending
  from judged
 group by trigger;
```

Three things about it that are not incidental:

- **The join to `chat_messages` is what makes the denominator `C-N2f`'s.** A run that
  planned zero beats (`C-R6`) or lost every beat (`C-R7`) produced no bubble and is not in
  `delivered` — correctly, because nothing was said for the querent to answer.
- **`author <> 'user'` and not `author in (...)`.** F1 owns the reader slugs; a fourth
  reader would be counted, and a new non-reader author would be a schema change F1 would
  have to argue for anyway.
- **`u.user_id = d.user_id` and not a `run_id` join.** The querent's reply is a new
  `user_message` run's trigger message; it has no relationship to the proactive run
  except in time. That is the whole measurement.

**The form.** `Hero` (the range-wide rate) + one `StackedBar` row per proactive trigger,
two segments each — `dibalas` / `tidak dibalas` — plus a `KpiRow` of three `StatTile`s
(`terkirim`, `dibalas`, `menunggu jendela 24 jam`). Slots from `REPLY_ORDER = ['replied',
'silent']`, so the colour dimension is the reply and the row axis is the trigger
(`[F7-11]`). Four rows, four triggers, two slots. `valueLabel` is the row's delivered
count, so **the denominator is printed on every bar** — A-D7's rule generalised from cost
to a rate.

**Never a line of the rate per day.** A daily rate over a handful of runs is the *"big
percentage over a small base"* that `INSIGHT_SYSTEM` already lists as not-a-problem; a
chart of it would manufacture the finding the prompt forbids.

**`CATATAN DARI PANEL`:**
- `Penyebutnya hanya run proaktif yang benar-benar menghasilkan gelembung. Run yang sengaja diam (nol beat) dan run yang kehilangan semua beatnya tidak masuk hitungan — dari dalam ruangan keduanya sama-sama sunyi.`
- `Run yang jendela 24 jamnya belum tutup dikeluarkan dari pembilang DAN penyebut, dan dihitung terpisah sebagai "menunggu". Kalau angka menunggu besar, rentangnya terlalu baru untuk dinilai.`
- `Balasan diukur dari pesan penanya berikutnya, bukan dari balasan ke gelembung tertentu. Penanya yang membalas hal lain tetap dihitung membalas.`
- `Angka ini adalah papan skor rilis ini. Kalau turun, yang salah biasanya materi pemicunya, bukan penanyanya.`

---

### P2 · `chat.runs` — **Run per hari**

**The question.** How much is the room doing, and how much of it is unprompted?

**The query** — `runsByUtcDay(db, range)`: `count(*)` grouped by
`(created_at at time zone 'UTC')::date` and `trigger`, zero-filled in TypeScript over
`enumerateDays(from, to)` (A3's rule — a `generate_series` of dates hands back
`timestamptz`, and the zero-fill is the part a unit test can own). `assertDense` from
`src/app/admin/metrics.ts` checks it and `ChartError`s rather than filling a gap.

**The form.** `Line`, **two** series: `dijawab` (`trigger = 'user_message'`) and
`proaktif` (the other four, summed). Slots from `RUN_KIND_ORDER = ['reactive',
'proactive']`. Two series, one axis, both counts — direct-labelled at the endpoint, per
I-10.

**The five-way trigger split lives in the panel's table, not in the chart.** Five
entities against four slots is `[F7-10]`'s wall, and §5.3's own ruling for the nine ops
is the precedent: *more than ~7 meaningful classes is a table, not more colours* — and at
five it is still the right instinct when four hues are all there are. `TableSpec` columns:
`Hari · user_message · reading_completed · idle_nudge · unanswered · cron`.

**`CATATAN DARI PANEL`:**
- `Dikelompokkan per hari UTC, satu kalender. Tabel chat tidak menyimpan hari kalender penanya, jadi tidak ada dua kalender yang tercampur di halaman ini.`
- `Satu run bisa menghasilkan nol sampai empat pesan. Ini menghitung RUN, bukan gelembung.`
- `Garis "proaktif" adalah empat trigger dijumlahkan; pecahannya ada di tabel.`
- `Kalau proaktif nol sepanjang rentang, periksa CHAT_PROACTIVE_ENABLED sebelum menyimpulkan apa pun soal aturan kelayakan.`

---

### P3 · `chat.beats` — **Beat per run, dan kesenyapan**

**The question.** How long is a run, and how often does the director decide nobody
speaks? `C-R6` is explicit: *"F2 must make it reachable and F7 must measure how often it
happens; a rate of zero means the director is not really deciding."*

**The query** — `beatHistogram(db, range)`:

```sql
select least(coalesce(jsonb_array_length(r.beats), 0), 4) as bucket,
       count(*) as runs
  from chat_runs r
 where r.status in ('done','abandoned')
   and r.created_at >= $from::date and r.created_at < ($to::date + 1)
 group by 1 order by 1;
```

Buckets `0 · 1 · 2 · 3 · 4+`. Restricted to terminal runs on purpose: a `running` run's
beat sheet is a plan, not an outcome, and counting it would put in-flight runs in the
`0` bucket beside deliberate silence — the two things this panel exists to separate.

**The form.** A horizontal histogram: `StackedBar`, five rows, one segment each
(`[F7-10]`). The `0 beat` row wears a second slot, because it is the row the operator is
looking for. Beside it, two `StatTile`s: `Kesenyapan` (the `0` bucket over all terminal
runs) and `Rata-rata beat` — the mean is offered only as a companion to the distribution,
never instead of it, which is the roadmap's own wording (*"distribution, not a mean"*).

**`CATATAN DARI PANEL`:**
- `Nol beat berarti sutradara memutuskan tidak ada yang menjawab. Itu rencana yang sah dan diinginkan — di grup sungguhan pesan memang kadang tidak dijawab.`
- `KESENYAPAN NOL BUKAN KABAR BAIK. Kalau angkanya 0%, sutradaranya tidak benar-benar memutuskan; ia selalu menjawab.`
- `Hanya run yang sudah selesai atau ditinggalkan yang dihitung. Run yang masih berjalan punya rencana, bukan hasil.`
- `Beat yang dijatuhkan setelah dua kali gagal validasi TIDAK terlihat di sini — panelnya ada di "Kesehatan run", dan dari dalam ruangan beat yang jatuh dan keputusan diam tampak sama persis.`

---

### P4 · `chat.cast` — **Siapa bicara, dan kepada siapa**

**The question.** Is this a group, or is it three prompt files taking turns? `C-N1a` and
`C-R5`: reader-to-reader is what makes the room a room.

**The query** — `castByTarget(db, range)`:

```sql
select m.author,
       case
         when m.reply_to_message_id is null then 'none'
         when p.author = 'user'             then 'querent'
         else 'reader'
       end as target,
       count(*) as messages
  from chat_messages m
  left join chat_messages p on p.id = m.reply_to_message_id
 where m.author <> 'user'
   and m.created_at >= $from::date and m.created_at < ($to::date + 1)
 group by 1, 2;
```

**The form.** `StackedBar`, three rows (Thessaly, Margaret, Adrian), three segments each
— `ke penanya` / `ke pembaca lain` / `tanpa target`. Slots from
`TARGET_ORDER = ['querent','reader','none']`; the readers are the row axis and colour is
the target (`[F7-11]`). `valueLabel` is each reader's total, so share-of-voice is
readable off the bar lengths without a second chart. A `StatTile` carries
`Porsi pembaca terbanyak`.

**`CATATAN DARI PANEL`:**
- `"ke pembaca lain" adalah beat yang membalas gelembung pembaca lain. Kalau angkanya nol sepanjang rentang, ruangan ini tiga monolog dan bukan satu grup.`
- `"tanpa target" adalah beat yang tidak membalas apa pun. Itu wajar untuk beat pertama sebuah run dan untuk pesan proaktif.`
- `Satu pembaca di atas ~60% dari seluruh gelembung berarti pengecoran timpang, bukan bahwa pembaca itu lebih baik.`
- `Angka ini menghitung PESAN, bukan run. Satu run bisa memberi dua gelembung kepada satu pembaca yang sama.`

---

### P5 · `chat.intent` — **Maksud beat**

**The question.** `C-N1d`: *they ask questions.* The roadmap assigns the rate to F7 in
§6.1 and omits it from §7's F7 list — see `## Discrepancies with the roadmap`.

**The query** — `beatIntents(db, range)`: `jsonb_array_elements(r.beats) as b`, grouped by
`b->>'intent'`, over terminal runs in range. **The field name is F1's** (seam S1: F1 owns
the beat shape, F2 owns its contents); `intent` is provisional here and the reconciliation
must pin it. The query is written so that an unknown key yields `null`, which renders as
`(tidak tercatat)` rather than as zero rows — an empty panel and a mis-keyed query must
not look alike.

**The form.** A histogram, `StackedBar` one segment per row, one slot (`[F7-10]`), ordered
by F2's declared intent order and **never by rank** — `opRows`' rule, because an order
that changes with the data reads as the data changing. A `StatTile` carries
`Beat bertanya` as a percentage of all beats: that is `C-N1d`'s number.

**`CATATAN DARI PANEL`:**
- `Ini membaca rencana sutradara, bukan teks yang benar-benar terkirim. Beat yang gagal validasi tetap terhitung di sini.`
- `Beat "ask" adalah pembaca yang bertanya balik. Rilis ini menyebutnya bagian yang paling sulit dan paling alami; kalau porsinya nol, sutradaranya tidak pernah memakai intent itu.`
- `Pembaca yang bertanya lalu tidak pernah menyinggung jawabannya lebih buruk daripada yang tidak pernah bertanya. Panel ini tidak bisa melihat hal itu — hanya membaca percakapannya yang bisa.`
- `Urutannya tetap, bukan urutan besar-kecil, supaya perubahan angka tidak terbaca sebagai perubahan susunan.`

---

### P6 · `chat.tokens` — **Token dan biaya: `chat_plan` vs `chat_turn`**

**The question.** Miftah's requirement 9, literally: what is the chat consuming, and how
does that sit against the rest of the app? **This panel answers it and restrains
nothing** (`[F7-1]`).

**The queries.**

```sql
-- chatTokensByUtcDay: the two series
select (created_at at time zone 'UTC')::date::text as bucket,
       op,
       count(*)                                   as calls,
       coalesce(sum(input_tokens),  0)            as input_tokens,
       coalesce(sum(output_tokens), 0)            as output_tokens,
       count(*) filter (where input_tokens is null and output_tokens is null) as untokenized
  from llm_calls
 where op in ('chat_plan','chat_turn')
   and created_at >= $from::date and created_at < ($to::date + 1)
   and status <> 'refused'
 group by 1, 2 order by 1, 2;

-- chatCallTotals: PriceableRow-shaped, so priceRollup() takes it unchanged
select model, local_date::text as local_date, count(*) as calls,
       coalesce(sum(input_tokens),0)  as input_tokens,
       coalesce(sum(output_tokens),0) as output_tokens,
       count(*) filter (where input_tokens is null and output_tokens is null) as untokenized
  from llm_calls
 where op in ('chat_plan','chat_turn') and local_date between $from and $to
 group by 1, 2;
```

`chatCallTotals`'s row shape is structurally assignable to `PriceableRow`
(`src/lib/analytics/rollup.ts:154`), so `priceRollup(rows, notionalLookup)` prices the
chat with **no edit to A3's or A2's code** — the whole reason this workstream needs no
`op` field on `PriceableRow`. The fleet share comes from `callsByOp` and
`tokensByBucketAndModel`, both already on the page's rollup, and is computed as a
fraction in the page rather than in SQL.

**The form.** `Line`, two series (`chat_plan`, `chat_turn`), y = tokens per day, slots
from `CHAT_OP_ORDER = ['chat_plan','chat_turn']`. `C-D5`'s argument is the form's
justification: *"the director is a large prompt and a tiny JSON reply, a voice is a large
prompt and a two-sentence reply — averaging them makes both figures meaningless"*, and
two lines on one axis is what un-averages them. Beside it a `KpiRow`:
`Token obrolan`, `Biaya notional obrolan` (with `unpricedCalls` as its `note`, `[F7-7]`),
`Porsi panggilan armada`, `Porsi token armada`.

**Cost never enters the chart.** A-D11 / `[F7-17]`.

**`CATATAN DARI PANEL`:**
- `chat_plan adalah satu panggilan sutradara per run; chat_turn adalah satu panggilan per beat. Bentuk tokennya berbeda jauh dan tidak boleh dirata-ratakan jadi satu angka.`
- `Biaya di sini notional. Setiap baris harga z.ai bernilai nol dengan sengaja — itu hasil pengukuran, bukan tempat kosong — jadi angka biaya berjalan bersama jumlah panggilan yang belum bisa diberi harga.`
- `Obrolan berjalan di CHAT_MODEL, yang bisa berbeda dari LLM_MODEL. Panel model di /admin/tokens adalah tempat memeriksa model mana yang belum punya baris harga.`
- `Porsi armada dihitung terhadap SELURUH panggilan model, termasuk moderasi, gist dan tombol Insight di dasbor ini. Itu bukan "porsi dari bacaan".`
- `Halaman ini mengukur, tidak membatasi. Satu-satunya rem di rilis ini ada di LLM_WINDOW_CHAT_CEILING, dan alasannya bukan biaya.`

---

### P7 · `chat.latency` — **Latensi per beat**

**The question.** How long does the room take to say something?

**The query** — `chatLatency(db, range)`: `percentile_cont(0.5)` and `(0.95)` over
`total_ms`, grouped by `op` and by UTC day, `where op in CHAT_OPS and status = 'ok'`.
A `percentile_cont` is `double precision` and genuinely nullable; **`null` stays `null`**
— "no measurement" is not 0ms (A3's `numOrNull`, and `TableSpec.emptyCell` prints an em
dash, never `0`).

**The form.** `Line`, two series (`chat_plan`, `chat_turn`), y = p95 ms, same slot order
as P6 so the two panels agree about which colour is the director. Two `StatTile`s carry
the range-wide p50 and p95 per op. Calls and latency never share a frame with tokens
(`[F7-17]`).

**`CATATAN DARI PANEL`:**
- `Ini waktu panggilan model, bukan waktu yang dirasakan penanya. Jeda mengetik antar-beat ditentukan server lalu dijalankan di peramban, dan tidak tercatat di mana pun.`
- `Satu run dengan tiga beat membayar satu chat_plan dan tiga chat_turn, berurutan. Waktu total run adalah jumlahnya ditambah jeda, dan tidak ada di halaman ini.`
- `p95 dihitung Postgres atas seluruh populasi op itu. Itu bukan rata-rata dari baris harian di tabel.`
- `Hanya panggilan yang berstatus ok yang dihitung. Panggilan yang gagal punya durasi, tapi bukan durasi menghasilkan sesuatu.`

---

### P8 · `chat.health` — **Run yang tidak sampai ke layar**

**The question.** Two rates that look identical from inside the room and must not look
identical to the operator: **runs that were abandoned**, and **beats that were dropped
after failing validation twice** (`C-R7`). Plus the director's own refusal rate
(`validatePlan`).

**The queries** — `runHealth(db, range)`:

```sql
-- statuses, plus the stuck bucket
select r.status,
       count(*) as runs,
       count(*) filter (
         where r.status in ('pending','planning','running')
           and (r.lease_until is null or r.lease_until < now() - interval '15 minutes')
       ) as stuck
  from chat_runs r
 where r.created_at >= $from::date and r.created_at < ($to::date + 1)
 group by 1;

-- dropped beats, and the director's fallback rate
select count(*)                                                    as terminal_runs,
       count(*) filter (where r.plan_source = 'fallback')           as fallback_plans,
       coalesce(sum(coalesce(jsonb_array_length(r.beats),0)), 0)    as beats_planned,
       coalesce(sum(m.bubbles), 0)                                  as bubbles
  from chat_runs r
  left join lateral (
    select count(*) as bubbles from chat_messages x
     where x.run_id = r.id and x.author <> 'user'
  ) m on true
 where r.status = 'done'
   and r.created_at >= $from::date and r.created_at < ($to::date + 1);
```

**`beats_planned - bubbles` over `done` runs is the dropped-beat count, and it needs no
new column.** `C-D6` consequence 3 is what makes it exact: a beat shed at the chat
ceiling leaves the run **`running`** with beats remaining, so it is never in this
population. A `done` run with fewer bubbles than beats lost them to `C-R7`'s two failed
validations. `plan_source` is the one column F7 asks F1 for — see `## Schema deltas`.

**The form.** `StackedBar` histogram of the five statuses, one segment per row, with
`abandoned` in a second slot (`[F7-10]`); a `KpiRow` of `Beat dijatuhkan`,
`Rencana ditolak`, `Run macet`.

**`CATATAN DARI PANEL`:**
- `Tidak ada gelembung error di rilis ini. Kegagalan adalah kesunyian — jadi beat yang jatuh dan keputusan diam terlihat sama dari dalam ruangan. Panel inilah satu-satunya tempat keduanya bisa dibedakan.`
- `Beat yang dijatuhkan dihitung dari selisih beat yang direncanakan dan gelembung yang tersimpan, pada run yang sudah selesai saja. Beat yang dibuang karena kuota meninggalkan runnya tetap "running", jadi tidak pernah masuk hitungan ini.`
- `"Run macet" adalah run yang belum selesai dan leasenya sudah lama lewat. Beberapa itu wajar: penanya menutup tab, dan run diambil lagi saat ia kembali. Yang perlu dilihat adalah kalau angkanya menumpuk dari hari ke hari.`
- `"abandoned" berarti semua beatnya gagal. Itu error, bukan penanya yang pergi — kebalikan dari arti "ditinggalkan" di panel bacaan.`

---

### P9 · `chat.quota` — **Kuota: obrolan di dalam jendela armada**

**The question.** `C-D6`'s promise, made checkable: *a chat run must never be the reason a
reading fails.* Seam S11 assigns F1 the new value of `LLM_WINDOW_CALL_CEILING` and **F7
the panel that shows whether it was right.**

**The queries.** `peakWindow5h(db, range, CHAT_OPS)` and `peakWindow5h(db, range)` — the
**same function**, twice, with and without an op filter. See
`## The denominator fix` for why this is a parameter on A3's query rather than a copy of
its window SQL in `chat.ts`.

**The form.** Two `Meter`s side by side — chat calls against `LLM_WINDOW_CHAT_CEILING`,
and all calls against `LLM_WINDOW_CALL_CEILING` — plus a `StatTile` for the chat's share
of the worst window. `Meter` takes an icon and a word as **required** props precisely
because §5.2 measured that a four-hue traffic light is unbuildable on this canvas; the
severity ramp is one hue and colour alone may never carry the state.

Two meters are not a dual-axis chart: they are two marks against two limits, each with
its own frame. What is forbidden is two scales in **one** frame.

**`CATATAN DARI PANEL`:**
- `Panggilan obrolan bertingkat "deferred": mereka dibuang di garis LUNAK, bukan di garis keras. Angka yang benar-benar mengikat lebih rendah dari batas yang tertulis.`
- `Meter armada di sebelah kanan adalah angka yang sama dengan angka utama di halaman Ringkasan, dari kueri yang sama. Kalau keduanya berbeda, salah satunya salah.`
- `Angka ini batas bawah: pencatatan berjalan setelah respons, dan kuota sudah terpotong sebelum panggilan dijalankan. Kalau meleset, arahnya selalu terlalu rendah.`
- `Jendela 5 jam berjalan, bukan hari kalender. Tidak ada tanggal di kunci penghitungnya.`
- `Batas panggilan armada diturunkan ulang untuk rilis ini. Kalau meter kanan sering di atas garis lunak sementara meter kiri masih longgar, yang salah adalah batas armadanya, bukan obrolannya.`

---

## 3. The denominator fix (seam S10)

### 3.1 The finding that changes the shape of this section

**There is no cost-per-reading figure anywhere in this repository.** A sweep over
`src/app/admin/**`, `src/lib/db/queries/admin/**`, `src/lib/analytics/**`,
`src/lib/llm/**` and `docs/analytics-queries.md` for any expression dividing a cost, a
token count or a call count by a reading count returns nothing. What exists is:

1. **A rule about such a denominator, stated in prose in four places — three of which are
   already stale**, one of them naming only half the ops it should.
2. **Fourteen aggregation sites that sum across every `LLMOp` with no predicate.** Almost
   all of them are *correct* unfiltered (the quota series counts every call; the per-op
   table exists to show every op) and must not be "fixed".
3. **Exactly two sites in the repo that filter on `op` at all**, both
   `and c.op = 'reading'` in the A-D17 drift check, both already correct
   (`queries/admin/metrics.ts:670`, `docs/analytics-queries.md:758`). **Do not touch
   either.**

So the honest reading of `C-D5`'s *"F7 owns fixing this everywhere it already exists"* is:
**fix the rule, not an arithmetic that was never written.** Inventing a cost-per-reading
tile in order to have something to correct would force `op` into `PriceableRow`, into
`tokensByBucketAndModel`'s SQL and into `userCostLeague`'s SQL — three edits to A3's
files, breaking six test files — to render a number nobody asked for (`[F7-6]`).

### 3.2 What F7 builds: one constant, with a compile guard

**NEW — `src/lib/admin/ops.ts`.** PURE, a LEAF: `import type { LLMOp }` and
`import { OP_ORDER }`, nothing else. No `server-only` (a unit test must reach it), no
`process.env`, no React.

```ts
/** Ops with no querent behind them. A cost-per-reading denominator excludes these. */
export const NON_READING_OPS = ['insight', 'blog_format', 'chat_plan', 'chat_turn']
  as const satisfies readonly LLMOp[];

export const READING_OPS = OP_ORDER.filter(
  (op) => !(NON_READING_OPS as readonly string[]).includes(op),
) as readonly LLMOp[];

/** THE GUARD. A fourteenth op is a compile error until somebody decides which side it
 *  is on -- `OP_ORDER`'s own `AssertNever` shape, one layer up. */
type AssertNever<T extends never> = T;
type _Unclassified = AssertNever<
  Exclude<LLMOp, (typeof NON_READING_OPS)[number] | (typeof READING_OPS_LITERAL)[number]>
>;
```

The literal twin `READING_OPS_LITERAL` is spelled out beside the derived `READING_OPS`
so the guard has two type-level members to subtract; `ops.test.ts` asserts the derived
array and the literal are equal, which is what keeps the transcription honest. That is
`OP_ORDER`'s own trade: a hand-written list plus a mechanical check, because
`Array.prototype.filter` has no type-level result.

**Why here and not beside `OP_ORDER`.** `src/lib/analytics/rollup.ts` is A3's file and,
this release, F1's — F1 must append the two values there or the existing `AssertNever`
fails to compile. S10 says *"F1 must not 'helpfully' fix it while adding the ops"*, and
the cleanest way to honour that is for the classification to live in a file F7 owns.
`src/lib/admin/**` is F7's by §7 and is already the home of `model.ts`, `allowlist.ts`
and `ops`-adjacent leaves.

### 3.3 The prose, file by file, with what changes

| # | File | Line(s) | Today | Change | Owner |
|---|---|---|---|---|---|
| 1 | `src/lib/llm/types.ts` | 158–159 | *"TWO OPS NOW MEASURE THE DASHBOARD AND THE CMS… must exclude `insight` AND `blog_format`"* | **FOUR ops, and name all four.** Point at `src/lib/admin/ops.ts` as the machine-checked copy | **F1** (it owns the union this release) — F7 supplies the sentence |
| 2 | `src/lib/analytics/rollup.ts` | 31, 38–46 | *"The ten, in the order…"* over an eleven-member array; *"THE LAST TWO HAVE NO QUERENT BEHIND THEM"*; *"A COST-PER-READING DENOMINATOR MUST EXCLUDE BOTH"* | *"The thirteen"*; **the last FOUR**; *"MUST EXCLUDE ALL FOUR"*, naming `ops.ts` | **F1** (compile-forced edit) — F7 supplies the sentence. Raised as a seam below |
| 3 | `docs/analytics-queries.md` | 566–572 | *"THERE ARE TEN `op` VALUES SINCE 2026-07-31, NOT NINE… It is the only `op` with no querent behind it"* — **wrong twice**: eleven today, and `blog_format` was added the same day and is missing | Thirteen, four without a querent, all four named | **F7** — flagged, `docs/` is unassigned in §7 |
| 4 | `docs/analytics-queries.md` | 639–640 | *"Three ops per reading is the expected shape; `calls` is not a reading count"* | Add: four ops have no reading at all, so `calls` is not a reading count in a second, stronger way | **F7** |
| 5 | `src/app/admin/copy.ts` | 332 | `opSubtitle: 'Sepuluh op adalah tabel, bukan grafik…'` — **already stale at eleven** | `'Tiga belas op…'`, and the comment above it (which says the count is spelled in words *so a bump forces a human to re-make the argument*) gets the argument re-made: at thirteen, a table is not a close call | **F7** |
| 6 | `src/app/admin/users/copy.ts` | 361 | `byOpSubtitle: 'Sembilan op dilipat menjadi tiga teratas + lainnya'` — stale at nine | Thirteen | **F7** |
| 7 | `src/app/admin/users/series.ts` | ~76 | header: *"Nine `op` values, closed"* | Thirteen | **F7** |
| 8 | `src/app/admin/tokens/page.tsx` | 455–462 | `OpTable`'s header: *"Cost by purpose… nine `op` values"* | Thirteen, four of which have no querent; the table stays unfiltered and the header says why | **F7** |
| 9 | `src/app/admin/metrics.test.ts` | 209 | `OP_ORDER.map((op, i) => ({ op, value: (9 - i) * 10 }))` — **a literal `9` where the length is meant**; already wrong at eleven and produces negative values at thirteen | `OP_ORDER.length - i` | **F7** |
| 10 | `CLAUDE.md` | `## Admin panel insights (A7)` and `## The markdown editor…` | both say a denominator *"must exclude `insight` AND `blog_format`"* | four ops | **RECONCILIATION ONLY.** v0.5.0 §9's non-negotiable 12 — *nothing new in `CLAUDE.md` from a workstream* — and this release's §13 says the same |

### 3.4 The three panel-facts blocks that hand a model both halves

The highest-risk site is not an arithmetic; it is a prompt. `kpiFacts`
(`src/app/admin/insight/panels.ts:175`) puts

```
{ label: OVERVIEW.kpi.spend,    value: usd(cost.costUsd, …) },   // line 198
{ label: OVERVIEW.kpi.readings, value: int(readings) },          // line 205
```

in one `headline` list, with **nothing in `notes` telling the model not to divide them** —
and `INSIGHT_SYSTEM`'s rule 1 only forbids citing a number that is not in the block, which
a quotient technically is not. Three edits, all in `panels.ts`, all `notes` additions:

- **`kpiFacts`** gains: `Biaya, panggilan dan token dihitung atas SELURUH op. Empat dari tiga belas op tidak punya penanya di belakangnya — insight, blog_format, chat_plan, chat_turn — jadi angka-angka ini tidak boleh dibagi dengan "Bacaan selesai". Hasilnya bukan biaya per bacaan.`
- **`serviceFacts`** extends its existing sentence (*"Satu bacaan bisa memicu beberapa panggilan model…"*) with the same four names.
- **`opFacts`** replaces `'op `insight` adalah tombol Insight di dasbor ini sendiri.'` with a class statement: `Empat op tidak diakibatkan penanya: insight (tombol di dasbor ini), blog_format (tombol Auto Format), chat_plan dan chat_turn (grup obrolan). Tabel ini sengaja tidak menyaringnya — justru menampilkan biayanya adalah alasan keempat op itu ada.`

That last sentence also pre-empts the contradiction a reviewer will otherwise see:
`panels.ts:653` records *"Exclude `op: 'insight'` from the metric queries"* as a
**rejected** fix, for a different problem (insight staleness). F7 does not reverse it and
must say so at the site.

### 3.5 The one structural defence: `[F7-4]`'s fence

`readingCostsFor` and `callsForReading` fold every ledger row carrying a `reading_id`.
F7 adds, in `src/lib/db/queries/admin/readings.integration.test.ts` (the `describe` at
line 181 already seeds a `moderation` row with `readingId: null` *"This row must NOT be
folded in"*), a case seeding a `chat_turn` row **with** a `reading_id` and asserting
`cost.calls` is unchanged — which fails today, and is therefore a request to F1 as much
as a test: **the chat's ledger rows carry `reading_id: null`.** If the reconciliation
rules the other way, the fix is an `op` predicate in both queries and a rewritten
`costLabel` in `src/app/admin/users/copy.ts:320`, and the label stops being true.

### 3.6 What is deliberately NOT changed

`callsByUtcDay`, `peakWindow5h`, `modelsSeen`, `callsByOp`, `OpTable`,
`callsByOpForUser`, `foldOps`, `opRows`, `tokensByBucketAndModel`, `userCostLeague`,
`userTotals`, `priceRollup`, `PriceableRow`, `CostFigure`, and both existing
`op = 'reading'` filters. Every one of them is either correct unfiltered (a quota series
counts every call that charged the window, chat included) or is the per-op breakdown
itself. **A fix applied to any of them hides the cost of the chat, which is the thing
requirement 9 asked to see.**

---

## 4. Insight panels

### 4.1 All nine get a button, and the reason is the fence

A7 gave all thirteen panels one. F7 gives all nine, and the binding argument is not
symmetry: `panels.test.ts:66` asserts

```ts
expect(idsIn(OVERVIEW_PAGE)).toEqual([...OVERVIEW_PANEL_IDS].sort());
```

— an **equality** between the ids a page mounts and the ids the registry declares. A page
with a box on six of nine panels forces that assertion down to a subset check, and a
subset check cannot see a renderer with no button (dead code that reads as a shipped
panel) or a button with no renderer (a 404 under a control that looks live). **Weakening
a fence to allow a design choice is how this codebase loses fences**, and the cost of
keeping it is three renderers nobody presses.

### 4.2 The registry, in `src/app/admin/insight/panels.ts`

A **third** record and a **third** loader, mirroring the two that exist. `PANEL_IDS` goes
13 → 22.

```ts
const CHAT_PANELS = {
  'chat.reply':   replyFacts,
  'chat.runs':    runsFacts,
  'chat.beats':   beatsFacts,
  'chat.cast':    castFacts,
  'chat.intent':  intentFacts,
  'chat.tokens':  chatTokensFacts,
  'chat.latency': chatLatencyFacts,
  'chat.health':  healthFacts,
  'chat.quota':   chatQuotaFacts,
} as const satisfies Record<string, (data: ChatData, range: Range) => PanelFacts>;
```

plus `CHAT_PANEL_IDS`, `ChatPanelId`, `chatFacts()`, `chatInsightStates()` and
`export type { ChatData }`. `panelFacts()` gains a third branch — `if (panel in
OVERVIEW_PANELS) … if (panel in TOKEN_PANELS) … return chatFacts(…)` — keeping the
existing rule that **a renderer can only ever be handed the shape its own loader
produced**, which is what the two-records-not-one design buys and a third record
preserves.

`loadChat(db, range)` runs `chatRollup(db, range)` — one composite, `CHAT_ROLLUP_QUERIES`
asserted, `fleetRollup`'s exact shape — so a button press costs one extra composite read
inside `withAdminRead`'s 10s budget, for one operator, which is the same trade A7 already
priced.

Each renderer formats its numbers with `../format` — the same functions the panel used —
so the box and the chart cannot print one figure two ways. The `notes` are the
`CATATAN DARI PANEL` blocks written out under each panel in §2, verbatim; that is the
contract, not a summary of it.

### 4.3 Staleness: nothing new, and `[F7-9]` is why

`statesFor` is unchanged. `settled = range.to < today` is still the whole rule, and
`chatInsightStates` is a fourth caller of the same generic. A7's measured finding — *press,
reload, and the box reads "the numbers have changed" under prose written four seconds
earlier* — is what that guard exists for, and re-deriving it here would be re-deriving it
wrongly: on `/admin/chat` the press moves **one** panel (`chat.quota`'s fleet meter),
because every other panel filters to `CHAT_OPS` and an `insight` row is not one. The
guard is already correct for the one panel that moves, and the timestamp is what does the
work on a live range.

`panels.test.ts` gains: `PANEL_IDS` length 22, `CHAT_PANEL_IDS` length 9, the
`/admin/chat` grep, disjointness against both existing pages, and the
`chatInsightStates` empty-range coverage loop that the token panels already have.

---

## 5. `/admin/users/[id]` and the chat

Roadmap Q4 is Miftah's to rule on. This section lays out the options with their costs and
**defaults to counts and no text.**

### 5.1 What is being asked for

A chat log is *"the six onboarding answers plus everything the querent volunteered
afterwards"* — and by `C-D8` the readers are actively soliciting the answers back into
the conversation, so the transcript contains the six answers **spoken aloud, in context,
with follow-up questions attached.** `A-D16`'s audited reveal was built for strictly less
than that, and there is one further asymmetry that cuts against showing it:
`onboarding_answers.answer_text` is AES-256-GCM encrypted at rest and `queries/onboarding.ts`
is the only module that decrypts it. **`chat_messages.body` is plaintext** (`C-D20`). The
protection there is *nothing reads it* — which is a property of the code, not of the data,
and a reveal component is the code that changes it.

### 5.2 The default, and what F7 builds unless overruled

**A `Obrolan` section on `/admin/users/[id]`, between `sosok` and `token`, rendering
counts and timestamps and no prose.** New `SECTIONS` entry `['obrolan', DETAIL.chat.heading]`,
a new `sections/Chat.tsx`, and one new query
`chatSummaryForAdmin(db, userId)` in `src/lib/db/queries/admin/chat.ts`. It shows:

- messages by author (the querent and each of the three readers), and the date of the
  first and last message;
- runs by `trigger` and by `status`;
- this person's own proactive reply rate, computed by the same function P1 uses;
- `chat_threads`: `last_read_at`, `last_proactive_at`, `proactive_count_today` /
  `proactive_count_date`, `last_user_message_at`, `last_reader_message_at`.

That last group is the operationally useful half and it contains no text at all: it
answers *"is the throttle set right for this person"*, which is the same question
`answersLastChanged` answers for the Lotus and which `detail.ts:310` already prefers a
query to an events aggregation for.

**No audit row is written**, because nothing is revealed. That matches §12's existing
ruling that the user LIST page has no `resource` value *"deliberate: 50 audit rows per
page load would make the audit panel unreadable"*.

### 5.3 The options, with their costs

**Option A — counts and no text. THE DEFAULT.** Cost: an operator investigating a report
cannot see what was said. Benefit: `admin_access_log`'s `resource` set
(`onboarding_answer`, `moderation_question`, `user_detail`, `reading_body` — A1's, closed)
is unchanged, no new route exists, and the most sensitive text in the product remains
unreachable from a browser.

**Option B — a one-MESSAGE-per-request audited reveal, mirroring
`GET /api/admin/users/[id]/answer/[key]`.** **Rejected as designed**, and not on
principle: **the audited reveal's unit was designed for a thing you read ONE of.** Six
onboarding answers means at most six audit rows; a conversation is hundreds of messages,
so reading one exchange is two hundred audit rows. An audit trail that records two hundred
reads for one act of reading is either noise the operator learns to scroll past, or a lie
about intent — and `audit.ts`'s own standard is *"an audit trail that over-records is
honest; one that under-records is not"*, which is a defence of granularity, not of volume.
It also needs a fifth `resource` value in A1's closed set, which is a reconciliation
question in its own right.

**Option B′ — a one-RUN-per-request reveal.** If Miftah wants text, this is the honest
unit. A run is 1–4 messages, it is the unit the engine actually produced, one press is
one audit row, and `resource_key` is a `chat_runs.id` — machine-generated, never a
decrypted value, matching `resource_key`'s stated rule. It still needs the fifth
`resource` value and it still puts the six answers on a screen, in a reader's voice, so
it is a `/privacy` question as well as an architecture one. `C-D8` condition 4 already has
F1 amending `/privacy` for this release; **if B′ is granted, that amendment must cover
admin reading of the chat too, in the same release, or the policy is false in production
again.**

**Option C — a transcript view.** Refused outright. `redactForUser()` redacts moderation
text at the soft delete and `chat_messages` is covered only by the cascade at the hard
delete thirty days later, so a transcript page is a standing window into a deleted
account's conversation for a month. It is also the "bulk decrypt" shape v0.5.0 §9's
non-negotiable 3 bans by name, differing only in that there is no decryption to do.

### 5.4 If B′ is granted, what it must clear, exactly

`src/lib/admin/reveal.ts`'s ordering, unchanged and not re-derived: (1) a read that
touches no prose confirms the run belongs to the subject; (2) `await recordAdminAccess(...)`
with **no `try`/`catch`**, so a failed audit write is a failed reveal; (3) only then read
the bodies. Outside `withAdminRead` (it sets `transaction_read_only = on`). The route is
`private, no-store`, answers every verb, and 404s on refusal. `reveal.integration.test.ts`
drives it with the `pg_temp` trigger that makes the audit write fail — that test, not a
source grep, is what proves the ordering.

---

## 6. Admin copy

Indonesian, hardcoded, in `src/app/admin/copy.ts` as a new `export const CHAT` beside
`COMMON`, `INSIGHT`, `OVERVIEW` and `TOKENS`; the user-detail strings in
`src/app/admin/users/copy.ts` as `DETAIL.chat`. **No `t()`, no `getT()`, no `tFor()`, no
`@/lib/i18n/*` import** (A-D12; `adminCopy.test.ts` and `adminSurface.test.ts` both grep
this tree, and the first also asserts the set of i18n specifiers in the tree is exactly
`['@/lib/i18n/locale']`).

Terms of art stay English: `token`, `input`, `output`, `p95`, `op`, `model`, `trigger`,
`run`, `beat`, `intent`, `lease`. Indonesian prose otherwise, and Indonesian rather than
Malay — `karier` not `kerjaya`, `kamu` not `awak`. Nothing on this page addresses a
querent, so the second person barely appears.

The tab label is **`Obrolan`**, in `ADMIN_PAGES`, not in `CHAT` — `pages.ts` owns nav
labels and `AdminTabs` reads them from there, which is what stops the nav and the tab
highlight disagreeing.

Every user-visible string is a required prop on the chart primitives (I-16) and none of
them is spelled inside `src/components/chart/**`; `deps.contract.test.ts`'s literal fence
is what enforces it, and F7 adds no chart component, so that fence is untouched.

Two copy strings are load-bearing enough to write here:

- `CHAT.replyHeroSub: (replied, delivered, pct) => `${replied} / ${delivered} · ${pct}`` — `heroSub`'s shape, so the denominator is beside the number (`[F7-12]`).
- `CHAT.quotaCaveat` reuses `OVERVIEW.meterCaveat`'s sentence rather than restating it. Two spellings of *"angka ini batas bawah"* would drift, and it is the same fact about the same reconstruction.

---

## 7. Schema deltas — what F7 needs from F1's `0014`

Per roadmap §0.4, **no workstream but F1 writes a migration**, and a column F7 needs goes
here so the reconciliation folds it in **before F1 is built.**

### 7.1 One column

| Table | Column | Type | Why |
|---|---|---|---|
| `chat_runs` | `plan_source` | `text not null default 'model'`, `CHECK (plan_source in ('model','fallback'))` | **The director's refusal rate, as a query instead of an events aggregation.** `C-D6`/`C-R7` make every other health number derivable from columns §3.3 already has — the dropped-beat count is `jsonb_array_length(beats) - count(bubbles)` over `done` runs, and silence is `jsonb_array_length(beats) = 0` — but *"the plan was refused and F2's deterministic fallback ran"* leaves no trace at all, because the fallback writes a perfectly ordinary beat sheet. F2's plan must produce *a plausible single beat*, so a fallback is **never** zero-beat and is otherwise indistinguishable from a real plan. Without this column the only instrument is `events`, and `validatePlan`'s refusal rate is the number that says whether the director is working. |

`default 'model'` rather than nullable: a null would be a third state meaning *"written
before this column existed"*, and there are no such rows — `0014` creates the table.

### 7.2 Two indexes

§3.3 lists none. `/admin/chat` scans by time across the whole fleet:

```sql
create index chat_runs_created_idx  on chat_runs (created_at desc);
create index chat_runs_user_idx     on chat_runs (user_id, created_at desc);
```

The first serves every fleet panel; the second serves `chatSummaryForAdmin` on
`/admin/users/[id]`. `chat_messages (run_id)` and `(user_id, created_at desc)` are already
in §3.2 and are what P1's correlated subquery and P4's self-join need.

### 7.3 What F7 does NOT ask for

- **No `local_date` on `chat_runs` or `chat_messages`.** `[F7-2]`.
- **No `chat_run_id` on `llm_calls`.** It would make latency joinable per run, and it is
  A2's table, a v0.5.0 owner, with `reading_id`'s precedent (*set for one op only, and the
  duplication is deliberate*) arguing against a second entity pointer. The cost is that
  P7 measures per-**call** latency and not per-**run**; that is stated on the panel rather
  than paid for with a column.
- **No new `admin_access_log.resource` value**, unless Q4 is answered with B′.
- **No column recording a dropped beat.** Derivable, and `C-D6` consequence 3 is what
  makes the derivation exact.

---

## 8. Tasks

Build order. Every path absolute from the repo root.

1. **`src/lib/admin/ops.ts` + `src/lib/admin/ops.test.ts`.** `NON_READING_OPS`,
   `READING_OPS`, the literal twin and the compile guard (§3.2). First, because it is a
   leaf with no dependency on F1 landing and it is what §3.3's prose points at. *Blocks on
   F1 only for the two new `LLMOp` values to exist.*
2. **The prose edits of §3.3 rows 3–9.** `docs/analytics-queries.md`,
   `src/app/admin/copy.ts:332`, `src/app/admin/users/copy.ts:361`,
   `src/app/admin/users/series.ts`, `src/app/admin/tokens/page.tsx:455`,
   `src/app/admin/metrics.test.ts:209`. Rows 1–2 are F1's and row 10 is the
   reconciliation's; F7 supplies the sentences.
3. **`src/app/admin/insight/panels.ts` — the three `notes` additions of §3.4**
   (`kpiFacts`, `serviceFacts`, `opFacts`), with the sentence at `opFacts` that names
   line 653's rejected exclusion so the diff does not read as a reversal.
4. **`src/lib/db/queries/admin/chat.ts` + `chat.integration.test.ts`.** Handle first,
   every function. `runsByUtcDay`, `beatHistogram`, `beatIntents`, `castByTarget`,
   `proactiveReplyRate`, `chatTokensByUtcDay`, `chatCallTotals`, `chatLatency`,
   `runHealth`, `chatSummaryForAdmin`, and the composite `chatRollup` with
   `CHAT_ROLLUP_QUERIES` asserted. **Every aggregate is `sql<unknown>` and `Number()`d at
   the boundary** — `sql<T>` is an assertion the driver is not obliged to honour, and
   `metrics.ts`'s header records what that cost V8. The integration test asserts
   `typeof === 'number'` on every returned field.
5. **`peakWindow5h`'s optional `ops` parameter**, in
   `src/lib/db/queries/admin/metrics.ts`. `peakWindow5h(db, range, ops?)` — the handle is
   still first, the existing call sites are unchanged, and the alternative is a copy of
   the `RANGE BETWEEN INTERVAL '5 hours' PRECEDING` window in `chat.ts`. **Two spellings
   of the one query that reconstructs what Redis holds is not a trade worth making**;
   `metrics.integration.test.ts` gets the filtered case. *Raised as a seam — it is an edit
   to A3's file.*
6. **`src/lib/db/queries/admin/readings.integration.test.ts`** — `[F7-4]`'s negative
   control: a `chat_turn` row with a `reading_id` must not be folded into
   `readingCostsFor`.
7. **`src/app/admin/pages.ts`** — `{ path: '/admin/chat', label: 'Obrolan', tab:
   '/admin/chat' }`, third in the list, after `/admin/tokens`. `pages.test.ts` already
   asserts every `tab` names an entry that has a `label`.
8. **`src/app/admin/copy.ts`** — `export const CHAT`, and the `CATATAN DARI PANEL` strings
   that both the page and `panels.ts` read, so the chart and the box cannot disagree.
9. **`src/app/admin/chat/slots.ts`** — `RUN_KIND_ORDER`, `REPLY_ORDER`, `TARGET_ORDER`,
   `CHAT_OP_ORDER`, `TRIGGER_ORDER`, `STATUS_ORDER`, `INTENT_ORDER`. Fixed orders,
   resolved through `slotFor`, never an array index (I-5).
10. **`src/app/admin/chat/series.ts`** — the pure adapter, `src/app/admin/metrics.ts`'s
    role for this page: query rows → `ChartSeries` / `StackRow` / `TableSpec`. Unit-tested
    against literals with no database.
11. **`src/app/admin/chat/page.tsx`** — nine panels, one `withAdminRead`, one `Hero`,
    `runtime = 'nodejs'`, `maxDuration = 30`, `requireAdminPage()`, `AdminTabs
    active="/admin/chat"`, `AdminPageViewed page="/admin/chat"`, `RangeFilter
    action="/admin/chat"`, per-panel `Suspense` with a height-reserving `ChartSkeleton`,
    one `catch` → `ChartError` and no logging, and the `todayUtc()` helper in the exact
    shape `deps.contract.test.ts:350` matches.
12. **`src/app/admin/insight/panels.ts`** — `ChatData`, `loadChat`, the nine renderers,
    `CHAT_PANELS`, `CHAT_PANEL_IDS`, `chatFacts`, `chatInsightStates`, and `panelFacts`'s
    third branch.
13. **`src/app/admin/insight/panels.test.ts`** — 22 / 9, the `/admin/chat` grep,
    three-way disjointness, the empty-range loop.
14. **`src/app/admin/deps.contract.test.ts`** — rewrite the Hero assertion (`[F7-12]`) and
    extend the ceiling fence to `process.env.LLM_WINDOW_CHAT_CEILING` (`[F7-15]`).
15. **`/admin/users/[id]`** — `SECTIONS` entry, `sections/Chat.tsx`, `DETAIL.chat` in
    `src/app/admin/users/copy.ts`, and `chatSummaryForAdmin` wired into the page's
    existing `withAdminRead` composite. Counts and no text (§5.2).
16. **`docs/analytics-queries.md` §19 — *The group chat*.** The reply-rate SQL, the
    dropped-beat SQL, and the chat's share of the five-hour window, so the panels have a
    hand-runnable twin. `docs/workstream-notes.md` gets F7's section at release close.

---

## 9. Verification

**Loop 1 — Vitest, no database.** `ops.test.ts` (the partition is exhaustive and the
literal twin matches the derived array); `src/app/admin/chat/series.test.ts` (every fold,
against literals — including the case where `beatHistogram` returns nothing, which must
render an empty panel and not a zero); `panels.test.ts` (22/9/grep/disjoint/empty-range);
`deps.contract.test.ts` and `adminCopy.test.ts` and `adminSurface.test.ts` over the
enlarged tree; `pages.test.ts`.

**Loop 2 — Vitest integration, `npm run db:up`.** `chat.integration.test.ts` is where the
reply rate is actually proved, and it needs four cases that a unit test cannot reach:

1. a proactive run with a bubble and a user message **23 hours later** → replied;
2. the same at **25 hours** → delivered, not replied;
3. a proactive run whose bubble is **2 hours old** → `pending`, and **in neither the
   numerator nor the denominator** (`[F7-3]`);
4. a proactive run with **zero bubbles** → absent from `delivered` entirely.

Plus: `beatHistogram` puts a `running` run in no bucket; `runHealth`'s dropped-beat count
is exact when a `done` run has three beats and two messages; every returned field is
`typeof === 'number'`; and `readingCostsFor` ignores a `chat_turn` row carrying a
`reading_id` (`[F7-4]`).

**Run `npm test` and `npm run test:integration` SEPARATELY.** `npm run test:all` fails
12–22 of V9's limiter tests as a harness race and its red does not mean anything.

**Loop 3 — a screenshot at 1440.** `tools/shot.sh /admin/chat 1440 2400 …`. v0.5.0
§12.7 is still open in as many words — *"STILL OPEN: nobody has read this dashboard on a
screen"* — and `[R8]` is the evidence that a surface question cannot be answered from a
plan. Nine panels is more than either existing page carries and the two-`Meter` row is a
layout nothing in the repo has rendered before.

**Loop 4 — width.** A `public/cards/_adminchatfit.html` at 320/360/390 for the two
`StackedBar` panels whose row labels are the longest strings on the page
(`reading_completed`, `ke pembaca lain`). This is the only loop that answers width.

**Loop 5 — CDP against `E2E_BASE=http://localhost:3001`, signed in as an admin.** Press
`Insight` on `chat.reply`, reload, and confirm the box does **not** claim the numbers
moved on a range ending today (`[F7-9]`); then press it on a closed range and confirm the
stale line behaves. **`ADMIN_EMAILS` is Production-only** (`[R37]`) — the signed-in admin
flow runs locally, and only the signed-out and non-admin refusal cases run against
production.

**Not a loop, and the one that decides the release:** read the reply-rate panel a week
after launch. A rate near zero with a healthy `chat.beats` and a healthy `chat.health`
means the material rules are wrong (`C-N2e`), not that the querent is boring — and
`chat.intent`'s ask rate is the first place to look.

---

## 10. Events

**F7 declares no new event name.** `admin.page_viewed` with `page: '/admin/chat'` is the
whole instrumentation, fired from the page's `Body` through `track()` — never awaited,
imported from `@/lib/analytics/track` on the server. `/admin/chat` joins `ADMIN_PAGES`, so
the prop is a member of the closed `AdminPagePath` union and a resolved path there is a
compile error, which is what keeps a subject's uuid out of a table whose rows survive that
subject's erasure.

**What F7 needs from F1, if and only if `plan_source` is refused:** one event,
`chat.plan_rejected`, props `{ reason: string }` from `validatePlan`'s closed refusal set
and nothing else — **no free text, a reason code, never a plan.** Declared here so F1 can
fold it; §7.1 argues the column is the better answer and this is the fallback, not the
request.

Everything else F7 renders comes from `chat_runs`, `chat_messages` and `llm_calls`. That
is deliberate and it is A-D18's rule: *"`llm.call_recorded` — dropped. That is a row in
`llm_calls`, not an event. A fact table and an event stream recording the same fact is how
they drift."*

---

## 11. Open questions

| # | Question | Why it needs a ruling, and what F7 does meanwhile |
|---|---|---|
| **F7-Q1** | **Roadmap Q4: does `/admin/users/[id]` show chat message bodies?** | §5. F7 builds Option A (counts, no text) and will not build B or B′ without a ruling, because both need a fifth `admin_access_log.resource` value (A1's closed set) **and** a `/privacy` amendment in the same release. |
| **F7-Q2** | **Is `plan_source` granted on `chat_runs`?** | §7.1. Without it, `chat.health`'s *Rencana ditolak* tile renders `—` and the panel says so; the fallback is `chat.plan_rejected` in `events`. |
| **F7-Q3** | **Does `peakWindow5h` gain an optional `ops` parameter, or does `chat.ts` copy the window SQL?** | Task 5. F7 proposes the parameter. It is an edit to A3's file, which §7 permits F7 and §6 of the v0.5.0 roadmap calls a reconciliation defect if unlisted — so it is listed. |
| **F7-Q4** | **What is the beat sheet's intent field called?** | Seam S1: F1 owns the shape, F2 owns the contents. `chat.intent` reads `b->>'intent'`; if the key differs the panel renders `(tidak tercatat)` for every beat, which is visible but wrong-looking. Pin it in the reconciliation. |
| **F7-Q5** | **Does `_ceilings()` grow a `chat` field, or does F1 export `_chatCeiling()`?** | `[F7-15]`. Either works; F7 needs one accessor that is not `process.env`, and `adminCopy.test.ts` is extended to ban the variable name in this tree whichever way it goes. |
| **F7-Q6** | **Is `docs/analytics-queries.md` F7's to edit?** | §7 names three trees F7 may touch and `docs/` is not one of them, while S10 assigns F7 a fix that lives partly in that file (§3.3 rows 3–4). Ruled either way it is one commit; it needs to be ruled. |
| **F7-Q7** | **Does the `Obrolan` tab sit third (after `Token`) or fifth (after `Pengguna`)?** | F7 assumes third: `/admin`, `/admin/tokens` and `/admin/chat` are the three fleet-metric pages and `/admin/users`, `/admin/blog` are the two per-subject ones. Cosmetic, but the nav order is the operator's mental model and it is cheaper to argue now. |

---

## 12. Discrepancies with the roadmap

1. **§7 F7's boundary is narrower than S10's job.** *"Must not touch: anything outside
   `src/app/admin/**`, `src/lib/db/queries/admin/**` and `src/lib/admin/**`"* — but the
   denominator rule is stated in `src/lib/llm/types.ts`, `src/lib/analytics/rollup.ts`,
   `docs/analytics-queries.md` and `CLAUDE.md`, none of which are in that list. F7's
   resolution: the two `src/lib/**` sentences go to **F1**, which is editing both files
   anyway (the union and the compile-forced `OP_ORDER` append), with F7 supplying the
   text; `CLAUDE.md` goes to the **reconciliation** per v0.5.0 §9's non-negotiable 12 and
   this release's §13; `docs/analytics-queries.md` is F7-Q6.

2. **§7 F7's panel list omits `C-N1d`'s ask rate, which §6.1 assigns to F7 in as many
   words** (*"A beat's intent may be `ask`… and F7 measures the rate"*). F7 builds it as
   `chat.intent` (P5). This is a widening of §7's *"at minimum"* list, not a
   contradiction, and it is recorded so it does not read as scope creep.

3. **§3.3's `chat_runs` declares no indexes at all**, and §3.2's index note (*"F1 sizes
   them"*) has no counterpart on the runs table. §7.2 above supplies the two the admin
   surface needs.

4. **§8's variable table gives `LLM_WINDOW_CHAT_CEILING` to F1 with no accessor named**,
   and `adminCopy.test.ts` forbids reading a ceiling from `process.env` under
   `src/app/admin/**`. F7-Q5.

5. **`C-D5` says "four of thirteen"; `OP_ORDER`'s own header says "The ten" over an
   eleven-member array**, and `docs/analytics-queries.md:566` says "ten… `insight` is the
   only `op` with no querent behind it", omitting `blog_format` which landed the same day.
   The roadmap's arithmetic is right and three existing statements of it are wrong. §3.3.

6. **`llm_calls.reading_id` and the chat.** Neither §3 nor §7 says whether a chat call's
   ledger row may carry a `reading_id` when the run was triggered by a reading
   (`chat_runs.trigger_reading_id`) or carries an attachment
   (`chat_messages.attached_reading_id`). Two existing admin queries fold every
   `reading_id`-bearing row into a figure labelled *Biaya generasi* with no `op` predicate.
   `[F7-4]` rules it `null` and ships the negative control; the reconciliation should
   confirm, because F1 writes the row.

7. **Seam S11 is satisfied by `chat.quota` (P9)** — *"F1 owns the change; F7 owns the panel
   that shows whether it was right"* — but the panel can only show it against a number
   `_ceilings()` reports, which is F7-Q5 again. Noted so the two are closed together.

8. **§10.3 calls `/admin/chat`'s reply-rate panel *"the only CONTINUOUS measurement of
   `C-N1` and `C-N2` once the release has shipped"*, and that is true of `C-N2` and only
   partly true of `C-N1`.** Naturalness has no continuous instrument and this plan does not
   pretend to one: `chat.beats`' silence rate, `chat.cast`'s reader-to-reader share and
   `chat.intent`'s ask rate are *proxies for the mechanism*, not for the prose. **The blind
   read stays the gate** (§10.2), and each of the three panels says so in its own
   `CATATAN DARI PANEL`.

---

## 13. The seams F7 touches, and who settles them

| Seam | Ruling F7 proposes |
|---|---|
| **S10** — the `/admin` denominator | F7 owns it. F1 appends the two values to `OP_ORDER` because the `AssertNever` forces it, and changes the two `src/lib/**` sentences **using F7's text**, in that commit. F7 owns `src/lib/admin/ops.ts`, every string under `src/app/admin/**`, and (pending F7-Q6) `docs/analytics-queries.md`. |
| **S11** — `LLM_WINDOW_CALL_CEILING`'s new number | F1 owns the number and the derivation; F7 owns `chat.quota` (P9), which renders the chat's share of the worst five-hour window against both ceilings. F1 must expose the chat ceiling through `_ceilings()` (F7-Q5). |
| **S1** — the `beats` JSON shape | F1 owns it, F2 fills it, **F7 reads it** — `jsonb_array_length` in `chat.beats` and `chat.health`, `b->>'intent'` in `chat.intent`. F7 is a third consumer and F7-Q4 asks that the intent key be pinned in F1's plan verbatim. |
| **S6** — `events.ts` | F1 owns it. F7 declares **nothing** unless F7-Q2 goes against the column, in which case `chat.plan_rejected` with a closed reason code. |
| **new** — `llm_calls.reading_id` on chat rows | Discrepancy 6. F7 proposes `null`, with the negative control in `readings.integration.test.ts`. |
| **new** — `peakWindow5h`'s `ops` parameter | F7-Q3. One implementation of the window query, or two. |

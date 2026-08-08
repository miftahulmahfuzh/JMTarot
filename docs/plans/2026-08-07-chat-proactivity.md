# F5 — Proactivity: triggers, eligibility, material, the nudge

**Workstream:** F5 of `PUBLIC_RELEASE_ROADMAP_v0.7.0.md`.
**Depends on:** F1 (the spine), F2 (the director), F3 (the voices).
**Date opened:** 2026-08-07.
**Brief:** roadmap §7 "F5", §6.2 in full, decisions `C-D7`, `C-D15`, `C-D18`, seam `S5`.

> **This plan builds TRIGGERS, not a pipeline.** `C-D7` is the design: an abandoned
> run and a proactive run are the same object. There is no second delivery path, no
> second table for proactive messages, no second renderer, and no "proactive" flavour
> of `chat_messages`. A proactive run is a `chat_runs` row that nobody posted a
> message for. Everything below is about **deciding to mint one**, and about **what
> it is allowed to be about.**
>
> Where this plan disagrees with the roadmap, the roadmap wins and this plan is
> wrong — except where `docs/plans/2026-08-07-RECONCILIATION-v0.7.0.md` says
> otherwise. §14 lists every place I believe the roadmap is factually wrong, with the
> measurement.

---

## 0. What F5 is, in one paragraph

Three sources can decide that a reader should speak without being spoken to: a
reading finishing, the querent opening the app, and a daily cron. Each of them calls
**one pure predicate** with the thread's state and a clock, and the predicate answers
with a trigger or with a reason for refusing. If it answers with a trigger, F5 selects
**exactly one piece of material** — a thing the run is about — writes a `chat_runs`
row, and stops. It never calls a model. F2's director and F3's voices do the talking,
through F1's engine, on the path they already have. **`C-N2e` is the load-bearing
rule: no material, no run.** A proactive message with nothing to be about produces
*"hai, apa kabar?"*, which is the emptiest thing this feature could ship, and it is
also the exact string the smoke script fails on.

---

## 1. Numbered invariants

These are the rules. Each has a reason and a failure mode, because a rule without one
is deleted by the next session that finds it inconvenient.

### `[F5-1]` A proactive run is a `chat_runs` row and nothing else exists

There is no `proactive_messages` table, no `is_proactive` column on `chat_messages`,
no `/api/chat/proactive` route, and no renderer that knows the difference. What made
a run proactive is `chat_runs.trigger`, which is `'reading_completed' | 'idle_nudge' |
'unanswered' | 'cron'` against `'user_message'`.

**Reason:** `C-D7` in as many words. The querent closing the tab mid-run and a reader
speaking first are the *same object in the same state*, so the badge, the delivery,
the lease, the validation and the erasure cascade are all already built.
**Failure mode:** a second pipeline means a second place for `C-R7`'s "there is no
error bubble" to be forgotten, a second place for `C-D13`'s gate to be absent, and a
second thing to audit on account erasure. It also means the feature can be broken in
a way that only shows up for messages nobody asked for — which is the half nobody
tests by hand.

### `[F5-2]` Eligibility is a PURE function with an injected clock, and it never touches the database

`src/lib/chat/proactive/eligibility.ts` — no `server-only`, no `@/lib/db/**`, no
`process.env`, no `next/*`. It takes a already-read `ThreadState`, an already-computed
`hasMaterial: boolean`, an already-resolved pair of numbers, and a `now: Date`.

**Reason:** `tally.ts`'s ruling, quoted: *"a heuristic is allowed to fail a build; it
is not allowed to fail a person."* Every gate below is a heuristic. A false positive
here is a reader messaging somebody at a moment that reads as tone-deaf, or asking
about a thing they already answered — and there is no undo in a group chat. The only
way that risk is payable is if every branch is enumerated in `npm test` with a fake
clock.
**Failure mode:** a predicate that reads the environment or the clock at call time is
untestable at the boundaries, and the boundaries are the whole feature — the run at
exactly `minGap`, the run on the day the counter rolls over, the run for an account
inside its erasure grace.

### `[F5-3]` `proactive_count_date` is a `string`, never a `Date`, and it is compared with `===`

`chat_threads.proactive_count_date` is a `date` column typed as `string` in
`schema.ts` (roadmap §3.1 already says so). F5 compares it to a `local_date` string
with `!==` and never parses it.

**Reason:** `local_date`'s trap verbatim (`CLAUDE.md`, `## Traps`). A `Date` renders
in the server's zone and is a day out for anyone in Jakarta between midnight and
07:00. The querent's calendar day is the only honest denominator for *"how many times
have the readers spoken to me today"*, because it is the day **they** are having.
**Failure mode:** `answersUpdatedAt`'s bug in a new place — a comparison that
*coerces and answers something*, so the cap is wrong for a third of every day with a
green typecheck and a green unit suite. `eligibility.test.ts` carries a case whose
fixture is the string `'2026-08-07'` and whose assertion fails if the parameter type
is widened to accept a `Date`.

### `[F5-4]` The mint makes no model call, and therefore reserves nothing

Not `reserveModelCall`, not `peek`, not `consume`. The mint is two indexed reads and
one insert.

**Reason:** `meter.ts`'s own argument for why `deferred` peeks before it consumes:
*"Consuming and then deciding to refuse would charge the window for a call that was
never made."* A mint is worse than that — it may never produce a call at all, because
the director may be shed, or the run may be superseded by `[F5-14]`, or the querent
may never come back.
**Failure mode:** every reading completion silently spends a slot in a five-hour
window shared with the product. `C-D6`'s whole promise is that a chat run never causes
a reading to fail; charging the ceiling at mint time breaks it at the cheapest
possible point.

### `[F5-5]` Under quota pressure the app accumulates pending runs; it never loses them, and the cron bounds the backlog

A shed `chat_turn` leaves the run `running` with beats remaining (`C-D6` consequence
3). A shed `chat_plan` leaves it `pending`. Neither is an error and neither is
retried by F5.

**Reason:** it is the single best argument for the run engine and it costs nothing to
honour.
**Failure mode:** an unbounded backlog. A week of quota pressure delivers seven-day-old
greetings the moment the ceiling clears, which is worse than never having spoken. So
`/api/cron/nudge` **abandons any run older than `PROACTIVE_RUN_TTL_HOURS` (default
48)**, and that sweep runs *before* the cron mints anything.

### `[F5-6]` A proactive run is minted invisibly. The dot fires on a stored bubble, never on a `pending` run

**Reason:** `M14`'s contract — *render nothing until you have something, and nothing
forever if you never do.* A dot that leads to an empty room is the worst version of
this feature: it trains the querent that the dot means nothing, which permanently
costs `C-N2b` its only notification surface. And `C-R6` makes a zero-beat plan a legal
outcome, so a dot on a `pending` run is a dot that can lead to nothing by design.
**Failure mode:** the querent taps a dot they did not cause and finds an empty room.
**This contradicts a sentence in `C-D7`** and is declared as a seam in §13 — `C-D7`'s
*"the red dot appears"* is about a run the querent already watched start, which is a
different case and is correct.

### `[F5-7]` A proactive run's beat sheet is never empty

`C-R6`'s *"the director may say nobody replies"* is an affordance for a **posted
message**, where not replying is a naturalness signal. Applied to a proactive trigger
it is a contradiction: nobody spoke, so there is nothing to decline to answer.

**Reason:** `[F5-13]`'s counter increments at mint, so a zero-beat proactive plan
spends the querent's daily budget on silence.
**Failure mode:** a director having a bad afternoon silences the feature for the day
with nothing on screen and nothing in the ledger to explain it. F2 owns the
enforcement; F5 owns the reason and states it here so the reconciliation can bind it.

### `[F5-8]` One material per run. Never a bundle

The selector returns `Material | null`, singular.

**Reason:** a message that mentions your reading, your recurring card and your
birthday in one breath is a newsletter, and a newsletter is precisely the thing
`C-N1b` forbids at the register level. A friend messages you about *one* thing.
**Failure mode:** three readers each pick a different item off the list and the room
delivers a digest. The single most bot-like output available to this workstream.

### `[F5-9]` The material is a *fact*, expressed; it is never a sentence for the reader to say

`describeMaterial()` returns structured fields plus short neutral prose. It never
returns *"Bilang ke dia kalau The Moon muncul lagi"*.

**Reason:** `effectiveYesNo()`'s rule and `validateChoice`'s rule and the admin
Insight prompt's rule, in a fourth place: where code knows something, code states it
and the model decides how to say it. And `V3`'s ruling on top — **the counts are
deleted from the material, not forbidden in it.** M4 hands over the Shadow Arcana, the
pulse line and the dominance word, exactly as `frequencyMechanic()` produces them, and
never `m` or `n`.
**Failure mode:** a model handed a sentence will paraphrase it, and three readers
handed the same sentence will paraphrase it three ways in one run. A model handed a
count will recite it — that is `V3`'s entire finding.

### `[F5-10]` No material means no run, and the refusal is measured

**Reason:** `C-N2e`, verbatim.
**Failure mode:** *"hai, apa kabar?"*. F7 charts `chat.proactive_evaluated` with
`outcome: 'skipped', reason: 'no_material'`; a high rate means the eligibility rules
are wrong, not that the querent is boring (`C-N2e`'s own sentence).

### `[F5-11]` A proactive message is timestamped when it was written

Nothing back-dates a `chat_messages.created_at`, and no run carries a "pretend this
arrived at" field.

**Reason:** `C-N2c`. The honest version is already good: they opened the app, and
there was a message.
**Failure mode:** the querent watches a timestamp appear and catches the lie once.
Note that this invariant is *free* under `[F5-1]`: a `pending` run has written no
messages yet, so there is nothing to back-date — the row is written when the beat
executes, which is when it is true.

### `[F5-12]` `reading_completed` is exempt from the silence gap. `idle_nudge` and `unanswered` are not

**Reason:** the gap gate exists to stop a reader filling dead air. A finished reading
is not dead air — it is a discrete thing the querent just did, at a moment they are
demonstrably present and looking at the app. Making Adrian wait three hours to react
to a reading taken three minutes ago is the feature not working.
**Failure mode:** either the reaction never lands (gap applied) or the room pings you
twenty minutes after every message (gap removed everywhere).

### `[F5-13]` The daily cap counts runs MINTED, and it does not refund

**Reason:** a limiter that refunds is a limiter with a race, and the refund path would
have to live inside F1's abandon handler, which F5 does not own. `[F5-7]` is what
makes non-refunding safe.
**Failure mode:** two `after()` callbacks on two lambdas both read `count = 1`, both
mint, and the cap is 3. Mitigated by the conditional `UPDATE … WHERE
proactive_count_today < :cap` returning a row count (§6.4) — the increment and the
check are one statement, which is the same shape as the lease.

### `[F5-14]` If the querent attaches reading X themselves, the `reading_completed` run for X does not fire

Seam `S5`, and F5 owns the rule. Both directions are covered; the mechanism is §9.

**Reason:** the querent bringing the reading into the room *is* the conversational
move. A reader saying *"eh, aku lihat bacaanmu barusan"* three seconds after the
querent said *"nih bacaanku barusan"* is two people talking over each other about the
same object, and it reads as a machine that did not notice.
**Failure mode:** duplicate, and it looks like a bug the querent can see.

### `[F5-15]` A soft-deleted account is never minted for

`users.deleted_at IS NOT NULL` refuses every trigger.

**Reason:** the thirty-day grace exists so somebody can change their mind. Messaging
them during it is the app arguing with a decision they made.
**Failure mode:** a person who pressed delete gets a friendly nudge from Thessaly.
There is no version of that which reads well.

### `[F5-16]` The cron shares `CRON_SECRET` with the sweep and 503s without it

Same secret, same `timingSafeEqual`, same 401 on mismatch, same 503 on absence.

**Reason:** `sweep/route.ts`'s header argues that an open endpoint which deletes rows
is worse than a sweep that never runs. `/api/cron/nudge` does not delete, but it
**writes rows into other people's chat rooms** and it fans out over every user — an
open version of it is a way to make the app message everybody. And a second secret is
a second thing to rotate, a second thing to have unset, and a second 503 nobody
recognises.
**Failure mode:** `CRON_SECRET` unset in Vercel and the nudge running unauthenticated,
or a second variable set on Production and forgotten on Preview.

### `[F5-17]` No driver error is ever logged from any path in this workstream

Roadmap non-negotiable 6, and it binds harder here than on the reading path: F5's
queries bind `chat_messages.body`, which is `C-D20` text a person typed, and
`readings.question`, which is `readings.question`.

**Reason:** a postgres error quotes the failing statement *and its bound parameters*.
**Failure mode:** the whole group chat in a production log. Production logs
`{ userId, trigger, sqlstate, errorClass }`; development prints the whole thing,
because there is nobody to leak it to.

### `[F5-18]` Nothing in F5 fails a reading, a page render, or a cron sibling

Every entry point wraps its own work. The reading route's `defer()` job catches and
logs; `/api/chat/state`'s `after()` catches and logs; the cron wraps each user
independently the way `sweep` wraps each delete.

**Reason:** roadmap non-negotiable 1, and `chain.ts`'s precedent — *"it NEVER THROWS,
it returns null. It is on the request path."*
**Failure mode:** one malformed thread row takes down the nudge for everybody, or a
chat mint throws inside the reading's `defer()` and takes `touchLastSeen` with it.

---

## 2. The Vercel Hobby cron limit

**Verified against Vercel's own documentation on 2026-08-07.**

| Source | Fetched | Says |
|---|---|---|
| `https://vercel.com/docs/cron-jobs/usage-and-pricing` (page `last_updated: 2026-07-15`) | 2026-08-07 | Hobby: **100 cron jobs per project**, **minimum interval once per day**, **scheduling precision per-hour (±59 min)**. *"Hobby accounts are limited to cron jobs that run once per day. Cron expressions that would run more frequently will fail during deployment."* |
| `https://vercel.com/docs/cron-jobs` (page `last_updated: 2026-06-16`) | 2026-08-07 | *"The timezone is always UTC."* Each invocation carries user agent `vercel-cron/1.0` and an `x-vercel-cron-schedule` header. |
| `https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan` | 2026-08-07 | Per-team limits removed and per-project limits raised to 100 on all plans, **2026-01-20**. |

### The number, and what follows from it

**A second cron job IS available. `vercel.json` gets a second entry and `sweep` is not
touched.** The roadmap's contingency — *"if a second job is not available, the nudge
folds into `sweep`"* — does not fire. This was true only for a window that closed on
2026-01-20; the "small number of cron invocations" sentence in
`src/app/api/cron/sweep/route.ts`'s header predates the change and is now stale (§14,
D1). **I am not editing that header — it is W7's file and the sentence is history
rather than a rule — but the reconciliation should know it no longer binds.**

### And the roadmap's 03:17 premise is wrong, in the querent's favour

The roadmap says *"`sweep`'s 03:17 is a terrible hour to message a person, so folding
means re-arguing `sweep`'s schedule."* **Vercel cron expressions are UTC.** `17 3 * *
*` is **10:17 WIB**, which is a perfectly ordinary hour to message somebody in
Jakarta. The premise was wrong and the conclusion it supported is moot anyway. Written
down because the next session to read §6.2 will otherwise re-derive a fold that is not
needed and re-argue a schedule that was never bad.

### The schedule I propose

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/sweep", "schedule": "17 3 * * *" },
    { "path": "/api/cron/nudge", "schedule": "0 12 * * *" }
  ]
}
```

`0 12 * * *` UTC is **19:00–19:59 WIB** (Hobby's ±59 min). Evening, after work, the
hour a person actually messages you. It is deliberately far from the sweep's 03:17
UTC so the two never share a warm lambda or a Neon wake-up, and it is **the one line
that changes if Miftah rules differently on quiet hours** (§5).

`x-vercel-cron-schedule` is *not* used as an authorisation signal — it is a header any
caller can set. `CRON_SECRET` is the only gate.

---

## 3. The three sources

Roadmap §6.2's table made concrete. **Source 2 is the mechanism; source 3 is the
enhancement**, and this design does not depend on the cron: with the cron removed
every run is still minted and still delivered, just later.

### Source 1 — a finished reading → `trigger: 'reading_completed'`

| | |
|---|---|
| **Fires from** | `src/app/api/reading/route.ts`, inside the **existing** `defer()`, as the **last** job. §8. |
| **Costs** | 2 indexed SELECTs + 1 INSERT + 1 conditional UPDATE. **No model call** (`[F5-4]`). Measured budget in §8. |
| **Material** | Always M1 (the reading that just finished). The selector is not consulted — the material is the trigger. |
| **If it fails** | Caught and logged, one line, no driver error (`[F5-17]`). The reading is already streamed and already stored; nothing the querent can see changes. The next open tick may pick the reading up as M1 anyway, because M1's detection is *"a reading since the last proactive run"* and not *"the reading in this request"*. **Self-healing by construction.** |
| **Must never** | Run before `persistReading` — `chat_runs.trigger_reading_id` is an FK to `readings.id` and the row does not exist yet. This is a hard ordering constraint, not a preference. Must never call a model. Must never fire for a reading whose `status` is `'blocked'` — W7 refused the question and the reader never spoke, so there is nothing to react to. Must never fire for a reading the querent has attached (`[F5-14]`). |

### Source 2 — the open tick → `trigger: 'idle_nudge' | 'unanswered'`

| | |
|---|---|
| **Fires from** | `GET /api/chat/state`'s `after()`. `C-D18`: *"That same call is the proactive tick. It is the one request this app can rely on a returning querent making."* `ChatButton` mounts on `/`, `/[reader]`, `/account` and `/history` (`C-D17`), so the tick fires on every page the querent actually lands on. |
| **Costs** | The eligibility read is one `chat_threads` row by PK plus one open-run existence check — **and F1 is already reading both to answer the request**, so the marginal cost of eligibility is zero. Material detection costs 1–3 further indexed queries and runs **only when eligibility has otherwise passed** (§4.6). Plus the warm, if §12 is granted. |
| **Material** | The selector, in the order of §4. |
| **If it fails** | Caught and logged. The response has already been sent; the badge is unaffected. |
| **Must never** | Delay the response — it is in `after()`, and `/api/chat/state` is the app's most-called endpoint. Must never mint more than one run per tick. Must never mint for a querent whose thread has an open run — the whole point is that runs are serial (`C-R5`: beats execute serially and never in parallel). Must never mint an `idle_nudge` into a room the querent has never opened (§4.7). |

### Source 3 — the daily nudge → `trigger: 'cron'`

| | |
|---|---|
| **Fires from** | `GET /api/cron/nudge`, `runtime = 'nodejs'`, `maxDuration = 60`, `CRON_SECRET` bearer. Once a day at `0 12 * * *` UTC. |
| **Costs** | One candidate query, then per candidate the same mint as source 2, **plus one `advance` call per minted run** — see below. Bounded by `NUDGE_MAX_USERS` (default 8) and by a wall-clock budget of 45s inside the 60s ceiling. |
| **Material** | The selector, same order, with `idle_nudge`'s source rules (§4.7). |
| **If it fails** | Each candidate is wrapped independently, `sweep`'s pattern: *"One failing sweep must not stop the other two."* The route returns 200 with a result object and a `failures[]` array; a total failure is visible in the platform log as one `[cron] nudge` line with a non-empty `failures`. Nothing retries. Tomorrow's run picks the same candidates up. |
| **Must never** | Fan out unbounded. Must never mint into a room the querent has never opened (§4.7) — the cron is the one source with nobody present, and cold-calling into an unopened room is the tone-deaf case this workstream exists to avoid. Must never use a `Date` for the day counter (§4.8 states exactly which way it is wrong and why that is the safe direction). |

**The cron does three things, in this order, and the order is the argument:**

1. **Abandon expired runs** (`[F5-5]`) — any `chat_runs` row `pending | planning |
   running` older than `PROACTIVE_RUN_TTL_HOURS`, with an expired lease. First,
   because a room with a stale open run is ineligible for a fresh one, and reaping
   after minting would leave those querents skipped for another day. Same argument
   `sweep`'s header makes for running erasure first.
2. **Mint** for eligible candidates.
3. **Advance one beat** of each run it just minted, and of any run left `pending` by
   an earlier source. **This is why the cron is worth having.** Sources 1 and 2 mint
   while the querent is in the app, so their runs are warmed by the next tick or by
   `/chat` itself; a cron run has nobody to warm it, and an unwarmed run produces no
   bubble, and no bubble means no dot (`[F5-6]`). **A cron that only mints does
   nothing a querent can see.**

Step 3 is the fan-out risk. A `chat_plan` call is a large prompt and a tiny reply; a
`chat_turn` is a large prompt and a two-sentence reply. Budget ~6s each, so 45s of
wall clock is ~7 beats. `NUDGE_MAX_USERS = 8` is set from that, not from a guess, and
the route stops advancing (but not minting) when the budget is spent. **At a scale
where 8 is too few, the fix is not a bigger number — it is that the cron mints only
and a queue drains it, which is a v0.8.0 mechanism named here so nobody invents it in
an emergency.** The current scale is a consent screen in Testing mode with two
manually-added accounts.

---

## 4. The material catalogue

`C-N2e`'s enumeration, made concrete. **Six kinds. The list is closed and lives in
`src/lib/chat/proactive/material.ts` as a discriminated union**, so a seventh is a
compile error at the `switch` in `describeMaterial()` rather than an `undefined`
handed to a director — the `Record<Locale, …>` facade argument applied to a different
axis.

### 4.1 The six

#### M1 — a reading since the last proactive run

- **Detected by:** `readings` where `user_id = :u`, `created_at > coalesce(chat_threads.last_proactive_at, epoch)`, `status <> 'blocked'`, `body is not null`, `id` not already a `chat_runs.trigger_reading_id`, and `id` not present as a `chat_messages.attached_reading_id` (`[F5-14]`). Ordered `created_at desc, id desc` — the `id` tiebreak for `recallableReadings`' stated reason: `now()` is transaction-start time, so two rows written in one transaction share a timestamp and `created_at desc` alone is not a total order. Limit 1. Cards from `reading_cards` in a second query, `recallableReadings`' shape.
- **Strength:** **strongest.** It is the only material that is about something the
  querent *did*, deliberately, in the last few hours. It is also the only one whose
  trigger is an event rather than a scan.
- **Expressed as:** `{ kind: 'reading', readingId, readerId, serviceId, cards: [{cardId, reversed}], gist, verdict, choice, hadQuestion, localDate }`.
  **Never `body`.** F3's context assembler decides what the readers see of a reading
  (roadmap §7, F3: *"which fields — `gist`, `question`, cards, or the body?"*); F5's
  job is to name *which* reading, and to hand over the fields cheap enough to sit in
  a plan prompt. `hadQuestion` is the boolean and never the question, following
  `RecalledReading`'s stated reason: *"the raw question is not"* model output and
  dropping it removes injection surface and tokens in one move.
- **Must never:** carry a `PILIHAN:`/`CHOICE:` marker. `readings.body` is the stripped
  body by construction (the route's `defer()` splits before `persistReading`), and F5
  does not read `body` at all, so this is satisfied by not doing anything. Written
  down because F6's plan has the same rule for the attachment and somebody will
  wonder why F5's is missing.

#### M2 — a reader question the querent never answered

**This is `C-N1d` and it gets its own section, §7.** In summary: the most recent
reader message whose beat intent was `ask`, with no user message after it, aged
between `CHAT_PROACTIVE_MIN_GAP_SECONDS` and `UNANSWERED_MAX_AGE_HOURS`, whose id has
not already been a `chat_runs.trigger_message_id`.

- **Strength:** **strong**, and the most dangerous. `C-N1d`: *"a reader who asks and
  then never refers to the answer is worse than one who never asked."* The inverse is
  also true and is the failure this material courts: a reader who asks and then
  **chases** is worse than both.
- **Expressed as:** `{ kind: 'unanswered', messageId, readerId, askedAgoHours }`. The
  text of the question is not copied into the material — `C-R5` and F3's context
  window already put the actual message in front of the voice, and copying it would
  make the run's prompt carry the same sentence twice, which is how a model decides
  the sentence is important and repeats it.

#### M3 — a bubble nobody replied to

- **Detected by:** the thread's last message is authored by a reader, its run is
  `done`, its intent is **not** `ask` (that is M2), it is older than the gap, and
  `chat_threads.last_user_message_at` is older than it.
- **Strength:** **medium.** In a real group, a message nobody answered is normal and
  usually stays that way. This material is legitimate when a reader has something to
  *add*, and illegitimate as a *"anyone there?"*.
- **Expressed as:** `{ kind: 'orphan', messageId, readerId, ageHours }`, and the
  director is told the intent is to **continue, never to check in**. F2 owns the beat
  intent; F5 owns saying which of its intents this material admits.
- **Must never:** fire twice for the same message. Same `material_key` mechanism as
  everything else (§4.5).

#### M4 — a recurring card

- **Detected by:** `firstPassingWindow(db, { userId, today, birthDate })` from
  `src/lib/memory/frequency.ts` — V3's existing ladder, `VERDICT_LADDER` =
  `['week','d13','month','year']`, walked narrowest-first and stopping at the first
  window that passes `passesGate()`. Then `frequencyMechanic(top, second, locale)`
  from `src/lib/memory/shadow.ts`.
- **Strength:** **medium**, and it is the material with the longest shelf life, which
  is exactly why it needs the hardest de-duplication. `firstPassingWindow` will return
  the same window with the same top pair for days.
- **Expressed as:** the seven fields `FrequencyMechanic` already carries — `topName`,
  `secondName`, `shadowName`, `shadowCardId`, `shadowCollision`, `pulseNumber`,
  `pulseGloss`, `dominance` — plus `windowPhrase(key, locale)`. **And nothing else.**
- **Must never:** carry `m`, `n`, `topCount`, `readings`, or any number that is a
  count. V3's ruling in capitals: *"THE COUNTS ARE DELETED FROM BOTH PROMPTS, NOT
  FORBIDDEN IN THEM. A model cannot recite a count it was never given."* And
  `FrequencyMechanic`'s key set is asserted exactly in `shadow.test.ts` *"because the
  way a tally returns is somebody adding `topCount` for a good-looking reason."* F5
  passes the object through; it does not build its own. **`tally.ts` is the third line
  of defence and the smoke script is where it runs (§11) — never at request time
  (`[F5-2]`'s reason, V3-11).**

#### M5 — a date that matters

Three occasions, in a closed union, checked in this order:

1. `birthday` — `profiles.birth_date` (a `string`, `dateCol`) month and day equal the
   querent's `local_date` month and day.
2. `first_reading_anniversary` — the anniversary of `min(readings.local_date)`, at
   one year or more.
3. `return` — `users.last_seen_at` more than 14 days before now, i.e. they came back.

- **Strength:** **strongest when it hits, and it almost never hits.** A birthday is
  the one day of the year when a message from three people who know you is
  unambiguously welcome.
- **Expressed as:** `{ kind: 'occasion', occasion: 'birthday' | 'first_reading_anniversary' | 'return', years?: number }`.
- **Must never:** compute or hand over an **age**. `profiles.birth_date` is a full
  date and the readers do not need the year — a reader who knows how old you are is a
  reader who read your file, and it is one sentence away from the register `C-N1b`
  forbids. `years` is present only for `first_reading_anniversary`, where it is a fact
  about the app rather than about the person.
- **Must never:** use a `Date` for the month/day comparison. The birthday is compared
  string-to-string on the `MM-DD` slice of `local_date`, which is the querent's day.
  A server-side `getMonth()` wishes somebody happy birthday a day early in Jakarta.

#### M6 — a Lotus fact newly relevant

- **Detected by:** `lotus_avatars.updated_at > coalesce(chat_threads.last_proactive_at, epoch)` — i.e. the querent edited or cleared an onboarding answer since the readers last spoke, and the distillation has been rebuilt.
- **Strength:** **weakest of the six, and it is the one I would cut first** if the
  reconciliation wants five. It is included because it is on `C-N2e`'s own list and
  because it is the only material that fires from `/account`, which is otherwise a
  dead end for this feature.
- **Expressed as:** `{ kind: 'lotus', summary }` — `lotus_avatars.summary`, keyed by
  locale, **which is model output that already passed `lotusSafetyCheck`**, so `A5`'s
  abstraction rule is satisfied without F5 touching `onboarding_answers` at all. **F5
  never decrypts anything.** `C-D8` condition 1 says the decryption happens in exactly
  one new place and that place is F3's assembler; F5 is not it and must not become it.
- **Must never:** fire when the edit *cleared* an answer to null. A reader remarking
  on a thing you just deleted is `C-D8` condition 5's failure (*"a reader who asks
  about the thing you refused to answer is the worst possible version of this
  feature"*) arriving through the back door. The detection therefore also requires
  `lotus_avatars.summary` to be non-empty and the count of non-null
  `onboarding_answers` rows not to have decreased — which F5 cannot see without a
  second query, so the honest implementation is: **M6 requires
  `answerPresence(db, userId)` to report the same number of present answers as the
  Lotus's own `traits` imply, and refuses otherwise.** `answerPresence` decrypts
  nothing, which is why it is the right function.

### 4.2 The order, and why it is fixed rather than scored

```
M5 occasion  >  M1 reading  >  M2 unanswered  >  M4 recurring  >  M3 orphan  >  M6 lotus
```

A fixed order, not a score. **Reason:** a score is a number somebody tunes, and a
tuned number needs a corpus, and there is no corpus — this feature has never run. The
order encodes three judgements that do not need tuning: an occasion is rarer and more
welcome than anything else; a thing the querent just did beats a thing the app
noticed; an unanswered question is more urgent than a pattern, because a question
decays and a pattern does not.

**Tie-break:** none needed — the kinds are mutually exclusive at detection and the
first hit wins.

### 4.3 Detection is lazy, in that order

`selectMaterial()` runs the six detectors **in order and stops at the first hit**,
`firstPassingWindow`'s pattern and its stated reason: *"the overwhelming majority of
users pass on `week` and stop after one pair of index scans. Fanning all four out
would quadruple the database work for the common case."* Here the common case is M1 or
nothing, so the common cost is one indexed query.

The exception is source 1, which does not run the selector at all — its material *is*
the trigger.

### 4.4 What the director receives

`describeMaterial(material, locale)` returns:

```ts
type MaterialBrief = {
  kind: MaterialKind;              // the discriminant, for the director's own switch
  facts: Record<string, string | number | boolean>;  // scalars only
  replyTo: string | null;          // a chat_messages.id the director MAY point a beat at
  note: string;                    // ONE short neutral line, per locale, from a fixed table
};
```

- **`facts` is scalars only**, `sanitizeProps()`'s discipline applied to a prompt: no
  arrays, no nesting. A card list is `cards: 'The Moon, The Tower (terbalik), The Star'`,
  built by F5, so the director cannot receive a shape it has to parse.
- **`note` comes from a fixed per-locale table in `src/lib/chat/proactive/notes.{id,en}.ts`
  behind a `Record<Locale, …>` facade**, exactly as `base.ts` → `base.{id,en}.ts` does,
  so a missing locale is a compile error rather than `undefined` handed to a model
  (`CLAUDE.md`, `## The prompt`). The English half is **rewritten, not translated**
  — I5's rule, and the enforcement is that a reviewer can see a translated note in
  five seconds.
- **`replyTo`** is how M2 and M3 reach `C-D11` without a second mechanism: the
  director is already handed the last N messages with their ids and their ages and
  *"may point a beat at any of them"*. F5 names one. **F5 does not construct a beat**
  — that is F2's and F5 must not touch it.

### 4.5 De-duplication: `chat_runs.material_key`

**`## Schema deltas` request (§10, delta 2).** One nullable text column plus a unique
index.

```
material_key text null
unique index chat_runs_material_key_uq on chat_runs (user_id, material_key)
  where material_key is not null
```

The key is opaque and built by F5:

| Kind | Key |
|---|---|
| M1 | `reading:<readingId>` |
| M2 | `ask:<messageId>` |
| M3 | `orphan:<messageId>` |
| M4 | `freq:<windowKey>:<fingerprint>` — `fingerprintOf()` from `frequency.ts`, which V3 already proved sufficient for exactly this question |
| M5 | `occasion:<occasion>:<YYYY>` |
| M6 | `lotus:<lotusUpdatedAtIso>` |

**A UNIQUE CONSTRAINT AND NOT A CHECK-THEN-INSERT**, because the mint runs from three
entry points on three lambdas and *"has this material been used"* asked before an
insert is a race with a window measured in milliseconds. The insert either succeeds or
violates, and a violation is a **normal outcome logged as `skipped/duplicate`**, never
an error.

**NULLs are DISTINCT here and that is correct.** `user_message` runs carry no
`material_key`, and there are many of them. This is the opposite of V7's
`share_links` constraint, whose whole trap was that Postgres treats NULLs as distinct
— **do not "fix" this index to `nulls not distinct`**, which would permit exactly one
`user_message` run per querent, forever, and would present as the chat silently
refusing to answer anybody after their first message.

**M4's key contains the fingerprint, which is what makes it self-expiring:** the
verdict changes when the card counts change, the fingerprint moves, and a new key
becomes available. Until then the readers say nothing about it again, which is the
behaviour a person has.

### 4.6 Material detection runs LAST among the gates

`checkEligibility()` is called with `hasMaterial` already resolved, so the caller must
decide when to pay for it. **The caller runs the cheap gates first** — flag, open run,
gap, daily cap, deleted account — and only then detects material.

**Reason:** the cheap gates refuse the overwhelming majority of ticks (there is
usually an open run, or the gap has not elapsed, or the cap is spent), and material
detection is 1–3 queries. Paying for it before the gap check would put three queries
on every page view in the app.

This means the pure predicate is called **twice** in the general case — once with
`hasMaterial: true` as an optimistic probe to see whether anything *else* refuses, and
once for real. That is ugly, so instead the predicate returns its refusals in a fixed
order and the caller reads them:

```ts
const pre = checkEligibility({ ...input, hasMaterial: true });
if (!pre.ok) return skip(pre.reason);          // cheap gates only; 'no_material' unreachable
const material = await selectMaterial(db, userId, ...);
if (!material) return skip('no_material');
```

`no_material` is the **last** branch in the predicate, which is what makes the probe
sound. `eligibility.test.ts` asserts the ordering by name, because reordering the
branches would make the probe pass a run the real call would refuse.

### 4.7 A room the querent has never opened

`chat_threads.last_read_at IS NULL` means the room has never been looked at.

| Source | May seed a never-opened room? | Why |
|---|---|---|
| `reading_completed` | **Yes** | It is tied to something they just did. A dot appearing after their first reading is the feature working, and it is the introduction to the room. |
| `idle_nudge` / `unanswered` (tick) | **Yes** | They are in the app right now. |
| `cron` | **No** | The one source with nobody present. A message arriving overnight into a room they have never seen is the app cold-calling them. |

`unanswered` into a never-opened room is unreachable in practice — there can be no
unanswered reader question in a room with no messages — and the table says "yes"
rather than special-casing it, because a rule with an unreachable branch is cheaper
than a rule with an exception.

### 4.8 The day counter and the cron's one honest inaccuracy

Sources 1 and 2 have a client and therefore a `local_date`: the reading route already
reads `LOCAL_DATE_HEADER` and holds `localDate.date`, and `GET /api/chat/state` must
send and read the same header (§10, interface I3).

**The cron has no client and therefore no `local_date`.** It uses
`utcDateString()` from `src/lib/analytics/localdate.ts`.

**The consequence, stated so nobody "fixes" it into the other one:** for a querent in
UTC+7, between 00:00 and 07:00 WIB the cron's UTC date is still *yesterday*. If the
counter's stored `proactive_count_date` is already today-in-WIB, the cron sees a
different string, resets the counter to 0, and grants **one extra** proactive run.
**The failure is a bounded overcount of one, never an undercount that silences the
feature.** That is the safe direction, and it is the direction the cron's own
schedule makes almost unreachable: `0 12 * * *` UTC is 19:00 WIB, which is the same
calendar day in both zones.

The alternative — reading each candidate's last-known `local_date` off their most
recent `readings` row — is one query per candidate inside a fan-out, to buy a
correction to a case the schedule already avoids. Declined, and recorded.

---

## 5. Quiet hours

**Roadmap `Q2` is Miftah's to rule on and this plan does not resolve it.** Both
options, with their costs, and the design that makes either a one-line change.

### The hard constraint

**The server does not know the querent's timezone.** Nothing in `users`, `profiles` or
`chat_threads` carries one. The only timezone signal that exists anywhere in this app
is `local_date`, the `YYYY-MM-DD` a client sends in `LOCAL_DATE_HEADER` — and a date
gives you the querent's zone to a resolution of **±1 day**, which is useless for an
hour-of-day question. `local_date` also only exists *when a client sends it*, which is
never, for the cron.

### The structural argument, which is why I recommend Option A

**Sources 1 and 2 mint only when the querent is demonstrably awake and in the app.**
Source 1 fires in a reading's `after()`; you cannot take a reading in your sleep.
Source 2 fires in `GET /api/chat/state`'s `after()`; that request exists because a
page mounted `ChatButton`, which means somebody navigated. If it is 03:00 for them,
they are up at 03:00 with the app open, and a message is not tone-deaf — it is the
room they are looking at.

**Source 3 is the only one that messages somebody who is not there. Its quiet hours
are its cron schedule.** UTC, chosen once, one line in `vercel.json`.

So the whole of `Q2` reduces to *which UTC hour*, and the answer is a line of JSON.

### Option A — no quiet-hours predicate. **Recommended.**

- **Cost:** a querent whose zone is far from WIB gets their cron nudge at an odd
  hour. `0 12 * * *` is 19:00 WIB, 05:00 in Los Angeles, 13:00 in London. The app's
  audience is Indonesian, the consent screen is in Testing mode with two Jakarta
  accounts, and the copy is Indonesian-first.
- **Cost:** a querent who opens the app at 03:00 may get an unprompted run. Argued
  above as not a cost.
- **Benefit:** no new column, no new header, no migration delta, nothing to keep in
  step, and the predicate stays pure with one fewer input.
- **The one-line change:** the `schedule` string.

### Option B — an explicit quiet-hours predicate

- **Needs:** a `chat_threads.utc_offset_minutes integer null` column (§10, delta 3),
  populated from a **new** client header sent by F4 (`Intl.DateTimeFormat().resolvedOptions().timeZone`
  or `-new Date().getTimezoneOffset()`), on every request that already sends
  `LOCAL_DATE_HEADER`.
- **Cost:** a column that is NULL for every querent until they next open the app, so
  the predicate needs a defined behaviour for NULL — and the only two candidates are
  *"assume WIB"* (which is Option A wearing a column) and *"do not mint"* (which
  silences the feature for everybody until F4's header ships and every querent
  returns).
- **Cost:** F4 must send a header it does not otherwise need, and `[F5-2]`'s pure
  predicate grows an input whose absence is the common case.
- **Cost:** **it needs migration `0014` to carry the column, which means the
  reconciliation must fold it before F1 is built.** If the ruling arrives after F1
  lands, it is `0015` — the one migration number §0.4 reserves and asks us not to
  spend.
- **Benefit:** honest quiet hours for sources 1 and 2 as well, if Miftah judges that a
  reader speaking unprompted at 03:00 is wrong *even to somebody who is awake*.

### How either ruling is one line

`checkEligibility()` takes an optional `quietHours: { fromHour: number; toHour: number; offsetMinutes: number | null } | null`, **defaulting to `null` = Option A**, and the
branch is:

```ts
if (input.quietHours && inQuietHours(input.now, input.quietHours)) {
  return { ok: false, reason: 'quiet_hours' };
}
```

`inQuietHours` is written, exported and unit-tested **in this workstream**, with the
`reason` in the union and the event prop already declared. Option A ships it dead.
Option B ships the column and the header and passes a non-null value. **The predicate
does not change either way**, which is the property the brief asked for.

---

## 6. Eligibility

`src/lib/chat/proactive/eligibility.ts` — **PURE, a LEAF.** No `server-only` (the
smoke script imports it, `tally.ts`'s rule), no `next/*`, no `@/lib/db/**`, no
`process.env`. It imports types from `@/lib/chat/types` (F1's, PURE) and `@/data/types`
and nothing else. `clientBoundary.test.ts` gets a fence for `@/lib/chat/proactive/**`
with this file as the single exception, `lines.ts`'s precedent.

### 6.1 The shapes

```ts
export type ProactiveTrigger = 'reading_completed' | 'idle_nudge' | 'unanswered' | 'cron';

export type ProactiveSource = 'reading' | 'tick' | 'cron';

/** Everything the predicate needs about the room. Read once, by the caller. */
export type ThreadState = {
  lastReadAt: Date | null;
  lastUserMessageAt: Date | null;
  lastReaderMessageAt: Date | null;
  lastProactiveAt: Date | null;
  proactiveCountToday: number;
  /** THE QUERENT'S CALENDAR DAY, AS A STRING. Never a Date. [F5-3] */
  proactiveCountDate: string | null;
  /** A run in pending | planning | running. F1's query answers it. */
  openRun: boolean;
  /** users.deleted_at IS NOT NULL. [F5-15] */
  erased: boolean;
};

export type EligibilityInput = {
  source: ProactiveSource;
  thread: ThreadState;
  /** The querent's calendar day. A STRING. utcDateString() for the cron (§4.8). */
  localDate: string;
  /** CHAT_ENABLED && CHAT_PROACTIVE_ENABLED, resolved by the caller at call time. */
  enabled: boolean;
  hasMaterial: boolean;
  minGapSeconds: number;
  maxPerDay: number;
  quietHours: QuietHours | null;   // §5. null under Option A.
  now: Date;                        // injected. [F5-2]
};

export type Eligibility =
  | { ok: true; trigger: ProactiveTrigger; countedDay: string; resetCounter: boolean }
  | { ok: false; reason: EligibilityRefusal };

export type EligibilityRefusal =
  | 'flag_off'
  | 'erased'
  | 'open_run'
  | 'never_opened'
  | 'quiet_hours'
  | 'gap'
  | 'daily_cap'
  | 'no_material';
```

### 6.2 The gates, in order, and the order is load-bearing

1. **`flag_off`** — `!input.enabled`. `C-D15`: `CHAT_PROACTIVE_ENABLED=0` stops
   unprompted runs only, on `ANALYTICS_ENABLED`'s rule (**only the exact string
   `'0'`**), and `CHAT_ENABLED=0` stops all generation. Both read **at call time**,
   by the caller, never at module scope — a module-scope `const` is inlined by the
   bundler and freezes the build-time value, which is the exact property the flag
   exists to provide.
2. **`erased`** — `[F5-15]`.
3. **`open_run`** — a run in `pending | planning | running`. `C-R5` makes beats
   serial; two concurrent runs in one room would interleave two conversations.
4. **`never_opened`** — `thread.lastReadAt === null && source === 'cron'`. §4.7.
5. **`quiet_hours`** — dead under Option A. §5.
6. **`gap`** — **skipped entirely when `source === 'reading'`** (`[F5-12]`). Otherwise:
   `max(lastUserMessageAt, lastReaderMessageAt, lastProactiveAt)` must be at least
   `minGapSeconds` in the past. All three, not just the last proactive one — a room
   that was busy ten minutes ago does not need somebody to break the silence.
7. **`daily_cap`** — if `thread.proactiveCountDate !== input.localDate` the counter is
   stale and the answer is `resetCounter: true, count treated as 0`. Otherwise
   `thread.proactiveCountToday >= input.maxPerDay` refuses.
8. **`no_material`** — `!input.hasMaterial`. **LAST, and §4.6 depends on it being
   last.** `eligibility.test.ts` asserts the ordering by name.

The trigger returned:

| source | trigger |
|---|---|
| `'reading'` | `'reading_completed'` |
| `'cron'` | `'cron'` |
| `'tick'` | `'unanswered'` if the material is M2, else `'idle_nudge'` |

The tick's two triggers are the one place the trigger depends on the material, so
`checkEligibility` takes `materialKind: MaterialKind | null` alongside `hasMaterial`
rather than inferring. **`chat_runs.trigger` is a closed set that F5 owns (roadmap
§3.3) and it is the column F7 groups `/admin/chat` by**, so it must say what happened,
not which entry point ran.

### 6.3 `CHAT_PROACTIVE_MIN_GAP_SECONDS` — default **10800** (3 hours)

**The argument, not the number.**

- **The lower bound is set by what reads as a machine.** A room that pings you
  twenty minutes after the last message, unprompted, is a notification engine. There
  is no version of "Adrian thought of you" that is true 20 minutes after Adrian last
  spoke.
- **The upper bound is set by the cron.** A gap of 24 hours would make the daily cron
  the only source that ever fires, which is the design the roadmap calls wrong
  (*"a design that depends on the cron is wrong"*).
- **Three hours is chosen because it is the shortest interval over which "it has gone
  quiet" is a true statement about a group chat.** An afternoon of silence followed
  by somebody saying something is what a group does. It also composes with the daily
  cap: three hours gives at most ~5 eligible windows in a waking day and the cap
  takes 2 of them, so the cap binds and the gap shapes.
- **It is not the reading path's gate** (`[F5-12]`), which is what stops this number
  having to be short.
- **It is a guess, and it is labelled one.** `PERSONA_MIN_AGE_SECONDS=3600`'s
  precedent, recorded rather than hidden: the only instrument that can move it is
  `C-N2f`'s reply rate over weeks on a real phone. **Measure before moving it.**

### 6.4 `CHAT_PROACTIVE_MAX_PER_DAY` — default **2**

- **1 is a newsletter.** One message a day, at roughly the same time, from the same
  cron, is a scheduled broadcast and reads as one.
- **3 or more is a notification machine.** A run is 1–4 messages from 1–3 readers
  (`C-D1`), so three runs is up to twelve unprompted bubbles in a day. Twelve is how
  you get muted, and there is no mute in this app short of not opening it — which is
  the metric the release is judged by.
- **2 gives the day a shape** — something in the afternoon, something in the evening
  — without being able to become a stream.
- **It counts runs MINTED and does not refund** (`[F5-13]`), which is only safe
  because `[F5-7]` forbids an empty proactive beat sheet.

**The increment is one conditional statement, not a read followed by a write:**

```sql
update chat_threads
   set proactive_count_today = case when proactive_count_date = :localDate
                                    then proactive_count_today + 1 else 1 end,
       proactive_count_date  = :localDate,
       last_proactive_at     = :now,
       updated_at            = :now          -- BY HAND. $onUpdate() does not fire here.
 where user_id = :u
   and (proactive_count_date is distinct from :localDate
        or proactive_count_today < :maxPerDay)
returning proactive_count_today;
```

Zero rows returned means somebody else won the race and the cap is spent — the mint
is abandoned and logged as `skipped/daily_cap`. **This is the lease's shape applied to
a counter**, and it is why the pure predicate's `daily_cap` branch is an
*optimisation* rather than the enforcement: the enforcement is in the `where` clause.
`updated_at` is set by hand because `$onUpdate()` does not fire inside
`onConflictDoUpdate` and this repo has been bitten by the column silently freezing.

### 6.5 What eligibility does NOT gate on

- **The model-call ceiling.** `[F5-4]`. The shed happens at advance time and is
  `deferred` by `C-D6`.
- **The rate limiter.** There is no querent action to limit. F1 owns `chat:` for the
  posted-message path.
- **`LLM_WINDOW_CHAT_CEILING`.** Same reason; it is checked before
  `reserveModelCall`, which F5 does not call.

---

## 7. The unanswered-question loop

`C-N1d`: *"a reader who asks and then never refers to the answer is worse than one
who never asked."* Detecting *"the querent never answered Thessaly's question"* is
this workstream's strongest material and its easiest false positive. It gets its own
section because the obvious implementation is wrong in four ways.

### 7.1 The signal is DECLARED, never detected from the text

**Do not look for a question mark.** A `?` at the end of a bubble is not a question
the querent owes an answer to — Adrian's register is full of *"kan?"*, *"iya nggak?"*
and rhetorical tags, and Margaret's is full of the reflective kind that is not
addressed to anybody. A text heuristic here is `CLAUDE.md`'s bare-`lagi` trap in a
new costume: a pattern that fires on most sentences of casual Indonesian and reports
a rate that is entirely noise, and that rate is what decides whether the feature is
cut or tightened.

**The beat sheet already declares it.** `C-N1d`: *"A beat's intent may be `ask`, the
director is told to use it, and F7 measures the rate."* So the signal is
`beats[beat_index].intent === 'ask'` for the beat that produced the message — a fact
the director *stated*, not one F5 inferred.

This is `effectiveYesNo()`'s rule in a fifth place: **where the system already knows
something, do not ask a heuristic to re-derive it.**

### 7.2 `chat_messages.intent` — a column, not a JSON walk

**`## Schema deltas` request (§10, delta 1).** `chat_messages.intent text null`, the
beat's declared intent denormalised onto the message it produced, written by F1's
engine at the same moment it writes `run_id` and `beat_index`. NULL for a user
message.

**Why a column and not `chat_runs.beats -> beat_index -> intent`:**

- The JSON shape is **F2's** and is quoted verbatim in F2's plan (seam `S1`). F5
  reading into it makes F5 a consumer of a contract it does not own and cannot see
  changing — F2 renaming `intent` to `move` would break F5's material silently, with
  a green typecheck, because JSON is `unknown`.
- The query is *"the most recent reader message with intent `ask`"*. Against a column
  that is `(user_id, created_at desc)`-indexed it is one index scan. Against
  `jsonb` it is a join to `chat_runs` plus a subscript per row, unindexable.
- F7 gets a free intent-distribution panel, which `C-N1d` asks it to measure anyway.

**No `CHECK` constraint on it**, deliberately: the closed set is F2's and it is
already checked by `validatePlan`. A `CHECK` here would mean F2 cannot add an intent
without a migration, which is exactly the coupling the column exists to remove.

### 7.3 Four false positives and what refuses each

| # | The false positive | Refused by |
|---|---|---|
| 1 | **Nagging about three questions.** A run of three beats can contain three `ask`s. Following up on all three is an interrogation. | **Only the single most recent `ask` is ever material.** `order by created_at desc, id desc limit 1`. |
| 2 | **Nagging twice about one question.** Ask, nudge, nudge, nudge. | **Once per ask, enforced by `material_key = 'ask:<messageId>'` and the unique index** (§4.5). Also by `chat_runs.trigger_message_id`, which §10 widens to carry the asking message for this trigger. |
| 3 | **Chasing four minutes later.** | The `gap` gate (`[F5-12]` does not exempt `unanswered`), plus `UNANSWERED_MIN_AGE_SECONDS` defaulting to the same `CHAT_PROACTIVE_MIN_GAP_SECONDS`. |
| 4 | **Resurrecting a dead question.** Following up on something asked last Tuesday reads as a cron job that found a row. | **`UNANSWERED_MAX_AGE_HOURS`, default 48.** An ask older than that is not material at all — it is not "still unanswered", it is "over". |

### 7.4 The two false positives nothing can refuse, named

- **The querent answered elsewhere.** Thessaly asks about a dream; the querent, moved,
  goes and takes a reading about it instead of replying. There is no join that sees
  that. The honest controls are the 48-hour death and the once-per-ask rule, and the
  cost of getting it wrong is one slightly off-key follow-up, not a wrong claim.
- **The querent answered without answering.** They replied *"nanti aku cerita"* and
  the question is still open. The detection sees a user message and calls it answered,
  which is the **safe** direction: a missed follow-up costs a bubble; a spurious one
  costs the querent's patience. **Biased towards refusing**, which is
  `validateChoice`'s bias and the opposite of `validateTurn`'s — and the reason is
  the same reason each time: bias toward whichever error is cheaper. Here a false
  positive is the app being obtuse *at* somebody, so it is the expensive one.

### 7.5 Closing the loop, which is `C-N1d`'s actual demand

Detection is half. The other half is that the follow-up **refers to** the question
rather than **repeats** it. F5's contribution is `MaterialBrief.replyTo = messageId`,
which lets the director point a beat at the original bubble (`C-D11`, a column not a
mechanism), so the room renders a quote stub and the reader is visibly picking a
thread back up rather than asking again. **F3's `validateTurn` is where a
near-verbatim repeat would be caught, and it is not caught today** — recorded in
§15 as an open question rather than solved here, because the register is F3's.

---

## 8. The reading route's `after()` budget

### 8.1 What is already out there

`src/app/api/reading/route.ts`, `maxDuration = 60`, `runtime = 'nodejs'`:

- `after(() => scheduleLotusRefresh(user.id))` — **conditional** on `!lotus ||
  lotus.stale`, its own `after()`, and it is a **model call**. Its header explains why
  it keeps its own callback rather than joining the queue.
- `after(() => recordModerationFlag(...))` — conditional on a category, its own
  `after()`.
- `after(() => hitRefusal(user.id))` — refusal path only.
- **One `defer()`**, which is the queue, and inside it, in order:
  1. `await Promise.race([done, streamTimeout()])` — parks up to
     `ANALYTICS_STREAM_TIMEOUT_MS` (**45s** default);
  2. `splitChoiceMarker` + `validateChoice` (pure);
  3. three `track()` calls (buffered);
  4. `await persistReading(...)` — the transaction, with a bounded retry
     (`ANALYTICS_RETRY_BUDGET_MS`, 5s);
  5. `void recordCall(...)` — buffered, not awaited;
  6. `await extractGist(...)` — **a model call**;
  7. `detectCallback` (pure);
  8. `await touchLastSeen(user.id)`.

So the invocation's remaining time after the stream settles is spent on: one
transaction, one model call inside the queue, and one model call outside it. The
header's own arithmetic: *"A `spread3` stream is well under 30 seconds and the retry
budget is 5, so 60 is headroom — it is not a guarantee."*

### 8.2 What a fourth job costs

The mint is:

| Step | Cost |
|---|---|
| read `chat_threads` by PK + open-run existence | 1 round trip (one query, a join or two selects F1 sizes) |
| `checkEligibility` | pure, microseconds |
| M1 is the trigger — no selector, but the suppression check (`[F5-14]`) | 1 indexed round trip on `chat_messages.attached_reading_id` |
| the counter `UPDATE … RETURNING` (§6.4) | 1 round trip |
| `INSERT INTO chat_runs` | 1 round trip |

**Four round trips, no model call, no transaction of its own.** Against a warm Neon
compute in `sin1` that is tens of milliseconds; against a cold one it is one wake-up
already paid for by `persistReading` four steps earlier. **It fits, and the reason it
fits is `[F5-4]`.** A design in which the reading route plans the chat run — one
`chat_plan` call, 3–8 seconds — would not, and would be competing with `extractGist`
for the tail of an invocation the header already declines to guarantee.

### 8.3 Where it goes, exactly

**Inside the existing `defer()`, as the LAST statement, after `touchLastSeen`.**

```ts
// after `await touchLastSeen(user.id);`
await mintOnReadingCompleted({
  userId: user.id,
  readingId,
  status: outcome.status,
  localDate: localDate.date,   // A STRING. [F5-3]
});
```

Three reasons for that position, in decreasing order of how hard they bind:

1. **After `persistReading` is mandatory.** `chat_runs.trigger_reading_id` is an FK to
   `readings.id`. Minting first is a constraint violation, and it would present as
   *"the chat never reacts to readings"* with an error in a log nobody reads.
2. **Last is deliberate, and it is a statement about priority.** Deferred jobs run in
   registration order inside one callback, so whatever is last is the first thing lost
   when the platform cuts the invocation short. **A lost mint costs one proactive
   message; a lost `persistReading` costs the querent's history and every memory
   feature that reads it.** The Lotus repair's header makes this argument, the gist's
   header makes it again, and A2's ledger makes it a third time — *"a dashboard row
   may never be in front of the querent's own history."* A proactive message is
   further back than a dashboard row.
3. **It is self-healing, which is what makes losing it acceptable.** M1's detection is
   *"a reading since the last proactive run"*, not *"the reading in this request"*, so
   the next open tick picks up a reading whose mint was lost. **This is the reason the
   material catalogue is a scan and not a queue.**

**It is not its own `after()`.** The Lotus repair takes its own because it must not
sit behind `persistReading` in the queue; the mint must sit behind `persistReading`,
so the queue is exactly right. And a separate `after()` would be a second callback
whose ordering against the queue is Next's business rather than ours.

**The four invariants in that file's header are untouched.** The client still sends
card ids and orientation; every word of card text is still looked up server-side; the
verdict is still `effectiveYesNo()`'s; a mid-stream failure still cannot become a 500.
The diff is one import and one awaited call. **If a diff there appears to change any
of the four, it is wrong.**

### 8.4 What moves if it turns out not to fit

Nothing moves; the mint moves. If `reading.completed` latency or a rise in lost
`readings` rows is ever traced to this, **the fix is to delete source 1 entirely and
let the open tick do it**, which costs nothing because M1's scan already finds the
reading. Source 1 exists to make the reaction arrive *sooner*, not to make it arrive.
Written down so the fix is obvious under pressure rather than "make the mint async",
which is a floating promise in a serverless function and is the thing `after()` exists
to prevent.

---

## 9. Seam `S5` — the manual attach

**F5 owns the suppression rule** (roadmap §11, S5). F6's plan states the same rule and
cites this section.

### 9.1 The rule

**If the querent attaches reading X into the chat themselves, the `reading_completed`
run for X does not fire.**

### 9.2 Why one check is not enough

The timing runs both ways and the common case is the *second* one:

| Order | What happens | Which mechanism catches it |
|---|---|---|
| The querent attaches X from `/history` days later; no `reading_completed` run for X was ever minted (or one was, and completed) | The attach is just a `user_message` run | Nothing to suppress. `material_key = 'reading:X'` already exists if a run was minted, so a later M1 cannot re-fire either. |
| The querent attaches X **before** the mint | Rare — the mint runs in the reading's own `after()`, which begins seconds after the stream ends | **Mechanism A**, the pre-check |
| The querent attaches X **after** the mint, while the run is still `pending` | **The common case.** F6's control appears on the draw screen *only after the reading is finished* (roadmap §7, F6), which is after the `after()` has already fired | **Mechanism B**, the supersede |
| The querent attaches X after the run has started speaking | The reader has already said something about it | **Neither. Left alone deliberately** — see §9.5 |

### 9.3 Mechanism A — the pre-check, inside the mint

`mintOnReadingCompleted` refuses when a `chat_messages` row exists with
`attached_reading_id = :readingId` for that user. One indexed query; the index is
F1's to size and roadmap §3.2 already asks for *"a partial index for the badge
count"*, so a partial index on `attached_reading_id where attached_reading_id is not
null` is the natural sibling.

Belt-and-braces on top: `material_key = 'reading:<readingId>'` and the unique index
(§4.5) mean that even if two paths both decide to mint for X, the second insert
violates and is logged as `skipped/duplicate`.

### 9.4 Mechanism B — the supersede, which F6 calls

**F5 exports one function; F6 calls it. F5 does not touch F6's route and F6 does not
re-implement the rule.**

```ts
// src/lib/chat/proactive/supersede.ts
/**
 * Kill a not-yet-started reading_completed run for this reading, because the
 * querent has just brought the reading into the room themselves.
 *
 * Returns the number of runs abandoned (0 or 1). Never throws.
 */
export async function supersedeReadingRun(
  db: DbOrTx,                       // handle first. queries/** rule, and this is one hop from it
  userId: string,
  readingId: string,
): Promise<number>;
```

```sql
update chat_runs
   set status = 'abandoned', updated_at = :now
 where user_id = :u
   and trigger = 'reading_completed'
   and trigger_reading_id = :readingId
   and status = 'pending'
   and (lease_until is null or lease_until < :now)
returning id;
```

- **`status = 'pending'` only.** A `planning` run is mid-`chat_plan`; killing it
  leaves a model call in flight whose result writes to an abandoned row. A `running`
  run has already spoken.
- **The lease predicate** is `C-R3`'s, reused rather than reinvented: a run somebody
  is holding is not ours to abandon.
- **One conditional statement, and the row count is the answer**, so there is no
  check-then-act window.
- **It runs inside F6's attach transaction, before the attach's own run is minted**,
  so a failure aborts the whole attach rather than leaving both runs alive.
  `redactForUser` / `revokeAllForUser`'s ordering argument, in a much smaller place.

### 9.5 What is deliberately NOT suppressed

**A `running` reading_completed run is left alone.** A bubble that has already been
stored cannot be un-said (`chat_messages` is append-only, roadmap §3.2: *"There is no
`status` column and no soft delete"*), and deleting one would be the first delete path
into that table. The querent then attaches a reading a reader is already talking
about, which reads as them joining a conversation already underway — which is what it
is, and which is honest.

### 9.6 The integration test

`src/lib/chat/proactive/supersede.integration.test.ts`, inside `withRollback`:

1. Insert a user, a reading, and a `reading_completed` run in `pending`.
2. Call `supersedeReadingRun`. Assert it returns 1 and the run is `abandoned`.
3. **The negative controls, and they fail by ACCEPTING** — V7's `unique nulls not
   distinct` tests' shape, named for the outcome:
   - a run in `running` is **not** abandoned;
   - a run with a live `lease_until` is **not** abandoned;
   - a run for a *different* reading is **not** abandoned;
   - a run for a different *user* is **not** abandoned. (The last one is the security
     shape of this query and the reason `user_id` is in the `where` at all, even
     though `trigger_reading_id` is already unique enough.)
4. Then call `mintOnReadingCompleted` for the same reading with an attach row present
   and assert **no run is created and the day counter did not move** — the counter
   assertion is the one that catches a pre-check placed after the increment.

---

## 10. Schema deltas

**Per §0.4 these go to the reconciliation, which folds them into `0014` before F1 is
built. F5 writes no migration.**

### Delta 1 — `chat_messages.intent text null` *(required)*

The beat's declared intent, denormalised from `chat_runs.beats[beat_index]`, written
by F1's engine beside `run_id` and `beat_index`. NULL for `author = 'user'`.

**Justified in §7.2.** Without it, M2 — the single strongest naturalness material in
`C-N1d` — has to be inferred from message text, which §7.1 argues is the `lagi` trap
and which would report a rate that is entirely noise. **No `CHECK`**, so F2 can add an
intent without a migration.

Index: none of its own. The query is *"most recent reader message with intent
`ask`"*, served by the existing `(user_id, created_at desc)` with a filter.

### Delta 2 — `chat_runs.material_key text null` + partial unique index *(required)*

```
material_key text null
create unique index chat_runs_material_key_uq
    on chat_runs (user_id, material_key) where material_key is not null;
```

**Justified in §4.5.** It is the de-duplication for all six materials, it makes the
check a constraint rather than a race, and **the `where material_key is not null` is
load-bearing**: without it, standard `UNIQUE` still treats NULLs as distinct so it
would happen to work, but a partial index is a tenth the size and states the intent.
**Do not "fix" this to `nulls not distinct`** — that is V7's `share_links` clause,
whose whole trap was the opposite case, and here it would permit exactly one
`user_message` run per querent forever.

### Delta 3 — `chat_threads.utc_offset_minutes integer null` *(CONDITIONAL on `Q2` ruling B only)*

§5, Option B. **Requested conditionally and flagged rather than taken**, because
roadmap §3.2's rule stands: *"adding a column now for a feature nobody asked for is
how a schema rots."* This one has been asked (Q2) and not yet answered.

**The reconciliation's actual decision is a timing one:** fold it now for a column
that may ship dead, or leave it and spend `0015` — *the one migration number §0.4
reserves and asks us not to spend* — if Miftah rules B after F1 lands. **I recommend
folding it.** A nullable integer nobody reads is free; `0015` is not.

### Delta 4 — a widened meaning for `chat_runs.trigger_message_id` *(no DDL change)*

§3.3 annotates it *"the posted message, for `'user_message'`"*. F5 also writes it for
`trigger = 'unanswered'` (the **asking reader message**) and for `'idle_nudge'` when
the material is M3 (the **orphaned bubble**). No column changes; the comment in
`schema.ts` does, and F1 owns that file. Recorded here so the annotation is written
once, correctly, rather than corrected later.

---

## 11. `npm run smoke -- --chat --proactive`

`scripts/smoke-llm.ts`. F3 owns `--chat`; **F5 owns `--proactive` and the two
compose**, exactly as `--all --lotus` and `--all --choice` compose today.

### 11.1 What it drives

**Six real runs — one per material kind — with no database.** `--lotus` and
`--persona` already run with `db:down` because they touch the prompt module only; this
inherits the property, which is what makes it a loop-1-adjacent instrument a session
can actually run.

Per material kind:

1. A hand-written fixture of that kind (`src/lib/chat/proactive/fixtures.ts`, plain
   data, no `server-only`), plus a hand-written thread state.
2. `describeMaterial(material, locale)` → the `MaterialBrief`. **Printed.**
3. F2's director, live → the beat sheet. **Printed.**
4. F3's voices, live, one beat at a time, each seeing the previous beats (`C-R5`).
   **Printed as bubbles, with the reader names covered.**

**Locale:** default `id`; `--locale en` switches. **Not both by default**, and the
reason is different from `--all`'s: `--all` defaults to both because W6's whole risk
*is* the second locale. Here the risk is the **material**, and twelve unprompted runs
is more prose than anybody reads in one sitting — and the blind read is the gate, so a
run nobody finishes reading is a gate nobody passes.

### 11.2 What it prints, and what fails loudly

Per run: the material kind, the brief, the beat sheet, the bubbles, and per-run word
counts against `LENGTH_BUDGET`'s chat rows (`C-D19`), asserted so the prompt and the
table cannot drift — the existing rule for every ceiling in this repo.

Three checks **fail the run**, and one warns:

| Check | Tier | Why |
|---|---|---|
| **The empty opener.** `/\b(apa kabar|gimana kabar|how are you|what'?s up)\b/i` in the first bubble of a run. | **FAIL** | This is `C-N2e`'s failure wearing a material. A run that had something to be about and opened with *"hai, apa kabar?"* means the brief did not reach the voice, and that is exactly the string the roadmap names. |
| **A tally.** `tallyFailures(body, locale)` from `src/lib/memory/tally.ts` — PURE, no `server-only`, already imported by this script. | **FAIL** | M4 hands over a Shadow Arcana and a pulse word and **never a count** (`[F5-9]`). A digit in the output was invented, which is V3's entire finding, and `summary.test.ts`'s assertion in a new place. |
| **A bare greeting** — `/^\s*(hai|halo|hi|hey)\b/i`. | **WARN** | `tally.ts`'s two-tier argument, verbatim: *"a scanner that flags legitimate output is a scanner somebody switches off within a week."* *"Selamat pagi"* from a morning nudge is legitimate; a bare *"hai"* opening an unprompted run usually is not. Printed and read by a person. |
| **`tallyProblems`' WARN tier**, unchanged. | WARN | Already how `--all` treats it. |

F3's forbidden-register grep (`C-N1b`) and the three voice proxies (own-forbidden
vocabulary, Margaret at 1.5× Thessaly's mean sentence length, Adrian's contraction
rate > 0 and Margaret's == 0 in `en`) run on this output too, unchanged — they are
F3's and F5 does not reimplement them.

### 11.3 The blind read

**The release gate, per §10.2, and it is not a unit test.**

Names covered, the six runs **shuffled**, the key after forty blank lines — the
existing mechanism, and the script covers the names for you. The key names **the
material kind as well as the reader**, because the two questions §10.2 asks are:

1. **Does the opening message have something to be about?** Read the bubble, guess
   the material, then check. **If you cannot tell what a run is about, the material
   did not reach the voice** — and the fix is `describeMaterial`'s `note` table or
   F3's prompt, never the code.
2. **Does it sound like somebody thought of you, or like a cron job?** There is no
   proxy for this and there is not going to be one.

And the reader identity, as `--all` already asks: **three of three, or fix the persona
blocks, not the code.**

---

## 12. The cold-open problem, and the warm

**Not a decision F5 takes alone — it is seam S-new-2 in §13.**

`[F5-6]` says the dot fires on a stored bubble. A `pending` run has no bubbles. So a
run minted in a reading's `after()` produces nothing visible until something advances
it, and the only things that advance a run are `/chat`'s own loop and the cron.

**Left alone, the failure is:** the querent takes a reading, closes the app, comes back
tomorrow — and sees a dot only if the cron happened to advance their run. Sources 1
and 2 become invisible for anyone who does not open `/chat` voluntarily, which is the
whole population this feature exists for.

**The fix is one line of behaviour: `GET /api/chat/state`'s `after()` advances at most
ONE beat of any open run, after minting.** `ChatButton` mounts on `/`, `/[reader]`,
`/account` and `/history`, so a normal session is 2–4 ticks — the plan lands on one,
the first bubble on the next, and the dot appears while the querent is still in the
app. `C-R3`'s lease is what makes it safe against `/chat`'s own loop and against the
cron.

**It costs something real and that is why it is a seam, not a decision:**

- **`/api/chat/state`'s `maxDuration` is `default` in roadmap §4.1, which on Hobby is
  ten seconds.** A `chat_turn` does not reliably fit in ten seconds. **This is
  `POST /api/locale`'s trap exactly** — the only database-writing route declaring
  neither `runtime` nor `maxDuration`, killed at the Hobby default on a cold lambda
  plus a suspended Neon compute, and diagnosed as an LLM call on a path that reaches
  no model. Warming requires `maxDuration = 60` on that route, which **F1 owns**.
- It puts a model call in the `after()` of the app's most-called endpoint. Bounded by:
  only while a run is open, one beat per tick, `deferred` class so the soft ceiling
  sheds it before any reading is touched.

**The alternative, which needs no route change:** F4's `ChatButton` reads `openRun:
true` off the state response and fires one `POST /api/chat/advance` in the background.
The model call then happens in the route built for it (`maxDuration = 60`), F5 writes
no advance code at all, and the cost moves to F4's asserted fetch count. **This is
probably the better answer and it is F4's to take**, which is why it is a seam rather
than a design here.

**Either way the cron does the same thing for the overnight case (§3, source 3, step
3), and that part is unambiguously F5's.**

---

## 13. Seams

| # | Seam | With | What must be settled |
|---|---|---|---|
| **S5** | Reading-completion proactivity vs. a manual attach | F6 | **Resolved in §9.** F5 exports `supersedeReadingRun`; F6 calls it inside the attach transaction and states the rule citing this section. |
| **S-new-1** | **What lights the dot** | F1, F4 | `[F5-6]`: a stored bubble, never a `pending` run. **This contradicts a sentence in `C-D7`** and the reconciliation must rule. `C-D7`'s sentence is about a run the querent watched start; F5's case is a run they never saw minted. |
| **S-new-2** | **Who warms a pending run** | F1, F4 | §12. Either `/api/chat/state`'s `after()` advances one beat (**and F1 raises that route to `maxDuration = 60`**), or `ChatButton` fires one background `advance` (**and F4 counts it among its asserted fetches**). Without one of the two, sources 1 and 2 are invisible. |
| **S-new-3** | **A proactive run's beat sheet is never empty** | F2 | `[F5-7]`. `C-R6`'s zero-beat plan is a `user_message` affordance. F2 must refuse it for a proactive trigger, or `[F5-13]`'s non-refunding counter spends the day on silence. |
| **S-new-4** | **`chat_messages.intent`** | F1, F2 | §10 delta 1. F1 writes the column from F2's beat; F5 reads it. **F5 must never read `chat_runs.beats`.** |
| **S-new-5** | **`chat_runs.material_key`** | F1 | §10 delta 2, including the partial unique index and the `nulls-distinct` warning. |
| **S-new-6** | **`GET /api/chat/state` must read `LOCAL_DATE_HEADER`** | F1, F4 | §4.8. Without the querent's calendar day the tick cannot honour `[F5-3]` and the daily cap silently becomes a UTC one. F4 sends it (the client already computes `todayKey()`); F1's route reads it with `parseLocalDate`. |
| **S-new-7** | **`CRON_SECRET` is shared and `.env.example` says so** | F1 | `[F5-16]`. F1 owns `.env.example` (S7); F5 supplies the annotation prose. |
| **S8** | The moderation gate | F1 | **Not F5's.** A proactive run has no querent text to gate. `C-D13` runs on a *posted* message; a proactive run has none, and a reader's own output is deliberately not classified. Recorded so nobody adds a gate call to the mint. |

---

## 14. Discrepancies with the roadmap

| # | Where | The roadmap says | What is actually true |
|---|---|---|---|
| **D1** | §6.2 `C-N2a`, and Q5 | *"Vercel's Hobby plan permits a small number of cron jobs at a daily cadence and `vercel.json` already spends one on `/api/cron/sweep`"*, with a fold-into-`sweep` fallback | **100 cron jobs per project on every plan since 2026-01-20** (§2, verified 2026-08-07). A second job is available; **the fold does not fire and `sweep` is not touched.** The *cadence* limit (once per day) and the ±59-minute precision are real and unchanged. `sweep/route.ts`'s own header carries the same stale sentence; it is history rather than a rule, and F5 is not editing W7's file. |
| **D2** | §6.2 `C-N2a` | *"`sweep`'s 03:17 is a terrible hour to message a person"* | **Vercel cron expressions are always UTC** (§2). `17 3 * * *` is **10:17 WIB**. The premise was wrong, in the querent's favour, and the conclusion it supported is moot under D1 anyway. |
| **D3** | `C-D7` | *"The run stays `running` with beats left. `GET /api/chat/state` reports it, **the red dot appears**"* | Correct for a run the querent watched start; **wrong as a general rule for a `pending` proactive run**, which may plan to zero beats under `C-R6` and would then be a dot leading to an empty room. `[F5-6]` and seam S-new-1. |
| **D4** | §4.1 | `/api/chat/state` has `maxDuration: default` | If the open tick warms a run (§12), that is ten seconds on Hobby for a path that makes a `chat_turn` call — **`POST /api/locale`'s trap exactly**, and §4.1's own paragraph is the one that names it. Seam S-new-2. |
| **D5** | §3.3 | `trigger_message_id` — *"the posted message, for `'user_message'`"* | F5 also writes it for `'unanswered'` (the asking reader message) and for M3-flavoured `'idle_nudge'` (the orphaned bubble). No DDL change; the annotation is wrong. §10 delta 4. |
| **D6** | §6.2 `C-N2e` | Lists five materials | This plan enumerates **six**, adding **M5 `return`** (a querent who came back after 14 days) as a sub-kind of *"a date that matters"*. It is the only material that fires for somebody with no readings, no messages and no recent activity — i.e. the exact person a proactive feature is for. Flagged rather than assumed. |
| **D7** | §8, the variable table | Lists `CHAT_PROACTIVE_MIN_GAP_SECONDS` and `CHAT_PROACTIVE_MAX_PER_DAY` for F5 | F5 also needs `UNANSWERED_MAX_AGE_HOURS` (48, §7.3), `PROACTIVE_RUN_TTL_HOURS` (48, `[F5-5]`) and `NUDGE_MAX_USERS` (8, §3). Three more rows for F1's `.env.example`, prose supplied in §16. |

---

## 15. Open questions

**For Miftah, or for the reconciliation. A plan must not resolve one by picking an
answer.**

| # | Question | Why it needs a ruling |
|---|---|---|
| **F5-Q1** | **`Q2`, quiet hours.** §5 lays out both options, recommends A (no predicate; the cron's UTC schedule *is* the quiet-hours mechanism), and shows that either ruling is one line. | Roadmap Q2 is explicitly Miftah's. The one thing that is **not** one line is delta 3's column: ruling B after F1 lands costs migration `0015`. |
| **F5-Q2** | **Is `2` the right daily cap?** §6.4 argues it. | It is a guess with an argument, `PERSONA_MIN_AGE_SECONDS`' shape, and the only instrument is `C-N2f`'s reply rate over weeks on a real phone. |
| **F5-Q3** | **Should M6 (the Lotus fact) ship at all?** §4.1 calls it the weakest and says it would be cut first. | It is on `C-N2e`'s own list, so cutting it is a roadmap deviation rather than a design choice. |
| **F5-Q4** | **`C-N1d`'s other half.** F5 detects the unanswered question and points a beat at it (§7.5). **Nothing stops the voice from re-asking it near-verbatim** rather than referring to it. | `validateTurn` is F3's and *"refuses shape, not truth"*; "is this a repeat of an earlier bubble" has no cheap shape test. Left open rather than faked. |
| **F5-Q5** | **`NUDGE_MAX_USERS = 8` has a scale ceiling of roughly eight querents per night.** §3 names the v0.8.0 successor (mint-only plus a drain queue). | At two dev accounts this is not a problem. It becomes one silently, and the symptom is *"the nudge stopped working for people whose ids sort late"*. |

---

## 16. Environment variables

**F1 owns `.env.example` (seam S7).** This is the prose, in that file's voice, for F1
to transcribe.

```
# ── Proactivity (F5) ────────────────────────────────────────────────────────
# CHAT_PROACTIVE_ENABLED is in flags.ts and is F1's. These five shape WHEN an
# unprompted run is allowed to exist. All five are read AT CALL TIME and all five
# fall back rather than becoming zero -- a gap of 0 makes three readers message
# you every time you load a page.

# How quiet the room must be before a reader speaks unprompted. Three hours.
# It does NOT gate a run triggered by a finished reading: that is a thing the
# querent just did, at a moment they are demonstrably present, and making Adrian
# wait three hours to react to it is the feature not working.
CHAT_PROACTIVE_MIN_GAP_SECONDS=10800

# Unprompted runs per querent per THEIR calendar day. One is a newsletter; three
# is up to twelve unprompted bubbles a day, which is how you get muted. It counts
# runs MINTED and does not refund.
CHAT_PROACTIVE_MAX_PER_DAY=2

# After this long, an unanswered reader question is not "still unanswered", it is
# over. Following up on something asked last Tuesday reads as a cron job that
# found a row.
UNANSWERED_MAX_AGE_HOURS=48

# A run left pending or running for this long is abandoned by the nightly nudge.
# Under quota pressure the app accumulates pending runs rather than losing them
# (C-D6), and this is what stops a week of pressure delivering seven-day-old
# greetings the moment the ceiling clears.
PROACTIVE_RUN_TTL_HOURS=48

# How many querents /api/cron/nudge will mint AND warm in one 60s invocation.
# Derived, not guessed: ~6s per beat against a 45s wall-clock budget. At a scale
# where this is too few, the fix is NOT a bigger number -- it is that the cron
# mints only and a queue drains it.
NUDGE_MAX_USERS=8

# CRON_SECRET is SHARED with /api/cron/sweep. One secret, for the sweep's own
# reason: a second is a second thing to rotate and a second thing to have unset.
# Both routes 503 without it and 401 on a mismatch.
```

---

## 17. Interfaces I need

**From F1** (`src/lib/chat/types.ts`, `src/lib/db/queries/chat.ts`, handle first):

```ts
// The thread row plus the open-run flag, in one read. F5 calls this from three places.
getThreadState(db: DbOrTx, userId: string): Promise<ThreadRow | null>
hasOpenRun(db: DbOrTx, userId: string): Promise<boolean>

// The mint. F5 supplies trigger, material_key, trigger_reading_id / trigger_message_id
// and locale; F1 owns the insert and the CHECK constraints.
insertRun(db: DbOrTx, row: NewChatRun): Promise<{ id: string } | null>   // null on unique violation

// The day counter, as the one conditional UPDATE in §6.4.
bumpProactiveCount(db: DbOrTx, userId: string, localDate: string, maxPerDay: number, now: Date): Promise<number | null>

// The engine, CALLED and never modified. F5's cron and (if S-new-2 rules that way)
// the open tick each take exactly one beat.
advanceRun(db: DbOrTx, userId: string, opts: { owner: string }): Promise<AdvanceResult>

// The run's language. C-D9 says the director declares it from the querent's text --
// a proactive run has no querent text, so it falls back to users.locale. F5 passes
// users.locale and F2's director may not override it for a proactive trigger.
```

**From F2:** the `intent` union, so `chat_messages.intent = 'ask'` is a type and not a
string literal in F5's query.

**From F3:** nothing at build time. `describeMaterial`'s `note` table lives in F5 and
F3's assembler receives the `MaterialBrief` as a field, not as prose to splice.

**From F4:** `LOCAL_DATE_HEADER` on the `GET /api/chat/state` fetch (seam S-new-6).

**From F6:** one call to `supersedeReadingRun` (§9.4).

---

## 18. Events

**Declared here; `C-D14`/`S6` say F1 owns `events.ts` and folds. Folding means
transcribing, not narrowing.** `C-D14` also says *"expect to FOLD"* — so here is what
I drafted and what I folded, per the v0.4.0 procedure.

### Drafted: four. Shipping: two.

| Drafted | Fate |
|---|---|
| `chat.proactive_minted` | **FOLDED** into `chat.proactive_evaluated` with `outcome: 'minted'` |
| `chat.proactive_skipped` | **FOLDED** into the same name with `outcome: 'skipped'` |
| `chat.proactive_material` | **DROPPED.** `material_kind` is a prop on the folded event; a separate name would put the numerator and the denominator in two scans, which is exactly what `reading.completed.choice` was folded to avoid |
| `chat.nudge_swept` | **KEPT.** It is the cron's own health line and its subject is an invocation, not a querent |

### `chat.proactive_evaluated`

```
{ outcome: 'minted' | 'skipped',
  source: 'reading' | 'tick' | 'cron',
  trigger: 'reading_completed' | 'idle_nudge' | 'unanswered' | 'cron' | null,
  material_kind: 'reading'|'unanswered'|'orphan'|'recurring'|'occasion'|'lotus'|null,
  reason: EligibilityRefusal | 'duplicate' | null }
```

Numerator and denominator in one scan. **`C-N2e`'s instrument** — F7 charts
`skipped/no_material` as a rate, because *"a high rate means the eligibility rules are
wrong, not that the querent is boring."*

**IT DOES NOT FIRE ON EVERY EVALUATION, AND THAT IS DELIBERATE.** `open_run` and
`gap` refuse the overwhelming majority of ticks — every page view of every querent
with a run in flight — and both are derivable from the `chat_threads` row at any time.
Firing on them would put a row in `events` for every page view in the app, against a
180-day TTL on Neon free's 0.5 GB. **It fires for `minted`, and for `skipped` with
`no_material`, `daily_cap`, `quiet_hours` or `duplicate`.** Same fold-by-dropping
argument that removed `revealed` in v0.4.0: *"request volume in the platform log
answers the privacy question and a look-and-close changes no decision."*

### `chat.nudge_swept`

```
{ candidates: number, minted: number, advanced: number, abandoned: number,
  failures: number, ms: number }
```

`sweep`'s result object, as an event. Scalars only.

**No free text, ever** (`C-D14`, non-negotiable 5). A material's *kind* is a closed
token; a bubble's *text* never appears, and neither does a reading's question, a
card name, or a `material_key` — which carries a uuid and would be an identifier in a
table that survives account erasure with `user_id` nulled.

---

## 19. Tasks

Numbered, in build order. **F1, F2 and F3 must be landed first** (roadmap §0).

### Task 1 — the pure predicate

**Files:** `src/lib/chat/proactive/eligibility.ts`, `eligibility.test.ts`.

`checkEligibility`, `inQuietHours`, the two type unions. **No imports outside
`@/lib/chat/types` and `@/data/types`.** Every gate of §6.2, in the stated order.

**Done when:** `npm test` covers each refusal by name; the ordering assertion (§4.6)
exists; the `proactiveCountDate` case uses a string fixture and the parameter type
does not accept a `Date`; the clock is injected everywhere and `new Date()` appears
nowhere in the file.

### Task 2 — the material types and the selector's pure half

**Files:** `src/lib/chat/proactive/material.ts` (the closed union, `MaterialBrief`,
`materialKey()`, the fixed order), `notes.id.ts`, `notes.en.ts`, `notes.ts` (the
`Record<Locale, …>` facade), `material.test.ts`.

`describeMaterial()` over injected material rows — pure, no database. The English
notes are **rewritten, not translated**, and a test asserts they are not
sentence-for-sentence twins (I5's enforcement shape).

**Done when:** the `switch` in `describeMaterial` is exhaustive by `AssertNever`;
`materialKey()` round-trips every kind; `facts` is scalars only and a test asserts it.

### Task 3 — the material queries

**Files:** `src/lib/chat/proactive/detect.ts`, `detect.integration.test.ts`.

Six detectors, **handle first**, run in order, first hit wins. M4 delegates to
`firstPassingWindow` + `frequencyMechanic` and adds nothing. M6 calls
`answerPresence`, which decrypts nothing.

**Done when:** `npm run test:integration` proves each detector's positive and its
nearest negative — a `blocked` reading is not M1, an `ask` with a user message after
it is not M2, an `ask` at 49 hours is not M2, a cleared answer is not M6.

### Task 4 — the mint

**Files:** `src/lib/chat/proactive/mint.ts`, `mint.integration.test.ts`.

`mintProactiveRun({ db, userId, source, localDate, now })` — reads the thread, runs
the cheap gates, detects material, bumps the counter (§6.4's one statement), inserts.
Catches everything, logs `{ userId, trigger, sqlstate, errorClass }` and never the
error (`[F5-17]`). Fires `chat.proactive_evaluated`.

**Done when:** the day-counter rollover is tested across a `local_date` change; two
concurrent mints produce one run (the `material_key` unique index is the proof, and
the test **fails by accepting a second row**); a soft-deleted user is never minted
for.

### Task 5 — seam S5

**Files:** `src/lib/chat/proactive/supersede.ts`, `supersede.integration.test.ts`.

§9.4 and §9.6, including all four negative controls.

### Task 6 — the reading route hook

**Files:** `src/lib/chat/proactive/onReading.ts` (`mintOnReadingCompleted`),
`src/app/api/reading/route.ts` (**one import, one awaited call, last inside the
existing `defer()`**).

**Done when:** `npm test` and `npm run test:integration` are green *and* the four
invariants in that route's header are visibly unchanged in the diff. **Stop the
database and take a reading**: it must stream and complete exactly as normal, with
nothing but a log line — W4's existing acceptance test, extended.

### Task 7 — the open tick

**Files:** `src/lib/chat/proactive/onTick.ts`, and F1's `/api/chat/state` calls it
from `after()`.

**Blocked on seam S-new-6** (the route must read `LOCAL_DATE_HEADER`) and, for the
warm, on **S-new-2**. Ship the mint; the warm lands only if the reconciliation grants
it *and* F1 raises `maxDuration`.

### Task 8 — `/api/cron/nudge`

**Files:** `src/app/api/cron/nudge/route.ts`, `vercel.json`, `nudge.integration.test.ts`.

`runtime = 'nodejs'`, `maxDuration = 60`, `CRON_SECRET` with `timingSafeEqual` and
`sweep`'s 401/503 shape. Three phases in order (§3): abandon expired, mint, advance.
Each candidate wrapped independently. `vercel.json` gets the second entry.

**Done when:** the 401 and 503 behaviours are tested; the TTL abandon is tested; the
wall-clock budget stops advancing without stopping the response; a `never_opened`
querent is not minted for.

### Task 9 — the smoke instrument

**Files:** `scripts/smoke-llm.ts`, `src/lib/chat/proactive/fixtures.ts`.

§11 in full: six fixtures, the composition with `--chat`, the three fail checks and
the warn tier, the word-count assertion against `LENGTH_BUDGET`, the shuffle and the
key after forty blank lines.

**Done when:** `npm run smoke -- --chat --proactive` runs with `db:down`, and **a
session has actually read the six.**

### Task 10 — the fences and the docs

**Files:** `src/lib/db/clientBoundary.test.ts` (a fence for
`@/lib/chat/proactive/**` with `eligibility.ts`, `material.ts` and `notes.*` as the
declared pure exceptions), `docs/DEPLOY-VERCEL.md` (a cron sub-section beside §2d's
kill switches, naming `CHAT_PROACTIVE_ENABLED=0` as the first thing to reach for and
the second cron entry as the second), `docs/workstream-notes.md` (F5's section),
`CHANGELOG.md`.

---

## 20. Verification

### Loop 1 — Vitest, no database. **The predicate lives here.**

- `eligibility.test.ts` — every gate, every refusal reason, the branch **order**, the
  `reading_completed` gap exemption, `never_opened` per source, the `resetCounter`
  boundary, `inQuietHours` across midnight, and the `proactiveCountDate`-is-a-string
  case that fails if the type is widened.
- `material.test.ts` — the fixed order, `materialKey()` per kind, `describeMaterial`
  exhaustiveness, `facts` scalars-only, the English notes not being translations.
- The smoke script's three checks as pure functions with a near-miss corpus each —
  `tally.ts`'s rule that a list with false positives needs a false-positive corpus,
  and a corpus needs a unit test, and a unit test needs a module. **`selamat pagi` is
  the near-miss the greeting check must not fail on.**

### Loop 2 — Vitest integration, `npm run db:up`. **The triggers live here.**

Every file `*.integration.test.ts`, inside `withRollback`:

- each detector's positive and its nearest negative (Task 3);
- the mint: the day rollover, the concurrent-mint constraint (**failing by
  accepting**), the soft-deleted refusal, the counter not moving on a refused mint;
- seam S5's four negative controls (§9.6);
- the cron's three phases, the TTL abandon, the 401/503;
- and the one that is not obvious: **a `reading_completed` mint for a reading whose
  `status` is `'blocked'` must not happen.** W7 refused the question, the reader never
  spoke, and a proactive run about it would be the app volunteering that it refused
  you.

`npm test` and `npm run test:integration` run **separately** — `npm run test:all`
fails 12–22 of V9's limiter tests as a harness race and its red does not mean
anything.

### Loop 5 — real Chrome over CDP

Answers *does the UI agree with what it sends*, which for F5 is: after a reading, does
`GET /api/chat/state` report an open run, and does a bubble exist afterwards. It does
**not** answer width and it does not answer timing over days.

### Loop 6 — a real iPhone against a Vercel preview. **The only thing that can pass this workstream.**

Nothing else can answer any of these:

1. **Take a reading, close the app, come back later, and find the dot.** §10.2's own
   test. This is the entire feature and it has no unit-test proxy.
2. **Does the message read as tone-deaf?** `[F5-2]`'s failure mode is a *feeling*.
3. **Is 2 per day too many, and is 3 hours too short?** `C-N2f`'s reply rate is the
   instrument and it needs weeks, not a run.
4. **Does the cron's 19:00 WIB feel like an hour a person messages you?** ±59 minutes
   of jitter is part of what is being judged.
5. **Do you answer a message you did not ask for?** The release's own scorecard, and
   the only honest measure of whether any of this worked.

**And the one gate that is not a loop:** `npm run smoke -- --chat --proactive`, read
blind. **Does the opening message have something to be about? Does it sound like
somebody thought of you, or like a cron job?**

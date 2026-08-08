# F1 — The Chat Spine Implementation Plan

**Goal:** three tables, one run engine, six routes, two ops, two flags, one sub-budget and
one privacy amendment — so that F2 can write a beat sheet, F3 can execute a beat, F4 can
drive the loop, F5 can mint a run nobody asked for, F6 can attach a reading and F7 can bill
all of it, **without any of them writing a migration, inventing an event name or touching
`gate.ts`.**

**Architecture:** `chat_runs` is a lease-protected state machine; `POST /api/chat/advance`
is its only entry point and does exactly one thing per call; `src/lib/chat/types.ts` is a
PURE leaf every other workstream imports; `src/lib/chat/run.ts` is the engine, with the
director and the voice behind two interfaces and a placeholder prompt each. **Nothing new
streams. Nothing new is translated. Nothing new is public.**

**Tech stack:** unchanged. Drizzle + postgres.js, `LLMProvider` from `@/lib/llm`, Zod at the
route boundary, Vitest (unit + integration). **No new dependency of any kind.**

---

**Governing documents, highest first:**
`docs/plans/2026-08-07-RECONCILIATION-v0.7.0.md` (not written yet) →
`PUBLIC_RELEASE_ROADMAP_v0.7.0.md` → this file. `CLAUDE.md`,
`docs/workstream-notes.md`, `docs/plans/2026-07-26-RECONCILIATION.md`,
`docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` and the earlier roadmaps all still bind.
**`C-D1` through `C-D20` and `C-R1` through `C-R7` are fixed decisions** — this plan
implements them. Where it *amends* one, the amendment is labelled and the reason is stated,
so the reconciliation can refuse it in one place. **§12's six open questions are not
resolved here.**

**`CLAUDE.md` sections a session must read before touching F1's files:** `## Traps` (all of
it), `## The data layer`, `## Analytics and reading history (W4)`, `## Trust, safety and
secrets (W7)`, `## Auth`, `## The z.ai plan`, `## Providers`, `## How to verify things here`.
**`docs/workstream-notes.md`:** W1, W4, W7, V9, A2, A7.

**Owns:** migration `0014_f1-chat.sql` and the three tables; `src/lib/db/queries/chat.ts`;
`src/lib/chat/types.ts`; `src/lib/chat/run.ts`; `src/lib/chat/model.ts`;
`src/lib/chat/budget.ts`; the six API routes; `chat_plan` and `chat_turn` in
`src/lib/llm/types.ts` and their rows in `callClass.test.ts` and `OP_ORDER`; `CHAT_ENABLED`
and `CHAT_PROACTIVE_ENABLED` in `src/lib/llm/flags.ts`; the `chat:` and `llm:chat:window`
namespaces; the moderation call site; **the whole of `src/lib/analytics/events.ts` for
v0.7.0**; `.env.example`; and **`/privacy` in both locales**.

**Must not touch:** any prompt file beyond the two placeholders §12 of this plan hands over
by name; any component; `/admin`; `src/lib/auth/gate.ts`; `src/lib/moderation/**`;
`src/middleware.ts`'s matcher (F4 owns the `/readers/` entry).

---

## 1. What F1 is, and what it is emphatically not

**F1 is plumbing that has to be right the first time, because six workstreams build on top
of it and `0015` is reserved rather than available.**

It is:

- **three tables and the one migration in this release**;
- **a state machine with a lease**, because two tabs and a cron can all reach one run;
- **one entry point**, so that an abandoned run and a proactive run are the same object
  (`C-D7`) and F5 builds triggers rather than a second pipeline;
- **the closed shapes** — `Beat`, `AdvanceReply`, `Director`, `Voice`, `Pace` — that turn
  four plans into one contract;
- **the budgets, the flags and the ops**, so that the chat can be shed, switched off and
  billed without any of F2–F7 knowing those mechanisms exist;
- **the gate call site**, and **the two legal documents this release makes false.**

It is **not**:

1. **Not a prompt.** F1 ships two placeholder prompt modules whose entire purpose is to be
   deleted by F2 and F3. They exist so that `callClass.test.ts` and `flagCoverage.test.ts`
   have files to name and so that F1 is independently verifiable end to end — §12 hands both
   over by filename.
2. **Not a renderer.** No component, no CSS module, no catalog key. `chat.*` in
   `src/lib/i18n/locales/id.ts` is F4's.
3. **Not a stream.** `C-D3`. `ReadingView`'s machinery, `teeReading`, `tee.ts`,
   `splitChoiceMarker` — none of it is reused and none of it may be. A chat turn is
   `complete()`.
4. **Not a translation.** `C-D9`. `TRANSLATABLE` gains no entry, `translations` gains no
   `entity`, `keys.ts` is not opened.
5. **Not a second reading surface.** No `readings` row, no `reading_cards` row, no
   `effectiveYesNo()`, no verdict, no `MAX_TOKENS.spread3`.

---

## 2. Decisions this plan makes

Each is F1's to make under §7 or under a seam ruling. Decisions that belong to Miftah are in
`## Open questions`; decisions that contradict the roadmap are in
`## Discrepancies with the roadmap`.

### `F1-D1` — The beat sheet is a versioned wrapper, and a beat carries no free text

The shape is quoted verbatim in `## The beats JSON shape` below. Two properties are the
decision:

**A beat carries no model-authored prose, not even a topic hint.** The obvious design gives
each beat a one-line `topic` the director wrote, and it is wrong for a reason `C-R5` already
states: *"Adrian replying to Thessaly must have Thessaly's actual words, not the director's
summary of what she was going to say."* A `topic` field is that summary, sitting in the
prompt's line of sight, and the first thing a voice prompt would do is read it instead of
the transcript. **The failure mode is a room where the readers answer a plan rather than each
other**, which is `C-N1` failing in the exact way no test can see.

**`beats` is `{ v: 1; beats: Beat[] }` and not a bare array.** A jsonb blob written by F2 and
read by F3 across releases, indexed into forever by `beats_done`, cannot say which shape it
is if it is a bare array. One integer buys a discriminated read instead of a guess.

### `F1-D2` — One `advance` call is one beat, and a retry is inside it

`C-R2` says one advance does one thing. `C-R7` says a failed turn is retried once. Those are
compatible and the reading that makes them compatible is: **the retry is a second model call
inside the same request, not a second request.** So there is no `attempt` column, no
`last_error` column, and no way for a client to lose count of retries by closing a tab.

Two consequences:

- `maxDuration = 60` on `/api/chat/advance` must cover **two** `chat_turn` calls plus the
  lease round trips. A chat turn is one to three sentences; two of them at z.ai's measured
  reading latency is comfortably inside sixty seconds, and the lease is ninety.
- **Both attempts write a `llm_calls` row**, because both reached a provider. `/admin/chat`'s
  validation-failure rate (F7) is therefore computable from `chat.turn_generated.attempt`
  and the cost is honest.

### `F1-D3` — `/api/chat/read` EXISTS, as a POST, and folding it into `state` is refused

§4.1 leaves this to F1. The answer is **no fold**, and the reason is not tidiness:

**`GET /api/chat/state` is called from `/`, `/[reader]`, `/account` and `/history` — four
pages that do not show a single message.** `C-D17` puts the button on all four and `C-D18`
makes the badge a client fetch from each. If that GET moved `last_read_at`, **the badge would
clear itself from a page where the querent never saw the message**, and the proactive dot —
the whole of `C-N2b`, the release's second acceptance criterion — would be extinguished by
the very request that renders it.

A second reason that would be sufficient alone: Next's router prefetch issues GETs the
querent did not cause. A GET that writes a fact meaning *"the querent saw this"* is wrong on
the same grounds `POST /api/locale` is a POST.

**The asymmetry to keep:** `state`'s `after()` **may** write bookkeeping the querent did not
cause — that is `C-D18`'s proactive tick and F5 owns it. It may not write a fact that claims
the querent looked.

### `F1-D4` — `LLM_WINDOW_CALL_CEILING` is re-derived and **unchanged at 280**

`C-D6` consequence 1 and seam S11 require the derivation, and §12's **Q3 owns the number**.
This is the derivation; the number remains Miftah's.

```
  280 = ~400 prompts per rolling 5 hours (z.ai Coding Plan, Pro tier) x 70%
```

Three facts, and they point the same way:

1. **The denominator is a property of the plan, not of the app.** The chat does not create
   quota. Raising the ceiling because the chat spends more is spending headroom that exists
   for a reason `meter.ts` states in its own header: *"we could not observe what quota
   exhaustion looks like on the wire without causing it."* The ~120 prompts of slack is the
   price of never having measured the cliff, and the chat is not an argument that the cliff
   moved.
2. **`## The z.ai plan` makes the slack more valuable, not less.** The balance on the account
   was read on 2026-08-01 and is **zero**. There is no wallet, so there is **no soft
   landing**: the failure past the plan's limits is `1113 Insufficient Balance` on the first
   call, instantly, for everybody. A ceiling that sits closer to the provider's own limit
   converts a graceful internal refusal into a provider-side outage.
3. **The correct instrument for "the chat multiplies calls 5–10×" is the sub-budget, not the
   ceiling.** `LLM_WINDOW_CHAT_CEILING` bounds the chat's share; `callClass: 'deferred'`
   bounds when it is shed; `C-D6` consequence 3 makes a shed turn free of consequence. All
   three exist precisely so the fleet ceiling does not have to move.

**So the commit message says: re-derived 2026-08-07, unchanged at 280, sub-budget added at
140.** *"Re-derived and unchanged"* is a real outcome of the exercise §7 demands, and it is a
better one than a bigger number nobody can defend.

**The one thing that does change it** is the ~February 2027 migration `## The z.ai plan`
describes: on a credit-metered plan, 280 loses its units entirely — a four-paragraph
`spread3` and a one-line classifier reply stop being one unit each, and at a 24× output
multiplier they are very far apart. **Re-derive against credits then; do not raise the number
now.**

### `F1-D5` — `LLM_WINDOW_CHAT_CEILING` is peeked before the fleet ceiling and consumed after it

Default `Math.floor(hardCeiling() / 2)` = **140**, per §8.

The order inside `reserveChatCall()` is:

```
  1. peek  llm:chat:window   -> at or over ceiling ? SHED, nothing charged
  2. reserveModelCall('deferred')  -> soft or hard refusal ? SHED, chat window untouched
  3. consume llm:chat:window       -> record the call that is about to be made
```

**Peek first, consume last**, which is `meter.ts`'s own argument for `peek()` existing:
*"Consuming and then deciding to refuse would charge the window for a call that was never
made — which, sustained across an afternoon at the soft line, walks the counter into the hard
ceiling on work that was already being declined. The refusals would cause the outage."* Here
it is worse, because a chat run makes two to five calls and the refusals would compound per
run.

**The key is `llm:chat:window` and it goes through `consume`/`peek`, NEVER `hit`.**
`hit()` applies a `read:` namespace before `backendFor()` sees the key, so `hit('llm:chat:window')`
would record into `read:llm:window`-shaped storage while the peek read the bare key — the two
halves working perfectly on two different counters, which is the failure `index.ts` documents
by name and which killed `meter.ts`'s soft tier in draft.

**There is no date in the key**, matching `llm:window`. The provider's quota is not a
property of anybody's calendar.

### `F1-D6` — `chat_messages` gains a `model` column, and it must never reach the browser

§3.2 does not list one. Every other table in this schema that holds generated prose does:
`readings.model`, `personas.model`, `daily_summaries.model`, `frequency_verdicts.model`,
`admin_insights.model`, `lotus_avatars.model`. A chat bubble would be **the only generated
prose in this database that cannot say what wrote it**, and `C-D4` makes the chat the one
surface running a model nothing else runs — which is exactly the case where "which model
wrote this?" is asked.

**NULL for `author = 'user'`.** The resolved string for a reader, `chatModelName()`, never an
env var name — `llm_calls.model`'s rule.

**And it is the reason the projection is explicit.** §0.3 non-negotiable 2 forbids a model
name reaching the browser, and `scripts/audit-secrets.ts` cannot see a column selected by
`db.select()` with no argument. So **every query in `queries/chat.ts` that feeds a route
selects its columns by name and `model` is not among them.** A `select()` with no projection
in that file is a defect; `chat.contract.test.ts` greps for it.

`prompt_version` was considered and refused. `translations.prompt_version` exists because a
cached row has to be invalidated when the prompt changes; a chat message is never regenerated
and never invalidated, so the column would be written and never read.

### `F1-D7` — No CHECK constraint may involve a column carrying `ON DELETE SET NULL`

The obvious constraints are `(author = 'user') = (run_id IS NULL)` and
`(run_id IS NULL) = (beat_index IS NULL)`. **Both are refused**, and the reason is A1's
§12.1 lesson generalised: `admin_access_log.admin_user_id` was declared `not null` with
`on delete set null`, and the consequence was that *the hard delete of any user an admin had
ever looked at would abort with `23502`* — the erasure `/privacy` clause 8 promises, failing
for exactly the population most likely to have asked for it, visible only in a cron log.

A CHECK has the same shape. `chat_messages.run_id` is `on delete set null`; the referential
action fires **during a delete**, and if it lands the row on the wrong side of a CHECK, the
DELETE raises. **The pairing is enforced in `insertMessage`, which is the only writer**, and
that is where it belongs: an insert-time rule that a route can violate, rather than a
delete-time landmine.

Surviving CHECKs are on columns with no referential action at all: `author`, `status`,
`trigger`, `beats_done >= 0`, the lease pair, the reader-body-non-empty rule, and
`id <> reply_to_message_id`.

### `F1-D8` — `moderate()` is called directly, `gate.ts` gets zero lines, and the classifier's latency is the post's

Seam S8. `gateReading()` exists to race a classifier against a stream that is already in
flight; **`C-R1` forbids a generative call on this route**, so there is no stream to race and
`gateReading` is the wrong function. The call is `moderate(sanitized, locale, signal)` —
already exported separately for exactly this, *"so a future caller … has the decision without
the machinery."*

**The cost is visible and is accepted:** the classifier's measured p95 is 903ms and
`MODERATION_TIMEOUT_MS` bounds it at 1500. That is the whole latency of a post.

**F4's obligation, stated here because F1's route creates it:** the querent's own bubble is
rendered **optimistically**, before the POST resolves (`C-R1`), and is **withdrawn on a 403**
in favour of `RefusalNotice` (`C-D13`). A route that can refuse and a client that cannot
withdraw is how a refused message ends up on screen looking stored.

**`gate.ts` needs no new argument.** But `moderation_flags` has no surface column, so a
blocked chat message and a blocked reading are indistinguishable rows — see
`## Discrepancies` item 5 and the `surface` prop this plan adds to three existing events.

### `F1-D9` — `chat_messages.body` stores the SANITIZED string, and the sanitizer already has the fence `C-D8` asks for

The reading route's rule, verbatim: *"IT IS HANDED THE SANITIZED STRING, NOT `question`.
Moderating one string and prompting another is the classic bypass."* A chat message is
moderated, stored, and then read back into every subsequent prompt in the room (`C-R5`), so
it is the same rule with a longer tail — a delimiter that survives storage is a delimiter in
every future prompt, not just one.

`sanitizeAnswer(raw, MAX_CHAT_MESSAGE_LENGTH)` is the function: it is the parameterised
sibling of `sanitizeQuestion`, already exported, already tested, and it **rejects rather than
truncates**. Zod checks the raw length first, so an over-cap body is a 400 before it arrives.

**`MAX_CHAT_MESSAGE_LENGTH = 2000`**, in `chat/types.ts`, not `MAX_QUESTION_LENGTH`'s 200. A
question is one line typed into a box under a spread; a chat message is a paragraph somebody
types into a room. The cap is enforced by Zod and **not by a column CHECK**, following
`blog_post_locales`' *"under 110 chars by lint, not by column"* — a constant that moves must
not require a migration.

**And `C-D8` condition 3 is already satisfied by existing code.** It asks for *"a sixth
fence, `<jawaban>`"*. `sanitize.ts` has had **six** fences since V8 and `<jawaban kunci="…">`
is the **fourth** of them — `<sosok>` is the sixth. So `stripUntrusted` already strips the tag
`C-D8` names, in both directions, with a test asserting the count. **F1 changes nothing in
`sanitize.ts` and F3 needs no new tag for the answers block.** Recorded in
`## Discrepancies` item 6, because a session reading `C-D8` will otherwise add a seventh
alternative that already exists and break `sanitize.test.ts`'s count assertion.

### `F1-D10` — The erasure answer is "the cascade covers it", and the audit is written down

`C-D20` requires this in writing even if the answer is trivial. It is not quite trivial.

All three tables cascade from `users.id`. The **hard** delete at `ERASURE_GRACE_DAYS` removes
every thread, message and run. The **soft** delete — `deleteAccount()` setting `deleted_at`
— removes nothing, and that is correct:

**`chat_messages.body` is `readings.question`'s neighbour, not `moderation_flags.question`'s.**
`delete.ts`'s header already states the rule that decides it: *"The asymmetry with
`moderation_flags` IS the asymmetry in the foreign keys: `set null` outlives the account,
`cascade` does not."* `moderation_flags.user_id` is `set null`, so a self-harm disclosure
would sit there for thirty more days and is therefore redacted inside the erasure
transaction. `readings`, `onboarding_answers` and now `chat_*` all cascade, so they are gone
at thirty days — and clearing them at the soft delete would **break the thirty-day restore
the confirmation copy promises**, which is precisely why `clearFreeTextAnswers()` is
deliberately absent from that transaction.

**So `deleteAccount()` gains zero lines, and `redactForUser` is not extended.**

Three things that follow and must not be undone:

- **`chat_messages.user_id` must stay `on delete cascade`.** The day somebody changes it to
  `set null` "to keep the analytics", the redaction obligation arrives with it and this
  paragraph becomes false. `delete.integration.test.ts` gains a case asserting the cascade,
  named for the promise rather than for the mechanism.
- **`events` rows survive erasure with `user_id` nulled**, which is why the six new event
  names below carry lengths, counts and closed unions and never a body.
- **`llm_calls.user_id` is `set null`**, so a chat call's cost outlives the account with no
  attribution. That is already true of every other op and needs no new treatment.

### `F1-D11` — `/chat` is refused by omission, and `gate.ts` gets zero lines

`C-D12` and `G2`. `isPublic()` is an allowlist of exact strings and narrow prefixes plus one
content clause; `/chat` is simply not in it, so a signed-out visitor is 302'd to `/login` and a signed-in
un-onboarded one to `/onboarding`. **No code change is required and none may be made** —
this is A1's ruling about `/admin` in the same words (*"`src/middleware.ts` and
`src/lib/auth/gate.ts` need NO code change"*), and the deliverable is the negative controls
in `gate.test.ts`, not an edit.

`/en/chat` reaches `decide()` spelled as the request spelled it. `isPublicContentPath()`
returns false (it is not a content path), the `/en/` strip in the content clause never runs
for it (`G2`: *"the other clauses must not strip"*), so the path is gated, falls through to
the route tree, and matches nothing — a real 404. **The test is named for the worst outcome
available in this release**, following the v0.4.0 precedent.

---

## 3. Numbered invariants

Each states a rule, why, and what breaks. These are the part of this document worth keeping.

**`[F1-1]` A `chat_messages` INSERT and its run's `beats_done` increment are ONE
TRANSACTION, and the UPDATE carries `WHERE lease_owner = $owner`.** This single pairing is
the whole of `C-R3`. If the UPDATE matches zero rows — because another executor took the
lease in between — the transaction rolls back and **no message is stored**. Split them, or
drop the `lease_owner` predicate, and the failure is the one `C-R3` names as real and
visible: **the same bubble in the room twice**, from two tabs or from a tab racing the cron.
`chat.lease.integration.test.ts` is the proof and it asserts a message COUNT of one, never a
status.

**`[F1-2]` The lease is taken in the SAME STATEMENT that reads the run, with
`FOR UPDATE SKIP LOCKED`.** A read-then-update is a race with a window the width of a network
round trip, and this run engine is reached concurrently by two tabs, an `after()` and a cron
by design. `SKIP LOCKED` covers the in-flight case and `lease_until < now()` covers the
committed one; **both are needed and neither is redundant**, because a lease held by a
committed transaction is not a locked row.

**`[F1-3]` The lease is ~90 seconds and is RECLAIMABLE, never permanent.** `C-R3`. A lambda
killed mid-beat must not lock the room until somebody notices, and the only thing that makes
that safe is `[F1-1]`: reclaiming a lease can at worst re-execute a beat whose message was
never committed.

**`[F1-4]` The beat sheet and the flip to `status = 'running'` are ONE UPDATE.** So
`status = 'planning' AND beats IS NOT NULL` is unrepresentable, and a reclaimed `planning`
run is provably one that has no sheet and must be planned again. Two statements, and a
reclaimed run with a sheet gets a **second** sheet — six bubbles where the querent was
promised three.

**`[F1-5]` The director's write additionally refuses when `beats_done > 0`.** Belt to
`[F1-4]`'s brace. A sheet overwritten after a beat has executed makes `beats_done` index into
a different array, so the run resumes at the wrong beat and re-posts one it already posted.
The guard is in the `WHERE`, not in TypeScript.

**`[F1-6]` A shed model call leaves the run EXACTLY as it was, releases the lease, and is not
an error.** `C-D6` consequence 3, and it is the single best argument for the run engine. No
`beats_done` increment, no `error_kind`, no `abandoned`, no 500, no bubble. The querent's next
visit delivers the rest. **The response says `state: 'shed'` and F4 must not retry it
immediately** — retrying a soft-ceiling refusal is a client hammering a budget that is
already out.

**`[F1-7]` A beat that fails validation twice ADVANCES `beats_done` and stores NOTHING.**
`C-R7`. The run continues; the room is quieter; nothing on screen says a reader failed.
**There is no error bubble in this release and there must never be one**, because W4's
`[Bacaan terputus…]` rule — the notice reaches the screen and never `readings.body` — is
unimplementable here: in a chat, every message *is* stored and *is* context for the next one,
so a stored notice would be quoted back at the querent by the next beat as if a reader had
said it. The failure is automatic rather than accidental.

**`[F1-8]` `POST /api/chat/message` makes no generative model call.** `C-R1`. It gates,
stores, mints, returns. The one model call is the classifier, already bounded at
`MODERATION_TIMEOUT_MS`. Add a planner call here "to save a round trip" and the querent waits
for a director before their own words render, which is the most obviously wrong thing this
design could do.

**`[F1-9]` The string that is moderated is byte-for-byte the string that is stored and later
prompted.** `F1-D9`. `sanitizeAnswer` is idempotent (there is a property test for its
sibling), so calling it once at the top of the handler and using that one value for the
classifier, the row and every future prompt is what makes the bypass unavailable. Two
sanitizations, or a raw store beside a clean classify, is the classic one.

**`[F1-10]` Every route handler starts with `requireUser()` and reads `{ ok }`.** §4.2.
Nothing calls `auth()`, nothing reads the cookie. `requireUser()` requires completed
onboarding by default, which is what the chat needs: the readers' context is the six answers
and the Lotus, and a half-onboarded querent has neither.

**`[F1-11]` `POST /api/chat/message` verifies that `attached_reading_id` belongs to the
caller.** F6 owns the bubble; **F1 owns the route, so F1 owns this check.** Without it a
querent posts a stranger's reading id and three readers read a stranger's reading aloud, in a
room, from a body the attacker never had access to. The check is `readings.user_id = $caller`
and it is a WHERE clause, not a 403 branch on a separate read — one statement, one truth.

**`[F1-12]` `chat_messages.model` is never selected by a query that feeds a route.**
`F1-D6`. §0.3 non-negotiable 2 says no model name reaches the browser, and
`audit-secrets.ts` greps the built bundle for env VALUES — it cannot see a column that a
route JSON-serialised. Explicit projections in `queries/chat.ts` are the enforcement, and a
bare `db.select()` in that file is a defect `chat.contract.test.ts` fails on.

**`[F1-13]` `queries/chat.ts` takes the handle FIRST and acquires no `server-only`, no
React and no `next/*`, transitively.** `queries/contract.test.ts` walks the graph and already
enforces both. It may therefore import `@/lib/chat/types` **only because that file is PURE** —
which is why `types.ts` may never grow an env read, a `server-only`, or a prompt string.

**`[F1-14]` `src/lib/chat/types.ts` is a LEAF: no `server-only`, no `next/*`, no
`process.env`, and its only import is `@/data/types`.** Six workstreams import it, including
a query module and (through F4) a client component. `flags.ts`, `prefix.ts`, `origin.ts` and
`choice.ts` are the four precedents, and every one of them says the same thing: a leaf that
acquires one import stops being reachable from one side of the app, and the discovery is a
build failure in somebody else's branch.

**`[F1-15]` `chatModel()` returns `undefined` when unset and `chatModelName()` restates
`ledger.ts`'s `||` chain exactly.** §7's words. `LLMCallOpts.model` is optional and
`resolvedModel()` resolves an absent one as `opts.model || LLM_MODEL || 'unknown'`; handing
the adapter the literal string `'unknown'` would send `model: "unknown"` to the provider. And
the two must stay identical, or **`chat_runs.plan_model` and the `llm_calls` row written
beside it name different models** — which is worse than either being wrong alone.
`model.test.ts` pins the chain, exactly as `admin/model.ts`'s does.

**`[F1-16]` `||`, not `??`, on every model variable.** An empty string is what a Vercel
variable added and then cleared looks like, and `CHAT_MODEL=''` reaching an adapter is a 400
that reads like a bad key.

**`[F1-17]` Every environment variable is read at CALL TIME, never at module scope.** §8.
A module-scope `const` is inlined by the bundler and freezes the build-time value into
production, which makes every one of these unflippable without a redeploy — the exact
property they exist to provide.

**`[F1-18]` A numeric variable falls back rather than becoming zero.** `positive()`'s rule
from `meter.ts` and `auth/ttl.ts`: `Number('')` is `0`, and a chat ceiling of `0` refuses
every chat call in the app, which is a typo taking a feature down with nothing reporting it.

**`[F1-19]` `CHAT_ENABLED=0` gates the model call, never the read.** `C-D15`. The room
opens, every past message renders, `GET /api/chat/messages` is untouched, and only
`/api/chat/advance` and the mint decline. `/api/chat/state` reports `chatEnabled: false` so
F4 can disable the composer with one line of copy. **A kill switch that blanks a screen is a
worse outage than the quota it protects**, and every flag in `flags.ts` already follows this
rule.

**`[F1-20]` `CHAT_ENABLED=0` writes nothing and is therefore self-healing.** The Lotus's
side of the `flags.ts` asymmetry, not the persona's: there is no stored artifact whose hash
would freeze, because a run left `pending` is picked up the moment the flag returns to `1`.
**Nothing is degraded and nothing must be stored to avoid a 500** — `/api/chat/state` has an
empty-state answer for every querent, which is `/api/persona`'s missing property and the
reason that route 500s.

**`[F1-21]` `local_date` and `proactive_count_date` are `'YYYY-MM-DD'` STRINGS, never
`Date`.** §9.9 and the `local_date` trap verbatim: a `Date` renders in the server's zone and
is a day out for anyone in Jakarta between midnight and 07:00. An integration test fails if
anyone "fixes" the column to `mode: 'date'`.

**`[F1-22]` `$onUpdate()` does not fire inside `onConflictDoUpdate` — every upsert sets
`updatedAt` by hand.** §9.10. For `chat_threads` the column is the only thing that can say
when the cursors last moved, and a frozen one makes every staleness question about a thread
unanswerable.

**`[F1-23]` No driver error is ever logged from a path that runs a chat query.** §9.6. A
postgres error quotes the failing statement **and its bound parameters**, and
`chat_messages.body` is one of them — text a person typed into a room where they were invited
to talk about the worst thing they have seen. Production logs ids, attempt and SQLSTATE;
development prints the whole thing, because there is nobody to leak it to. The generalisation
`CLAUDE.md` states is the audit: *"which of my bound parameters came from a person."* Every
`catch` in F1's files uses one `logChatFailure()` helper, and `chat.contract.test.ts` greps
the routes for a bare `console.error(err)`.

**`[F1-24]` No free text in `events.props`.** §9.5. A length, a count, a closed union, a
uuid. Never a body, never a nickname, never an address form, never a reject *message*.
`events` rows survive erasure with `user_id` nulled and that is only honest because
`sanitizeProps()` provably strips everything identifying.

**`[F1-25]` `sanitizeProps()` DROPS non-scalars, so no prop is ever an array.** W5's
`recalled_ids` and V8's `facets` were both flattened for this: an array prop arrives as an
**absent key** with nothing logged and nothing thrown, which is worse than a prop that was
never declared. `chat.run_planned` carries `beats`, `cast` and `asks` as integers rather than
a cast array for exactly this reason.

**`[F1-26]` Chat calls are `callClass: 'deferred'`, and that is a promise to the reading.**
`C-D6`. The rule in `types.ts` says a call somebody is watching a spinner for is
`interactive`, and by that rule a chat turn is interactive. **The exception is deliberate and
arithmetic**: a run is 2–5 calls, sixty runs exhaust the whole app's five-hour quota, and the
next thing refused would be somebody's reading. `callClass.test.ts` carries the two rows and
the reason.

**`[F1-27]` `chat_plan` and `chat_turn` are two ops, not one and not three.** `C-D5`. Two
because a large prompt with a tiny JSON reply and a large prompt with a two-sentence reply
have wildly different token shapes and averaging them makes both figures meaningless. Not
three, because *what made a turn proactive is `chat_runs.trigger`* — **an op is what the call
is, not why it happened.**

**`[F1-28]` Four of thirteen ops now measure something other than a reading.** A
cost-per-reading denominator must exclude `insight`, `blog_format`, `chat_plan` **and**
`chat_turn`. **F1 must not fix that anywhere it already exists** — seam S10 gives it to F7,
and F1 "helpfully" patching one of A3's queries is how two workstreams both half-fix one
thing.

**`[F1-29]` `/chat` is never in `isPublic()`, has no canonical, no `hreflang`, no sitemap
entry, and is `noindex`.** `C-D12`. This room contains a person's six onboarding answers
spoken aloud. **`/en/chat` must 404.**

**`[F1-30]` `/privacy` is amended in the SAME release, in both locales, and the amendment
changes existing sentences rather than adding a new clause beside them.** §9.4. Two sentences
in the shipped policy become **false** the day `C-D8` ships — clause 2.2's *"only the abstract
summary reaches the language model"* and clause 4.1's *"an abstract summary of your initial
answers"*. A1's reconciliation R31 already ruled on this exact shape: *"Amending only 3 and 8
would leave a policy that is technically amended and still misleading, which is worse than one
plainly out of date."*

**`[F1-31]` A skipped answer stays skipped, and the prompt is told the set is partial.**
`C-D8` condition 5. `answer_text IS NULL` means the querent declined, and **a reader who asks
about the thing you refused to answer is the worst possible version of this feature.** F3
implements the omission; F1 states it because F1 owns the privacy clause that promises it.

**`[F1-32]` `events.ts` has ONE owner for v0.7.0 and it is F1, and folding a declaration in
means TRANSCRIBING it.** `C-D14`, S6. A workstream's prop shape is narrowed only by a written
argument in this document's `## Events` section, never silently.

---

## The `beats` JSON shape — seam S1

**F1 owns the shape. F2 owns what goes in it. F3 reads it.** Quoted verbatim; F2's plan
quotes this block and does not restate it in its own words.

```ts
// src/lib/chat/types.ts — PURE. No imports but `@/data/types`.

/**
 * WHO IS SPEAKING, and the union is `ReaderId` because a beat is always a reader.
 * There is no `'user'` beat: the querent is not directed.
 */
export type BeatSpeaker = ReaderId;

/**
 * WHO IS BEING SPOKEN TO. Not the same thing as `replyTo`, and conflating them is
 * the mistake this field exists to prevent — see the comment on `replyTo`.
 */
export type BeatAddressee = 'user' | ReaderId;

/**
 * WHAT THE BEAT IS FOR.
 *
 * **F2 OWNS THE MEMBERS; F1 OWNS THAT THE FIELD IS A CLOSED UNION DECLARED HERE.**
 * The relationship is `LLMOp`'s: the union lives in the import-free file because
 * `queries/chat.ts` and a client component both name it, and adding a member is a
 * reconciliation question rather than an authoring convenience. The set below is
 * §7's proposal, transcribed.
 *
 * `ask` IS THE ONE THE RELEASE IS MEASURED BY (`C-N1d`), which is why
 * `chat.run_planned` carries an `asks` count rather than leaving it to be derived.
 */
export type BeatIntent =
  | 'answer'
  | 'ask'
  | 'react'
  | 'tease'
  | 'agree'
  | 'push_back'
  | 'aside';

/**
 * ONE BEAT. FOUR FIELDS, ALL CLOSED, AND **NO FREE TEXT** (`F1-D1`).
 *
 * A `topic` or `hint` field is the obvious fifth and it is refused: `C-R5` says every
 * beat sees every earlier beat's ACTUAL WORDS, and a director-written summary sitting
 * in the prompt is what a voice would read instead of the transcript. The failure is a
 * room where the readers answer a plan rather than each other.
 *
 * `delayMs` is ALSO not here (seam S3). It is a function of the PREVIOUS bubble's
 * length, which does not exist when the sheet is written; F3's `Pace` computes it at
 * execution time from prose that has actually been generated.
 */
export type Beat = {
  /** Which reader speaks. */
  reader: BeatSpeaker;
  /**
   * WHO THEY ARE TALKING TO. A prompt fact: it decides whether the querent is
   * addressed by name at all, which is what `validateTurn`'s address-form check
   * (`C-D10`) needs before it can refuse an invented nickname.
   */
  to: BeatAddressee;
  /**
   * WHICH MESSAGE THIS QUOTES, or null. `chat_messages.id`.
   *
   * **THIS IS THE QUOTE STUB AND NOT THE ADDRESSEE** (`C-D11`: *"WhatsApp's quote
   * stub and nothing more"*). A beat may address Margaret without quoting her, and
   * may quote a message while addressing the querent about it. Two facts, two
   * fields; merged, and `to` becomes unknowable for every un-quoted beat.
   *
   * **THE "OUT OF NOWHERE" REPLY IS THIS FIELD POINTING AT AN OLD ID** and nothing
   * else. `C-D11`: nothing else is needed and nothing else may be built.
   */
  replyTo: string | null;
  intent: BeatIntent;
};

/**
 * THE SHEET, AS IT IS STORED IN `chat_runs.beats`.
 *
 * A WRAPPER AND NOT A BARE ARRAY (`F1-D1`): a jsonb blob written by one workstream,
 * read by another, indexed into by `beats_done` forever, cannot say which shape it is
 * if it is an array. One integer buys a discriminated read instead of a guess.
 *
 * **`beats: []` IS A VALID SHEET AND IS THE COMMON GOOD OUTCOME** (`C-R6`): the
 * director said nobody replies, the run goes straight to `done`, no `chat_turn` call is
 * made, and the querent's message sits there unanswered — which is what happens in a
 * real group chat. F7 measures the rate; **a rate of zero means the director is not
 * really deciding.**
 */
export type BeatSheet = {
  v: 1;
  beats: Beat[];
};
```

**What F2 may change without a migration:** the members of `BeatIntent`, through the
reconciliation. **What F2 may not change:** the field set, the absence of free text, or `v`.
`chat.contract.test.ts` asserts the four field names and asserts that no field of `Beat` is
typed `string` other than `replyTo`.

---

## The engine — state machine, lease protocol, and the SQL

### The states

`pending | planning | running | done | abandoned`, per §3.3. **`pending` and `planning`
differ**: `pending` is minted and unclaimed, `planning` is claimed and the director is in
flight. Collapsing them loses the ability to tell "nobody has advanced this yet" from "an
executor died mid-plan", which is exactly the distinction the lease reclaim needs.

### (status, event) → (status, action)

| status | event | → status | action | reply |
|---|---|---|---|---|
| — | mint (post / trigger) | `pending` | insert `chat_runs` | — |
| `pending` | `advance`, lease taken | `planning` | call the director (`chat_plan`) | — |
| `planning` | plan returns ≥1 beat | `running` | ONE UPDATE: write `beats`, `plan_model`, `locale`, flip status, release lease | `{ state:'planned', next:{reader,delayMs}, done:false }` |
| `planning` | plan returns 0 beats (`C-R6`) | `done` | write `beats:{v:1,beats:[]}`, release lease. **No turn call.** | `{ state:'silent', done:true }` |
| `planning` | call failed or `validatePlan` refused | `running` | write F2's deterministic single-beat fallback as the sheet | `{ state:'planned', … }` |
| `planning` | fallback impossible (no material at all) | `abandoned` | `error_kind`, release lease | `{ state:'silent', done:true }` |
| `planning` | shed (`F1-D5`) or `CHAT_ENABLED=0` | `planning` | release lease, nothing written | `{ state:'shed', done:false }` |
| `running` | `advance`, beat valid | `running` \| `done` | ONE TX: insert message + `beats_done++` + release lease | `{ state:'spoke', message, next, done }` |
| `running` | beat invalid, attempt 1 | `running` | retry the SAME beat, in this request (`F1-D2`) | — |
| `running` | beat invalid, attempt 2 | `running` \| `done` | `beats_done++`, **store nothing** (`C-R7`) | `{ state:'skipped', next, done }` |
| `running` | every beat skipped | `abandoned` | `error_kind='all_beats_failed'` | `{ state:'silent', done:true }` |
| `running` | shed | `running` | release lease, nothing written | `{ state:'shed', done:false }` |
| `planning` / `running` | lease live, held by someone else | unchanged | nothing | `{ state:'busy', done:false }` |
| `planning` / `running` | lease expired | reclaimable | next `advance` retakes it | — |
| `done` / `abandoned` | `advance` | unchanged | nothing | `{ state:'idle', done:true }` |
| — | `advance`, no active run | — | nothing | `{ state:'idle', done:true, runId:null }` |

**`abandoned` and `silent` are indistinguishable from the room, deliberately** (`C-R7`).

### The lease protocol, as SQL

**Claim.** One statement. `owner` is a per-request `crypto.randomUUID()` — an opaque token,
**never a session id** (§3.3).

```sql
update chat_runs
   set lease_until = now() + make_interval(secs => $3),
       lease_owner = $2,
       status      = case when status = 'pending' then 'planning' else status end,
       updated_at  = now()
 where id = (
         select id
           from chat_runs
          where user_id = $1
            and status in ('pending', 'planning', 'running')
            and (lease_until is null or lease_until < now())
          order by created_at asc
          limit 1
          for update skip locked
       )
returning id, status, trigger, trigger_message_id, trigger_reading_id,
          locale, beats, beats_done, created_at;
```

**Why both predicates.** `for update skip locked` skips a row another transaction currently
holds — the two-tabs-in-the-same-millisecond case. `lease_until < now()` excludes a row whose
holder has already committed — the two-tabs-a-second-apart case, which is far more common and
which `skip locked` alone does **not** cover. Drop either and the second tab executes the
same beat.

**`order by created_at asc`** so a querent with a stale abandoned-looking run and a fresh one
drains the old first, in the order the room happened.

**Write the sheet.** One statement, `[F1-4]` and `[F1-5]`:

```sql
update chat_runs
   set beats      = $3::jsonb,
       beats_done = 0,
       plan_model = $4,
       locale     = $5,
       status     = case when jsonb_array_length($3::jsonb -> 'beats') = 0
                         then 'done' else 'running' end,
       lease_until = null,
       lease_owner = null,
       updated_at  = now()
 where id = $1
   and lease_owner = $2
   and beats_done = 0
   and beats is null
returning status;
```

Zero rows returned means somebody else planned it. **That is not an error** — the reply is
`{ state: 'busy' }` and the client retries after `delayMs`.

**Execute one beat.** The insert and the increment in ONE transaction (`[F1-1]`):

```sql
-- inside db.transaction(...)
insert into chat_messages
  (id, user_id, author, body, locale, reply_to_message_id, run_id, beat_index, model)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9);

update chat_runs
   set beats_done  = beats_done + 1,
       status      = case when beats_done + 1 >= $11 then 'done' else 'running' end,
       lease_until = null,
       lease_owner = null,
       updated_at  = now()
 where id = $7
   and lease_owner = $10
   and beats_done = $8
returning beats_done, status;
```

**`and beats_done = $8` is the second half of the guarantee.** The lease predicate stops a
second executor; this stops the *same* executor replaying a beat it already committed after a
retry at a higher layer. Zero rows → the driver's `returning` is empty → **throw and let the
transaction roll back**, discarding the insert. The route answers `{ state: 'busy' }`.

**Release without advancing** (shed, busy, planning-failed):

```sql
update chat_runs
   set lease_until = null, lease_owner = null, updated_at = now()
 where id = $1 and lease_owner = $2;
```

**Lease length: 90 seconds**, one and a half times `maxDuration`. Shorter than `maxDuration`
and a slow beat's own lease expires under it, letting a second executor in while the first is
still writing — which `[F1-1]`'s `beats_done` predicate would catch, but only after paying for
two model calls. Much longer, and a dead lambda locks the room past a querent's patience.

---

## Schema deltas

Three tables, one migration, **`0014_f1-chat.sql`**, owner F1 and only F1. Generated with
`npm run db:generate -- --name f1-chat`; the `schema.ts` edit, the `.sql` and every file under
`meta/` are committed in one commit (`migrations/README.md` rule 4). **`drizzle-kit push` is
banned.**

**There is no `pgEnum` and there must not be one** — `ALTER TYPE … ADD VALUE` cannot run in
the transaction that adds it, so every closed set is `text` with a `CHECK` and a `$type<>()`.

### `chat_threads` — one row per querent

```ts
export const chatThreads = pgTable('chat_threads', {
  /**
   * THE ONLY KEY. `C-D2`: one thread per querent, forever. **A `thread_id` column
   * anywhere in this release is a mistake** — `chat_messages.user_id` is what makes
   * account erasure a cascade rather than a join, and a surrogate key on a table whose
   * natural key is already a uuid buys nothing and costs a second unique index.
   * `profiles`, `lotus_avatars` and `personas` take the same exception.
   */
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The badge's cursor. **NULL means never opened**, which is not the same as zero
   *  unread and is what `C-D18`'s M14 contract renders as no dot at all. */
  lastReadAt: tsCol('last_read_at'),
  /** Silence measurement for F5's triggers. Denormalised from `chat_messages` for the
   *  reason `readings.shared_at` is: the eligibility predicate must not join. */
  lastUserMessageAt: tsCol('last_user_message_at'),
  lastReaderMessageAt: tsCol('last_reader_message_at'),
  /** The proactive throttle's left-hand side. */
  lastProactiveAt: tsCol('last_proactive_at'),
  proactiveCountToday: integer('proactive_count_today').notNull().default(0),
  /**
   * **A `'YYYY-MM-DD'` STRING, NEVER A `Date`** (`C-N2d`, `F1-21`). The QUERENT'S
   * calendar day, sent by the client. A `Date` renders in the server's zone and is a
   * day out for anyone in Jakarta between midnight and 07:00 — and this column decides
   * whether a reader is allowed to message somebody today.
   *
   * NULLABLE, because a thread exists before any proactive run has been considered.
   */
  proactiveCountDate: dateCol('proactive_count_date'),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  /** SET BY HAND IN EVERY UPSERT (`F1-22`). `$onUpdate()` does not fire inside
   *  `onConflictDoUpdate`, and this is the only column that can say when the cursors
   *  last moved. */
  updatedAt: tsCol('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});
```

No index. The primary key is the only access path.

### `chat_messages` — the log, append-only

```ts
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * `'user' | 'thessaly' | 'margaret' | 'adrian'`.
     *
     * **ONE COLUMN, NOT A NULLABLE `reader_id` BESIDE A BOOLEAN** (§3.2): two columns
     * that must agree is two columns that will not.
     *
     * Bare `text` narrowed with `$type<ChatAuthor>()` — F1 owns the value set and
     * `ChatAuthor` lives in `@/lib/chat/types`, which is PURE and imports only
     * `@/data/types`. That does **not** breach this file's narrowing rule for the same
     * reason `Block` does not: the rule forbids `schema.ts` depending on a module that
     * depends on `schema.ts`, and nothing under `src/lib/chat/types.ts` does or may.
     */
    author: text('author').$type<ChatAuthor>().notNull(),
    /**
     * **TEXT A PERSON TYPED, IN PLAINTEXT, EXACTLY LIKE `readings.question`** (`C-D20`)
     * — and already through `sanitizeAnswer` (`F1-D9`), because this string enters
     * every subsequent prompt in the room.
     *
     * Three consequences: never log a driver error from a path that binds it
     * (`F1-23`); `/privacy` names it as stored user text; and `events.props` carries a
     * length and never this.
     */
    body: text('body').notNull(),
    /** The language **this message** is in (`C-D9`). Not the viewer's, not the
     *  thread's — there is no thread language. A bubble carries a `lang` attribute
     *  matching this; the page does not. */
    locale: text('locale').$type<Locale>().notNull(),
    /**
     * `C-D11`. **`set null`, NEVER cascade**: deleting a quoted message must not delete
     * the reply. Both sides may use it — the querent from the UI, a reader when the
     * beat sheet says so.
     */
    replyToMessageId: uuid('reply_to_message_id').references(
      (): AnyPgColumn => chatMessages.id,
      { onDelete: 'set null' },
    ),
    /** F6's. **In `0014` so F6 needs no migration.** `set null`, so the bubble outlives
     *  its reading and F6 decides what that renders. */
    attachedReadingId: uuid('attached_reading_id').references(() => readings.id, {
      onDelete: 'set null',
    }),
    /** NULL for a user message. Paired with `beatIndex` by `insertMessage`, **not by a
     *  CHECK** — see `F1-D7`. */
    runId: uuid('run_id').references(() => chatRuns.id, { onDelete: 'set null' }),
    beatIndex: integer('beat_index'),
    /**
     * **THE RESOLVED MODEL, NULL FOR `author = 'user'`** (`F1-D6`). Every other table
     * holding generated prose carries one; a chat bubble would otherwise be the only
     * generated prose here that cannot say what wrote it.
     *
     * **NEVER SELECTED BY A QUERY THAT FEEDS A ROUTE** (`F1-12`). §0.3 forbids a model
     * name reaching the browser and `audit-secrets.ts` cannot see a serialised column.
     */
    model: text('model'),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    /**
     * **THE ONLY READ PATTERN THE SURFACE HAS**, and the keyset-pagination index:
     * `where user_id = $1 and (created_at, id) < ($2, $3) order by created_at desc,
     * id desc limit $4`. The `id desc` tail is what makes the tuple comparison
     * index-ordered rather than a sort.
     */
    index('chat_messages_user_created_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    /**
     * `C-R5`'s per-run read — every beat sees every earlier beat of its own run — AND
     * the FK's own index. **AN FK IS NOT AN INDEX AND POSTGRES WILL NOT MAKE ONE**:
     * `reading_cards_reading_idx`'s lesson is that a referential action performs one
     * sequential scan PER parent row, and `set null` scans exactly as `cascade` does.
     */
    index('chat_messages_run_idx').on(t.runId).where(sql`run_id is not null`),
    /** The self-FK's `set null` scan. PARTIAL, because almost every row is null. */
    index('chat_messages_reply_idx')
      .on(t.replyToMessageId)
      .where(sql`reply_to_message_id is not null`),
    /** The `set null` from `readings`, which deletes in bulk at the hard erasure. */
    index('chat_messages_reading_idx')
      .on(t.attachedReadingId)
      .where(sql`attached_reading_id is not null`),
    /** The closed set. A CHECK rather than a pgEnum, per this file's header. */
    check(
      'chat_messages_author_ck',
      sql`${t.author} in ('user', 'thessaly', 'margaret', 'adrian')`,
    ),
    /**
     * **A READER NEVER STORES AN EMPTY BUBBLE.** `C-R7` says a failed beat stores
     * nothing; an empty string is that failure arriving as data and being read aloud by
     * the next beat as a message somebody sent.
     *
     * The `author = 'user'` escape is F6's: **an attachment with no text is a perfectly
     * good conversational move** and must produce a run. The route refuses a user
     * message that is empty AND unattached; the column does not, because
     * `attached_reading_id` carries `on delete set null` and `F1-D7` forbids a CHECK
     * over such a column.
     */
    check('chat_messages_reader_body_ck', sql`${t.author} = 'user' or length(${t.body}) > 0`),
    /** A self-reply renders an infinite quote stub. One line, no FK involved, free. */
    check('chat_messages_no_self_reply_ck', sql`${t.replyToMessageId} <> ${t.id}`),
  ],
);
```

**Refused: the partial index for the badge count.** §3.2 suggests one. It is declined and the
refusal is recorded rather than forgotten: the badge counts reader messages after
`last_read_at`, and `chat_messages_user_created_idx`'s two leading columns already reduce that
to the unread window — a handful of rows. A fourth index on the highest-write table in this
release is write amplification for a count over five rows. **Revisit if a thread ever holds
enough unread messages for the filter to matter, which would itself be a bug in `C-N2d`'s
throttle.**

### `chat_runs` — the unit of generation

```ts
export const chatRuns = pgTable(
  'chat_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * **F5 OWNS THE VALUES; THE SET IS CLOSED AND LIVES HERE** (§3.3).
     * `'user_message' | 'reading_completed' | 'idle_nudge' | 'unanswered' | 'cron'`.
     *
     * `C-D5`: **a proactive turn is a `chat_turn`, and what made it proactive is this
     * column.** An op is what the call is; this is why it happened. `/admin/chat`
     * groups by it.
     */
    trigger: text('trigger').$type<RunTrigger>().notNull(),
    /** The posted message, for `'user_message'`. `set null` — a run whose trigger is
     *  gone is still a run that happened, and `F1-D7` forbids a CHECK tying them. */
    triggerMessageId: uuid('trigger_message_id').references(
      (): AnyPgColumn => chatMessages.id,
      { onDelete: 'set null' },
    ),
    triggerReadingId: uuid('trigger_reading_id').references(() => readings.id, {
      onDelete: 'set null',
    }),
    status: text('status').$type<RunStatus>().notNull().default('pending'),
    /** The run's language (`C-D9`). Declared by the director from the querent's text,
     *  validated against `id | en`, falling back to `users.locale`. **There is no
     *  language detector in this repo and this release does not add one.** */
    locale: text('locale').$type<Locale>().notNull(),
    /**
     * THE BEAT SHEET. `BeatSheet`, quoted verbatim in this plan's own section — seam
     * S1: **F1 owns the shape, F2 owns the contents.**
     *
     * NULL until the director has answered, and `[F1-4]` makes
     * `status = 'planning' AND beats IS NOT NULL` unrepresentable: the write and the
     * status flip are ONE UPDATE.
     */
    beats: jsonb('beats').$type<BeatSheet>(),
    beatsDone: integer('beats_done').notNull().default(0),
    /** `C-R3`. Two tabs must not execute the same beat. ~90s and reclaimable. */
    leaseUntil: tsCol('lease_until'),
    /** An opaque per-request token. **NEVER a session id** (§3.3) — a session id in a
     *  row that F7 may render is an identifier with no reason to be there. */
    leaseOwner: text('lease_owner'),
    /** The resolved planner model, `llm_calls.model`'s neighbour. `chatModelName()`,
     *  which restates `ledger.ts`'s chain (`F1-15`) so the two cannot disagree. */
    planModel: text('plan_model'),
    /**
     * `classifyStreamError()`'s vocabulary plus this engine's own
     * (`plan_invalid`, `all_beats_failed`). **A SHORT CLASSIFIER, NEVER A MESSAGE** —
     * unbounded cardinality makes every `group by` useless and a message can carry a
     * prompt fragment or a key.
     *
     * **SNAPSHOT IT BEFORE ANY `await`** (§3.3, `tee.ts`'s trap): `finish()` read its
     * fields after `await source.usage`, by which time a cancelled controller had made
     * the catch overwrite `errorKind` with `'unknown'` — so every abandoned reading was
     * recorded as failing for an unknown reason.
     */
    errorKind: text('error_kind'),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    updatedAt: tsCol('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    /**
     * THE CLAIM QUERY AND `activeRunFor`, and nothing else ever reads this table by
     * user. PARTIAL on the three live statuses, so the index stays the size of the
     * app's in-flight work forever rather than the size of its history.
     */
    index('chat_runs_user_active_idx')
      .on(t.userId, t.createdAt)
      .where(sql`status in ('pending', 'planning', 'running')`),
    /** F5's suppression rule (seam S5): *has a run already been minted for reading X?*
     *  Also the `set null` scan from `readings`. */
    index('chat_runs_trigger_reading_idx')
      .on(t.triggerReadingId)
      .where(sql`trigger_reading_id is not null`),
    /** The `set null` scan from `chat_messages`. */
    index('chat_runs_trigger_message_idx')
      .on(t.triggerMessageId)
      .where(sql`trigger_message_id is not null`),
    /** F7 groups by trigger over a date range. */
    index('chat_runs_trigger_created_idx').on(t.trigger, t.createdAt.desc()),
    check(
      'chat_runs_status_ck',
      sql`${t.status} in ('pending', 'planning', 'running', 'done', 'abandoned')`,
    ),
    check(
      'chat_runs_trigger_ck',
      sql`${t.trigger} in ('user_message', 'reading_completed', 'idle_nudge', 'unanswered', 'cron')`,
    ),
    check('chat_runs_beats_done_ck', sql`${t.beatsDone} >= 0`),
    /** **A HALF-SET LEASE IS A LOCK NOBODY OWNS**, and the claim statement would then
     *  either never reclaim it or reclaim it from under a live executor.
     *  `blog_post_locales_hero_pair_ck` is the precedent for the shape. Safe under
     *  `F1-D7` because neither column carries a referential action. */
    check(
      'chat_runs_lease_pair_ck',
      sql`(${t.leaseUntil} is null) = (${t.leaseOwner} is null)`,
    ),
  ],
);
```

### The circular reference

`chat_messages.run_id → chat_runs.id` and `chat_runs.trigger_message_id → chat_messages.id`
are mutually referencing. Both are **nullable** and both are `set null`, so there is no
insert-order deadlock: a user message is inserted with `run_id = null`, the run is minted
naming it, and a reader message is inserted afterwards naming the run. Drizzle requires the
`(): AnyPgColumn =>` thunk on both sides; `AnyPgColumn` joins the `drizzle-orm/pg-core`
import list in `schema.ts`.

### What does NOT change

`readings`, `profiles`, `events`, `translations`, `share_links`, `moderation_flags`,
`llm_calls` and `admin_access_log` gain no column. `translations` gains no `entity` and
`'chat'` never becomes a `share_links` entity (`C-D12`). `resetDb()` in
`src/lib/db/testing/harness.ts` gains the three table names, **in this migration's own
commit** — that file's header sets the rule (A1 owns the list; a workstream adds its own
tables in the commit that adds the migration, because `TRUNCATE` names a relation and a name
added early makes every caller fail with `42P01` until the migration lands). Seventeen tables
become twenty. **The list is exhaustive by intent**: `CASCADE` would reach `chat_messages` and
`chat_runs` from `chat_threads` alone, and all three are named anyway so that a table added to
the schema and forgotten here shows up as leaked state rather than as a silent survivor.

---

## The routes

All six declare `export const runtime = 'nodejs'` and an explicit `maxDuration`. **§4.1 says
"default" for three of them and this plan declares a number for all six** — see
`## Discrepancies` item 3.

### `GET /api/chat/state` — `maxDuration = 30`

| | |
|---|---|
| Guards, in order | `requireUser()` → `hit('chat:state:<uid>', 240/h)` |
| Response 200 | `{ unread, lastReadAt, lastMessageAt, pendingRun, chatEnabled }` |
| Codes | 200, 401, 403, 429 |
| `after()` | **F5's proactive mint** (`C-D18`, `C-N2a` source 2), behind `chatProactiveEnabled()` |

```ts
type StateReply = {
  unread: number;                                    // reader messages after last_read_at
  lastReadAt: string | null;                         // ISO
  lastMessageAt: string | null;                      // ISO
  pendingRun: { id: string; status: RunStatus; beatsRemaining: number } | null;
  chatEnabled: boolean;                              // F1-19: F4 disables the composer
};
```

**`unread: 0` and `pendingRun: null` is a 200 with an empty state, never a 500** (§4.2). A
querent who has never opened the room has no `chat_threads` row and that is the normal case,
not an error — the property `/api/persona` lacks and 500s for. **This release must not add a
fourth route with that defect.**

**`chatEnabled` is a boolean, not a model name.** It reaches the browser deliberately.
`audit-secrets.ts` greps for env *values*; `'0'`/`'1'` are not in `SECRET_ENV` and could not
usefully be.

**The proactive tick lives in `after()` and is F5's.** F1 exports `mintRun()` and registers
the `after()`; F5 supplies the eligibility predicate. **F1 ships the hook returning `null`
unconditionally**, so the route is complete and inert until F5 lands.

### `GET /api/chat/messages` — `maxDuration = 15`

| | |
|---|---|
| Query | `?before=<ISO>&beforeId=<uuid>&limit=<1..50>` |
| Guards | `requireUser()` → `hit('chat:read:<uid>', 300/h)` |
| Response 200 | `{ messages: ChatMessageDto[]; hasMore: boolean }` — **newest first** |
| Codes | 200, 400 (bad query), 401, 403, 429 |
| `after()` | nothing |

Keyset pagination on the tuple, served index-ordered by `chat_messages_user_created_idx`:

```sql
where user_id = $1
  and ($2::timestamptz is null or (created_at, id) < ($2, $3))
order by created_at desc, id desc
limit $4
```

`before` and `beforeId` are both-or-neither and Zod refuses one without the other, for the
reason offset pagination does not survive an append-only log: a run inserting three bubbles
while the querent scrolls shifts every offset and duplicates a bubble on screen.

`limit` defaults to 30 and is capped at 50. **No `withAnalytics` and no event** — V6's history
routes set the precedent: the three history events fire from the client because
`history.filtered` needs to know chip-vs-picker and the server cannot.

**The DTO, which is what F4 and F6 consume:**

```ts
export type ChatMessageDto = {
  id: string;
  author: ChatAuthor;
  body: string;
  locale: Locale;
  replyToMessageId: string | null;
  attachedReadingId: string | null;
  runId: string | null;
  beatIndex: number | null;
  createdAt: string; // ISO
};
```

**`model` is absent and its absence is `F1-12`.**

### `POST /api/chat/read` — `maxDuration = 15`

| | |
|---|---|
| Body | `{ upTo?: string }` — ISO; absent means now |
| Guards | `requireUser()` → `hit('chat:read:<uid>')` (shared with `messages`) |
| Response 200 | `{ unread: number }` — the count AFTER the move, so F4 needs no second call |
| Codes | 200, 400, 401, 403, 429 |
| `after()` | nothing |

**It exists rather than folding into `state`, and `F1-D3` is the argument.** `last_read_at`
never moves backwards: the update is `greatest(last_read_at, $2)`, so an out-of-order request
from a slow tab cannot resurrect a dot the querent already cleared.

### `POST /api/chat/message` — `maxDuration = 20`

| | |
|---|---|
| Body | `{ body: string; reply_to_message_id?: string \| null; attached_reading_id?: string \| null }` |
| Response 200 | `{ message: ChatMessageDto; runId: string }` |
| Response 403 | `RefusalPayload` — W7's, verbatim, **never a bubble** (`C-D13`) |
| Codes | 200, 400, 401, 403 (onboarding **or** moderation), 429, 503 (`CHAT_ENABLED=0`) |

**Guards, in this order, and the order is the decision:**

1. `requireUser()`.
2. `hit('chat:post:<uid>', 60/h)` and `refusalsExhausted(user.id)`, concurrently — `hit()`
   records unconditionally and `refusalsExhausted()` is a read, so neither's outcome can
   change the other's effect. **`hitGlobal()` is deliberately NOT called**: its budget is the
   reading path's and a post spends no generative call. **`reserveModelCall()` is NOT called
   either** — the classifier reserves for itself inside `metered()`.
3. Zod: `body` 1..`MAX_CHAT_MESSAGE_LENGTH`, the two ids uuid-or-null.
4. `sanitizeAnswer(body, MAX_CHAT_MESSAGE_LENGTH)` → null is a 400 (`F1-9`).
5. **`attached_reading_id` ownership** (`F1-11`), as a `WHERE user_id = $caller` on the
   existence check.
6. **`moderate(clean, locale)`** (`F1-D8`). Blocked → `after(() => hitRefusal(user.id))`,
   `after(() => recordModerationFlag(…))`, `track('moderation.refused', { surface: 'chat', … })`,
   and a 403 carrying `refusalPayload(verdict)`. **No `chat_messages` row is written.**
7. `chatEnabled()` → **the message is STORED either way**; only the mint is skipped, and the
   reply carries `runId: null`. `F1-19`: off means "write nothing new", and a querent's own
   words are not new generation.
8. Store, mint, touch the thread — **all three in ONE transaction**, so a stored message with
   no run (a room that silently never answers) is unreachable.

**`after()`:** the `withAnalytics` drain writes `chat.message_sent` and, on a refusal, the
moderation flag and the refusal budget. **Both go in `after()` and never `defer()`** — the
reading route's own note: `defer()` opens with `if (!enabled()) return`, so with
`ANALYTICS_ENABLED=0` the refusal budget would never record, and **an analytics kill switch
must not be able to disable a security control.**

### `POST /api/chat/advance` — `maxDuration = 60`

| | |
|---|---|
| Body | `{ runId?: string }` — advisory; the engine claims by `user_id` regardless |
| Response 200 | `AdvanceReply` |
| Codes | 200, 400, 401, 403, 429 |

**Guards:** `requireUser()` → `hit('chat:advance:<uid>', 400/h)`. Four hundred is 60 posts ×
(1 plan + up to 4 beats + slack); it is a runaway-client guard, not a product limit, and the
real bound is `LLM_WINDOW_CHAT_CEILING`.

`runId` is accepted, logged and **not trusted**: the claim statement selects by `user_id` and
the live-status set. A client naming a finished run, or a run that is not theirs, gets
`{ state: 'idle' }`. **W3's completion-route rule applied to a run**: the client is trusted to
say it wants to advance, never which beat.

```ts
export type NextBeat = { reader: ReaderId; delayMs: number };

export type AdvanceReply =
  | { state: 'planned'; runId: string; next: NextBeat; done: false }
  | { state: 'spoke';   runId: string; message: ChatMessageDto; next: NextBeat | null; done: boolean }
  | { state: 'skipped'; runId: string; next: NextBeat | null; done: boolean }
  | { state: 'silent';  runId: string; done: true }
  | { state: 'busy';    runId: string | null; done: false }
  | { state: 'shed';    runId: string | null; done: false }
  | { state: 'idle';    runId: null; done: true };
```

**This is a discriminated union where `C-R2` sketched four optional siblings
(`{ state, message?, typingFor?, delayMs?, done }`), and `C-R2` delegates the naming to F1.**
`typingFor` and `delayMs` are one object because they are one fact — *who is about to speak
and for how long the indicator runs* — and a reply that could carry a `delayMs` with no reader
is a shape F4 would have to defend against at every call site. `done` is present on every arm
so a client's loop condition never reads `undefined`.

**`after()`:** `chat.run_planned`, `chat.turn_generated` and, on the last beat,
`chat.run_finished`. **`llm_calls` rows are written by `metered()` with no code here** —
`chat_plan` and `chat_turn` both go through `complete()`, which is the decorator's chokepoint,
so F1 hand-threads nothing.

### `GET /api/cron/nudge` — F5's, listed for completeness

Not F1's file. F1's contribution is `mintRun()` and the `CRON_SECRET` bearer pattern already
established by `/api/cron/sweep`. **`maxDuration = 60`.** §12's **Q5** owns whether a second
Vercel Hobby cron is available at all.

---

## Events

**F1 owns `src/lib/analytics/events.ts` for v0.7.0 (`C-D14`, seam S6). This is the whole
register for the release, already folded.**

### The count

**The taxonomy holds 70 names today, not 67.** `C-D14` says 67; A1 moved it 67 → 70 on
2026-07-30 and `events.test.ts` bounds it at `toBeLessThanOrEqual(70)`. **So any new name is
red until that ceiling moves**, and a session that trusts the roadmap's number will not
understand why. See `## Discrepancies` item 1.

**70 → 76. Twenty names were drafted across six workstreams; six landed.**

### The folding ledger

| Drafted | Owner | Outcome |
|---|---|---|
| `chat.message_sent` | F1 | **KEPT** |
| `chat.message_blocked` | F1 | **DROPPED** — a refusal is `moderation.refused` with `surface: 'chat'`. A second name would double-count the one thing W7 already measures, and would put a chat refusal outside every existing moderation query |
| `chat.run_minted` | F1 | **DROPPED** — a mint with no plan is not yet a fact worth a row; `chat.run_planned.trigger` covers every mint that produced anything, and `chat.proactive_skipped` covers the ones that did not |
| `chat.run_planned` | F1 | **KEPT**, absorbing four of F2's |
| `chat.plan_generated` / `chat.plan_invalid` / `chat.plan_fallback` / `chat.silence` | F2 | **FOLDED** into `chat.run_planned.outcome` (closed) + `reject_reason` (closed). `C-R6`'s silence rate and `C-N1d`'s ask rate become one table scan instead of a four-way union |
| `chat.beat_executed` / `chat.beat_failed` | F1 | **FOLDED** into `chat.turn_generated.outcome` |
| `chat.turn_generated` | F3 | **KEPT** |
| `chat.turn_invalid` | F3 | **FOLDED** into `outcome: 'skipped'` + `reject_reason` |
| `chat.address_used` | F3 | **FOLDED** into `chat.turn_generated.address_form` — a closed `'nickname' \| 'clipped' \| 'none'`, **never the form itself**, which is a slice of a name somebody typed |
| `chat.run_finished` | F1 | **KEPT** — the abandoned-at-planning case fires zero turn events, so `C-R7`'s skip rate has no denominator without it |
| `chat.run_completed` / `chat.run_abandoned` | F1 | **FOLDED** into `chat.run_finished.status` |
| `chat.opened` | F4 | **KEPT** |
| `chat.button_clicked` | F4 | **FOLDED** — the click *is* the open; `chat.opened.from` says where from |
| `chat.scrolled` | F4 | **DROPPED** — v0.4.0's `revealed` precedent: a look-and-close changes no decision |
| `chat.typing_shown` | F4 | **DROPPED** — derivable from `chat.turn_generated.delay_ms`, and a fact table and an event stream recording one fact is how they drift |
| `chat.proactive_minted` | F5 | **FOLDED** — a proactive run is a `chat.run_planned` whose `trigger` is not `user_message` |
| `chat.proactive_skipped` | F5 | **KEPT** — `C-N2e` requires measuring the trigger that fired with **no material**, and the run that did not happen cannot be a prop on an event that only exists when one did |
| `chat.proactive_replied` | F5 | **DROPPED** — `C-N2f`'s reply rate is a QUERY over `chat_messages` and `chat_runs` (F7 owns it). Firing it would mean the message route joining back to find the run: **a join on a write path to record a fact the tables already hold** |
| `chat.nudge_ran` | F5 | **DROPPED** — `/api/cron/sweep` logs rather than emitting; the nudge follows it, and its outcome is already `chat.proactive_skipped` per candidate plus `chat.run_planned` per mint |
| `chat.attachment_added` | F6 | **FOLDED** into `chat.message_sent.attached_from` — §7 F6 names it, and the fold is flagged in `## Discrepancies` item 4 |
| `chat.attachment_opened` | F6 | **DROPPED** — `revealed`'s precedent again |

**Why `chat.message_sent` survives the same objection that killed `chat.proactive_replied`.**
Both duplicate a row. The difference is the cost of writing them: `chat.message_sent` is a
buffered scalar push in a handler that already has the facts, and `reading.completed` sets the
precedent for an event beside its own table (`events` rows survive erasure in aggregate,
`chat_messages` does not). `chat.proactive_replied` would require **a join at write time** to
discover which run it answers. That is the line, and it is worth stating because the next
person will draw it in the wrong place.

### The six, with prop shapes

```ts
  /*
   * ── v0.7.0's SIX (C-D14), AND TWENTY WERE DRAFTED ──────────────────────────
   *
   * The full ledger is in `docs/plans/2026-08-07-chat-spine.md` `## Events`. The
   * short version, because this file is the data dictionary people read: four of
   * F2's four names became two props on `chat.run_planned`; three of F3's became
   * props on `chat.turn_generated`; three of F4's became one; three of F5's became
   * a query and a prop; and F6's one became a prop on `chat.message_sent`.
   *
   * **NO FREE TEXT.** A chat message's LENGTH is a prop; its body is not. An
   * address form is a CLASS (`'clipped'`), never the word — the word is a slice of
   * a nickname somebody typed, which is the same rule `reading.completed`'s
   * `choice_length` follows and for the same reason.
   */
  'chat.message_sent',
  'chat.run_planned',
  'chat.turn_generated',
  'chat.run_finished',
  'chat.opened',
  'chat.proactive_skipped',
```

```ts
  /**
   * The querent posted, and it was STORED. A refused message fires
   * `moderation.refused` with `surface: 'chat'` and never this.
   *
   * `length` AND NEVER THE BODY. `attached_from` is F6's folded declaration: the
   * two surfaces that can attach a reading, and `null` when nothing was attached —
   * **a sometimes-absent prop is `| null`, never optional** (rule 5).
   */
  'chat.message_sent':       { length: number; locale: string;
                               reply_to: boolean;
                               attached_from: 'history' | 'draw' | null;
                               minted_run: boolean };

  /**
   * The director answered. **THE RELEASE'S OWN SCORECARD LIVES IN THESE PROPS.**
   *
   * `beats: 0` with `outcome: 'silence'` is `C-R6`'s rate, and §5 says a rate of
   * ZERO means the director is not really deciding — so numerator and denominator
   * are one scan over one event rather than a join between two, which is exactly
   * why `reading.choice_offered` was folded into two props in 2026-07-29.
   *
   * `asks` is `C-N1d`. `replies_to_old` is `C-D11`'s "out of nowhere" reply being
   * reachable at all. `cast` is how many distinct readers the sheet names.
   *
   * `reject_reason` is `validatePlan`'s CLOSED set, never a message
   * (`persona.generated.reject_reason` is the precedent). `null` on `outcome:'ok'`.
   */
  'chat.run_planned':        { trigger: string; locale: string;
                               beats: number; cast: number; asks: number;
                               replies_to_old: number;
                               outcome: 'ok' | 'fallback' | 'silence';
                               reject_reason: string | null;
                               total_ms: number };

  /**
   * One beat executed, or skipped. **FIRES ONCE PER BEAT, INCLUDING A SKIP**, so
   * `chat.run_finished`'s `beats_planned - beats_delivered` and this event's
   * `outcome` distribution are two ways of reading one number and must agree.
   *
   * `attempt` is 1 or 2 (`F1-D2`) — the retry is inside one request, so there is no
   * run column for it and this prop is the only record.
   *
   * `chars`, NEVER the body (rule 1). `delay_ms` is what the SERVER told the client
   * to wait (seam S3), which is the only way to tell a metronome from a pace —
   * `C-R4`: *a constant is a metronome and a metronome is the thing that reads as
   * a bot.*
   *
   * `address_form` is a CLASS. The forms themselves are `mif`, `tah`, `jo` — slices
   * of a nickname a person typed, and `events` rows survive erasure.
   */
  'chat.turn_generated':     { reader_id: string; intent: string; trigger: string;
                               beat_index: number; attempt: number;
                               outcome: 'ok' | 'skipped';
                               reject_reason: string | null;
                               replied_to_reader: boolean;
                               address_form: 'nickname' | 'clipped' | 'none';
                               chars: number; delay_ms: number; total_ms: number };

  /**
   * The run ended. **`beats_planned - beats_delivered` IS `C-R7`'s SKIP RATE**, and
   * `total_ms` is wall-clock from mint to finish — which for a proactive run is the
   * only measurement of how long a querent waited without knowing they were waiting.
   *
   * `'abandoned'` and a zero-beat `'done'` are indistinguishable from the room by
   * design; they are distinguishable HERE, which is the whole reason this event is
   * not folded into `chat.run_planned`.
   */
  'chat.run_finished':       { trigger: string; status: 'done' | 'abandoned';
                               beats_planned: number; beats_delivered: number;
                               error_kind: string | null; total_ms: number };

  /**
   * F4's, folded. `unread` at open is `C-N2b`'s red dot actually working: a
   * distribution centred on zero means the badge is showing something that is not
   * there.
   *
   * `from: 'attach'` is F6's entry point. `'button'` is `C-D17`'s circle.
   */
  'chat.opened':             { unread: number; from: 'button' | 'direct' | 'attach';
                               had_pending_run: boolean };

  /**
   * F5's, and **the only new name that measures something that did NOT happen.**
   * `C-N2e`: a trigger with no material does not fire, and a high rate here means
   * the eligibility rules are wrong rather than that the querent is boring.
   *
   * Both unions closed. `reason: 'quiet_hours'` is present because §12's Q2 may
   * make it reachable; it is never emitted until Miftah rules.
   */
  'chat.proactive_skipped':  { source: 'reading_completed' | 'idle_nudge' | 'unanswered' | 'cron';
                               reason: 'no_material' | 'throttled' | 'too_soon'
                                     | 'quiet_hours' | 'disabled' | 'run_in_flight' };
```

### Three existing prop shapes widen, and no name changes

**The chat is the second surface that can be refused, and W7's three events were written when
there was only one.** All three currently require `reader_id` and `service_id`, which a chat
refusal does not have.

```ts
  'moderation.refused':        { source: …; category: string; confidence_bucket: …;
                                 surface: 'reading' | 'chat';        // NEW
                                 reader_id: string | null;           // WIDENED
                                 service_id: string | null };        // WIDENED
  'moderation.timeout':        { failed_open: boolean; reason: …;
                                 surface: 'reading' | 'chat';        // NEW
                                 reader_id: string | null;
                                 service_id: string | null };
  'moderation.allowed_flagged':{ category: string; confidence_bucket: …;
                                 surface: 'reading' | 'chat';        // NEW
                                 reader_id: string | null;
                                 service_id: string | null };
```

**`surface` is not cosmetic and it is the only fix available.** `moderation_flags` has no
surface column, and a blocked chat message leaves **no other trace at all** — `C-D13` says the
refused text is not stored as a `chat_messages` row, so unlike a blocked reading there is not
even a `readings` row beside it. Without this prop, a spike in false positives on the chat
surface is invisible in a table that already mixes the two, and W7's whole tuning argument —
*"a false positive is an accusation delivered to somebody who did nothing wrong"* — has no
instrument on the surface where it matters most.

**A column on `moderation_flags` was the alternative and is refused**: it is W7's table, it
needs a migration this release has spent, and the event answers the question. If tuning later
needs it in the table, that is a v0.8.0 delta with a measurement behind it.

`events.test.ts`'s ceiling moves `70 → 76`, with the folding ledger transcribed into its
comment — the ritual A1 and the choice verdict both followed.

---

## Environment variables — `.env.example`, seam S7

**F1 owns the file, including the annotations for F2's, F3's and F5's variables, which those
plans supply as prose.** F1 writes the block and the reconciliation folds their words in;
until then each carries a one-line placeholder naming its owner, so a variable is never in
the file with an empty explanation.

A new `# --- v0.7.0: the group chat ---` section, after the flags block. The four F1 owns, in
full:

- **`CHAT_MODEL=glm-5.2`** — `C-D4`. Set in `.env.example` **and in Vercel, Production AND
  Preview** (`ADMIN_MODEL`'s rule: a preview running a different model from production is a
  difference nobody would think to look for while debugging the thing they pushed). Unset
  falls back to `LLM_MODEL`. It points **away** from `LLM_MODEL` for the opposite reason
  `ADMIN_MODEL` does — that surface has no reader's voice on it and **everything on this one
  is.** `prices.ts` already carries a `glm-5.2` row at zero, verified 2026-08-01, so the chat
  is priced from day one. **Run `npm run probe:usage` after it lands** — it is a model change,
  and this repo has been wrong about what a provider reports for a whole release before.
  **Escape `$` as `\$` here; do not escape in the Vercel dashboard.**
- **`CHAT_ENABLED=1`** — only the exact string `'0'` disables. Gates generation, never the
  read (`F1-19`). Set to `1` on Vercel rather than left unset, for the reason the five
  existing flags are: unset behaves identically, so the value is not what the row is for —
  **being findable is.** `1` on screen makes the obvious opposite `0`, the one value that
  works.
- **`CHAT_PROACTIVE_ENABLED=1`** — unprompted runs only. A posted message still gets answered.
  **This is the flag an operator reaches for first**, because proactive runs are the ones with
  no human waiting and therefore the cheapest to lose.
- **`LLM_WINDOW_CHAT_CEILING=`** — the chat's share of the rolling five-hour window. Defaults
  to half the hard ceiling (140 of 280). **Without it a single enthusiastic querent's
  afternoon reaches the soft line and every deferred feature in the app — the gist, the day
  summary, the frequency verdict — goes quiet with them.** `positive()`'s rule: a garbage
  value falls back rather than becoming zero.

**`LLM_WINDOW_CALL_CEILING` stays at 280**, and its existing annotation gains one paragraph
recording `F1-D4`'s re-derivation and the February 2027 trigger.

**`RATELIMIT_CHAT_BACKEND` is NOT added.** §8 says "only if F1 argues it needs one" and the
argument is negative: the two per-user budgets (`chat:post:`, `chat:advance:`) are one user
against one budget, and one user's requests land mostly on one warm instance — which is
`RATELIMIT_SESSION_BACKEND`'s whole argument for memory. But `llm:chat:window` is **fleet-wide
and must be on Redis**, and it reaches `consume`/`peek`, which `memoryOnly()` never matches by
construction. So a variable here would either do nothing useful or silently move the one
budget that must not move. **A variable can be added the day somebody measures a reason for
one.**

Placeholders for the other workstreams, each with its owner named: `CHAT_MAX_BEATS` (F2),
`CHAT_CONTEXT_MESSAGES` and `CHAT_CONTEXT_READINGS` (F3), `CHAT_PROACTIVE_MIN_GAP_SECONDS`
and `CHAT_PROACTIVE_MAX_PER_DAY` (F5).

---

## `/privacy` — the amendment, both locales

**`C-D8` condition 4 and §9.4. Not a follow-up.** §7 says "the clause"; there are **five
touch points, and two of them are sentences in the shipped policy that become false.**

| # | Where | What |
|---|---|---|
| 1 | **2.2, bullet 3** | **FALSE TODAY.** It reads *"Hanya ringkasan abstraknya yang sampai ke model bahasa"* / *"Only an abstract summary reaches the language model."* `C-D8` makes that untrue on the chat surface. **Amend the sentence in place**, naming the room, rather than adding a contradicting clause elsewhere |
| 2 | **2.2, new bullet** | A skipped answer stays skipped (`C-D8` condition 5) — a promise the assembler keeps and the policy must state |
| 3 | **new 2.7** | The room: messages stored verbatim in plaintext, exactly like a typed question; not translated; no automatic deletion; nobody human reads them |
| 4 | **3** | One line: *why* — so the readers answer this person and not a generic one |
| 5 | **4.1** | **FALSE TODAY.** *"…dan ringkasan abstrak dari jawaban awalmu"* / *"…and an abstract summary of your initial answers"*. On the chat surface the answers themselves are transmitted. Amend |
| 6 | **6, the retention table** | A row for chat messages: **kept until you delete your account**, no automatic sweep. `facts.ts` gains no variable because there is no retention variable to read — and a hand-typed number in that table is exactly what `facts.ts` exists to prevent |
| 7 | **8** | Erasure: the cascade removes the whole room at the hard delete, and the soft delete keeps it for the restore window (`F1-D10`) |

**A1's R31 is the governing precedent, in its own words:** *"Amending only 3 and 8 would leave
a policy that is technically amended and still misleading, which is worse than one plainly out
of date."* That is why items 1 and 5 are edits and not additions.

**Both locales, in one commit.** `privacy.id.tsx` first — the Indonesian is the source, and the
Malay grep applies (`jangka waktu` / `masa simpan`, **never `tempoh`**; this document is about
retention on almost every line, so it is where that word would land).

**Whether the amendment bumps `TERMS_VERSION` and forces re-acceptance is Miftah's** — see
`## Open questions` Q-F1-1. `C-D8` itself calls this *"a material change to what the querent
agreed to"*, and this project has a mechanism for exactly that (`users.terms_version` compared
against `TERMS_VERSION`) which nobody has decided to use here.

---

## Tasks

Numbered, in build order. Each names its files and is independently verifiable.

### Task 1 — `src/lib/chat/types.ts`, the PURE leaf, and its contract test

**Creates:** `src/lib/chat/types.ts`, `src/lib/chat/types.contract.test.ts`.

Everything in `## The beats JSON shape`, plus `ChatAuthor`, `RunStatus`, `RunTrigger`,
`ChatMessageDto`, `AdvanceReply`, `NextBeat`, `MAX_CHAT_MESSAGE_LENGTH`, and the three
interfaces `Director`, `Voice`, `Pace`.

The contract test asserts: the only import is `@/data/types`; no `server-only`; no
`process.env`; no `next/`; `Beat` has exactly four fields; `BeatIntent` and `RunTrigger` are
closed. **`npm test` alone verifies this task.**

### Task 2 — `src/lib/chat/model.ts` and `model.test.ts`

**Creates:** both. A byte-for-byte structural copy of `src/lib/admin/model.ts`: `chatModel()`
returning `string | undefined`, `chatModelName()` returning the resolved string, `||` not
`??`, zero imports, no `server-only`. `model.test.ts` pins the `||` chain against
`ledger.ts`'s `resolvedModel` (`F1-15`) with the same cases `admin/model.test.ts` uses.

### Task 3 — the two flags, and `flagCoverage.test.ts`'s third table

**Edits:** `src/lib/llm/flags.ts`, `src/lib/llm/flags.test.ts`,
`src/lib/llm/flagCoverage.test.ts`.

`chatEnabled()` and `chatProactiveEnabled()`, both `!== '0'`, both appended to
`DEFERRABLE_FLAGS`. `flags.test.ts` keeps asserting `READING_ENABLED` and
`TRANSLATION_ENABLED` appear nowhere — **the list growing is not a licence to add a sixth for
symmetry.**

`flagCoverage.test.ts` needs three amendments, and each is a departure that must be argued in
the file:

1. **`FLAGGED` entries gain an optional `guardedIn`.** The two chat model call sites are F2's
   and F3's files; the guard is a single `if (!chatEnabled())` in `run.ts`, which is the only
   path to either. **`EXEMPT`'s `ownSwitch` already does exactly this** — it asserts
   `classify.ts`'s switch lives in `gate.ts` — so the pattern is established rather than
   invented.
2. **The register assertion compares SETS, not sorted arrays.** Two `FLAGGED` rows share
   `CHAT_ENABLED`, and the existing `map(env).sort()` equality would fail on the duplicate.
3. **A third table, `GATES`,** for a `DEFERRABLE_FLAGS` member that gates a *mint* rather than
   a call. `CHAT_PROACTIVE_ENABLED` makes no model call directly — it stops a `chat_runs` row
   being written — so it has no entry in `callSites()` and would otherwise fail *"no flag is
   declared and left unwired"*. **`C-D15` binds it into `DEFERRABLE_FLAGS`, so the test grows
   rather than the decision changing.** The assertion `C-D15` names — *"the set of model call
   sites is exactly its two tables"* — is untouched, because `GATES` holds no call site.

### Task 4 — `chat_plan` and `chat_turn`: two ops, `OP_ORDER`, `callClass.test.ts`

**Edits:** `src/lib/llm/types.ts`, `src/lib/analytics/rollup.ts`,
`src/lib/llm/callClass.test.ts`.

`LLMOp` 11 → 13. `OP_ORDER` gains both **at the end, after `insight` and `blog_format`** —
that array's own header says the last entries are the ones with no querent behind them and
that the boundary is visible in the order rather than only in a comment. `AssertNever` makes
omitting either a compile error.

`callClass.test.ts` gains two `COMPLETE_CALLS` rows naming the files Task 8 creates, with
`callClass: 'deferred'` markers and the `C-D6` argument. **`LLM_OPS` in that file is a literal
list and must be extended by hand** — a set derived from the thing it checks cannot disagree
with it.

**This task is red until Task 8 lands**, because *every declared op has at least one call
site*. Tasks 4 and 8 are therefore one commit, or Task 4 lands after Task 8. **Land them
together.**

### Task 5 — `schema.ts`, the three tables, migration `0014`, `resetDb()`

**Edits:** `src/lib/db/schema.ts`, `src/lib/db/testing/harness.ts`.
**Creates:** `src/lib/db/migrations/0014_f1-chat.sql` + `meta/`.

Exactly `## Schema deltas`, plus the six row types (`ChatThread`/`NewChatThread`,
`ChatMessage`/`NewChatMessage`, `ChatRun`/`NewChatRun`). `AnyPgColumn` joins the pg-core
imports for the two self/mutual references.

`npm run db:generate -- --name f1-chat`; commit `schema.ts`, the `.sql` and `meta/` together.
**Read the generated SQL by eye** — drizzle emits the CHECKs and partial indexes and this is
the one release where nobody else will notice a wrong one.

### Task 6 — `src/lib/db/queries/chat.ts` and its integration tests

**Creates:** `src/lib/db/queries/chat.ts`, `src/lib/db/queries/chat.integration.test.ts`,
`src/lib/db/queries/chat.contract.test.ts`.

Handle first on every export (`F1-13`). Explicit column projections everywhere (`F1-12`).
Exports: `getThread`, `upsertThread`, `markRead`, `unreadCount`, `insertMessage`,
`listMessages`, `messagesForRun`, `insertRun`, `activeRunFor`, `claimRun`, `writeBeatSheet`,
`completeBeat`, `releaseLease`, `finishRun`.

`chat.contract.test.ts` greps this file for a bare `db.select()` with no projection and for
`model` appearing in any projection that a route consumes.

### Task 7 — `src/lib/chat/budget.ts`

**Creates:** `src/lib/chat/budget.ts`, `src/lib/chat/budget.test.ts`.

`chatCeiling()` (`positive(process.env.LLM_WINDOW_CHAT_CEILING, floor(hard/2))`) and
`reserveChatCall()` implementing `F1-D5`'s three steps. The test asserts the **peek-first,
consume-last** ordering by counting backend calls, and asserts that a fleet-ceiling refusal
leaves the chat window untouched. It also asserts the key is reached through `consume`/`peek`
and never `hit` — the one bug that makes both halves work perfectly on two different
counters.

### Task 8 — `src/lib/chat/run.ts`, the two call sites, and the two placeholder prompts

**Creates:** `src/lib/chat/run.ts`, `src/lib/chat/direct/plan.ts`,
`src/lib/chat/direct/prompt.placeholder.ts`, `src/lib/chat/voices/turn.ts`,
`src/lib/chat/voices/prompt.placeholder.ts`, `src/lib/chat/run.test.ts`.

**The ownership line, stated so F2 and F3 do not have to guess** (and flagged in
`## Discrepancies` item 7):

- **F1 owns the CALL SITE.** `direct/plan.ts` and `voices/turn.ts` are the two files that
  reach `getProvider().complete()`. They declare the `op`, the `callClass`, `model:
  chatModel()`, and they take their `CompletionPrompt` as an **argument**. They are the files
  `callClass.test.ts` and `flagCoverage.test.ts` name, so their paths are fixed here and F2
  and F3 must not move them.
- **F2 and F3 own the PROMPT and the VALIDATOR.** They delete
  `prompt.placeholder.ts`/`validate` stubs and supply real modules. **F1's placeholders are
  marked `// F2 REPLACES THIS FILE ENTIRELY` in their first line.**

`run.ts` holds: `mintRun()`, `advance()`, the state machine, the `chatEnabled()` guard for
both call sites, `reserveChatCall()`, and the `after()` events. It is `server-only` by way of
its imports and is **not** unit-testable end to end — so the state machine's decision function
is extracted as a pure `nextAction(run, sheet)` that `run.test.ts` drives with a table, in
`gate.decide()`'s idiom.

### Task 9 — `events.ts`: six names, three widenings, the ceiling

**Edits:** `src/lib/analytics/events.ts`, `src/lib/analytics/events.test.ts`, and the three
`track('moderation.*')` call sites in `src/app/api/reading/route.ts` (which gain
`surface: 'reading'` and nothing else).

Exactly `## Events`. The folding ledger goes into `events.test.ts`'s comment beside the
`70 → 76` ceiling move, following the 66→67 and 67→70 precedents.

### Task 10 — `/api/chat/state`, `/messages`, `/read`

**Creates:** three `route.ts` files under `src/app/api/chat/`.

Per `## The routes`. `/state`'s `after()` calls an F5 hook that F1 ships returning `null`.

### Task 11 — `/api/chat/message` and the moderation seam

**Creates:** `src/app/api/chat/message/route.ts`.

Per `## The routes`, guards in the stated order. **`src/lib/moderation/gate.ts` gets zero
lines.**

### Task 12 — `/api/chat/advance`

**Creates:** `src/app/api/chat/advance/route.ts`.

### Task 13 — `gate.test.ts` negative controls

**Edits:** `src/lib/auth/gate.test.ts` only. **`gate.ts` gets zero lines** (`F1-D11`).

Cases: `/chat` signed-out → `/login`; `/chat` signed-in un-onboarded → `/onboarding`; `/chat`
signed-in onboarded → `next`; **`/en/chat` is not public**, with the test named for the worst
outcome available in this release; `/api/chat/*` signed-out → 401 JSON.

### Task 14 — `.env.example`

**Edits:** `.env.example`. Per `## Environment variables`.

### Task 15 — `/privacy`, both locales

**Edits:** `src/app/privacy/privacy.id.tsx`, `src/app/privacy/privacy.en.tsx`.

Per `## /privacy`. **Seven edits, two of which are corrections of sentences that would
otherwise be false.**

### Task 16 — the erasure audit, as a test

**Edits:** `src/lib/account/delete.integration.test.ts`.

A case that creates a thread, three messages and a run, hard-deletes the user, and asserts all
three tables are empty — and a case that soft-deletes and asserts they are **not**, named for
the restore promise rather than for the mechanism. `deleteAccount()` gets zero lines
(`F1-D10`), and a source-level assertion says so.

### Task 17 — `docs/workstream-notes.md`

A `## F1 — the chat spine` section: the lease protocol as shipped, the traps this workstream
paid for, the `C-D8` sixth-fence correction, the events ledger, and the `F1-D4` re-derivation.
**`CLAUDE.md` gains nothing until the release is done** — §13 owns the `## The group chat`
section, and it holds only rules and invariants.

---

## Verification

### The loops, applied to F1

| Loop | What it answers here |
|---|---|
| **1. Vitest** (`npm test`, no Docker) | `types.contract.test.ts`; `model.test.ts`'s `\|\|` chain; `flags.test.ts`'s four "not disabled" strings; `flagCoverage.test.ts`'s three tables; `callClass.test.ts`'s thirteen ops in both directions; `budget.test.ts`'s peek-then-consume ordering; `run.test.ts`'s `nextAction` table; `events.test.ts`'s ceiling and shape |
| **2. Vitest integration** (`npm run test:integration`, needs `db:up`) | **the lease**; the cascade on erasure; the badge count; `reply_to`'s `set null`; the keyset pagination; the run lifecycle; `updatedAt` moving inside the thread upsert |
| **4. Fixed-width** | nothing. F1 renders nothing |
| **5. Real Chrome over CDP** | *does the UI agree with what it sends* — F4 owns it, but F1's routes are what it exercises: the advance loop's request bodies against the stored rows |
| **6. A real iPhone against a preview** | **the cold-lambda question `POST /api/locale` exists to warn about.** `/api/chat/message` and `/api/chat/read` both WRITE, and a user action that writes is one of the few things likely to be the request that wakes a suspended Neon compute. **1348ms warm from WSL told us nothing last time** |

**Run `npm test` and `npm run test:integration` SEPARATELY.** `npm run test:all` fails 12–22
of V9's limiter tests as a harness race and its red does not mean anything.

**`npm run build` before believing a green typecheck.** TypeScript stays on 5.x.

### The integration test that proves two concurrent `advance` calls produce ONE message

`src/lib/db/queries/chat.integration.test.ts`, and it is the one test in this workstream that
must not be simplified.

**It cannot use `withRollback`.** The harness's rolled-back transaction is a single
transaction, and a lease race needs **two connections** that can see each other's commits. So
this case uses `resetDb()` — the documented escape hatch *"for code that commits its own
transaction"* — and opens a second postgres.js handle against `TEST_DATABASE_URL`.

```
  given   a user, a thread, and one chat_runs row: status 'running',
          beats = a two-beat sheet, beats_done = 0, lease_until = null

  when    two claimRun() calls are issued CONCURRENTLY on two handles
          (Promise.all), each with its own owner token,
          and each winner calls completeBeat() with a distinct body

  then    exactly ONE claim returns a row
          exactly ONE completeBeat() succeeds; the other throws
          select count(*) from chat_messages where run_id = $1  ===  1
          chat_runs.beats_done                                   ===  1
          chat_runs.status                                       === 'running'
```

**It asserts the message COUNT, not the run's status**, for `tee.ts`'s reason: the cancel test
asserts `errorKind` and not only `status` precisely because the status is the thing that looks
right while the interesting fact is wrong. A run at `beats_done = 1` with **two** messages is
the exact bug `C-R3` names, and only the count sees it.

**Three sibling cases, because one race is not the protocol:**

- **An expired lease is reclaimable.** Set `lease_until` to the past, claim, assert a row.
- **A live lease is not.** Set `lease_until` to the future with another owner, claim, assert
  no row — this is the *committed holder* case that `for update skip locked` alone does not
  cover, and deleting the `lease_until < now()` predicate must turn it red.
- **`completeBeat` with a stale `beats_done` rolls back the insert.** Pass `expected = 0` when
  the row already reads 1; assert the throw **and** assert `count(*) = 0`. Without the second
  assertion the test passes on an implementation that inserts and then throws.

### The acceptance loop for F1 alone

F1 ships placeholders, so `npm run smoke -- --chat` is F3's. F1's own end-to-end check is
loop 5 against `E2E_BASE=http://localhost:3001` with a dev session:

```
  POST /api/chat/message  {"body":"halo"}     -> 200, message.id, runId
  POST /api/chat/advance  {}                  -> {state:'planned', next:{reader,delayMs}}
  POST /api/chat/advance  {}                  -> {state:'spoke', message:{author:<reader>}}
  ... until done:true
  GET  /api/chat/state                        -> unread > 0
  POST /api/chat/read                         -> unread === 0
  GET  /api/chat/messages                     -> the whole exchange, newest first
```

**And the one that is not a test:** stop the database (`npm run db:down`) and load `/chat`.
W4's acceptance test in a new place — the room must fail *legibly*, and `/api/chat/state` must
not be the fourth route in this app that 500s when the database is down.

---

## Interfaces F1 exports

For F2, F3, F4, F5, F6 and F7. **Everything here is in `src/lib/chat/types.ts` unless stated.**

```ts
// The shapes, all quoted in full above.
export type { ChatAuthor, RunStatus, RunTrigger, BeatIntent, BeatSpeaker,
              BeatAddressee, Beat, BeatSheet, ChatMessageDto, AdvanceReply, NextBeat };
export const MAX_CHAT_MESSAGE_LENGTH = 2000;

// F2 implements this. `run.ts` calls it and nothing else does.
export type DirectorInput = {
  runId: string;
  userId: string;
  trigger: RunTrigger;
  triggerMessageId: string | null;
  triggerReadingId: string | null;
  /** The querent's default, per `C-D9`'s fallback. The director may override it. */
  fallbackLocale: Locale;
};
export type DirectorResult = {
  beats: Beat[];
  locale: Locale;
  outcome: 'ok' | 'fallback' | 'silence';
  rejectReason: string | null;
  model: string;
  totalMs: number;
};
export interface Director { plan(input: DirectorInput): Promise<DirectorResult>; }

// F3 implements these two.
export type VoiceInput = {
  runId: string;
  userId: string;
  beat: Beat;
  beatIndex: number;
  locale: Locale;
  trigger: RunTrigger;
  /** `C-R5`: every beat sees every earlier beat of its own run, as ACTUAL PROSE. */
  runSoFar: ChatMessageDto[];
  attempt: 1 | 2;
};
export type VoiceResult =
  | { ok: true;  body: string; addressForm: 'nickname' | 'clipped' | 'none';
      model: string; totalMs: number }
  | { ok: false; rejectReason: string; totalMs: number };
export interface Voice { speak(input: VoiceInput): Promise<VoiceResult>; }

/**
 * Seam S3: **F3 computes it, F1 returns it, F4 honours it.** Three files, one number.
 * PURE, so `npm test` can drive it. `previousChars` is null before the first bubble.
 * `C-R4`: a constant is a metronome and a metronome is the thing that reads as a bot.
 */
export type Pace = (args: { next: Beat; previousChars: number | null }) => number;
```

```ts
// src/lib/chat/run.ts — F5 calls the first, F4 drives the second through the route.
export function mintRun(args: {
  userId: string;
  trigger: RunTrigger;
  triggerMessageId?: string | null;
  triggerReadingId?: string | null;
  locale: Locale;
}, handle?: DbOrTx): Promise<{ runId: string } | null>;

export function advance(args: { userId: string; locale: Locale }): Promise<AdvanceReply>;
```

`mintRun` takes an **optional handle as its last argument**, not its first — it is a writer
like `persistReading` and `flushEvents`, not a query module, and the optional handle is how
F5's hook inside the message route's transaction passes it in. **It returns `null` when
`CHAT_ENABLED=0` or a live run already exists**, which is what makes F5's suppression rule
(seam S5) a read of the return value rather than a second query.

```ts
// src/lib/chat/model.ts
export function chatModel(): string | undefined;
export function chatModelName(): string;

// src/lib/chat/budget.ts
export function chatCeiling(): number;
export function reserveChatCall(): Promise<{ ok: true } | { ok: false; reason: 'chat_window' | 'soft' | 'hard' }>;
```

`src/lib/db/queries/chat.ts` exports the fourteen functions named in Task 6, handle-first.

---

## Interfaces F1 needs

| From | What | Why |
|---|---|---|
| **F2** | `src/lib/chat/direct/prompt.ts` exporting a `CompletionPrompt` builder and `validatePlan` | F1 ships placeholders at those paths; the call site file `direct/plan.ts` is F1's and its path is fixed by `callClass.test.ts` |
| **F3** | `src/lib/chat/voices/prompt.ts`, `validateTurn`, and the `Pace` implementation | same shape; `voices/turn.ts` is F1's call site |
| **F3** | the context assembler (seam S2) | `run.ts` passes `runSoFar` and nothing else; **F3's assembler reads everything else itself** and F2's director calls into it with a narrower profile rather than building a second one |
| **F4** | a client that honours `delayMs` and bounds every fetch | `POST /api/locale`'s rule: a bigger `maxDuration` is not a latency regression **but it must be paired with a bound on the client**, or you have only made the hang longer |
| **F4** | the optimistic bubble and its withdrawal on 403 | `F1-D8`. A route that can refuse and a client that cannot withdraw is how a refused message ends up on screen looking stored |
| **F5** | `eligibleFor(thread, now)` — a PURE predicate with an injected clock | `run.ts` calls it inside `/api/chat/state`'s `after()`; F1 ships a stub returning `null` |
| **F7** | nothing | F7 reads the tables |

---

## Open questions

**For Miftah or for the reconciliation. §12's Q1–Q6 are NOT resolved here.**

**`Q-F1-1` — Does the `/privacy` amendment bump `TERMS_VERSION` and force re-acceptance?**
`C-D8` calls it *"a material change to what the querent agreed to"*, and this project has the
mechanism: `users.terms_version` is compared against `TERMS_VERSION` and a mismatch forces
re-acceptance. Nobody has decided whether to use it. **The cost of yes** is an interstitial in
front of every returning querent on the release day. **The cost of no** is a policy that
changed materially with nothing telling anybody. This is not §12's Q1 — that asks whether the
answers may be used; this asks whether the querent is told again.

**`Q-F1-2` — What date does the cron use for `proactive_count_date`?** `C-N2d` fixes it as the
querent's calendar day, sent by the client. `/api/cron/nudge` has no client and therefore no
`x-jm-local-date` header. Three options, all defensible, none F1's to pick: the cron uses UTC
and the two writers disagree by up to seven hours; the cron reads the stored value and
declines to mint when it cannot verify the day; or `chat_threads` gains a `last_local_date`
column and the cron uses the last one the client sent. **The third is a column and would have
to land in `0014`** — so it must be settled before F1 is built, not after. Named here rather
than left to F5.

**`Q-F1-3` — Should `moderation_flags` gain a `surface` column?** This plan answers the
tuning question with an event prop (`## Events`), which needs no migration and is honest. The
column would be better for the one query that matters — *"what is the false-positive rate on
the chat surface"* joined against the flag's own category and pattern — and it is W7's table.
**Raised rather than taken**, because the release has spent its migration.

**`Q-F1-4` — Does anything ever delete a `chat_messages` row?** §3.2 says no status column and
no soft delete, and this plan implements that. But a querent who posts something they regret
into a room that three characters will quote back at them for the rest of the account's life
has no remedy short of deleting the account. That is a real product gap and it is a
*deliberate* one; it is named here so the first bug report is met with a decision rather than
a scramble.

**`Q-F1-5` — Is `hit('chat:advance:<uid>', 400/h)` on Redis or memory?** This plan puts it on
the default backend and refuses `RATELIMIT_CHAT_BACKEND`. It is the highest-frequency
authenticated budget the app has ever had — five round trips per posted message — and
`events:` was moved to memory for exactly that shape of reason. **Measure it on the first
preview**, and if it dominates the Upstash command budget, the honest fix is the variable §8
already reserved.

---

## Discrepancies with the roadmap

Direct, per the brief. The reconciliation settles each.

**1. `C-D14` says "67 names today". The taxonomy holds 70.** A1 moved it 67 → 70 on
2026-07-30 and `events.test.ts` asserts `toBeLessThanOrEqual(70)`. This matters mechanically:
**a session that trusts the roadmap will add a name and see a red test it cannot explain**,
because 67 + 1 is under the ceiling and 70 + 1 is not. This plan moves the ceiling to 76.

**2. §3.3 says the `beats` shape is F2's; §7 and seam S1 say it is F1's.** §3.3: *"the beat
sheet. Written once by the director; **shape is F2's and is quoted verbatim in F2's plan**"*.
§7 F1: *"The `beats` JSON shape, **quoted verbatim**, so F2 writes to a contract"*. S1:
*"**F1 owns the shape; F2 owns the contents.** F1's plan quotes it verbatim; F2's plan quotes
F1's"*. **This plan follows S1**, because the seam table exists to settle exactly this and §7
restates it. §3.3's sentence should be struck.

**3. §4.1 says `maxDuration` is "default" for `/state`, `/messages` and `/read`, and §4.1's
own next paragraph says it is declared on every one of these.** The two halves contradict.
This plan declares 30/15/15, and the reason is §4.1's own cautionary tale: **`POST /api/locale`
was the only database-writing route declaring neither `runtime` nor `maxDuration`**, was killed
at Vercel's ten-second Hobby default on a cold lambda plus a suspended Neon compute, and was
diagnosed as an LLM call on a path that reaches no model. `/read` writes. `/state` writes in
`after()`. "Default" is the value that killed the last route that had it.

**4. §7 F6 names `chat.attachment_added` as an event; this plan folds it into
`chat.message_sent.attached_from`.** `C-D14` invites the fold in as many words — *"a plan that
folds three of its names into props on two others has done the job right"* — and
`chat.message_sent` needs the prop regardless, because a run's shape depends on whether a
reading was attached. **Flagged rather than done quietly**, because §7 is a brief and a name in
it reads as a decision.

**5. `C-D13` and §3 leave a blocked chat message with no trace but a `moderation_flags` row
that cannot say which surface it came from.** A blocked reading at least leaves a
`readings`-adjacent context; a blocked chat message leaves nothing, because `C-D13` correctly
refuses to store the refused text. This plan's answer is the `surface` prop on three existing
events; the better answer is a column, and that is `Q-F1-3`.

**6. `C-D8` condition 3 calls `<jawaban>` "a sixth fence". It is the FOURTH of six that
already exist.** `src/lib/prompt/sanitize.ts` has fenced `<pertanyaan>`, `<penanya>`,
`<jawaban kunci="…">`, `<riwayat>`, `<terjemahan>` and `<sosok>` since V8, and
`sanitize.test.ts`'s *"the delimiter set"* block asserts the header's count against the
alternation — the two had already drifted once. **The good news is that F1 and F3 need no
change to `sanitize.ts` at all**; the risk is that a session reading `C-D8` literally adds a
seventh alternative for a tag that is already there and turns that test red for a reason that
looks unrelated.

**7. §7's ownership lines cut through the two model call sites.** F1 owns *"stub director and
stub voice behind the interfaces F2 and F3 will implement"* and *"must not touch: any prompt
file"*; F2 owns `src/lib/chat/direct/**` and *"must not touch: the engine"*. But
`callClass.test.ts` and `flagCoverage.test.ts` name **files**, and the file that calls
`getProvider().complete()` is simultaneously the engine's edge and the prompt's edge. This
plan draws the line at the prompt MODULE (Task 8): F1 owns `direct/plan.ts` and
`voices/turn.ts` (op, tier, model, flag guard, ledger), F2 and F3 own `direct/prompt.ts` and
`voices/prompt.ts` plus the validators. **The reconciliation should ratify the boundary and
the two filenames**, because three plans will otherwise each assume a different one and the
two grep-based tests will name a file that does not exist.

**8. §8's table gives `LLM_WINDOW_CALL_CEILING` the note "280 — MUST BE RE-DERIVED".** It is
re-derived in `F1-D4` and the answer is **unchanged**. That is a legitimate outcome of the
exercise and not a skipped task, but a reader of §8 alone will read an unchanged 280 as a
workstream that forgot. **The commit message and `.env.example` both say "re-derived
2026-08-07, unchanged".**

**9. §5's `C-R2` fixes the advance reply as `{ state, message?, typingFor?, delayMs?, done }`
and delegates the field names to F1.** This plan returns a discriminated union with
`next: { reader, delayMs }`. Not a disagreement — the delegation is explicit — but F4's plan
must quote *this* shape and not §5's sketch.

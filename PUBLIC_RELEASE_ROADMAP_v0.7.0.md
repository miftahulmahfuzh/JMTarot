# JMTarot — Public Release Roadmap v0.7.0: The Group Chat

**Status:** planning. Nothing here is built yet.
**Date opened:** 2026-08-07.
**Version in `package.json` when this was written:** 0.6.0.

> **This file is the contract between seven workstreams.** Each has its own plan
> under `docs/plans/2026-08-07-chat-*.md`. **Where a workstream plan disagrees with
> this file, this file wins and the plan is wrong** — except where
> `docs/plans/2026-08-07-RECONCILIATION-v0.7.0.md` says otherwise, which outranks
> both.
>
> **RECONCILED 2026-08-07. THE SEVEN PLANS FOUND SIX FACTUAL ERRORS IN THIS FILE**
> and each is marked *(corrected, R#)* below. **Read the reconciliation first** —
> in particular its §2, which replaces §3's table list, and its §6, which
> replaces §0.1's build order.
>
> `CLAUDE.md` still binds. Every trap, every invariant, every "do not undo this"
> in it applies to this release unless a decision below **names** the rule it is
> amending. Two rules are amended by name in §2 (`A5` and `A-D18`'s ceiling);
> nothing else is.

---

## 0. How to execute this roadmap

### 0.0 `implement PUBLIC_RELEASE_ROADMAP_v0.7.0.md f3` — what that means, exactly

A future session will be opened with exactly that sentence and little else. It
means:

1. Read **this file**, whole. It is the contract.
2. Read `docs/plans/2026-08-07-RECONCILIATION-v0.7.0.md`. It outranks this file.
3. Read **that workstream's plan file** from the index in §0.1.
4. Read the sections of `CLAUDE.md` and `docs/workstream-notes.md` that the plan
   names. The plan names them because they contain the traps.
5. Build **only that workstream.** If you find you need a file another workstream
   owns (§6), stop and say so rather than editing it.
6. `npm test`, `npm run typecheck`, `npm run build`, and the workstream's own
   verification section. `npm run test:integration` if it touched `src/lib/db/**`.

Lowercase `f3` and uppercase `F3` mean the same thing.

**The workstreams are dependency-ordered. F1 must land before anything else.**

**⚠ THE ORDER BELOW IS WRONG AND THE RECONCILIATION'S §6 REPLACES IT.** F3's
context assembler imports F6's `attachmentBlock`, so **F6 splits**: its prompt
block lands before F3, its UI after F4. The corrected order is

```
F1 → F6 (tasks 1–5) → F3 → F2 → F4 → F6 (tasks 6–8) → F5 → F7
```

`implement … f6` is therefore run **twice**, and f6's plan marks the split.

### 0.1 The plan index

| Id | Workstream | Plan file | Depends on |
|---|---|---|---|
| **F1** | The chat spine — schema, runs, routes, ops, flags, limits, gate | `docs/plans/2026-08-07-chat-spine.md` | — |
| **F2** | The director — who speaks, in what order, to whom | `docs/plans/2026-08-07-chat-director.md` | F1 |
| **F3** | The voices — context, prompts, address forms, turn generation | `docs/plans/2026-08-07-chat-voices.md` | F1 |
| **F4** | The surface — `/chat`, the button, bubbles, avatars, reply-to | `docs/plans/2026-08-07-chat-surface.md` | F1 |
| **F5** | Proactivity — triggers, eligibility, delivery, the nudge | `docs/plans/2026-08-07-chat-proactivity.md` | F1 F2 F3 |
| **F6** | Attachments — a reading carried into the chat | `docs/plans/2026-08-07-chat-attachments.md` | F1 F4 |
| **F7** | The operator's view — `/admin/chat`, tokens, engagement | `docs/plans/2026-08-07-chat-admin.md` | F1 |

### 0.2 The read order, every time

`docs/plans/2026-08-07-RECONCILIATION-v0.7.0.md` → **this file** → the workstream
plan → the `CLAUDE.md` sections it names → the `docs/workstream-notes.md` sections
it names. Then the code.

### 0.3 Five things that are true of every workstream

1. **No model call, and no database write, on the path of a byte the querent is
   waiting for**, except the two this release adds deliberately and bounds: the
   moderation classifier on a posted message (already bounded at
   `MODERATION_TIMEOUT_MS`) and the turn generation inside `POST /api/chat/advance`,
   which is what that request is *for*.
2. **Nothing new reaches the browser.** No prompt text, no model name, no key, no
   decrypted onboarding answer. `scripts/audit-secrets.ts` runs inside
   `npm run build` and will fail if you get this wrong. The chat is the surface
   where this is easiest to break, because the prompt is the product.
3. **Every module under `src/lib/db/queries/**` takes its handle first.** Every
   pure module stays pure. `clientBoundary.test.ts` gets new fences (§6).
4. **The Indonesian is Indonesian, not Malay**, and the eleven-word grep now has a
   chat instrument too (§10).
5. **`events.ts` has ONE OWNER for v0.7.0 and it is F1** (§2, `C-D14`). Every other
   workstream declares its events in its own plan and F1 folds them in; folding
   means transcribing, not narrowing.

### 0.4 Migration numbers are assigned here, so two agents cannot both write `0014`

The last committed migration is `0013_a7-admin-insights.sql`.

| Migration | Owner | What |
|---|---|---|
| `0014_f1-chat.sql` | **F1, and only F1** | `chat_threads`, `chat_messages`, `chat_runs`. **BUILD THE RECONCILIATION'S §2, NOT §3 BELOW** — five workstreams each needed a column §3 did not have, and all six are folded there |
| `0015` | **RESERVED, UNASSIGNED** | Only if a workstream proves at build time that `0014` was wrong. Raise it in the reconciliation instead if you can. |

**No other workstream writes a migration.** If F5 or F6 or F7 needs a column, it
goes in that workstream's plan under `## Schema deltas`, the reconciliation folds
it into `0014` **before F1 is built**, and F1 writes it. This is the v0.5.0
procedure and it exists because seven agents inventing `user_id` / `userId` / `uid`
is the single most likely way this becomes a mess.

`drizzle-kit push` is still banned. `generate` + `migrate` only.

### 0.5 The one thing that is not a task in any plan

**Read the chat.** Not the tests — the conversation. `npm run smoke -- --chat`
prints a scripted multi-turn exchange and `npm run smoke -- --chat --proactive`
prints an unprompted one. §6 of this file says why no unit test can stand in for
this, and §10 makes the blind read the release gate.

---

## 1. What v0.7.0 is

**Three readers and the querent, in one room, that keeps going when nobody is
looking at it.**

Today JMTarot is a machine you operate: you pick a reader, you pick a service, you
draw, you read four paragraphs, you close the tab. Thessaly, Margaret and Adrian
are three prompt files that have never met. The app has never once spoken first.

v0.7.0 adds a group chat containing the querent and all three readers, in which:

- a **director** decides, per message, who answers — one reader, two, or all three
  — and whether one of them is answering *the querent* or *another reader*;
- the readers can see who the querent is: their nickname, their birth date, their
  six onboarding answers, their Lotus, their recent readings, and the last stretch
  of this conversation — so they answer *this* person and not a generic one;
- the readers **ask questions back**, and they **speak first**: after a reading, at
  the end of a quiet day, about a bubble from an hour ago that nobody answered;
- the querent can **reply to a specific bubble**, and so can a reader;
- a reading can be **carried into the room** from `/history` or from the draw
  screen, the way you would paste a screenshot into a group;
- and the readers call the querent by a **clipped nickname** — *mif*, *tah* — the
  way Indonesians actually address each other.

### The two things this release is measured by, and nothing else

Miftah's words, and they are the acceptance criteria:

> *the two things for me, that determine how successful we are, in implementing
> v0.7.0, is how **natural**, and how **proactive** the chat group would feel to
> be. THAT'S IT. i do not care about anything else.*

So:

- **`[C-N1]` NATURAL** — with the names covered, the three readers are still three
  people; they interrupt, agree, tease, go quiet, and answer each other; nobody
  summarises, nobody lists, nobody signs off. §6.1 is the definition and §10.2 is
  the gate.
- **`[C-N2]` PROACTIVE** — the querent opens the app and there is a red dot they
  did not cause. §6.2 is the mechanism.

**Everything else in this document is in service of those two, including the parts
that look like infrastructure.** When a decision below is a trade, it is traded in
their favour.

### And the one budget instruction

> *DO NOT STINT ON BURNING TOKENS DURING CHAT IN THE CHAT GROUP!! ... i don't care
> what price we have to pay for it.*

Granted, with one boundary that is not about money and cannot be waived: **a chat
run must never be the reason a reading fails.** See `C-D6`. Money is not the
constraint here; z.ai's *prompt-count* quota is, and it is shared with the product.

### What v0.7.0 is NOT

- **Not a support inbox.** No human ever reads these. No escalation path.
- **Not shareable.** `/chat` is gated, private, and gets no `/s/` route, no OG
  image, no `isPublic()` entry. `C-D12`.
- **Not a second reading surface.** No cards are drawn in the chat, no verdict box,
  no `readings` row. A reader may *talk about* a reading; they never *give* one.
- **Not multi-thread.** One room per querent, forever. No DMs with a single reader,
  no second group. `C-D2`.
- **Not translated.** A chat message is written once, in the language it was
  written in, and stays there. `C-D9`.
- **Not attachments generally.** In v0.7.0 the only attachable thing is a reading.
- **Not push.** No web push, no email, no notification permission prompt. The red
  dot is the whole notification surface, and it is only visible inside the app.

---

## 2. Decisions already taken

Settled from Miftah's brief of 2026-08-07 plus this file's reading of the codebase.
**Do not relitigate these. Raise a flag in the reconciliation if a plan hits a wall
against one.**

### `[C-D1]` The chat is a **run engine**, not a request/response endpoint

The unit of generation is a **run**: one trigger (a posted message, a finished
reading, a quiet evening) produces one `chat_runs` row, which produces **1–4
messages from 1–3 readers**.

A run has a **beat sheet** — an ordered list of what is about to happen, each beat
naming a reader, what it is replying to, and its intent. The director writes the
beat sheet; the voices execute it one beat at a time.

**Why not one request that streams the whole exchange:** a three-beat run is 4
model calls and 15–30 seconds. Vercel's function ceiling is 60s and the reading
route already spends `maxDuration = 60`. A run that overruns would lose messages
the querent has already seen appear. **One beat per request** keeps every request
short, makes the run resumable, and — this is the load-bearing part — **makes an
abandoned run and a proactive run the same thing.** See `C-D7`.

### `[C-D2]` One thread per querent. `chat_threads` is keyed by `user_id` and has no id of its own

There is no thread picker, no title, no archive. `chat_threads` exists for the read
cursor and the proactive bookkeeping, not for plurality. A `thread_id` column
anywhere is a mistake: `chat_messages.user_id` is the key, and it is the column that
makes account erasure a cascade rather than a join.

### `[C-D3]` A turn is **buffered and delivered whole**, never streamed token by token

This is a naturalness decision, not a performance one. **A group chat message
arrives as a bubble.** Watching Adrian type character by character is a chatbot
tell; a typing indicator followed by a whole bubble is what every person in the
world reads as a message.

It also buys three things a stream cannot:

- **validation before display** — the address form, the forbidden vocabulary, the
  card names, the length. `C-D10`.
- **the inter-turn beat** — a deliberate pause between Thessaly finishing and
  Margaret starting, which is most of what "natural" means in a group.
- **one code path for proactive turns**, which have nobody watching them.

`ReadingView`'s streaming machinery is not reused and must not be. A chat turn is
`complete()`, not `streamReading()`.

### `[C-D4]` The chat runs on `CHAT_MODEL`, defaulting to **`glm-5.2`**

Miftah's ruling, in his words: *"i would like you to set the LLM for the chat group
(planner and readers) to be GLM 5.2. the best model we have."*

- **A NEW VARIABLE, NOT `LLM_MODEL`.** It follows `ADMIN_MODEL`'s shape and points
  the same way `ADMIN_MODEL` does — *away* from `LLM_MODEL`, toward the better
  model — but for the opposite reason: `ADMIN_MODEL` points away because nothing on
  that surface is in a reader's voice, and this points away because **everything on
  this surface is.** Unset falls back to `LLM_MODEL`.
- **ONE VARIABLE FOR BOTH THE DIRECTOR AND THE VOICES.** `ADMIN_MODEL`'s precedent:
  one variable for the whole class. A `CHAT_PLANNER_MODEL` would be a fourth model
  variable whose only effect is to let somebody make the director dumber than the
  readers it is directing, at 2am, and never notice. If measurement later shows the
  director is fine on a cheaper model, that is a *new* variable with a measurement
  behind it, argued in the reconciliation.
- **`glm-5.2` IS ALREADY CALLED IN PRODUCTION AND THIS IS A MEASUREMENT, NOT AN
  ASSUMPTION.** `ADMIN_MODEL=glm-5.2` is set in `.env.example` and the Insight
  button works, and `src/lib/llm/prices.ts` carries a `glm-5.2` row verified
  2026-08-01. **Read `CLAUDE.md`'s `## The z.ai plan` before touching a price or a
  ceiling because of this release.** One thing there is worth repeating: the legacy
  plan predates GLM-5.2 and the *current* plan's supported set is GLM-5.2,
  GLM-5-Turbo and GLM-4.7 — so the chat, by accident, is on the **right** side of
  the ~February 2027 line that `LLM_MODEL=glm-4.6` is on the wrong side of.
- **`npm run probe:usage` after this variable lands**, per `## Providers`. It is a
  provider/model change and this repo has been wrong about what a provider reports
  for a whole release before.
- The four-variable emergency fallback (`gemini-3.5-flash-lite`) covers this
  variable too: unset, chat follows `LLM_MODEL` like everything else.

### `[C-D5]` Two new `LLMOp` values: `chat_plan` and `chat_turn`. **11 → 13**

`LLMOp` is a closed union in `src/lib/llm/types.ts` and adding to it is
*deliberately not free* — `OP_ORDER` in `@/lib/analytics/rollup` carries an
`AssertNever`, and `callClass.test.ts` fails until every new value has a call site
and every call site has a tier. **A new value is a question for Miftah. It is asked
and granted here**, on the argument that made `insight` and `blog_format`: Miftah
asked for the chat's token consumption to be visible in `/admin`, and a cost table
cannot say what the chat costs if the chat's calls are filed under `reading`.

- **TWO, NOT ONE.** The director and a voice have wildly different token shapes —
  the director is a large prompt and a tiny JSON reply, a voice is a large prompt
  and a two-sentence reply — and averaging them makes both figures meaningless.
- **TWO, NOT THREE.** A *proactive* turn is a `chat_turn`; what made it proactive is
  `chat_runs.trigger`, which `/admin/chat` groups by. An op is what the call *is*,
  not why it happened.
- **FOUR OF THIRTEEN OPS NOW MEASURE SOMETHING OTHER THAN A READING.** A
  cost-per-reading denominator must exclude `insight`, `blog_format`, `chat_plan`
  **and** `chat_turn`. F7 owns fixing this everywhere it already exists.

### `[C-D6]` Chat calls are `callClass: 'deferred'`, and that is a promise to the reading

`src/lib/llm/meter.ts` sheds `deferred` work at the **soft** ceiling (70% of
`LLM_WINDOW_CALL_CEILING`, so 196 of 280) and `interactive` work only at the hard
one. The rule as written in `types.ts` is *"if a user is watching a spinner for
these bytes, it is interactive"* — and by that rule a chat turn is interactive,
because somebody is watching a typing indicator.

**It is `deferred` anyway, and the exception is deliberate.** The reason is
arithmetic, not taxonomy:

> `LLM_WINDOW_CALL_CEILING` is **280 model calls per rolling five hours, fleet-wide.**
> A chat run is 2–5 calls. **Sixty chat runs exhaust the entire app's five-hour
> quota** — and the next thing to be refused is somebody's reading.

A reading is the product; the chat is the best thing in the product. When those
two compete the reading wins, and `deferred` is the mechanism that already exists
to say so. The querent sees *"pembacamu lagi sibuk"* and their cards still turn
over.

Three consequences that are not optional:

1. **`LLM_WINDOW_CALL_CEILING` MUST BE RE-DERIVED BEFORE THIS SHIPS**, and the
   derivation goes in the commit message. 280 is *~400 prompts per 5 hours × 70%*
   on a plan whose denominator `CLAUDE.md` already says is expiring. The chat
   multiplies this app's calls per active user by roughly 5–10×. **Raising it
   without re-reading `## The z.ai plan` is the mistake that section exists to
   prevent.**
2. **The chat gets its own sub-budget**, `LLM_WINDOW_CHAT_CEILING`, checked *before*
   `reserveModelCall` and defaulting to **half** the hard ceiling. Without it a
   single enthusiastic querent's afternoon reaches the soft line and every deferred
   feature in the app — the gist, the day summary, the frequency verdict — goes
   quiet with them.
3. **A shed chat turn is not an error.** The run is left `running` with beats
   remaining and picked up later, which is `C-D7`'s machinery. Nothing is lost,
   nothing 500s, and the querent's next visit delivers the messages. This is the
   single best argument for the run engine.

### `[C-D7]` An abandoned run and a proactive run are **the same object**, and that is the whole design

A run is `pending | planning | running | done | abandoned`, holds its beat sheet,
and knows how many beats it has executed. Two facts follow, and they are what makes
proactivity cheap:

- **The querent closing the tab mid-run does not cancel it.** The run stays
  `running` with beats left. `GET /api/chat/state` reports it and the next open
  delivers the rest. *(**Corrected, R6:** this bullet used to say the red dot
  appears. **The dot is lit by a STORED BUBBLE and never by a pending run** —
  `C-R6` makes a zero-beat plan valid, so a dot lit by a pending run can lead the
  querent to a room with nothing new in it, which is the opposite of what the dot
  is for. `state` returns the unread count and the pending flag as two separate
  fields: the count drives the dot, the flag drives the warm.)* *"Adrian replied while you were away"* costs
  no new mechanism at all.
- **A proactive run is a run nobody posted a message for.** It is minted by a
  trigger (§6.2), it plans, it runs, its messages land, and the exact same badge and
  the exact same delivery path carry it.

**So there is one engine and one delivery path, and F5 builds triggers rather than
a second pipeline.** A design in which proactive messages have their own route,
their own table or their own renderer is wrong.

### `[C-D8]` The readers see the querent's **raw onboarding answers**. This amends `A5`

`CLAUDE.md`'s V8 rule `A5` says, in those words: *"THE PERSONA PROMPT NEVER RECEIVES
A RAW ONBOARDING ANSWER."* It gets the engine facts, the closed values, and the
Lotus summary — abstraction enforced by construction.

**For the chat surface, and only for the chat surface, that is amended.** Miftah's
brief is explicit and is the reason the feature exists:

> *so maybe user would wanna talk about their worst thing that they ever seen (from
> the 6 questions), then because readers can see the user data and user 6 answers as
> context, readers can respond "correctly". nyambung jawabannya, ga ngaco.*

A reader who has the Lotus but not the answers cannot ask *"emang nenek kamu
meninggalnya kapan?"*. That question **is** the product. Granted, with five
conditions that are not negotiable and that every plan inherits:

1. **The decryption happens in exactly one new place**, the chat context assembler
   (F3), through `queries/onboarding.ts` — still *"the only module that encrypts or
   decrypts that column"*. No second decrypt path, no bulk route, no new export.
2. **Not one decrypted byte reaches the browser.** The answers enter a prompt on the
   server and the browser receives only the reader's prose. `audit-secrets.ts` and
   `clientBoundary.test.ts` are the fences; F3's plan adds a canary test in
   `prompt.test.ts`'s shape.
3. **`<jawaban>` fences the block.** *(**Corrected, R2:** this said "a sixth
   fence". **It is the third of six that already exist** — `sanitize.ts`'s
   `DELIMITER` is `pertanyaan|penanya|jawaban|riwayat|terjemahan|sosok` and
   `buildLotusPrompt` writes `<jawaban kunci="…">` today. Reusing it needs no
   edit; adding a seventh alternative for it breaks `sanitize.test.ts`. **What IS
   new is `<obrolan>` and `<lampiran>`**, and F3 owns that edit — see R12.)*
   The rationale stands: unlike in the persona prompt, here it is fencing text a
   person actually typed, so it is doing real work rather than standing in for a
   rule.
4. **`/privacy` is amended, in both locales, in the same release**, and **so are
   the two onboarding hints.** *(**Corrected, Q7 — the most serious finding of the
   reconciliation.**  This said "the clause", singular. F1 found **seven**
   `/privacy` touch points, two of them existing sentences that become false. And
   `/privacy` is not the document that matters: `onboarding.q.worst_thing.hint`
   promises, **while the querent is typing the answer**, that it is *"tidak pernah
   dikutip di dalam bacaanmu"*, and `most_loved.hint` that *"namanya tidak akan
   pernah muncul di dalam bacaan"*. Both survive `C-D8` on the letter — a chat is
   not a *bacaan* — and the first does not survive in spirit at all. **Nobody
   re-reads `/privacy`; everybody reads the hint.** F1 owns both hints in both
   locales, and `CHAT_ANSWERS_ENABLED` is granted so this is reversible.)*
5. **A skipped answer stays skipped.** `answer_text IS NULL` means the querent
   declined, and a reader who asks about the thing you refused to answer is the
   worst possible version of this feature. The assembler omits nulls and the prompt
   is told the set is partial.

**This is the highest-consequence decision in the release. It is recorded here so
that a future session finds it as an amendment with conditions rather than as a
violation of `A5` that nobody noticed.**

### `[C-D9]` Chat messages are never translated, and a turn mirrors the message it answers

Requirement 4 in the brief: *"Agent(s) will need to respond in whatever language the
user asked in."*

- **`chat_messages.locale` records the language a message was written in**, exactly
  as `readings.locale` records the language the prose came out in.
- **The director declares the run's language**, from the querent's text, validated
  against `id | en`, falling back to `users.locale`. There is no language detector
  in this repo and this release does not add one — the model already reads the
  message and can say.
- **`TRANSLATABLE` in `src/lib/translate/keys.ts` gets no new entry, and
  `translations` gets no new `entity`.** A chat message is conversation, not
  content: translating it would make Thessaly say something she did not say, in a
  room where the querent can see the original. Same ruling as `readings.choice`,
  for the same reason.
- **The UI chrome still follows `t()` and the viewer's locale.** The bubbles do not.
  A bubble carries a `lang` attribute matching its own `locale`; the page does not.

### `[C-D10]` Code derives the address forms; the model **chooses** one from the list

Requirement 5: *miftah → mif or tah; jodith → jo; nina → ni or na; anton → ton.*

`src/lib/chat/address.ts` — **PURE, a LEAF, zero imports** — takes a nickname and
returns an ordered list of candidate forms, always including the nickname itself,
first. The prompt is handed the list and told it may use any of them; **a turn that
addresses the querent by a form not in the list is invalid** and is retried once.

This is `effectiveYesNo()`'s rule and `validateChoice`'s rule in a third place:
**where code can enumerate the legal answers, the model picks and code checks.**
The model is not asked to do Indonesian morphology and this repo is not asked to
predict what a model will invent — it invented *"Pulan"* for The Moon and it will
invent a nickname.

Two hard constraints on the derivation:

- **A minimum length of 2 and a small denylist.** A mechanical clipping of an
  arbitrary name can land on a word nobody wants shouted at them. The denylist is
  in the module, it is checked against both locales, and a candidate that trips it
  is simply not offered.
- **The full nickname is always candidate zero and is the default.** If the
  derivation produces nothing usable, the readers use the nickname, which is what
  they do today. **An empty candidate list is a correct outcome, never an error.**

### `[C-D11]` Reply-to is a **column**, not a table, and both sides may use it

`chat_messages.reply_to_message_id`, a self-referencing FK. Set by the querent from
the UI, and set by a reader when the beat sheet says so. There is no thread depth,
no collapse, no *"3 replies"* — it is WhatsApp's quote stub and nothing more.

**The "out of nowhere" reply is not a separate mechanism.** The director is handed
the last N messages *with their ids and their ages*, and may point a beat at any of
them. Adrian answering Margaret's bubble from an hour ago is the director choosing
an old id. Nothing else is needed and nothing else may be built.

### `[C-D12]` `/chat` is gated, private, and `isPublic()` must never learn it

Same sentence `CLAUDE.md` uses about `/history`, and for a stronger reason: this
room contains a person's six onboarding answers spoken aloud. `/chat` is not in
`isPublic()`, is inside the middleware matcher, carries no canonical, no `hreflang`,
no sitemap entry, is `noindex`, and appears in `SITEMAP_PATHS` nowhere.

**And `/en/chat` must 404**, per contract `G2`: `isPublic()`'s content clause strips
`/en/`; the other clauses must not. There is already a test named for the worst
outcome available in the v0.4.0 release and this release adds a path to it.

### `[C-D13]` A posted message goes through the W7 gate, and a refusal is never in a reader's voice

The chat is the largest free-text surface this app has ever pointed at a model, and
the readers actively invite the heaviest material in the product. So:

- **`moderate()` runs on every posted user message**, blocklist and classifier,
  under `MODERATION_TIMEOUT_MS`, exactly as `gateReading` does it.
- **The gate refuses HARM, not SENSITIVITY.** W7's product judgement is untouched
  and the classifier prompt is not "tightened" for this surface. Grief, illness,
  a dying parent and a frightening partner are what the room is *for*.
- **A refusal renders `RefusalNotice`'s copy, not a bubble.** It is the app
  speaking, never Thessaly — a reader who refuses you is a friend who refuses you.
  The refused text is not stored as a `chat_messages` row.
- **`hitRefusal()` applies**, on the same counter and the same budget as the reading
  path. Probing the blocklist through a chat box is the same probing.
- **A reader's own output is not classified.** It is model output generated from a
  fenced prompt, like every other piece of prose in this app, and a second
  classifier pass on it would double the call count for a risk `base.{id,en}.ts`
  already carries.

### `[C-D14]` `events.ts` has one owner for v0.7.0 and it is **F1**. Expect to FOLD

**70 names today, and `events.test.ts:104` caps at 70** — *(corrected, R1: this
said 67. It moved 67 → 70 on 2026-07-30 for A1, so the cap is ALREADY at the
ceiling and the first new name is red for a reason this number would hide. F1
moves the cap to 76 in the same commit that adds the six.)* The ceiling moved and
the register was
*revisited* rather than bumped — two names became two props on an existing event,
two write events became one with a closed `action`, and one was dropped because the
platform log already answered its question.

**Do that again.** §7's F1 carries a proposed register; it is a starting point, and
a plan that folds three of its names into props on two others has done the job
right. **No free text in `events.props`, ever** — a chat message's *length* is a
prop, its text is not, and `sanitizeProps()` is what makes the "we keep no text you
wrote" claim in `/privacy` true.

### `[C-D15]` Two new flags in `src/lib/llm/flags.ts`. Five becomes seven

`CHAT_ENABLED` and `CHAT_PROACTIVE_ENABLED`, both on `ANALYTICS_ENABLED`'s rule
(**only the exact string `'0'` disables**), both in `DEFERRABLE_FLAGS`.

- **The reading and the translation still have none** and `flags.test.ts` still
  asserts the absence by name. The list growing is not a licence to add a sixth for
  symmetry; it is a licence to add a switch for a *new feature that can be off*.
- **`CHAT_ENABLED=0` GATES THE MODEL CALL, NEVER THE CACHED READ**, which is the
  rule every flag in that file already follows. The room still opens, every past
  message still renders, and the composer is disabled with one line of copy. **A
  kill switch that blanks a screen is a worse outage than the quota it protects.**
- **`CHAT_PROACTIVE_ENABLED=0` stops unprompted runs only.** A posted message still
  gets answered. This is the flag an operator reaches for first, because proactive
  runs are the ones with no human waiting and therefore the cheapest to lose.
- **`flagCoverage.test.ts` asserts the set of model call sites is exactly its two
  tables.** Two new call sites arrive in this release and both are flagged; neither
  goes in the admin-only `EXEMPT` table, which still has three members and is still
  owed one `ADMIN_MODEL_CALLS_ENABLED` on its fourth.

### `[C-D16]` Reader avatars are **generated, committed assets**, and the querent's is the lotus

The brief asks for a circular photo per reader, cropped from the existing reader
art, and *"just set it to a default image"* for the querent.

- **`tools/make_avatars.py`**, idempotent, source `assets/` → `public/readers/`,
  square WebP at 2× the largest rendered size. Committed, never hand-edited, exactly
  like `public/cards/` and `public/wallpapers/`. `npm run avatars`.
- **The crop boxes are a hand-written table of three entries in the script**, not
  face detection. Three faces, reviewed once by eye, checked in.
- **`public/dukuns/*.jpg` are the source and are never edited in place.** They are
  2:1 landscape *scenes*; the avatar is a crop of the face out of one.
- **The querent's avatar is the lotus**, the same glyph `AccountButton` draws, for
  the reason that component's header already gives at length: it is the app's own
  symbol for the querent, it needs no data and no network, and **the Google picture
  is deliberately absent from the token and must not be reintroduced.** A
  lettered circle reads as Gmail.
- **`/readers/*` gets its own cache header and is NOT `/cards/*`'s year of
  `immutable`** — that mistake has already been made once in this repo, with
  `/wallpapers/`.

### `[C-D17]` The chat button is mounted by the owning server page, exactly like `AccountButton`

A circle to the **left** of the account circle, top right, `position: fixed`, same
z-layer.

`AccountButton`'s header states the mount rule and its three reasons: mounting it in
the root layout means either an `auth()` call on every request the app serves, or a
second copy of `isPublic()` kept in step by hand — **and mounting it *is* the session
check**, because every page that mounts it is outside `isPublic()`.

**The chat button inherits all of it, including the absence.** It is on `/`,
`/[reader]`, `/account` and `/history`, and **it is not on the draw screen**, for
`AccountButton`'s reason 2: a one-tap exit in the corner of a streaming page is
wrong regardless. The draw screen's route into the chat is the attachment button
(F6), which appears only after the reading is finished.

`src/components/accountSurface.test.ts` is the existing guard and gets a sibling.

**And the `position: fixed` trap applies unchanged**: `fixed` positions against the
nearest ancestor carrying a `transform`, `filter` or `perspective`, so the button is
a direct child of the page's shell and never inside `.bleed` or anything under
`Fan.module.css`.

### `[C-D18]` The unread badge is **client-fetched and never server-rendered**

`GET /api/chat/state` fills it in after mount. The button renders with no dot and
grows one, which is `FrequencyLine`'s and `DaySummary`'s `M14` contract: *render
nothing until you have something, and nothing forever if you never do.*

The alternative — reading `chat_threads` in four server pages — puts a database read
on the render path of the busiest screen in the app, which §0.3 forbids. It would
also make the button flash a stale dot on a cached render.

**That same call is the proactive tick.** It is the one request this app can rely on
a returning querent making, so `C-D7`'s minting happens in its `after()`. See §6.2.

### `[C-D19]` Chat prose is short, and the ceiling is in `LENGTH_BUDGET` like every other ceiling

`CLAUDE.md`'s rule: *"Every word ceiling lives in `LENGTH_BUDGET` in
`src/lib/prompt/budget.ts`, interpolated into the prompt and asserted by the smoke
script so the two cannot drift."*

- Chat budgets join that table. A bubble is **one to three sentences**; the band is
  F3's to set and to measure, and it is far below `daily`'s.
- **`MARGARET_MULTIPLIER = 1.3` applies**, because `VD19` says it is a fact about
  the reader rather than about one service. Margaret is longer-winded in a group
  chat too.
- **Ceilings AND floors, and never scale one end of a band.** The 2026-07-29 cut
  is recorded as scaling both because narrowing a band fails the smoke script on
  output that obeyed the prompt.
- **A very short message is legitimate and the floor must permit it.** *"wkwk"*,
  *"iya sih"*, *"hm"* are how a group chat actually reads, and a floor that forbids
  them makes three readers who each deliver a paragraph — which is the single most
  chatbot-like failure available to this release. F3 owns how; the roadmap owns
  that it must be possible.

### `[C-D20]` The querent's own messages are stored verbatim, and `/privacy` says so

`chat_messages.body` for an author of `'user'` is **text a person typed, stored in
plaintext**, exactly like `readings.question`. Consequences, all of which already
have precedent in this repo:

- **Never log a driver error from any path that runs a chat query.** A postgres
  error quotes the failing statement *and its bound parameters*. Production logs
  ids, attempt and SQLSTATE; development prints the whole thing.
- **It is `readings.question`'s neighbour in every privacy commitment.** Erasure
  cascades on `user_id`. The soft-delete redaction path (`redactForUser`) must be
  audited by F1 against this table and the answer written down, even if the answer
  is *"the cascade covers it"*.
- **`events.props` carries a length and never a body**, per `C-D14`.

---

## 3. Schema deltas — the only place a new table is described

> **⚠ SUPERSEDED. BUILD THE RECONCILIATION'S §2, NOT THIS SECTION.** Five
> workstreams each proved they needed a column this table list does not have —
> `chat_messages.client_key` (F4, idempotency), `.intent` (F5, F7), `.model` (F1),
> `chat_runs.material_key` (F5), `.plan_source` (F7),
> `chat_threads.utc_offset_minutes` (F5) — plus two indexes on `chat_runs`. All are
> folded there. What follows is kept as the record of what was fixed centrally
> BEFORE the plans were written, which is the part that worked.

Three tables, one migration, `0014`, owner **F1**. Column names are fixed here so
seven plans cannot disagree. `snake_case` in SQL, `camelCase` in Drizzle, as
everywhere else in `schema.ts`.

**Read `src/lib/db/schema.ts`'s header before writing any of this.** In particular:
**there is no `pgEnum` anywhere in this project and there must not be one here** —
`ALTER TYPE … ADD VALUE` cannot run inside a transaction, so every closed set is a
`text` column with a `CHECK` and a `$type<>()`.

### 3.1 `chat_threads` — one row per querent

| column | type | notes |
|---|---|---|
| `user_id` | `uuid` **PK** → `users.id` `on delete cascade` | there is no other id. `C-D2` |
| `last_read_at` | `timestamptz` null | the badge's cursor. NULL means never opened |
| `last_user_message_at` | `timestamptz` null | silence measurement for `C-D7` triggers |
| `last_reader_message_at` | `timestamptz` null | ditto |
| `last_proactive_at` | `timestamptz` null | the proactive throttle's left-hand side |
| `proactive_count_today` | `integer` not null default 0 | with `proactive_count_date` |
| `proactive_count_date` | `date` **as `string`, never `Date`** | `local_date`'s trap: the querent's calendar day |
| `created_at` / `updated_at` | `timestamptz` | `$onUpdate()` **does not fire inside `onConflictDoUpdate`** — set it by hand |

### 3.2 `chat_messages` — the log, append-only

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK default random | |
| `user_id` | `uuid` → `users.id` `on delete cascade` | the key everything joins on |
| `author` | `text` not null, `CHECK` | `'user' \| 'thessaly' \| 'margaret' \| 'adrian'`. **One column, not a nullable `reader_id` beside a boolean** — two columns that must agree is two columns that will not |
| `body` | `text` not null | `C-D20` |
| `locale` | `text` not null `$type<Locale>()` | the language *this message* is in. `C-D9` |
| `reply_to_message_id` | `uuid` null → `chat_messages.id` `on delete set null` | `C-D11`. **`set null`, never cascade**: deleting a quoted message must not delete the reply |
| `attached_reading_id` | `uuid` null → `readings.id` `on delete set null` | F6. In `0014` so F6 needs no migration |
| `run_id` | `uuid` null → `chat_runs.id` `on delete set null` | null for a user message |
| `beat_index` | `integer` null | which beat of the run this was |
| `created_at` | `timestamptz` not null default now | |

Indexes: `(user_id, created_at desc)` — the only read pattern the surface has —
plus `(run_id)` and a partial index for the badge count. F1 sizes them.

**There is no `status` column and no soft delete.** A message cannot be edited or
unsent in v0.7.0. Adding either later is a migration; adding a column now for a
feature nobody asked for is how a schema rots.

### 3.3 `chat_runs` — the unit of generation

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK default random | |
| `user_id` | `uuid` → `users.id` `on delete cascade` | |
| `trigger` | `text` not null, `CHECK` | `'user_message' \| 'reading_completed' \| 'idle_nudge' \| 'unanswered' \| 'cron'`. **F5 owns the values; the set is closed and lives here** |
| `trigger_message_id` | `uuid` null → `chat_messages.id` | the posted message, for `'user_message'` |
| `trigger_reading_id` | `uuid` null → `readings.id` `on delete set null` | for `'reading_completed'` |
| `status` | `text` not null, `CHECK` | `'pending' \| 'planning' \| 'running' \| 'done' \| 'abandoned'` |
| `locale` | `text` not null `$type<Locale>()` | the run's language. `C-D9` |
| `beats` | `jsonb` null | the beat sheet. Written once by the director; **shape is F2's and is quoted verbatim in F2's plan** |
| `beats_done` | `integer` not null default 0 | |
| `lease_until` | `timestamptz` null | two tabs must not execute the same beat. See `C-R3` |
| `lease_owner` | `text` null | an opaque token, never a session id |
| `plan_model` | `text` null | the resolved model, `llm_calls`' neighbour |
| `error_kind` | `text` null | **snapshot it BEFORE any `await`**, per `tee.ts`'s trap |
| `created_at` / `updated_at` | `timestamptz` | by hand inside any upsert |

### 3.4 What does NOT change

`readings` gains no column. `profiles` gains no column. `events` gains no column.
`translations` gains no `entity` value. `share_links` is untouched and `'chat'`
never becomes one of its entity values (`C-D12`).

---

## 4. The route table

### 4.1 New routes

| Route | Method | Auth | `maxDuration` | What |
|---|---|---|---|---|
| `/chat` | page | `requireUser()` via middleware | — | The room. Gated, `noindex`, not in `isPublic()` |
| `/api/chat/state` | GET | `requireUser()` | **30** | Unread count, pending-run flag, thread cursors. **Cheap, cacheable-never, and the proactive tick lives in its `after()`** |
| `/api/chat/messages` | GET | `requireUser()` | **15** | Paged history, `?before=&limit=`. Newest first. **Inlines `replyTo: {id, author, snippet}`** (R10) |
| `/api/chat/message` | POST | `requireUser()` | **20** | Gate → store the user's message → mint a `pending` run. **No planner call, no turn call** |
| `/api/chat/advance` | POST | `requireUser()` | **60** | The engine. Plans, or executes exactly one beat. `C-D1` |
| `/api/chat/read` | POST | `requireUser()` | **15** | Move `last_read_at`. **Not folded into `state`** — `state` is polled from four pages that show no messages, so a GET that moved the cursor would clear the dot from a page nobody read |
| `/api/cron/nudge` | GET | `CRON_SECRET` bearer | **60** | One daily proactive sweep, `0 12 * * *` = 19:00 WIB. F5 |

*(**Corrected, R5:** three of these said `default`, while the paragraph directly
below said `maxDuration` is declared on every one of them. The paragraph was
right. **`default` is the ten-second Hobby value that killed `POST /api/locale`.**
All six declare `export const runtime = 'nodejs'` and an explicit number.)*

**`maxDuration` is declared on every one of these.** `POST /api/locale` is the
cautionary tale: the only database-writing route declaring neither `runtime` nor
`maxDuration`, killed at Vercel's ten-second Hobby default on a cold lambda plus a
suspended Neon compute, and diagnosed as an LLM call on a path that reaches no
model. **A user action that WRITES is one of the few things likely to be the request
that wakes a suspended compute.**

And its second rule binds here too: **a bigger `maxDuration` is not a latency
regression, but it must be paired with a bound on the client.** F4 declares a client
timeout per fetch and asserts the *count* of fetches, exactly as the blog editor's
four are asserted.

### 4.2 Rules over the whole tree

- **Every handler starts with `requireUser()`** and reads `{ ok }`, so the two guards
  at the top read alike. Nothing calls `auth()` directly and nothing reads the
  cookie.
- **`/chat` is in the middleware matcher.** `wallpapers/`, `cards/` and `dukuns/`
  are excluded and `readers/` joins them — a `Set-Cookie` on a static avatar is the
  same mistake, and only the matcher prevents it. **This is a matcher change, not an
  `isPublic()` change**, per `R7`.
- **A timeout is the one outcome that means UNKNOWN**, so it is the only one
  retried — once, from the client, with the run id kept. `!response.ok` and offline
  do not retry, because those are answers. `POST /api/locale`'s third rule.
- **No route returns 500 for an absent row.** `/api/chat/state` on a querent who has
  never opened the room returns an empty state, not an error. (`GET /api/persona`
  and `/api/memory/*` still 500 when the database is down rather than 204; that is
  a known open item in `CLAUDE.md` and this release must not add a fourth.)

---

## 5. The generation architecture — the seam every workstream meets at

This section is the contract between F1 (which builds the engine), F2 (the
director), F3 (the voices), F4 (the client that drives it) and F5 (the triggers).
**If a plan describes a different lifecycle, the plan is wrong.**

```
  querent posts                     a trigger fires (F5)
        |                                    |
        v                                    v
  POST /api/chat/message              chat_runs row minted
   - moderation gate (C-D13)           status='pending'
   - store chat_messages(author=user)         |
   - mint chat_runs status='pending'          |
        \__________________  ____________________/
                           \/
                POST /api/chat/advance   <-- the ONE engine entry point
                           |
        status='pending'   |   status='running'
                           |
     +---------------------+----------------------+
     |                                            |
     v                                            v
  DIRECTOR (F2)                             VOICE (F3)
  one chat_plan call                        one chat_turn call
  -> beats[]: who, replying to what,         -> one chat_messages row
     with what intent, in what order            (author=<reader>)
  -> status='running'                        -> beats_done++
  -> returns { typingFor, delayMs }          -> returns { message,
                                                  next|null }
                           |
                           v
              beats exhausted -> status='done'
```

### `[C-R1]` `POST /api/chat/message` makes no generative model call

It gates, it stores, it mints, it returns — fast. The classifier is the one model
call and it is already bounded at `MODERATION_TIMEOUT_MS`. **The querent's own
bubble must appear instantly**; making them wait for a planner before their own
words render is the most obviously wrong thing this design could do.

### `[C-R2]` One `advance` call does exactly one thing

Plan, or execute one beat. Never both, never two beats. The reply tells the client
what is about to happen next — which reader, and for how long the typing indicator
should run — so the client can render the pause before it asks for the bubble.

`{ state, message?, typingFor?, delayMs?, done }` was the sketch; **F1's
`AdvanceReply` is the shape** — a seven-arm discriminated union, and F1 fixes the
field names while F4 consumes them.

**It must have a `shed` arm and F1 built one** (R10). This sketch could not express
*"shed, come back later"*, which `C-D6` requires: the run stays `running` with beats
left, it is not an error and it is not done. `done: true` stops the client;
`done: false` with no message makes it hammer the soft ceiling; an HTTP error gets
retried. `{ state: 'shed', runId, done: false }`, and **F4 must not retry it.**

### `[C-R3]` A run is leased, and a lease is how two tabs do not double-post

`lease_until` + `lease_owner`, taken in the same statement that reads the run. An
expired lease is reclaimable. **The failure this prevents is real and visible**: two
tabs, or a tab plus the cron, executing beat 2 twice and putting the same bubble in
the room twice.

The lease is short (~90s) because a lambda that dies mid-beat must not lock the room
until someone notices.

### `[C-R4]` The typing delay is **client-side and server-declared**

The server says `delayMs`; the client waits before asking for the next beat. The
server never sleeps — a `setTimeout` inside a lambda is paid function time and, on
`after()`, is not reliably reached.

**The delay is a function of the previous bubble's length and the next reader's
temperament**, not a constant. A constant is a metronome and a metronome is the
thing that reads as a bot. F3 owns the function; F4 owns honouring it and owns
`prefers-reduced-motion`, under which the indicator does not animate but the delay
still applies.

### `[C-R5]` Every beat sees every earlier beat of its own run

Adrian replying to Thessaly must have Thessaly's actual words, not the director's
summary of what she was going to say. The context assembler reads `chat_messages`
for the run as it goes, which is free — the rows are already being written.

**This is what makes reader-to-reader work at all**, and it is why beats execute
serially and never in parallel.

### `[C-R6]` The director may say "nobody replies", and that must be cheap and normal

A beat sheet of length zero is a valid plan. `status` goes straight to `done`, no
turn call is made, and the querent's message sits there unanswered — **which is what
happens in a real group chat and is one of the strongest naturalness signals
available.** F2 must make it reachable and F7 must measure how often it happens; a
rate of zero means the director is not really deciding.

### `[C-R7]` A failed beat degrades the run, never the room

A turn that fails validation is retried **once**. A turn that fails twice is
skipped: `beats_done` advances, the run continues to the next beat, and nothing is
shown. A run whose every beat fails ends `abandoned` and the querent sees no bubble
— indistinguishable, from the room, from `C-R6`.

**Never a `[Bacaan terputus…]`-style notice in a bubble.** W4's rule that the notice
reaches the screen but never `readings.body` exists because a stored copy gets
quoted back at the querent later as if the reader had said it. In a chat, where
every message *is* stored and *is* context for the next one, that failure is
automatic. **There is no error bubble in this release.**

---

## 6. Natural and proactive — what they mean, and how they are measured

This is §1's acceptance criteria made concrete. **Every plan is expected to cite
this section.**

### 6.1 Natural

**`[C-N1a]` Three people, not three prompts.** `CLAUDE.md`'s existing rule stands
and now has a second surface: *"if the three readers ever stop being distinguishable
with the names covered, fix the persona paragraphs, not the code."* F3 forks the
chat persona blocks per locale behind a facade, exactly as `readers.ts` does, and
each carries **its own worked example of a chat message** — because the worked
paragraph does more work than the description, and a chat message is not a reading
paragraph.

**`[C-N1b]` The forbidden register is longer here than anywhere in the app.** No
lists. No headings. No "Baik, mari kita bahas". No summarising the querent's message
back at them. No closing offer (*"kalau ada yang mau ditanya lagi…"* is the English
tic list's `let me know if…` in Indonesian and it is the single most bot-like string
available). No em-dash essays. F3 owns the list and the smoke script greps it.

**`[C-N1c]` Silence, brevity and disagreement are features.** `C-R6` makes silence
reachable, `C-D19` makes *"wkwk"* legal, and the readers must be allowed to
contradict each other — Miftah's own example is Thessaly telling Adrian he is being
nosy. **A room where all three agree with the querent and with each other is a
focus group, not a group chat.**

**`[C-N1d]` They ask questions.** The brief calls this *"the hard, natural and
proactive part"*. A beat's intent may be `ask`, the director is told to use it, and
F7 measures the rate. **A reader who asks and then never refers to the answer is
worse than one who never asked** — `C-R5` and the context window are what close that
loop.

**`[C-N1e]` They call the querent by name, clipped.** `C-D10`.

**`[C-N1f]` The only instrument is a blind read.** `npm run smoke -- --chat` prints
a scripted exchange with the reader names covered, shuffled, key after forty blank
lines — `smoke -- --all`'s existing mechanism. **If you cannot tell who is who,
fix the persona blocks.** The three voice proxies (own-forbidden-vocabulary, mean
sentence length with Margaret at 1.5× Thessaly, contraction rate with Adrian > 0 and
Margaret == 0 in `en`) run on chat output too.

### 6.2 Proactive

**`[C-N2a]` There are exactly three sources of an unprompted run, and no polling
loop.**

| # | Source | When | Owner |
|---|---|---|---|
| 1 | **A finished reading** | the reading's existing `after()` mints a `reading_completed` run | F5, hooking F1's mint function |
| 2 | **The open tick** | `GET /api/chat/state`'s `after()` may mint an `idle_nudge` or `unanswered` run when the eligibility rules pass | F5 |
| 3 | **The daily nudge** | `/api/cron/nudge`, once a day, at an hour a person would message you | F5 |

**Source 2 is the mechanism; source 3 is the enhancement**, and a design that
depends on the cron is still wrong — but not for the reason this paragraph gave.

*(**Corrected, R3 and R4.** This said Hobby *"permits a small number of cron
jobs"*, so the nudge might have to fold into `sweep`, which *"must not run at
03:17"*. **Both halves are false.** Verified 2026-08-07: **Hobby allows 100 cron
jobs**, minimum interval once per day, per-hour precision — the changelog entry is
2026-01-20. And **Vercel cron is always UTC**, so `sweep`'s `17 3 * * *` is
**10:17 WIB**, not 3am. The fold is not designed and Q5 is closed. `sweep`'s own
header carries the same stale sentence and F1 corrects it. The nudge is
`0 12 * * *` — written down because a future session will otherwise "fix" it to
noon.)*

**`[C-N2b]` The red dot is the whole notification surface.** No web push, no email,
no permission prompt. `C-D18` is how it renders.

**`[C-N2c]` A proactive message is timestamped when it was written, and the app
never pretends otherwise.** Minting a run on the open tick and back-dating it so it
looks like it arrived overnight is a lie the querent can catch the first time they
watch the timestamp appear. The honest version is already good: they opened the app,
and there was a message.

**`[C-N2d]` Eligibility is throttled and the throttle is per calendar day, the
querent's.** `proactive_count_date` is a `string`, not a `Date` — `local_date`'s trap
verbatim: the querent's calendar day, sent by the client, because a `Date` renders in
the server's zone and is a day out for anyone in Jakarta between midnight and 07:00.

**`[C-N2e]` There must be *material*.** A proactive run with nothing to be about
produces *"hai, apa kabar?"*, which is the emptiest thing this feature could ship.
F5 enumerates the material — a reading since the last run, a reader question the
querent never answered, a bubble nobody replied to, a recurring card, a date that
matters — and **a trigger with no material does not fire.** F7 measures how often
that happens, because a high rate means the eligibility rules are wrong, not that
the querent is boring.

**`[C-N2f]` The measurable proxy for success is the reply rate.** Did the querent
answer a message they did not ask for, within 24 hours? That single number is the
closest this project can get to *"proactive feels alive"*, and F7 owns putting it on
a chart. Its denominator is proactive runs that produced at least one bubble.

---

## 7. The seven workstreams

Each entry states **what it owns**, **what it must not touch**, and **what its plan
must contain beyond the obvious**. The plan file writes the detail; this is the
brief.

### F1 — The chat spine

`docs/plans/2026-08-07-chat-spine.md`

**Owns:** migration `0014` and the three tables (§3); `src/lib/db/queries/chat.ts`;
`src/lib/chat/types.ts` (PURE, the shared shapes every other workstream imports);
`src/lib/chat/run.ts` (the engine — lease, advance, beat accounting) with **stub**
director and **stub** voice behind the interfaces F2 and F3 will implement; the six
API routes (§4.1, minus the cron); the two `LLMOp` values and their `callClass`
declarations; `CHAT_MODEL` and `src/lib/chat/model.ts` (a LEAF, `ADMIN_MODEL`'s
`src/lib/admin/model.ts` shape — and **`chatModel()` returning `undefined` when unset
must restate `ledger.ts`'s `||` chain exactly**, or a stored row and the `llm_calls`
row beside it name different models); the two flags in `src/lib/llm/flags.ts`; the
`chat:` rate-limit namespace and `LLM_WINDOW_CHAT_CEILING`; the moderation seam
(`C-D13`); the whole of `events.ts` for this release (`C-D14`); and **`/privacy`'s
amendment in both locales** (`C-D8` condition 4).

**Must not touch:** any prompt file, any component, `/admin`.

**Its plan must additionally settle:**
- The `beats` JSON shape, **quoted verbatim**, so F2 writes to a contract and F3
  reads from one. F1 owns the shape; F2 owns what goes in it.
- The lease protocol as SQL, and the integration test that proves two concurrent
  `advance` calls produce one message.
- Whether `/api/chat/read` exists or folds into `state`, and why.
- The erasure audit: what `redactForUser()` / the `deleted_at` transaction do about
  `chat_messages`, written down even if the answer is "the cascade covers it".
- The proposed `events` register, **already folded** — expect to ship fewer names
  than you draft.
- `.env.example` annotations for every new variable, in that file's voice.

### F2 — The director

`docs/plans/2026-08-07-chat-director.md`

**Owns:** `src/lib/chat/direct/**` — the plan prompt (forked per locale behind a
facade), the `chat_plan` call, `validatePlan`, and the deterministic fallback.

**Must not touch:** the engine, the routes, the voices' prompts.

**Its plan must additionally settle:**
- **What the director actually decides**, as a closed list: the cast, the order, the
  reply target of each beat, each beat's intent (`answer | ask | react | tease |
  agree | push_back | aside`, or whatever closed set it argues for), the run's
  language, and whether to speak at all.
- **The affinity input.** `readers.json` already carries `specialties` per locale;
  the brief asks that the reader whose character best fits the question be the one
  who answers. Is that a code-side score handed to the model as a hint, or a fact
  the model derives from the persona blocks? **Argue it, and prefer the hint** —
  `effectiveYesNo()`'s precedent is that where code can decide, code decides.
- **`validatePlan` refuses shape, not truth**, and says so — `validateInsight`'s
  ruling verbatim. A beat naming a fifth reader, a reply target that is not in the
  supplied window, a beat count over the cap, a cast with a repeated reader in
  adjacent beats: all refused. *"Is this the right reader for this question"* has no
  cheap test and must not be faked with one.
- **The fallback when the call fails or the plan is refused.** It must be
  deterministic, must produce a *plausible* single beat, and must be tuned toward
  **one reader** rather than three — a fallback that is louder than the real thing
  is the wrong failure.
- **The cap.** Maximum beats per run, maximum runs chained. A director that can
  schedule six beats will, and six bubbles at once is a bot dumping.
- **How the "out of nowhere old reply" is reachable** (`C-D11`): the size of the id
  window and whether ages are given in the prompt as timestamps or as prose.

### F3 — The voices

`docs/plans/2026-08-07-chat-voices.md`

**Owns:** `src/lib/chat/context.ts` (the assembler); `src/lib/chat/prompt/**`
(`base`, `readers`, forked per locale behind a `Record<Locale, …>` facade so a
missing locale is a compile error); `src/lib/chat/address.ts` (PURE, LEAF);
`validateTurn`; the `chat_turn` call; `LENGTH_BUDGET`'s chat rows; and
`npm run smoke -- --chat` with the blind read.

**Must not touch:** the engine, the director's prompt, any component.

**Its plan must additionally settle:**
- **The context budget, itemised.** Nickname and address candidates, birth date and
  the numerology facts, the six answers (`C-D8`), the Lotus summary, the last *n*
  readings (which fields — `gist`, `question`, cards, or the body?), the last *m*
  messages, the current run's beats so far, the attached reading if any. **Each
  with an `n` that is a named constant and a stated reason**, because "configurable"
  in the brief means somebody will want to change it.
- **The six answers' fences and the canary test** (`C-D8` conditions 1–3, 5).
- **The forbidden register** (`C-N1b`) as a grep list, per locale, plus the existing
  Malay eleven for `id` and the English tic list for `en`.
- **How a one-word message is possible** under `LENGTH_BUDGET` (`C-D19`).
- **`validateTurn`**, refusing shape: an address form outside the candidate list, an
  English card name mangled, a length outside the band, a markdown list, a reader
  addressing themselves. **Biased towards accepting** — `validateChoice`'s bias is
  the opposite because there a false acceptance ships the reported bug; here a false
  rejection costs a bubble and makes the room quieter, which is the failure this
  release cannot afford.
- **`delayMs`'s function** (`C-R4`).
- **The blind read protocol and where its output goes** when a session runs it.

### F4 — The surface

`docs/plans/2026-08-07-chat-surface.md`

**Owns:** `src/app/chat/**`; `src/components/Chat*.tsx` and their CSS modules;
`tools/make_avatars.py` and `npm run avatars`; `public/readers/**`; the `chat.*` keys
in `src/lib/i18n/locales/id.ts` (**write the Indonesian first — a red typecheck in
`en.ts` is the feature**); the middleware matcher entry for `/readers/`; and the
`accountSurface.test.ts` sibling.

**Must not touch:** any route handler, any prompt, `schema.ts`.

**Its plan must additionally settle:**
- **The advance loop as client code**, including: what happens on a failed fetch,
  the four (or however many) client timeouts **and an asserted count of fetches**,
  what the typing indicator is, and what the querent sees while a run is in flight.
- **The reply-to interaction on a phone.** Long-press? Swipe? A button in a
  bubble menu? **This is the interaction most likely to be wrong on hardware and
  right in WSL**, and loop 4 cannot answer it.
- **The composer's geometry with the keyboard up**, which `CLAUDE.md` already lists
  as an open item for the answer sheet's textarea. Same geometry, same limitation.
- **Scroll anchoring** — a new bubble arriving must not yank the querent out of the
  history they are reading.
- **`ChatButton`'s mount rule and its absence from the draw screen** (`C-D17`), plus
  the `position: fixed` trap.
- **Where the badge count comes from and what it does at zero** (`C-D18`, `M14`).
- **Widths at 320/360/375/390** via loop 4 — a fixed-width container plus
  `getBoundingClientRect`, which is exact and is the only loop that answers width.
  `public/cards/_slotfit.html`'s pattern; a `_chatfit.html` is the deliverable.
- **Safari does not focus a `<button>` when it is tapped**, so any dialog this
  surface opens takes its opener as a `returnFocusTo` **prop**. Both existing
  overlays do.

### F5 — Proactivity

`docs/plans/2026-08-07-chat-proactivity.md`

**Owns:** `src/lib/chat/proactive/**` — eligibility, material selection, the trigger
set; the hook into the reading route's existing `after()`; the mint inside
`/api/chat/state`'s `after()`; `/api/cron/nudge` and its `vercel.json` entry; and
`npm run smoke -- --chat --proactive`.

**Must not touch:** the engine's advance path, the director's prompt, the voices.

**Its plan must additionally settle:**
- **The Vercel Hobby cron count, verified against Vercel's documentation, with the
  number and the date written down** (`C-N2a`), and the fold-into-`sweep` fallback.
- **The material catalogue** (`C-N2e`) and the rule that no material means no run.
- **The eligibility predicate as a pure function**, unit-testable with injected
  clocks, because *"a heuristic may fail a build; it may not fail a person"* —
  `tally.ts`'s rule, and a false positive here is a reader messaging somebody at a
  moment that reads as tone-deaf.
- **The interaction with F6.** If the querent attaches the reading themselves, the
  `reading_completed` run for that reading must not also fire. §11 names this seam.
- **The quiet hours question.** A run minted at 03:00 Jakarta is timestamped 03:00
  and reads as a bot. Argue whether the mint respects local hours, and remember the
  server does not know the querent's timezone — only `local_date` does, and only
  when a client sends it.
- **What the `after()` on the reading route may cost.** That path already carries
  `persistReading`, the gist, and `scheduleLotusRefresh`; a fourth job that plans a
  chat run competes with them for the same lambda's remaining time.

### F6 — Attachments

`docs/plans/2026-08-07-chat-attachments.md`

**Owns:** the *"bahas di grup"* control on `/history/[id]` and inside the finished
reading on the draw screen; the attachment bubble renderer; the attachment's slice of
the context assembly (agreed with F3 and written in both plans); and the
`chat.attachment_added` event.

**Must not touch:** `schema.ts` (the column is in `0014`), the engine, the director.

**Its plan must additionally settle:**
- **What the bubble renders.** Not the whole reading — a compact card with the three
  cards, the question if it was included, and the first line. `ReadingView` is the
  one renderer three surfaces mount and **this is not a fourth mount**; it is a new,
  much smaller component, and the plan must say so explicitly so nobody tries.
- **Whether the querent may add text with the attachment** (the brief says they may,
  optionally) and what happens when they do not — an attachment with no text is a
  perfectly good conversational move and must produce a run.
- **What the readers get.** The reading's `body`, its cards, its verdict, its
  question — **and the rule that the body handed over is the STRIPPED body**, the one
  `persistReading` stored, never one containing a `PILIHAN:` marker.
- **A foreign-locale attachment.** A reading generated in `id` attached to an `en`
  conversation: `ReadingView`'s rule 4 does not apply here because this is not
  `ReadingView`, but the underlying honesty does. Argue it; do not silently render
  Indonesian prose under English chrome.
- **The draw screen's control must not appear while the reading is streaming**, for
  `AccountButton`'s reason: a one-tap exit from a streaming page aborts the reading
  and records `reading.aborted`.
- **A deleted reading.** `on delete set null` means the bubble outlives its reading.
  What does it render?

### F7 — The operator's view

`docs/plans/2026-08-07-chat-admin.md`

**Owns:** `/admin/chat` and its tab in `AdminTabs`; the queries under
`src/lib/db/queries/admin/chat.ts`; the panel registry entries in
`src/app/admin/insight/panels.ts`; and **fixing the cost-per-reading denominator
everywhere it already exists** (`C-D5`).

**Must not touch:** anything outside `src/app/admin/**`, `src/lib/db/queries/admin/**`
and `src/lib/admin/**`.

**Its plan must additionally settle:**
- **The panels.** At minimum: runs over time by trigger; beats per run; cast
  distribution (who speaks, how often, and the silence rate from `C-R6`); tokens and
  cost split `chat_plan` vs `chat_turn`; latency per beat; validation-failure rate;
  **and `C-N2f`'s proactive reply rate, which is the release's own scorecard.**
- **Admin copy is Indonesian, hardcoded, and never in the i18n catalog** (`A-D12`),
  and `adminCopy.test.ts` forbids `t()` across that tree.
- **No charting library. Hand-rolled, server-rendered SVG**, the validated palette,
  and **never a dual-axis chart** (`A-D10`, `A-D9`, `A-D11`).
- **`R21` survives**: no public content route is cached in production, and the
  insight box's first frame is server-rendered from its own `withAdminRead`.
- **Pressing the Insight button changes the panel it describes** (`A7`'s measured
  finding) — so the stale flag fires only on a closed range. It applies here
  identically and the new panels must not re-derive it wrongly.
- **Whether the chat needs a row on `/admin/users/[id]`**, and what it may show.
  **It must not show message bodies without the same one-key-per-request, audited
  reveal `A-D16` built for onboarding answers** — a chat log is strictly more
  sensitive than the six answers, because it is the six answers plus everything the
  querent volunteered afterwards. **If in doubt, show counts and no text.**

---

## 8. Environment variables

`.env.example` is the reference and every variable below gets its full annotation
there, in that file's voice. F1 owns the file for this release.

| Variable | Default | Owner | Notes |
|---|---|---|---|
| `CHAT_MODEL` | unset → `LLM_MODEL` | F1 | **Set to `glm-5.2` in `.env.example` and in Vercel, Production and Preview.** `C-D4` |
| `CHAT_ENABLED` | on | F1 | Only `'0'` disables. Gates generation, never the read. `C-D15` |
| `CHAT_PROACTIVE_ENABLED` | on | F1 | Only `'0'` disables. Unprompted runs only |
| `LLM_WINDOW_CHAT_CEILING` | half of `LLM_WINDOW_CALL_CEILING` | F1 | The chat's sub-budget inside the 5-hour window. `C-D6` |
| `LLM_WINDOW_CALL_CEILING` | **280 — MUST BE RE-DERIVED** | F1 | Existing variable. `C-D6` consequence 1. Read `## The z.ai plan` first |
| `CHAT_CONTEXT_MESSAGES` | F3's number | F3 | How many past messages enter a prompt |
| `CHAT_CONTEXT_READINGS` | F3's number | F3 | How many past readings |
| `CHAT_MAX_BEATS` | F2's number | F2 | Cap per run |
| `CHAT_PROACTIVE_MIN_GAP_SECONDS` | F5's number | F5 | Silence before an unprompted run |
| `CHAT_PROACTIVE_MAX_PER_DAY` | F5's number | F5 | Per querent, per **their** calendar day |
| `RATELIMIT_CHAT_BACKEND` | unset → default backend | F1 | Only if F1 argues it needs one |

**Rules inherited unchanged:** read every one of these **at call time, never at
module scope**, or the bundler freezes the build-time value into production and the
switch stops switching. Escape `$` as `\$` in `.env` files and **do not escape in
the Vercel dashboard.** A number variable falls back rather than becoming zero, per
`auth/ttl.ts` and `meter.ts` — a ceiling of `0` refuses every call in the app, which
is a typo taking the product down.

---

## 9. Non-negotiables

A plan that violates one of these is wrong.

1. **A chat run never causes a reading to fail.** `C-D6`.
2. **No decrypted onboarding answer, no prompt text, no model name and no key
   reaches the browser.** `C-D8`, and `npm run build` enforces it.
3. **`/chat` never becomes public** and `isPublic()` never learns it. `C-D12`.
4. **`/privacy` is amended in the same release as `C-D8`, in both locales.** Not a
   follow-up.
5. **No free text in `events.props`.** A length, never a body.
6. **No driver error is ever logged from a path that runs a chat query.**
7. **Every generated bubble is validated before it is stored.** `C-D3`, `C-R7`.
8. **There is no error bubble.** A failure is silence. `C-R7`.
9. **`local_date` and `proactive_count_date` are `string`, never `Date`.**
10. **`$onUpdate()` does not fire inside `onConflictDoUpdate`** — every upsert sets
    `updatedAt` by hand.
11. **Every module under `src/lib/db/queries/**` takes its handle first**, and
    nothing imports `@/lib/db/client` from a script or a test.
12. **The Indonesian is Indonesian, not Malay**, in the chat prompts and the chat
    catalog both.
13. **No therapy, diagnosis, treatment or healing-of-trauma language**, in either
    locale, and the English forbidden list stays the longer one. This binds harder
    here than anywhere: a reader asking about the worst thing you have seen is one
    sentence away from sounding like a clinician.
14. **`npm run build` is run before believing a green typecheck.** TypeScript stays
    on 5.x.

---

## 10. Verification

### 10.1 The loops, applied

| Loop | What it answers here |
|---|---|
| **1. Vitest** | `address.ts`, `validatePlan`, `validateTurn`, the eligibility predicate, the beat accounting, the context assembler's budget, `chat.*` catalog parity |
| **2. Vitest integration** | the lease (two concurrent advances → one message), the cascade on erasure, the badge count, `reply_to` `set null`, the run lifecycle |
| **4. Fixed-width + `getBoundingClientRect`** | **the only loop that answers width.** `_chatfit.html` at 320/360/375/390, both locales, long nicknames, long bubbles, the quote stub |
| **5. Real Chrome over CDP** | *does the UI agree with what it sends* — the advance loop's request bodies against the rendered bubbles. **It does not give you a phone width**; `innerWidth` is 500 whatever `--width` says |
| **6. A real iPhone against a preview** | the reply-to gesture, the composer with the keyboard up, the typing indicator on glass, the badge in standalone mode. **Nothing else can answer these** |

`npm test` must still pass without Docker. Run `npm test` and
`npm run test:integration` **separately** — `npm run test:all` fails 12–22 of V9's
limiter tests as a harness race and its red does not mean anything.

### 10.2 The acceptance test for the release

**Both halves. Neither is a unit test.**

1. **`npm run smoke -- --chat`**, read blind. Three readers, names covered. If you
   cannot tell who is who, the release is not done. Then read it *again* asking one
   question: **would a person send this?**
2. **`npm run smoke -- --chat --proactive`**, read blind. Does the opening message
   have something to be about? Does it sound like somebody thought of you, or like a
   cron job?
3. **On a real iPhone, against a Vercel preview:** take a reading, close the app,
   come back, and find the dot. Reply to a reader's bubble from yesterday. Attach a
   reading from `/history`. Then keep chatting for ten minutes **because you want
   to**, which is the only test that matters.

### 10.3 The instruments this release adds

- `npm run smoke -- --chat` / `--chat --proactive` (F3, F5)
- `public/cards/_chatfit.html` (F4)
- `npm run avatars` (F4)
- `/admin/chat`'s reply-rate panel (F7) — the only *continuous* measurement of
  `C-N1` and `C-N2` once the release has shipped

---

## 11. The seams — where two workstreams meet and both think they own it

Every one of these is resolved in the reconciliation, and each is a place where two
plans will otherwise both describe the same object slightly differently.

| # | Seam | Ruling |
|---|---|---|
| S1 | **The `beats` JSON shape** | **F1 owns the shape; F2 owns the contents.** F1's plan quotes it verbatim; F2's plan quotes F1's |
| S2 | **The context assembler** | **F3 owns it.** F2's director needs a *narrower* view of the same material; it calls into F3's assembler with a different profile, and does not build a second one |
| S3 | **`delayMs`** | **F3 computes it, F1 returns it, F4 honours it.** Three files, one number |
| S4 | **The attachment's prompt slice** | **F6 owns the shape; F3 owns where it sits in the prompt.** Both plans quote it |
| S5 | **Reading-completion proactivity vs. a manual attach** | **F5 owns the suppression rule.** If the querent attaches reading X, the `reading_completed` run for X does not fire. F6's plan states the same rule and cites F5's |
| S6 | **`events.ts`** | **F1 owns the file.** Every other plan declares its events in its own `## Events` section, and F1 folds and transcribes |
| S7 | **`.env.example`** | **F1 owns the file**, including the annotations for F2's, F3's and F5's variables — which those plans supply as prose |
| S8 | **The moderation gate on a chat message** | **F1 owns the call site.** W7's `gate.ts` is not modified; if it needs a new surface argument, F1 says so and the reconciliation rules on it |
| S9 | **`ChatButton` vs `AccountButton`** | **F4 owns the new component and must not edit `AccountButton`.** If the two need to know about each other's geometry, that is a CSS custom property in `tokens.css`, and `tokens.ts` changes first |
| S10 | **The `/admin` denominator fix** | **F7 owns it**, across every existing file that computes a cost per reading. F1 must not "helpfully" fix it while adding the ops |
| S11 | **`LLM_WINDOW_CALL_CEILING`'s new number** | **F1 owns the change; F7 owns the panel that shows whether it was right.** The derivation goes in F1's plan and in the commit message |

---

## 12. Open questions

These are **for Miftah**, and a plan must not resolve one by picking an answer. If a
workstream is blocked on one, it says so in its plan and builds the rest.

> **⚠ ALL SEVEN ARE CLOSED. Miftah ruled on 2026-08-07: *"do whatever you need.
> change /privacy. anything. just do whatever means necessary so the chat group
> feels natural and proactive."*** The rulings, including the four smaller
> questions the plans raised, are the reconciliation's **§7b** — read it, not the
> table below, which is kept as the record of what was asked.
>
> **Q1 and Q7 GRANTED**, five conditions intact, `/privacy` **and both onboarding
> hints** amended, `TERMS_VERSION` **not** bumped. **Q4** counts-and-no-text.
> **Q3** 280 stands. **Q2** no local quiet hours. **Q5** closed by measurement.
> **Q6** deferred to the next release. And **one beat may now produce two
> bubbles** — F3's ask, granted as the ruling most responsive to the instruction,
> and one F1 must build for now because it cannot be added cheaply later.

**Status before the ruling: Q5 CLOSED by measurement, Q3 ANSWERED by F1, Q2
LARGELY DISSOLVED by F5 — and Q7 was new and outranked all of them.**

| # | Question | Status | Why it needs a ruling |
|---|---|---|---|
| **Q7** | **The two onboarding hints promise the opposite of `C-D8`, and they are read while the querent types the answer.** `worst_thing.hint`: *"tidak pernah dikutip di dalam bacaanmu"*. `most_loved.hint`: *"namanya tidak akan pernah muncul di dalam bacaan"*. Amend both, in both locales? And does the amendment bump `TERMS_VERSION`? | **OPEN — NEW, and the most serious finding** | Both survive on the letter (a chat is not a *bacaan*) and the first does not survive in spirit at all. Nobody re-reads `/privacy`; everybody reads the hint. **Ruling on Q1 rules on this.** Found by F3. |
| **Q1** | **`C-D8` amends `A5` and puts the six raw onboarding answers — including `worst_thing` — into a chat prompt on every run.** The brief asks for exactly this. Confirm, with the five conditions. | **OPEN — now inseparable from Q7** | It is the difference between a room that knows you and a room that read your file. `CHAT_ANSWERS_ENABLED` is granted so it is reversible without a redeploy. |
| **Q4** | **Does `/admin/users/[id]` show chat message bodies?** | **OPEN** | F7 defaults to *counts and no text*, and adds the argument the roadmap lacked: `A-D16`'s audited reveal was built for *a thing you read one of*, and a conversation would be 200 audit rows for one act of reading. F7 offers **Option B′ — one *run* per reveal** if text is wanted. |
| **Q6** | **Is `glm-5.2` still plan-served in February 2027**, and does the chat's model choice change the migration `## The z.ai plan` describes? | **OPEN** | The chat is on the right side of that line and `LLM_MODEL=glm-4.6` is on the wrong one. That may be an argument for moving the reading model early rather than a coincidence. |
| **Q3** | `LLM_WINDOW_CALL_CEILING`'s new value. | **ANSWERED — confirm only** | F1 re-derived it and changed nothing: **280 stands, `LLM_WINDOW_CHAT_CEILING = 140`.** A bigger number does not create quota — z.ai meters prompts, and `## The z.ai plan` says the far side is `1113`, not throttling. |
| **Q2** | Quiet hours. | **LARGELY DISSOLVED** | F5: sources 1 and 2 only fire when the querent is demonstrably in the app, and source 3's UTC cron *is* the mechanism (19:00 WIB). `utc_offset_minutes` is folded into `0014` anyway so ruling the other way later is one line. |
| **Q5** | A second cron job on Hobby. | **CLOSED** | **100 jobs on Hobby**, verified 2026-08-07. The nudge gets its own. |

---

## 13. What "done" looks like

A `CHANGELOG.md` entry for `v0.7.0`, a `docs/workstream-notes.md` section per
workstream with the traps each one paid for, a `CLAUDE.md` `## The group chat`
section holding **only the rules and the invariants** — and a room that Miftah keeps
opening when there is nothing in it, because Thessaly might have said something.

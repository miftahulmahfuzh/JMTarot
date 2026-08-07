# v0.7.0 Reconciliation — the group chat

**Date:** 2026-08-07.
**Inputs:** `PUBLIC_RELEASE_ROADMAP_v0.7.0.md` and the seven workstream plans written
against it in parallel, none of which could see any of the others.

> **THIS FILE OUTRANKS THE ROADMAP, AND THE ROADMAP OUTRANKS THE SEVEN PLANS.**
> Where a plan says something this file overturns, the plan is wrong and is to be
> edited before it is built. Every ruling below names the plan it changes.
>
> **Read this before `implement PUBLIC_RELEASE_ROADMAP_v0.7.0.md f<n>`.** It is
> shorter than any of the plans and it is where the seven were made to compose.

The seven agreed far more than they disagreed, which is what the roadmap was for.
What follows is only the disagreements, the facts the roadmap got wrong, and the
things nobody owned.

---

## 0. Summary of what changed

- **Six facts in the roadmap were wrong** and are corrected in §1. Two of them
  (the cron limit, the fence count) would have caused a workstream to build
  something unnecessary; one (the event count) would have made a correct commit
  look red.
- **Migration `0014` grows by six columns and two indexes.** Five workstreams
  needed something §3 did not have. §2 is now the single authoritative table
  definition and F1 builds *that*, not roadmap §3.
- **Four contracts are pinned verbatim** in §3, because three or more workstreams
  each name them: the beat sheet, the advance reply, the fence set, and the op set.
- **Nine files had no owner.** §4 assigns each one.
- **The build order in roadmap §0.1 was wrong** and is corrected in §6.
- **Four things are escalated to Miftah** in §7, one of which is new and is the
  most serious finding of the whole exercise.

---

## 1. Facts the roadmap got wrong

### `[R1]` The event taxonomy is **70 names, not 67**, and `events.test.ts` caps at 70

`C-D14` says 67. It moved 66 → 67 on 2026-07-29 and **67 → 70 on 2026-07-30 for
A1**, and `src/lib/analytics/events.test.ts:104` asserts
`EVENT_NAMES.length <= 70`.

**Consequence if uncorrected:** the cap is *already* at the ceiling, so the first
new name is red — and a session reading the roadmap's 67 would look for the cause
in their own diff. F1's plan is right and its 70 → 76 arithmetic stands. **The cap
in `events.test.ts` moves to 76 in the same commit that adds the names**, and the
commit message says why, per that file's own convention.

*Found by F1.*

### `[R2]` `<jawaban>` already exists. `sanitize.ts` has **six** fences, not five

`C-D8` condition 3 calls `<jawaban>` *"a sixth fence"*. It is **the third of six
that already exist**: `src/lib/prompt/sanitize.ts:79`'s `DELIMITER` is
`pertanyaan|penanya|jawaban|riwayat|terjemahan|sosok`, and `<jawaban kunci="…">` is
what `buildLotusPrompt` writes today.

**Consequence if uncorrected:** a session taking `C-D8` literally adds a seventh
alternative for a tag that is already there, and `sanitize.test.ts`'s fixpoint
assertions over the count go red for a reason that reads like a real defect.

**What IS new** — and the roadmap names neither — is `<obrolan>` (F3's chat
transcript block) and `<lampiran>` (F6's attachment block). See `[R12]`.

*Found by F1 and F3 independently; the gap that made it visible was flagged by F2
and F6 independently.*

### `[R3]` Vercel allows **100 cron jobs on Hobby**, not "a small number"

`C-N2a` and Q5 both rest on a scarcity that no longer exists. Verified 2026-08-07
against `vercel.com/docs/cron-jobs/usage-and-pricing` and the changelog entry
*"Cron jobs now support 100 per project on every plan"* (2026-01-20): **100 jobs,
minimum interval once per day, per-hour precision (±59 min).**

**Q5 is closed.** `/api/cron/nudge` gets its own entry. The fold into `sweep` does
not happen and is not designed.

**The same stale sentence is in `src/app/api/cron/sweep/route.ts`'s header**
(*"Vercel's free plan allows a small number of cron invocations"*). It is W7's file
and F5 correctly did not edit it. **F1 corrects that one sentence**, since F1 is
already the workstream that touches release-gate prose, and the commit message
carries the date and the source.

*Found and verified by F5.*

### `[R4]` `sweep`'s `17 3 * * *` is **10:17 WIB**, not 03:17

**Vercel cron schedules are always UTC.** The roadmap's *"03:17 is a terrible hour
to message a person"* is built on a false premise. The premise is struck; the
conclusion (that the nudge gets its own job) survives on `[R3]` instead.

**`/api/cron/nudge` is `0 12 * * *` = 19:00–19:59 WIB.** Written down here because
a future session reading `0 12` will otherwise "fix" it to noon.

*Found by F5.*

### `[R5]` Roadmap §4.1 contradicts itself on `maxDuration`, and "default" is the wrong value

§4.1's table says `default` for `/api/chat/state`, `/messages` and `/read`; the
paragraph beneath it says *"`maxDuration` is declared on every one of these"* and
then cites `POST /api/locale` — **the only database-writing route declaring neither
`runtime` nor `maxDuration`**, killed at Vercel's ten-second Hobby default on a
cold lambda plus a suspended Neon compute.

**The paragraph is right and the table is wrong.** F1's declared values stand and
are now binding: `/state` **30**, `/messages` **15**, `/read` **15**, `/message`
**20**, `/advance` **60**, `/cron/nudge` **60**. All six declare
`export const runtime = 'nodejs'`.

*Found by F1; independently flagged by F5 as the specific hazard on `/state`.*

### `[R6]` `C-D7`'s red dot is wrong for a `pending` run

`C-D7` says a pending run makes *"the red dot appear"*. But `C-R6` makes a
zero-beat plan valid and desirable — so a dot lit by a pending run can lead the
querent to a room with nothing new in it, which is the exact opposite of what the
dot is for.

**RULING: THE DOT IS LIT BY A STORED BUBBLE AND NEVER BY A PENDING RUN.** Unread
is counted over `chat_messages` with `author <> 'user'` and
`created_at > last_read_at`. A pending or running run contributes nothing to the
badge until its first bubble is written.

This is `M14` again — *render nothing until you have something* — and it is why
`GET /api/chat/state` returns the unread **count** and the pending-run **flag** as
two separate fields: the count drives the dot, the flag drives the warm.

*Found by F5.*

---

## 2. Migration `0014`, folded — **this replaces roadmap §3**

**F1 builds this table list, not roadmap §3's.** Six columns and two indexes were
each required by a workstream that could not see the others. Every addition below
names the workstream that proved it necessary and the failure it prevents.

### 2.1 Additions to `chat_messages`

| column | type | required by | why, and the failure without it |
|---|---|---|---|
| `client_key` | `text` null | **F4** | The one permitted timeout retry (`POST /api/locale`'s rule 3) double-posts the querent's sentence — and then **both copies are context for every future turn**. Unique per `(user_id, client_key)` where not null. |
| `intent` | `text` null, `CHECK` over `BeatIntent` | **F5, F7** | F5's unanswered-ask material must read a *declared* intent. Inferring a question from a `?` is `CLAUDE.md`'s bare-`lagi` trap in a new place. F7's ask rate (`C-N1d`) is the same column. |
| `model` | `text` null | **F1** | Every other prose table in this schema records the model that wrote the row. **It is never selected by a route projection** — §0.3 forbids a model name reaching the browser and `audit-secrets.ts` cannot see a serialised column. |

`intent` is null for `author = 'user'` and for a reader turn whose beat carried
none.

### 2.2 Additions to `chat_runs`

| column | type | required by | why |
|---|---|---|---|
| `material_key` | `text` null | **F5** | De-duplication of proactive runs, as a **partial unique index on `(user_id, material_key) where material_key is not null`** — a constraint, not a check-then-insert race. **Do not "fix" it to `nulls not distinct`**; that is V7's `share_links` trap pointing the other way, and it would collapse every non-proactive run into one. |
| `plan_source` | `text` not null default `'model'`, `CHECK ('model'\|'fallback')` | **F7** | The only way to see `validatePlan`'s refusal rate. F2's fallback is never zero-beat and is otherwise **indistinguishable from a real plan**, so without this the panel measuring the director measures nothing. |

### 2.3 Additions to `chat_threads`

| column | type | required by | why |
|---|---|---|---|
| `utc_offset_minutes` | `integer` null | **F5**, conditional on Q2 | Folded **now** even though Q2 is unruled. If Miftah rules for local quiet hours after `0014` lands, the alternative is spending the reserved `0015` on one integer. A null column nobody reads costs nothing; a migration in a later session costs a migration. |

### 2.4 Indexes roadmap §3 omitted

- `chat_runs (created_at desc)` — F7's fleet-wide panels.
- `chat_runs (user_id, created_at desc)` — F7's per-user drill-down and F5's
  eligibility read.

### 2.5 Two rules on `0014` that are not columns

**`[R7]` No `CHECK` may involve a column carrying `ON DELETE SET NULL`.** A1's
`23502` lesson generalised: the constraint detonates *during erasure*, when the FK
nulls a column a CHECK requires. The author/run pairing is enforced in
`insertMessage`, not in the schema. *(F1.)*

**`[R8]` `llm_calls.reading_id` MUST be `null` for `chat_plan` and `chat_turn`.**
This is not cosmetic and it fixes a live defect: `readingCostsFor` and
`callsForReading` in `src/lib/db/queries/admin/` fold **every** `reading_id`-bearing
ledger row into a reading's *Biaya generasi* with no `op` predicate — and a chat run
has two plausible reading pointers (`trigger_reading_id`, and an attachment's
`attached_reading_id`). Left alone, a chat run inflates the cost of the reading that
triggered it, silently. **F7 writes the negative control; F1 writes the rule at the
call site.** *(F7.)*

---

## 3. The four contracts, pinned

### `[R9]` The beat sheet — F1's shape, **plus F2's `angle`, minus `aside`**

Two plans designed this independently and reached different answers. Both arguments
are good; the ruling takes F1's structure and F2's field.

**`angle` IS ADMITTED.** F1 refused free text in a beat on the grounds that *"a
director-written summary sitting in the prompt is what a voice would read instead of
the transcript"*. That risk is real and F2's design already answers it: the angle
**names a subject, never a sentence**, is capped at `MAX_ANGLE_CHARS = 90`, is run
through `stripUntrusted()`, is nulled on a newline, and `null` is an ordinary
outcome the prompt explicitly licenses. **F1's concern is hereby the reason for
every one of those constraints**, and is recorded on the field rather than used to
delete it.

The deciding argument is the release's own: without an angle, three beats of intent
`answer` give three voices nothing to differ about, and a room where all three
answer the same thing in the same direction is the panel `C-N1c` forbids.

**`aside` IS DROPPED. Six intents:** `answer | ask | react | tease | agree |
push_back`. F2 proposed the fold against a shape with no `to` field; **F1's `to`
makes it stronger, not weaker** — an aside is `to` naming somebody with `replyTo:
null`, which is two fields already saying it.

```ts
export type BeatIntent =
  | 'answer' | 'ask' | 'react' | 'tease' | 'agree' | 'push_back';

export type Beat = {
  reader: ReaderId;
  to: 'user' | ReaderId;        // addressee — NOT the quote target
  replyTo: string | null;       // chat_messages.id — the quote stub
  intent: BeatIntent;
  angle: string | null;         // <= 90 chars, a SUBJECT, never a sentence
};

export type BeatSheet = { v: 1; beats: Beat[] };
```

- **`beats: []` is a valid sheet and the common good outcome** (`C-R6`).
- **`delayMs` is NOT a beat field** — it is a function of the *previous* bubble's
  length, which does not exist when the sheet is written. Seam S3, `[R11]`.
- **F1 owns the type and the file; F2 owns the members of `BeatIntent` and what goes
  in `angle`; F7 is a third consumer and reads `intent` by string key.** All three
  plans must quote this block verbatim.
- `chat.contract.test.ts` asserts the five field names and that no field of `Beat` is
  typed bare `string` **other than `replyTo` and `angle`**, with `angle` additionally
  asserted against `MAX_ANGLE_CHARS`.

### `[R10]` `AdvanceReply` — F1's union, and it already answers F4's D2

F4 raised the sharpest gap in the roadmap: `C-R2`'s sketch
`{state, message?, typingFor?, delayMs?, done}` **cannot express "shed, come back
later"**, which `C-D6` requires — the run stays `running` with beats left, it is not
an error and it is not done. `done:true` stops the client; `done:false` with no
message makes it hammer the soft ceiling; an HTTP error gets retried.

**F1 had already built it.** `AdvanceReply` is a seven-arm discriminated union
including `{ state: 'shed'; runId: string | null; done: false }`, and `[F1-6]`
states that F4 must not retry it. **This is convergence, not conflict**, and both
plans are correct as written. Recorded here only because F4's plan raises it as
blocking and must be edited to cite `[F1-6]` instead.

`GET /api/chat/messages` **must inline `replyTo: { id, author, snippet }`** (F4's
D3). A page is 40 rows and `C-D11`'s whole point is a beat quoting an hour-old
message that is usually off the page — without the inline stub the quote renders as
nothing and the release's most distinctive mechanic silently disappears. **F1 adds
it to the DTO.**

### `[R11]` `delayMs` — three files, one number, and it is not in the schema

F3 exports a pure `Pace` function; F1 calls it at execution time and returns the
number in `AdvanceReply.next`; F4 waits it out and owns `prefers-reduced-motion`
(under which the indicator does not animate **but the delay still applies**, because
the delay is conversational pacing and not decoration).

All three plans agree already. Pinned because it is the seam most likely to be
"simplified" into a constant, and `C-R4` says why a constant is a metronome.

### `[R12]` The fences: **two new alternatives, and F3 owns the edit**

Per `[R2]`, `<jawaban>` needs nothing. Two genuinely new purposes arrive:

- **`<obrolan>`** — the chat transcript handed to a voice. F3's.
- **`<lampiran>`** — the attachment block. F6's shape, rendered **inline inside
  `<obrolan>` at its own message**, never hoisted (hoisting makes a ten-message-old
  attachment read as the current subject).

**`src/lib/prompt/sanitize.ts` has no owner in roadmap §7 and three plans noticed.
F3 owns the edit** — it owns the chat prompt layer and is the workstream that would
see a fence fail. F2 and F6 supply their tag names and neither touches the file.

**The `DELIMITER` alternation, the header's count, and `sanitize.test.ts`'s fixpoint
assertions move in one commit.** That file's own header records that W5 *"added
`riwayat` as a fifth alternative and left this header saying four"*; do not repeat
it. Six becomes **eight**.

`<lampiran>` gets its own alternative even though it nests inside `<obrolan>`: the
fixpoint stripper works on the alternation, and a nested tag the stripper cannot
name is a hole in exactly the block that carries a querent's own text.

### `[R13]` The op set, and the two files that carry it

`chat_plan` and `chat_turn`, 11 → 13, per `C-D5`. **F1 owns `direct/plan.ts` and
`voices/turn.ts`** (the op, the tier, the model, the flag guard); **F2 and F3 own
`direct/prompt.ts` and `voices/prompt.ts`** and their validators. This boundary must
be ratified rather than assumed because **`callClass.test.ts` and
`flagCoverage.test.ts` name files by string** — the filenames above are now binding.

**`flagCoverage.test.ts` grows a third table, `GATES`**, for
`CHAT_PROACTIVE_ENABLED`: `C-D15` binds it into `DEFERRABLE_FLAGS`, but it gates a
*mint* rather than a *call*, and the existing two tables have no shape for that.
*(F1.)*

**F7's denominator finding inverts the roadmap's premise (S10).** A full sweep found
**zero** cost-per-reading arithmetic in the repo. What exists is the *rule*, stated
in prose four times — **three of which are already stale**: `OP_ORDER`'s header says
*"The ten"* over an eleven-member array, and `docs/analytics-queries.md:566` names
only `insight`. So S10 becomes one new `src/lib/admin/ops.ts` with a compile guard,
ten prose edits, and three `notes` additions in `panels.ts`. Split: **F1 takes the
two `src/lib/**` sentences** (it is editing both files anyway), **F7 takes
`panels.ts`, `ops.ts` and `docs/analytics-queries.md`**, and **`CLAUDE.md`'s
sentence is corrected when F1 lands, not before** — `## The markdown editor for
/admin/blog` currently says *"two ops now measure the dashboard and the CMS"*,
which is TRUE today and becomes false only when `chat_plan` and `chat_turn` exist.
Editing it now would put a claim in the file loaded every session that the code
does not yet support, which is the failure `bodyHash` and `dateModified` are the
standing examples of.

---

## 4. The nine files nobody owned

| File | Ruling |
|---|---|
| `src/lib/prompt/sanitize.ts` | **F3.** `[R12]` |
| `scripts/audit-secrets.ts` | **F1.** It derives its needles from `src/lib/prompt/**` and `src/lib/moderation/**` only, so **non-negotiable 2 is currently unenforced for every string F3 writes** and the script's own `derived ZERO needles` guard cannot fire. F3 supplies the paths; F1 edits the script. *(F3's finding — the most important of the unowned nine.)* |
| `src/lib/chatSurface.ts` | **F4.** A pure reducer for the advance loop, on `swipeDeck.ts`'s precedent. Without it `npm test` cannot reach a single decision on this surface. Roadmap §7's F4 glob is widened to include it. |
| `next.config.ts` (`/readers/*` header) | **F4**, which is also adding the matcher entry. **Not `/cards/*`'s year of `immutable`** — that mistake was already made once with `/wallpapers/`. |
| `src/components/LotusMark.tsx` | **F4**, extracted from `AccountButton.tsx`. This is the one edit to that file S9 permits, it is a pure extraction with no behaviour change, and the alternative — duplicating four `d` strings with a byte-identity test — is worse. |
| `npm run db:seed` (a seeded chat thread) | **F4.** Loop 4 has nothing to measure otherwise, and posting real messages would cost model calls per harness run. Seed the four hard cases: a 400-char bubble, a quote stub, a 24-char nickname, a midnight crossing. |
| `src/app/api/cron/sweep/route.ts` (one stale sentence) | **F1.** `[R3]` |
| `src/lib/llm/meter.ts` (`_ceilings()` gains a `chat` field) | **F1.** `adminCopy.test.ts` bans reading a ceiling from `process.env` in F7's tree, so F7 needs an accessor. |
| `src/lib/db/queries/admin/rollup.ts` (`peakWindow5h` gains an optional `ops`) | **F7**, listed rather than done silently. The alternative is a second copy of the rolling-window SQL. |

---

## 5. Events — 70 → 76, and what was folded

F1 owns the file (`C-D14`, S6). Twenty names were drafted across six plans; **six
land.** Two folds need recording because the workstream that lost a name asked for
something back:

- **`chat.attachment_added` folds into `chat.message_sent`** as `attached_from`.
  **F6's condition is accepted: `reading_id` survives the fold**, because the
  attachment rate's denominator is *readings finished*, not messages sent, and that
  join is impossible without it. A `reading_id` of the querent's own reading is
  already carried by `reading.completed`; this is not new exposure.
- **`chat.run_completed` and `chat.run_abandoned` fold into `chat.run_finished`**
  with a `status` prop. F1's argument stands: the abandoned-at-planning case fires
  zero turn events, so `C-R7`'s skip rate would have no denominator without a run
  event that always fires.
- **F2's `source` prop on `chat.plan_completed` is load-bearing and must not be
  narrowed away** in the fold — it is what separates `[R9]`'s `plan_source` at the
  event layer from the column, and F7 reads both.

**W7's three moderation events gain a `surface` prop** (`reading | chat`). Without
it a blocked chat message leaves no distinguishable trace anywhere, and W7's
`moderation_flags` has no `surface` column. The prop is the migration-free answer;
the column is the better one and is **Q-F1-3**, escalated in §7.

**The cap in `events.test.ts` moves 70 → 76 in the same commit.** `[R1]`.

---

## 6. Build order — roadmap §0.1 was wrong

**F3's context assembler imports F6's `attachmentBlock`.** F6 was placed last.

```
F1  →  F6 (tasks 1–5: the prompt block only)  →  F3  →  F2  →  F4  →  F6 (tasks 6–8: the UI)  →  F5  →  F7
```

F6 splits. Its plan must be edited to mark the split explicitly, because
`implement … f6` will otherwise be run once, in the wrong place, twice.

F2 moves after F3 because F2's prompt quotes F3's context profile (S2), and F3's
profile table is the contract. F5 moves after F4 because two of its three sources
need a client that warms a run (`[R14]`).

*Found by F6.*

---

## 7. Escalated to Miftah

Roadmap §12's six questions stand. **Two are now closed by measurement, one is
answered by a plan, and one entirely new question arrives that outranks the rest.**

### `[Q7 — NEW, and the most serious finding of the exercise]` The onboarding hints promise the opposite of `C-D8`

`C-D8` amends `A5` so the readers can see the six raw answers. The roadmap treats
`/privacy` as the document that has to change. **It is not the only one, and it is
not the one that matters.**

`src/lib/i18n/locales/id.ts:389`, shown **while the querent is typing the answer**:

> *"Jawaban ini disimpan terkunci, tidak pernah ditampilkan lagi, dan **tidak
> pernah dikutip di dalam bacaanmu**."*

and `:404`:

> *"**Namanya tidak akan pernah muncul di dalam bacaan.**"*

Both survive `C-D8` **on the letter** — a chat is not a *bacaan* — and the second
survives *in spirit* only because F3's `validateTurn` mechanically refuses a proper
name lifted from an answer. The first does not survive in spirit at all: the whole
point of the feature is Thessaly quoting it back at you.

**Nobody re-reads `/privacy`. Everybody reads the hint while typing.** So:

- **F1's `/privacy` amendment is necessary and not sufficient. The two onboarding
  hints are amended in the same release, and F1 owns them**, in both locales.
- F1 found **seven** `/privacy` touch points, **two of which are existing sentences
  that become false** — roadmap `C-D8` condition 4 says "the clause", singular, and
  is wrong.
- **`Q-F1-1` rides on this: does the amendment bump `TERMS_VERSION` and force
  re-acceptance?** `C-D8` calls it a material change and nobody has decided.

**And this is the argument for granting F3's `CHAT_ANSWERS_ENABLED`** — a switch
that drops the six raw answers from the chat context while leaving the room open.
**Granted.** It is deliberately *not* a `flags.ts` entry (it gates an *input* to a
call site, not the call), it lives in F1's chat config leaf, and it follows the
`'0'` rule. It is what makes Q1 reversible without redeploying the prompt layer,
and given the above, Q1 needs to be reversible.

### `[Q3 — answered by F1, still Miftah's to confirm]` The ceiling stays at 280

F1 re-derived it and concluded **no change**, with `LLM_WINDOW_CHAT_CEILING = 140`
peeked before the fleet ceiling and consumed after it. The argument is better than
the roadmap's: **a bigger number does not create quota.** z.ai meters prompts per
rolling five hours; raising 280 raises what this app is willing to spend, not what
the plan will serve, and `## The z.ai plan` says the failure mode on the other side
is `1113` rather than throttling. The sub-budget plus `deferred` shedding is the
instrument.

### `[Q2 — largely dissolved by F5]` Quiet hours

F5 recommends Option A: **do nothing special.** Sources 1 and 2 only fire when the
querent is demonstrably in the app, and source 3 is a UTC cron whose schedule *is*
the quiet-hours mechanism (`0 12 * * *` = 19:00 WIB). `utc_offset_minutes` is folded
into `0014` anyway (`§2.3`) so that ruling the other way later is a one-line change
rather than a migration.

### `[Q5 — closed]` `[R3]`. A second cron job is available.

### Still open, unchanged: `Q1`, `Q4`, `Q6`

- **Q1** — now inseparable from `Q7`. Ruling on one rules on both.
- **Q4** — `/admin/users/[id]` and chat bodies. F7 defaults to **counts and no
  text**, and adds an argument the roadmap did not have: `A-D16`'s audited
  one-key-per-request reveal *"was built for a thing you read one of"*, and a
  conversation would be 200 audit rows for one act of reading. F7 offers **Option
  B′ — one *run* per reveal** as the honest unit if Miftah wants text at all.
- **Q6** — unchanged.

### New, smaller, and worth a sentence each

- **F3:** may one beat ever produce **two bubbles**? F3 calls it the largest
  naturalness gain left. It is F1/F2 schema, not F3, so it cannot be added later
  cheaply.
- **F2:** may a reader tease **the querent**, not just each other?
- **F2:** `CHAT_MAX_BEATS` 4 or 3.
- **F3:** `gus` on the address denylist or not.

---

## 7b. Miftah's rulings, 2026-08-07, later the same day

> *"do whatever you need. change /privacy. anything. just do whatever means
> necessary so the chat group feels natural and proactive"*

**Every open question that was blocking a workstream is closed by that sentence.
The ones it closes are recorded here rather than in §7, so that a future session
can see what was asked, what was granted, and on what authority.**

### `[R14]` Q1 and Q7 — **GRANTED.** The readers see the six raw answers

`C-D8`'s amendment to `A5` stands, **with all five conditions intact.** The
conditions are not what was waived; the hesitation about consent was.

And Q7's consequence is granted with it:

- **`/privacy` is amended in both locales — all seven touch points, including the
  two existing sentences that become false.** F1.
- **BOTH ONBOARDING HINTS ARE AMENDED, IN BOTH LOCALES.** F1.
  `onboarding.q.worst_thing.hint` may no longer say *"tidak pernah dikutip di
  dalam bacaanmu"* and `most_loved.hint` may no longer say *"namanya tidak akan
  pernah muncul di dalam bacaan"*. **These are the load-bearing edit, not
  `/privacy`** — they are read by every new querent at the moment of typing, and
  `/privacy` is read by nobody.
- **`TERMS_VERSION` IS NOT BUMPED AND RE-ACCEPTANCE IS NOT FORCED** (`Q-F1-1`
  closed). No T&C clause changes; what changes is the description of how data is
  used. A forced re-accept is a modal people dismiss, which buys the appearance of
  consent and not the thing.
- **INSTEAD, THE ROOM SAYS SO ITSELF, ONCE, ON FIRST OPEN.** One line above the
  first bubble naming what the readers can see, with a link to `/privacy`,
  dismissed forever on any interaction. **Shown to the person, at the moment it
  becomes true, on the screen where it happens** — which is the only version of
  this that is worth anything. **F4 owns the surface; F1 owns the copy**, and it
  is `chat.first_open.notice` in both locales.
  *(This is the reconciliation's proposal, not Miftah's instruction. Strike it if
  it reads as furniture — but then Q7 has no user-visible answer at all.)*
- **`CHAT_ANSWERS_ENABLED` still ships**, as the reversal that does not need a
  prompt-layer redeploy.

### `[R15]` Q4 — **counts and no text** on `/admin/users/[id]`

F7's default is taken. Option B′ (one *run* per audited reveal) is recorded as the
honest unit if text is ever wanted, and is not built now.

### `[R16]` Q3 — confirmed. 280 stands, chat sub-budget 140

F1's re-derivation is accepted as written.

### `[R17]` Q2 — Option A. No local quiet hours

F5's recommendation. `utc_offset_minutes` still lands in `0014` (§2.3) so the
reversal is one line rather than a migration.

### `[R18]` Q6 — **deferred to the next release, deliberately**

Whether `glm-5.2` is still plan-served in February 2027 is not a v0.7.0 question
and answering it now would be a guess with a date on it. It stays in
`CLAUDE.md`'s `## The z.ai plan` where it belongs. **What v0.7.0 records is the
fact that makes it easier later: the chat is already on the supported side of that
line.**

### `[R19]` The four smaller questions, ruled on the stated priority

Miftah's sentence names one tie-breaker — *natural and proactive* — and these are
all ties.

| Asked by | Question | Ruling |
|---|---|---|
| **F3** | May one beat produce **two bubbles**? | **GRANTED, and it is the ruling most responsive to the instruction.** F3 calls it *"the largest naturalness gain left"*, and a person who has more to say sends a second message rather than a longer one. It is F1/F2 schema — `Beat` gains nothing, but `advance` may write two `chat_messages` rows for one beat and `beats_done` still advances by one. **F1 must build for it now**; it cannot be added cheaply later, which is exactly why it was asked. |
| **F2** | May a reader tease **the querent**, not only each other? | **GRANTED.** Three readers who are warm to the querent and sharp only with each other is a customer-service tone wearing a personality. Miftah's own worked example in the brief is Adrian being nosy *at the querent* — *"emang kenapa lo nanya makan siang? udah laper ya?"* — so the brief already assumed this. Bounded by `base.{id,en}`'s existing safety contract, which is unchanged. |
| **F2** | `CHAT_MAX_BEATS` 4 or 3? | **4.** More voices in a run is the naturalness bet, and `C-D6`'s sub-budget plus `deferred` shedding is what bounds the cost — not a cap on how many people may speak. |
| **F3** | `gus` on the address denylist? | **F3's judgement, and bias toward the denylist.** A missing address form costs nothing — the full nickname is always candidate zero — while a wrong one is the app calling somebody something they did not agree to. `[C-D10]`'s bias, applied to its own edge case. |

---

## 8. Edits each plan must make before it is built

| Plan | Edits |
|---|---|
| **F1** | Build §2's table list, not roadmap §3. Adopt `[R9]`'s `Beat` (add `angle`, drop `aside`). Add `replyTo` stub to the messages DTO (`[R10]`). Take ownership of `audit-secrets.ts`, `_ceilings()`, `sweep`'s stale sentence, the two `src/lib/**` op sentences, the two onboarding hints, and `CHAT_ANSWERS_ENABLED`. Move `events.test.ts`'s cap to 76. Strike its own note that §3.3 gives the beats shape to F2 — S1 is right and §3.3's sentence is struck by this file. |
| **F2** | Six intents, not seven. Quote `[R9]` verbatim. Drop the `<obrolan>` ownership proposal — `[R12]` gives it to F3. Its affinity lexicon is accepted as new data beside `readers.json`. |
| **F3** | Take `sanitize.ts` (`[R12]`) and supply `audit-secrets.ts`'s paths. Quote `[R9]`. Its `<jawaban>`-already-exists finding is upheld (`[R2]`); its `CHAT_SENTENCE_RATIO` 1.5 → 1.25 and `total_ms`-not-`latency_ms` corrections are accepted. Its three extra env vars go to F1 as prose (S7). |
| **F4** | Replace D2 with a citation of `[F1-6]` — F1 already built `state: 'shed'`. Take `chatSurface.ts`, `next.config.ts`'s `/readers/*` header, `LotusMark.tsx` and the seed thread (§4). 112px avatars accepted over `C-D16`'s "2×"; `C-D16`'s `assets/` source is struck, `public/dukuns/` is the source. Badge is `--gold-pale`, accepted. |
| **F5** | Adopt `[R6]` — the dot is a stored bubble. Its `supersedeReadingRun()` two-mechanism answer to S5 is **upheld and is the ruling**, including the draw-screen race F6 found. Its six materials (five plus `occasion: 'return'`) accepted. `[R3]`/`[R4]` fold into its cron section. |
| **F6** | Mark the task split (§6). Its `attachmentBlock` signature is the S4 contract and F3 quotes it. It keeps `reading_id` in the folded event (§5). Its `attachable()` predicate goes to F1 for the route guard. It does not touch `sanitize.ts`. |
| **F7** | Its S10 inversion is upheld (`[R13]`). `plan_source` is folded (§2.2). `[R8]`'s negative control is its task. Ask rate (`C-N1d`) is formally added to its scope — roadmap §6.1 assigned it and §7 omitted it. |

---

## 9. What this exercise proved about the roadmap

Recorded because the next release will be planned the same way.

**Seven plans written in parallel against one contract found six factual errors in
that contract, and every one of them was found by the workstream the error would
have hurt.** F1 found the event cap because F1 adds events; F5 found the cron limit
because F5 needed a job; F6 found the build-order inversion because F6's output is
F3's input.

**Two findings were made independently by two agents each** — the `sanitize.ts`
ownership hole (F2 and F6) and the `<jawaban>` miscount (F1 and F3). Independent
corroboration from agents that could not see each other is the strongest signal this
process produces, and both were correct.

**The one thing no agent could have found alone is `[Q7]`.** F3 found it because F3
reads the onboarding catalog to write in the querent's register — a workstream about
prose style found the release's biggest consent problem. That is an argument for
briefing each agent on the *product*, not only on its own files.

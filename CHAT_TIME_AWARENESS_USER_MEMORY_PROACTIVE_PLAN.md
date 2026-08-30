# Plan: Chat time-awareness, user profile memory, and proactive readers

**Slug:** `chat-time-awareness-user-memory-proactive`
**Date:** 2026-08-30
**Analysis:** `20260830-085616-B4K2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/tarot_app/chat-time-awareness-user-memory-proactive`
**Branch:** `feature/chat-time-awareness-user-memory-proactive` (base: `origin/main` @ `43d3c1e`)
**Phases:** 9
**Status:** planned  *(reconciled, rounds 1 and 2 — final)*

---

## Why

> 1. can you fetch my chat group history from prod (mahfuzh74@gmail.com) ?
> so in the chat, we were talking about how i think 5 am is a good time to start my morning run,
> and then, i do a yes/no reading asking whether my lunch would taste good later or not.
> when i asked about this reading in the chat group, thessaly said "makan tetap, mif. perut kosong jam 5 nanti malah kepala pusing, lari gimana mau jalan"
> this is a wrong answer because that moment is 8:39 am . she said "jam 5 nanti" but 5 am has passed 3 hours ago. i think we need to pass current datetime as additional context .
>
> 2. this one is a big big feature: i think we need to save/persist some kind of "profile memory" of a user that will keep being added/updated as long as he uses the group chat. the LLM need to determine ANYTHING that will help us build a better understanding of the user. anything . like his habits, his likes/dislikes, favourite food ,favourite activities, what happens in his life lately. this profile system will help us improve user experience for Chat Group.
>
> 3. this one depends on no 1 & 2. this is about the chat group being PROACTIVE. i want the readers to be much more PROACTIVE when interacting with user, they will ask "ice breaking" questions, like "kamu weekend ini kemana aja?" (if timestamp said this is sunday afternoon) , or "njir, udah senin aja. mager ga lu ngantor?" (if timestamp said this is monday morning to noon) . when we have a good user profile data, then reader can ask "gimana dinner lu tah? nasi padang lagi kan? wkwk" (here reader know user usually dinner with nasi padang). or, "gimana si bonjeng, marah2 lagi ga dia?" (readers know user has this "bonjeng" guy , an annoying bastard from his office management team). we already use GLM 5.3 , i really hope so much that these readers can act as real humans, speak like real friends. the main objective is to make users "hooked" and keep using our app for as long as possible, and keep coming back to the chat group as often as possible.
>
> > [!IMPORTANT]
> > i don't care about glm 5.3 token consumption. burn it all to hell. i just want to see our chat group pass the turing test. increase readers interaction (reader<->reader , reader<->user), reader making jokes, reader giving insights to user, reader being supportive to each other/ user. whatever means necessary for the best user experience for our chat group
>
> that's all. let's start cooking

**The cost ruling is a ruling and every phase may spend against it** — a bigger prompt, more model
calls per run, more runs per day. **It is not a licence to make a chat call outrank a reading:**
`C-D6` is about *who is shed first when the five-hour quota runs out*, and the answer stays "the
chat". `callClass: 'deferred'` survives unchanged in every phase.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| **R1** | The readers must know the current date and time; fix *"jam 5 nanti"* said at 08:39 | **1, 2** |
| **R2** | A persisted, continuously-updated model-written profile memory of the querent | **3, 4, 5, 6** |
| **R3** | Markedly more proactive and more human readers, using R1's clock and R2's profile | **7, 8, 9** |

**Final after reconciliation — no step moved between phases carrying an `R` with it, so no
`Satisfies` line changed.** Two things were assigned that no phase had claimed, and neither
widens a requirement: `waktu` in `sanitize.ts`'s `DELIMITER` went to phase 2 (R1, its own fence)
and `/admin/chat`'s beat histogram went to phase 9 (R3, the surface that measures its own change).
Phase 1's `ChatButton` local-date fix serves R1's transport and unblocks R3's daily cap; it stays
in phase 1 rather than being split out, and that is recorded rather than legalised by widening
phase 1's `Satisfies`.

## Scope

**In scope**
- A real UTC offset reported by the browser, persisted to the existing
  `chat_threads.utc_offset_minutes` column, and rendered into both chat prompts.
- A new per-user `user_memory` artifact written by a new 14th `LLMOp`, behind a new kill switch,
  read into the voice prompt as a new fenced block, erasable and disclosed.
- Two new proactive material kinds (time-anchored, profile-anchored), a looser proactive policy
  with **real** quiet hours, and a rewritten director/voice prompt set for naturalness.

**Out of scope**
- **Widening `CHAT_CONTEXT_MESSAGES` beyond 40.** `memory.ts`'s dilution argument: three weeks of
  chatter in front of the instruction makes the instruction weaker, not the reader smarter. R2 is
  the answer to the window, not a bigger window.
- **Streaming a chat turn.** `C-D3` is untouched; a bubble arrives whole.
- **An error bubble.** `C-R7` is untouched; a failure is still silence.
- **Translating a chat message or the memory prose.** `C-D9` is untouched.
- **A second `CHAT_PLANNER_MODEL`.** `CLAUDE.md` refuses it by name.
- **Changing `LLM_WINDOW_CALL_CEILING`'s denominator.** That is the February 2027 z.ai question.

## Invariants

Every phase must leave all of these true, and each is an existing rule this workstream sits on top of.

1. **The tree builds and `npm test` passes at the end of every phase.** `npm run build` too — the
   TypeScript trap means a green `typecheck` is not evidence.
2. **`buildChatPrompt` returns `{ system, user, maxTokens }` and nothing else** (`[F3-5]`). A new
   context field may not become a route response field.
3. **Material is fenced; the instruction is not.** Every new block is fenced and `stripUntrusted`ed
   by the builder that writes the fence. The only unfenced block stays `GILIRANMU:` / `YOUR TURN:`.
4. **A reader never says how they know** (`C-D8`), and **the proper-name ban binds `<jawaban>`
   ALONE.** *(Rewritten by the reconciler; the draft was wrong and phase 5 caught it.)*
   - **Both blocks:** no *"kamu pernah bilang"*, no *"di catatanku"*, no *"according to your
     profile"*, no quoting the querent's own sentence back. *"nasi padang lagi kan?"* is the
     target; *"you told me on the 9th"* is the failure. This half is unchanged and binds
     `<jawaban>` and `<ingatan>` identically.
   - **`<jawaban>` ONLY:** a reader must never write a person's NAME that appears inside the six
     onboarding answers; they name the relation instead. That rule rests on a **published
     promise** — `onboarding.q.most_loved.hint` tells the querent the name will not travel — and
     it is the promise, not the sensitivity, that makes it binding.
   - **`<ingatan>` CARRIES NO NAME BAN, DELIBERATELY.** Nothing promises anything about a name the
     querent said out loud in the group chat, and *"gimana si bonjeng, marah2 lagi ga dia?"* is
     **R3's own target sentence** — a ban over the memory would delete the feature. A reader who
     knows the name and pointedly says *"si bos lu itu"* instead is not being careful, it is
     being strange. The boundary is enforced where it actually lives: `answer_name_leak` still
     refuses a proper name that came out of a stored ANSWER and has not been said in the room,
     wherever in the bubble it appears. Phase 3's `USER_MEMORY_KINDS` carries `person` and phase
     7's `profile` material names the subject at kind level and carries no text at all.
5. **A skipped onboarding answer stays skipped** (`C-D8` condition 5). Nothing in R2 may
   reintroduce a fact the querent declined to give.
6. **No driver error is logged from any path that runs a chat or memory query** (`C-D20`), and
   `events.props` carries lengths and closed tokens, never prose.
7. **Every new model call site is `callClass: 'deferred'`** and reserves through
   `reserveChatCall()` if it is on the chat surface.
8. **Nothing under `src/lib/db/queries/**` imports `server-only`, `react` or `next/*`**, even
   transitively, and every exported function takes the handle first, named `db`.
9. **`local_date` values stay `'YYYY-MM-DD'` strings.** The new clock is a *separate* value; it
   does not turn `localDate` into a `Date`.
10. **Reader and card names stay English**; the Malay grep and the tic lists still apply to every
    new prompt string.
11. **Copy that reverses a documented ruling records the reversal** in `docs/workstream-notes.md`,
    and any rule added to `CLAUDE.md` compresses or moves one out in the same commit
    (net-neutral editing).

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | The browser reports a clock, the server stores it | R1 | `src/lib/analytics`, `src/lib/chat`, `src/app/api/chat`, `src/lib/db/queries` | 22 | — | NORMAL | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-1.md` | — | miftahulmahfuzh/JMTarot#14 |
| 2 | Both chat prompts state the time | R1 | `src/lib/chat/prompt`, `src/lib/chat/direct`, `src/lib/prompt` | 17 | 1 | HARD | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-2.md` | — | miftahulmahfuzh/JMTarot#15 |
| 3 | `user_memory`: table, migration `0017`, queries, erasure | R2 | `src/lib/db`, `src/lib/memory/profile`, `src/lib/account` | 13 | — | NORMAL | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-3.md` | — | miftahulmahfuzh/JMTarot#17 |
| 4 | The extractor: the 14th op, the flag, the generator, the trigger | R2 | `src/lib/memory/profile`, `src/lib/llm`, `src/lib/admin`, `src/lib/chat` | 21 | 1, 3 | HARD | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-4.md` | — | miftahulmahfuzh/JMTarot#18 |
| 5 | `<ingatan>`: the memory reaches the prompt | R2 | `src/lib/chat/context`, `src/lib/chat/prompt`, `src/lib/chat/validate` | 11 | 1, 2, 3, 4 | HARD | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-5.md` | — | miftahulmahfuzh/JMTarot#19 |
| 6 | The querent can read it and delete it | R2 | `src/app/account`, `src/app/api`, `src/app/privacy`, `src/lib/i18n` | 14 | 3, 4 | NORMAL | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-6.md` | — | miftahulmahfuzh/JMTarot#20 |
| 7 | Two new proactive material kinds | R3 | `src/lib/chat/proactive` | 10 | 1, 2, 3, 4 | HARD | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-7.md` | — | miftahulmahfuzh/JMTarot#22 |
| 8 | The proactive policy: real quiet hours, a louder cadence | R3 | `src/lib/chat/proactive`, `src/app/api/cron`, `vercel.json` | 10 | 1, 7 | NORMAL | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-8.md` | — | miftahulmahfuzh/JMTarot#23 |
| 9 | Naturalness: the prompt rewrite, its measurement and its scorecard | R3 | `src/lib/chat/{prompt,direct,voices}`, `src/lib/prompt`, `scripts`, `src/app/admin/chat` | 21 | 2, 5, 7 | HARD | `.workflows/plan/chat-time-awareness-user-memory-proactive/phase-9.md` | — | miftahulmahfuzh/JMTarot#24 |

**Land them in numeric order.** Every dependency points backward. **Round 2 corrected one column:
phase 4 depends on phase 1 as well as phase 3** — round 1 had already written *"land phase 1
first"* into phase 4's body for `run.ts`, and its own edit to `validateExtraction` added a
required `localDate` that only phase 1's clock can supply honestly (phase 3's `lastSeen` is *the
querent's* calendar day, `local_date`'s rule). So the R2 cluster is `{1,3} → 4 → {5,6}` and the
two clusters still overlap: 1 and 3 have no dependency on anything and can start together.
Phases 5, 7 and 9 each land into a file an earlier phase already edited and each of their plans
now quotes those files as they will look **after** the earlier phase — see the Reconciliation Log.

### Phase 1 — The browser reports a clock, the server stores it
**Satisfies:** R1
**Owns:** The querent's UTC offset end to end — a new client header (`x-jm-utc-offset`), its
validation leaf `src/lib/analytics/utcoffset.ts`, its persistence into the **already-existing**
`chat_threads.utc_offset_minutes` column, `threadOffsetMinutes` to read it back, and
**`src/lib/chat/clock.ts` — THE ONE CLOCK MODULE FOR THE RELEASE** (`resolveChatClock`,
`WEEKDAYS`, `DAY_PARTS`, `dayPartOf`, `weekdayOf`, `localDayDelta`), plus `ChatClock`,
`KnownChatClock`, `Weekday` and `DayPart` on `chat/types.ts`. Threads the resolved clock into
`AssembleArgs`, `ChatContext`, `DirectorInput` and `VoiceInput`, and deletes the two fabricated
`new Date().toISOString().slice(0, 10)` calls. **Also fixes the `ChatButton` defect**: the badge
poller sent no local date, so every proactive tick from `/`, `/[reader]`, `/account` and
`/history` ran on the UTC day — the wrong calendar day for ~7 hours a night in Jakarta, on the
exact key the daily proactive cap and the occasion detectors use.
**Does not touch:** any prompt string, `ageLabel`, `ageBucket`, `inQuietHours`, or anything under
`src/lib/chat/proactive/**`. **No migration** — the column exists (`[R17]`). **Does not narrow
`getThread`'s `.select()`**, which phases 7 and 8 read `utcOffsetMinutes` off.
**Exit criteria:** the offset round-trips browser → header → route → `chat_threads` →
`threadOffsetMinutes` → `resolveChatClock` → the three input types; a unit test pins the header
parser's refusals and the **sign** (`getTimezoneOffset()` is negated exactly once); an integration
test proves the column round-trips and that zero survives as zero; `resolveChatClock` and
`weekdayOf` agree on the same day; **no prompt string, no prompt output and no
`chatPromptVersion` value changes.**

### Phase 2 — Both chat prompts state the time
**Satisfies:** R1
**Owns:** The reversal of the no-clock ruling, in writing. A fenced `<waktu>` block first in the
voice's user turn and a `SEKARANG:` / `NOW:` line first in the director's header, both rendered by
one producer (`renderNow` + `CHAT_TIME_VOCAB`, appended to phase 1's `clock.ts` — **the release's
only weekday and day-part vocabulary**, which phase 7 imports); the `WAKTU:` / `TIME:` section in
both base contracts; director rule **12**; the calendar-anchored `ageBucket` vocabulary
(`pagi tadi`, `semalam`) that `[F2-16]` refused for want of an offset; `waktu` in
`sanitize.ts`'s `DELIMITER`; the `chatPromptVersion` hash gaining the vocabulary table. **Records
both reversals** — `build.ts`'s `ageLabel` header and `[F2-16]` reason 3 — in
`docs/workstream-notes.md` with the old argument quoted, not deleted.
**Does not touch:** the clock's transport or storage (phase 1), `ChatContext.clock` (phase 1
declares it — **Step 8's fallback is dead**), quiet hours (phase 8), `<ingatan>` (phase 5), or
director rules 1 and 11 (phase 9). Writes no `CLAUDE.md` line — phase 9 owns the release's one.
**Exit criteria:** `npm run smoke -- --chat` shows a reader treating five in the morning as past
at 14:05 and answering about the lunch rather than the run — **the reported bug, not reproduced**;
`prompt.test.ts` pins `<waktu>`'s shape, its fencing, its position first and its **absence** on a
`known: false` clock; `window.test.ts` still asserts **no age bucket contains a digit**, now on
the clocked path too; `git grep kelmarin src/lib/chat` is empty; the blind read still identifies
three of three readers.

### Phase 3 — `user_memory`: table, migration `0017`, queries, erasure
**Satisfies:** R2
**Owns:** **THE PAYLOAD SHAPE FOR THE WHOLE RELEASE** — `src/lib/memory/profile/types.ts` (a
zero-import leaf: `USER_MEMORY_KINDS`, `UserMemoryItem` = `{ id, kind, text, lastSeen }`,
`isUserMemoryItem`, `USER_MEMORY_SOURCE_VERSION`, the caps and `USER_MEMORY_ITEM_ID_RE`), the
`user_memory` table with **two** jsonb columns (`items` and the `dismissed_ids` tombstone list),
migration `0017` (**the only claimant**), `src/lib/db/queries/memory.ts` (`getUserMemory`,
`upsertUserMemory`, `touchUserMemory`, `dismissUserMemoryItems`, `redactUserMemory`), and **the
erasure duty landing before anything can write a row**. The item `id` is
**content-derived and stable** — three later phases rest on that.
**Does not touch:** any model call, flag, `LLMOp` or prompt. Its `CLAUDE.md` edit is a COUNT
CORRECTION (twenty-two tables → twenty-three) and owes no compensating cut.
**Exit criteria:** `npm run db:migrate` applies cleanly and idempotently; the integration suite
proves `updated_at` is maintained by hand inside `onConflictDoUpdate`, that `upsertUserMemory`
**cannot** touch `dismissed_ids`, that a soft delete redacts in the same transaction that sets
`deleted_at` **and blanks `input_hash`**, and that a hard delete cascades;
`queries/contract.test.ts` and the leaf's `types.contract.test.ts` stay green.

### Phase 4 — The extractor: the 14th op, the flag, the generator, the trigger
**Satisfies:** R2
**Depends on:** **1** and 3. *(Round 2: phase 1 was implied by round 1 and is now declared — see
the note under the phase table and Reconciliation Log round 2, item 4.)*
**Owns:** The 14th `LLMOp` (`profile_memory`) with all four interlocking compile guards satisfied
in one commit (`OP_ORDER`, `admin/ops.ts`, `callClass.test.ts`, `flagCoverage.test.ts`); the
`PROFILE_MEMORY_ENABLED` kill switch and its `.env.example` / `DEPLOY-VERCEL.md` §2d rows;
`prompt.ts` (the hash, `normaliseFact`, **`userMemoryItemId` implementing phase 3's formula**,
four-arm staleness, the contract, the validator); the `server-only` generator and the deferred
trigger after a completed run; `ingatan` in `sanitize.ts`'s `DELIMITER`; the
`@/lib/memory/profile/**` client fence and its `audit-secrets.ts` entry.
**Decision A stands (the hash MOVES and the flag WRITES NOTHING — a third shape, recorded in
`flags.ts`'s header, not tidied). Decision B stands (a querent's deletion is NOT a staleness
trigger)**, now enforced by phase 3's `dismissed_ids` column rather than a payload field.
**Does not touch:** `types.ts` or the schema (phase 3), the chat prompt (phase 5), `/account` or
`/privacy` (phase 6), the proactive path (7–8).
**Exit criteria:** both `AssertNever` guards satisfied and all four guard tables green; the
generator writes a row from a fixture transcript and returns `unchanged` on a second call; an item
whose `id` is in `dismissed_ids` is mechanically dropped even when the model returns it; the flag
off writes nothing and self-heals on the next moved hash; `events.test.ts`'s ceiling moves 77 → 78
**once, and this is the phase that spends it.**

### Phase 5 — `<ingatan>`: the memory reaches the prompt
**Satisfies:** R2
**Owns:** The seventh assembler read (voice-only, swallowed), `ChatContext.memory: string[]`, the
fenced `<ingatan>` block **at index 3** of the final six, the base contract's rules for it in both
locales, and the mechanical `memory_verbatim_ngram` refusal in `validate.ts`. **It writes the FINAL
form** of the two fence enumerations in `base.{id,en}.ts` (six blocks, `keenam`), of `build.ts`'s
block-order header paragraph, and of `prompt.test.ts`'s fence whitelist and *"builds from nothing
at all"* — each quoted with phase 2's `<waktu>` already in place.
**Two decisions, both written and both accepted:** the **director profile does not get the block**,
and **there is no proper-name ban over `<ingatan>`** — which is what corrected invariant 4 above.
**Does not touch:** the extractor (4), the clock block (2), the material kinds (7),
`sanitize.ts` (2 and 4 own it), or `validate.ts`'s existing thresholds (9).
**Exit criteria:** `prompt.test.ts` pins the block's fencing, its position and its absence from
the system prompt, **and that no `YYYY-MM-DD` and no `kind` token appears inside `<ingatan>`**;
the `no_context` refusal path still refuses; `npm run smoke -- --chat` shows a reader using a
remembered fact **without attribution**.

### Phase 6 — The querent can read it and delete it
**Satisfies:** R2
**Owns:** `/account` visibility of what the room believes about them, per-item and whole-list
deletion, the `private, no-store` routes, both locale catalogs, and the `/privacy` amendment
(SubClause `2-8` in both locales plus four list edits) and the `chat.first_open.notice` amendment.
**`/privacy` and the account control are the load-bearing half** — V8's finding was that nobody
re-reads `/privacy` and everybody reads the control they are looking at.
**Step 0's ruling stands: no edit control ships, correction is deletion.** *Forget one* and
*forget everything* are both `dismissUserMemoryItems` (which tombstones); `redactUserMemory`
belongs to the erasure path alone. The copy must not promise permanence — a reworded or refiled
fact can return.
**Does not touch:** the generator, the prompt, the proactive path, or `events.ts` (**zero event
names**).
**Exit criteria:** the querent can see every stored line and delete any or all of them; a deletion
is absent from the next prompt **and from the next extraction**; `legal.test.ts`'s anchor-set
equality holds across both locales; `clientBoundary.test.ts` keeps `memoryView` earned.

### Phase 7 — Two new proactive material kinds
**Satisfies:** R3
**Owns:** `MaterialKind` six → eight: `time_of_day` (the Sunday-afternoon / Monday-morning
ice-breaker, key `tod:<YYYY-MM-DD>:<part>`, **last in `MATERIAL_ORDER` and capped at one run per
querent per local day**) and `profile` (the *nasi padang* / *bonjeng* opener, key
`profile:<itemId>:<YYYY-MM>`, at index 3), with their detectors, their `brief.ts` rehydration arms
and their notes in both locales. **`ProfileMaterial` HAS NO TEXT FIELD** — the seam that keeps a
model's sentence about a person out of the director's unfenced header; the fact reaches the voice
only, through phase 5's `<ingatan>`.
**Does not touch:** eligibility, the cap, quiet hours or the cron (8); the director's rule prose
(9). Declares no calendar helper and no word table — it imports `clock.ts` and `CHAT_TIME_VOCAB`.
**Exit criteria:** each kind detects, mints, survives `chat_runs_user_material_uq`, rehydrates
from `material_key` alone at plan time, and renders a `BAHAN:` line of closed tokens and scalars
**and never free text** — `material.test.ts` asserts `ProfileMaterial`'s key set exactly, so a
future `text:` is a red test; `tod:` self-expires like `occasion:return:<day>`; **a second `tod:`
on the same local day is refused**; a null offset yields no time material and never an error.

### Phase 8 — The proactive policy: real quiet hours, a louder cadence
**Satisfies:** R3
**Owns:** Wiring `inQuietHours` — written, exported, tested and **shipped dead** since `[R17]` —
into `mint.ts` against phase 1's offset, with `CHAT_QUIET_FROM_HOUR` / `CHAT_QUIET_TO_HOUR` and
their fallbacks; the retune under Miftah's ruling (`MIN_GAP` 3h → 1h, `MAX_PER_DAY` 2 → 5,
`RUN_TTL` 48h → 24h, `NUDGE_MAX_USERS` 8 → 20) and a second cron slot at `0 1 * * *` (08:00 WIB)
so a dormant querent can be greeted in the morning. **`[R17]`'s Option A is reversed and
recorded**: source 3's quiet hours were *its schedule*, and a schedule stops being the mechanism
the moment sources 1 and 2 can fire at 3 a.m.
**The volume argument is repaired, not waived:** the defended bound is **~20 unprompted bubbles a
day**, and it holds only because a proactive run is **two to four beats** (phase 9's rule 11, not
the eight-beat cap) **and** because `time_of_day` is capped at one run per local day (phase 7).
Both are recorded in `maxPerDay`'s own doc comment as the things to check before this number moves
again.
**Does not touch:** the material kinds (7), any prompt, `events.ts`'s declarations (one doc
comment only), or `CLAUDE.md`.
**Exit criteria:** `eligibility.test.ts` covers the live gate in both directions, the `reading`
exemption, and **a null offset meaning *not quiet* rather than *blocked***; `REFUSAL_ORDER` still
puts `no_material` last so `mint.ts`'s probe-then-detect ordering survives; the daily cap is still
enforced by the `bumpProactiveCount` UPSERT and not by the predicate; `quiet_hours` stays in
`ALWAYS_RECORDED` **because it can now fire and is the window's only instrument**.

### Phase 9 — Naturalness: the prompt rewrite, its measurement and its scorecard
**Satisfies:** R3
**Owns:** The prose that decides whether the release works — director rule 1, **rule 11 (which
today caps a proactive run at *"satu beat, kadang dua"*, directly contradicting R3, and lands at
two to four)**, four worked examples where there were three, a reader-to-reader exchange in each of
the six reader blocks, the base contract's licence to joke and to back another reader up; the caps
that make it possible (`CHAT_MAX_BEATS` 6 → 8, `PLAN_MAX_TOKENS` 400 → 900, `MAX_MEMO` 16 → 32,
`CHAT_DIRECTOR_WINDOW` and `WINDOW_BODY_CHARS`); `REPAIR_WORDS`; the smoke script's floors and two
new blind-read questions. **Plus, assigned by the reconciler: `/admin/chat`'s beat histogram**,
blind past four since 2026-08-28 and blinder at eight — the release's own scorecard must not
under-report the thing the release changed. **And the release's ONE net-neutral `CLAUDE.md` line**,
with its compensating cut in the same commit.
**Does not touch:** any schema, route, material detection, or `events.ts`. **Renumbers no director
rule — phase 2's rule 12 (the clock) must survive.** **Keeps phase 2's clock probe and phase 5's
memory fixture** when it rewrites `CHAT_SCRIPT` / `CHAT_SHEETS`.
**Exit criteria:** **the blind read is the gate** — `npm run smoke -- --chat` and
`--chat --proactive`, names covered; if you cannot tell who is who, it is not done. The three voice
proxies still pass; the *"a silence rate of zero is not good news"* property survives; **rule 12 is
present and unmodified and `system.test.ts` still walks `[1 … 12]`**; **rule 11's proactive range
stays bounded at two to four beats**, because phase 8's daily cap is defended against it;
`wc -c CLAUDE.md` does not rise across the release.

## Reconciliation Log

**Round 1. 31 conflicts found, 31 resolved, 0 deferred** — the table below is numbered 1–31 and
this header read *"24"* until round 2 counted it. Every resolution is written into the phase files
themselves, in a `## Reconciliation (round 1 — BINDING)` block at the top of each and in the
affected code blocks. `contract_changed` was **true** — creations and deletions moved between
phases — which is what warranted the second round.

**Round 2. 11 residues found, 11 resolved, 0 deferred.** Verification of the moved contracts, not
a fresh sweep. See the round-2 section after the tables. `contract_changed` is **false**: nothing
in round 2 moved a creation, a deletion or a rename between phases — the edits made the phase
bodies say what their own round-1 tables already said, plus one dependency that round 1 had
stated in prose and never written into a `Depends on` line. **There is no round 3 and none is
needed.**

### A. Duplicate designs for one fact

| # | Class | Conflict | Resolution |
|---|---|---|---|
| 1 | Duplicate work | **Two clocks, both REQUIRED.** P1: `ChatClock` + `src/lib/chat/clock.ts` + `ChatContext.clock`. P2: `WallClock` + `src/lib/chat/wallclock.ts` + `ChatContext.utcOffsetMinutes`. Both could not land. | **P1's design wins and `clock.ts` becomes THE ONE CLOCK MODULE.** `wallclock.ts` cancelled; P2 appends `renderNow` and `CHAT_TIME_VOCAB` to `clock.ts`. Full substitution table in P2's reconciliation block. Every consumer re-checked: P2's `<waktu>` + director header ✓, P2's `AgeSpan` ✓ (via `KnownChatClock`), P7's `weekdayOf`/`partOf`/`localStampFor` ✓, P8's `quietHoursFor` ✓ (it takes the raw offset, unchanged). |
| 2 | Duplicate work | **Three vocabulary tables.** P2's `WALLCLOCK_VOCAB`, P7's `WEEKDAY_WORDS_{ID,EN}` and `DAY_PART_WORDS_{ID,EN}`. P7 asked in writing that they be shared, *"or one prompt says 'Monday morning' on one line and 'siang' on another"*. | **ONE table, `CHAT_TIME_VOCAB` in `clock.ts`**, written by P2, imported by P7. P7's two tables cancelled. |
| 3 | Contract drift | **Two `DayPart` sets.** P2: `small_hours/morning/midday/afternoon/night` (<4, <11, <15, <19, else). P7: `morning/midday/afternoon/evening/late` (5–11, 11–15, 15–18, 18–22, else). | **P7's tokens and boundaries win**, three reasons: they are persisted inside a `tod:` `material_key` and cannot be renamed later; `late` starting at 22 makes P8's default quiet window agree by construction; P2's set had no name for 22:00–04:00 that its own `EARLIER_TODAY` could use. **P2's WORDS survive**, re-keyed onto the five, and its `EARLIER_TODAY` / `YESTERDAY` tables are re-keyed with no member left `null`. |
| 4 | Contract drift | **`Weekday` as `0\|1\|…\|6` (P1) vs `'sun'\|…\|'sat'` (P7).** | **The string union**, because P7 puts a weekday in a `material_key` and in `describeMaterial`'s facts — persisted surfaces where an integer is a magic number. `clock.ts`'s `WEEKDAYS[getUTCDay()]` is the one place the two meet. |
| 5 | Duplicate work | **`localStampFor` / `LocalStamp` / `civilFromDays` (P7) duplicate `resolveChatClock` (P1)**, both deriving a local `'YYYY-MM-DD'` + hour from an epoch and an offset. | **P7's are cancelled**; it calls `resolveChatClock` and reads `localDate` + `part`. P7's *argument* for re-deriving the day (the cron has no client) is accepted verbatim and preserved in the file. Its `clientBoundary` `new Date(` sentinel still holds — it greps `material.ts`'s own source. |
| 6 | Verification | **Sign convention across P1/P2/P7/P8.** | **Checked: all four agree** — minutes EAST of / to ADD to UTC, Jakarta `+420`, `getTimezoneOffset()` negated exactly once, in P1's `localUtcOffsetMinutes()`. `inQuietHours`'s `now + offset*60_000` is the arithmetic the others matched. No edit; recorded in P2's and P8's contracts so it cannot drift silently. |

### B. The `user_memory` payload — four phases, four shapes

| # | Class | Conflict | Resolution |
|---|---|---|---|
| 7 | Duplicate work | **`src/lib/memory/profile/types.ts` created by BOTH P3 and P4**, with different kind vocabularies, different item types and a different item id. | **P3 owns it; P4 imports.** Full name-mapping table in P4's reconciliation block. |
| 8 | Contract drift | **P4's item `id` is documented *"NOT stable across regenerations"*; P3's, P6's and P7's mechanisms all require that it IS.** | **P3's contract binds:** `id = sha256(kind + '\u001f' + normalise(text))`, 12 hex, content-derived and stable. P4 implements it in `prompt.ts` (a leaf may not hold `node:crypto`). A non-stable id is not an alternative design — it is the tombstone, the `material_key` and `chat_runs_user_material_uq` all silently not working. |
| 9 | Duplicate work | **Two suppression mechanisms.** P3: a `dismissed_ids` COLUMN + the item id. P4: `ProfileMemory.suppressed` inside one `memory` jsonb + a separate 16-hex `suppressionKey()` over the text alone. | **P3's column and P3's id.** P4's single-writer rule is then enforced by SQL — `upsertUserMemory`'s `set` list cannot name `dismissed_ids` — rather than by discipline. **Cost recorded, not hidden:** the merged id also misses a fact refiled under a different `kind`, so the extractor is told to prefer an existing item's wording *and* kind. |
| 10 | Unmet assumption | **P5 reads `row.notes[].text`; there is no `notes` column.** | `row.items[].text`, each item first narrowed by `isUserMemoryItem`. P5 renders `text` and nothing else — no `id`, `kind` or `lastSeen` — which is invariant 4 in code, with a `prompt.test.ts` assertion. |
| 11 | Unmet assumption | **P6 calls `forgetUserMemoryItem` and `clearUserMemory`; neither exists.** | Both are `dismissUserMemoryItems`. **_Forget everything_ passes every current item id and is NOT `redactUserMemory`** — the erasure function deliberately does not tombstone (a restored account is meant to rebuild), so using it for the querent's button would be a button that lies until the next extraction. Two verbs, one mechanism, no new query. |
| 12 | Duplicate work | **P6's blob-vs-items hedge** (`WHOLE_MEMORY_ID`, a `{ body?: unknown }` arm). | **Blob arm cancelled** — P3 chose the list, and a dead branch in an adapter is a branch somebody later restores. The *structural* read survives, and is now load-bearing rather than defensive: `$type<>` is an assertion the driver need not honour and these rows are model output. |
| 13 | Contract drift | **Two closed vocabularies for one item.** P3's `UserMemoryKind` (7) vs P7's `PROFILE_TOPICS` (7), on an item that has no `topic` field. | **`UserMemoryKind` is the closed token** on a `profile:` material; `ProfileTopic`/`profileTopicOf` cancelled, `profileKindOf` maps the unknown to `'other'`. `PROFILE_SUBJECT_{ID,EN}` re-keyed. **No `topic` field is added** — two sets on one item is two sets that drift. Loss recorded: `work` has no home and files under `situation`. |

### C. Volume — the interaction nobody priced

| # | Class | Conflict | Resolution |
|---|---|---|---|
| 14 | Contract drift | **P8's cap of 5 is defended by MATERIAL SCARCITY (*"the cap is almost never the binding gate — `no_material` is"*), which P7's `time_of_day` falsifies** — by P7's own words it has *unlimited key supply*, fresh in every part of every day. | **The scarcity premise is RESTORED where the supply is:** `detectTimeOfDay` refuses a second `tod:` on the same local day (`usedTimeOfDayToday`, the probe `usedProfileKeys` already performs). `MATERIAL_ORDER`'s last place protects *ranking*; this protects *volume*. At most one of five runs is ever the calendar. **Both plans carry the coupling in both directions.** |
| 15 | Contract drift | **P8 computed a worst case of ~20 bubbles/day against a 4-bubble run; P9 raises `CHAT_MAX_BEATS` 6 → 8, making it ~40** — a notification machine by P8's own stated standard, and the user ruled on TOKENS, not on how many messages a person receives. | **The defended bound stays ~20, and what holds it is P9's rule 11**, which lands a proactive run at **two to four beats** (the eight-beat cap is for a querent-triggered run). **`maxPerDay`'s doc arithmetic is rewritten** to say so, and rule 11's range becomes **load-bearing for volume, not only for tone** — an exit criterion on phase 9 and a named check before either number moves again. **No number was changed; the argument was made true.** |

### D. Shared files — one owner or an explicit sequence

| # | File | Writers, in order | Resolution |
|---|---|---|---|
| 16 | `src/lib/chat/prompt/build.ts` | 2 → 5 → 9 | **Final block order: `<waktu>`, `<penanya>`, `<jawaban>`, `<ingatan>`, `<riwayat>`, `<obrolan>`, instruction.** P2 writes five, **P5 inserts at index 3 and owns the final header paragraph** (its rewrite deleted P2's `<waktu>` entry — fixed). P9 appends to `chatPromptVersion`'s hash array after P2's entry and touches nothing else. |
| 17 | `base.{id,en}.ts` fence enumerations | 2 → 5 (→ 9, which touches neither) | P2 writes five blocks / `kelima`; **P5 writes the final six / `keenam` and its four quoted lines now name `<waktu>`.** |
| 18 | `src/lib/prompt/sanitize.ts` `DELIMITER` | 2, 4 | **GAP FOUND: nobody claimed `waktu`.** Assigned to P2 — the builder that writes a fence strips its material, and without it a querent typing `</waktu>` forges the frame. P4 keeps `ingatan`; P5 adds neither. |
| 19 | `src/lib/chat/run.ts` | 1 → 4 | Compose cleanly: P1's clock read and `doPlan`/`doBeat` params end up inside P4's extracted `advanceOnce()`; `advance()`'s exported signature is untouched by both. |
| 20 | `src/lib/db/queries/chat.ts` | 1, 4 | No shared lines (insert after `getThread`; append at EOF). **P1 must NOT narrow `getThread`'s `.select()`** — P7 and P8 both read `utcOffsetMinutes` off it and both claim they compile on `main` because of it. Recorded as a constraint in P1. |
| 21 | `src/lib/chat/proactive/mint.ts` | 7 → 8 | **One `const utcOffsetMinutes`**, added by P7 (plus a `clock` derived from it); P8 reuses it for `quietHoursFor` and does not re-read the thread. |
| 22 | `prompt.test.ts` | 2 → 5 → 9 | **P5 writes the final form** of the fence-whitelist alternation (`waktu\|…\|ingatan\|…`), of `names all N fenced blocks as MATERIAL` (six), and of *"builds from nothing at all"* (an unknown `clock` **and** `memory: []`). |
| 23 | `direct/system.{id,en}.ts` + `system.test.ts` | 2 → 9 | P2 appends **rule 12** and corrects the stale *"all ten numbered rules"* to a walked list `[1 … 12]`; P9 rewrites rules 1 and 11 and the examples and **renumbers nothing**. Rule 12 surviving is a P9 exit criterion — it is R1's only enforcement on the director. |
| 24 | `scripts/smoke-llm.ts` | 1 → 2 → 5 → 9 | P1 adds the one fixture clock `CHAT_CLOCK` (P2's `CHAT_UTC_OFFSET_MINUTES` cancelled — two fixture clocks is how the director and the voice describe different afternoons in one printed run); P2 adds the clock probe; P5 adds `CHAT_MEMORY_FIXTURE`; **P9 rewrites the script and must keep both.** |
| — | `src/lib/chat/validate.ts` | 5 → 9 | Compose as designed: P5 adds exactly one `TurnRejectReason` member, which is a **compile error** in P9's `Record<Locale, Record<TurnRejectReason, string>>` until it is given words. **Intended coupling; the closed set is stated once, in `validate.ts`.** |
| — | `src/lib/clientBoundary.test.ts` | 4 → 6 → 7 | Three separate `it()`s, no shared lines. |
| — | `docs/workstream-notes.md` | 2, 3, 4, 5, 7, 8, 9 | Order by phase number. P8 inserts inside its own F5 section; the rest append. No content conflict. |
| — | `CLAUDE.md` | 3, 9 | **P9 owns the release's ONE net-neutral prose edit** (P2 drafted the line and handed it over; the compensating cut is named in the commit message). P3's table count and P9's two numeric phrases are CORRECTIONS and owe nothing. |

### E. Gaps and other findings

| # | Class | Finding | Resolution |
|---|---|---|---|
| 25 | Gap | **`/admin/chat`'s beat histogram buckets at 4 and `beatFold`'s mean treats the top bucket as exactly 4** — blind since 2026-08-28, blinder at 8. P9 identified it and handed it **to nobody**. | **Assigned to P9 as Step 18** and its package widened. No other phase owns `src/app/admin/chat/**` or `queries/admin/chat.ts`; P9 is what makes the instrument materially wrong; and `CLAUDE.md` calls that panel *the release's own scorecard*. `beatFold`'s mean stays flagged as a lower bound. |
| 26 | Gap | `waktu` missing from `sanitize.ts`'s `DELIMITER`. | See #18. |
| 27 | Unowned requirement | — | **None.** Every `R` in the Requirements table is served, and no step moved between phases carrying an `R` with it, so no `Satisfies` line changed. |
| 28 | Requirement creep | Checked all nine. | **None found.** P2's smoke-script clock probe is R1's instrument (not R3 measurement); P1's `ChatButton` local-date fix is on R3's critical path but is one line in P1's own component and stays there — splitting one component's header block across two phases would cost more than the tidiness is worth. Recorded rather than moved. |
| 29 | Verification | `0017` claimed by more than one phase? | **No.** P3 alone; P1 explicitly claims none and its `schema.ts` touch is comment-only. |
| 30 | Verification | Events taxonomy headroom. | **P4 alone spends it (77 → 78, `memory.profile_written`).** P1 adds a PROP to an existing declaration (no name, ceiling unmoved); P8 edits one doc comment; P5, P6, P7, P9 declare nothing. **No headroom after P4** — recorded in P4. |
| 31 | Ordering violation | P7 claimed *"it compiles and passes on main today"*. | **False after reconciliation** — it now imports `clock.ts` (P1) and `CHAT_TIME_VOCAB` (P2). **P7's `Depends on` gains phase 2**, in its header and in the phase table. The half that mattered survives: no query change is needed, and a null offset is a correct silent outcome. |

### Round 2 — verifying the contracts round 1 moved

**Round 1 returned `contract_changed: true` because creations and deletions moved between phases.
Round 2 walked every moved contract end to end, in the code blocks and not only in the
substitution tables, and found ELEVEN residues. All eleven are resolved in the phase files; none
required a new decision, and no phase was restructured.**

**The generalisation, because it is the useful part:** round 1 resolved every conflict by writing
a *substitution table* at the top of each phase and marking it BINDING. That is the right record,
and it is not the fix — **five of these eleven are places where the table was correct and the code
block three hundred lines below it still said the old thing.** A plan whose header contradicts its
own `ts` block is a plan an implementer follows by reading the block. Round 1's rule 4 said so
(*"fix the code blocks, don't just add a caveat"*); this is the audit of it.

| # | Class | Where | Finding | Resolution |
|---|---|---|---|---|
| 32 | Broken-build phase | **P1**, `clock.test.ts` | `expect(dayPartOf(-1)).toBe('evening')` **would have failed.** `-1` wraps to `23` and `evening` ends at 21, so 23 is `late` — which is what `dayPartOf`'s own docblock and P8's quiet-window agreement both say. A red test in the first phase of the set. | Expectation corrected to `'late'`, with the reason inline. The case is kept: the **wrap** is the property worth pinning; only the expected token was wrong. |
| 33 | Broken-build phase | **P2**, the append to P1's `clock.ts` | The moved code uses `DayPart` (in `CHAT_TIME_VOCAB`) and `KnownChatClock` (in `clockTime` / `renderNow`); P1's `clock.ts` opens `import type { ChatClock, Weekday } from './types'`. **The substitution table did not name the import.** | P2's block now says to WIDEN P1's existing type import to `{ ChatClock, DayPart, KnownChatClock, Weekday }`, not to add a second one. |
| 34 | Contract drift | **P4**, six sites | Round 1's edit spelled the function **`userUserMemoryItemId`** in six places while eight others (and this index's phase-4 *Owns* line) spelled it `userMemoryItemId`. A doubled prefix compiles nowhere. | One name everywhere: **`userMemoryItemId`**. The substitution-table row is rewritten so it reads as *the name survives, the formula does not* (12 hex over the formula in conflict #8, phase 3's) rather than as cancelling the function P4 implements. |
| 35 | Ordering violation | **P4** header, and the phase table | Round 1 wrote *"land phase 1 first"* into P4's body for `run.ts`, and separately gave `validateExtraction` a required `localDate`. **Neither reached P4's `Depends on` line or this index's `Depends on` column.** | **P4 depends on 1 and 3.** Declared in P4's header, in a round-2 note in its reconciliation block, and in the phase table. Nothing about P1 moves for it. |
| 36 | Unmet assumption | **P4**, `generate.ts` | Round 1 added `localDate` to `validateExtraction`'s opts — to stamp phase 3's `lastSeen` — and **left no caller supplying one.** Phase 3's docblock says `lastSeen` is *the querent's* calendar day, `local_date`'s rule, so the server's UTC date is a day out for a Jakarta querent between midnight and 07:00. | `ExtractionMaterial` gains a **required** `localDate`, supplied at both construction sites by `resolveChatClock({ offsetMinutes: await threadOffsetMinutes(...) })` — **phase 1's mechanism, unchanged and unextended**, the same one `advance()` uses, so the browser path, the cron and a backfill all answer it identically and an unknown offset degrades to `known: false` rather than to an error. This is what makes #35 real. |
| 37 | Deleted-then-used | **P4**, `generate.ts` × 2, `prompt.test.ts` × 2 | `memoryFrom()` is **cancelled inline at its definition** (round 1 commented the body out) and was still **imported twice and called twice**. | All four removed. The write is now `upsertUserMemory(db, { items: verdict.items, … })` — `items` is its own column — with the note that this function **never names `dismissedIds`**, which is conflict #9's single-writer rule enforced by SQL. |
| 38 | Contract drift | **P4**, `generate.ts` + 12 test fixtures | The cancelled wrapper's field name `suppressed` survived at `input.existing.suppressed`, in `validateExtraction`'s call, in every `prompt.test.ts` opts literal, and in two prose lines — against the declared `existing: { items, dismissed }`. Two fixtures also referenced an undeclared `key` where `id` was in scope. | All renamed to `dismissed`; every `validateExtraction` opts literal now carries `localDate: TODAY`, declared once beside the `describe`; `[key]` → `[id]`. Remaining hits on the word are cancellation notes and one test title. |
| 39 | Contract drift | **P4**, `upsertUserMemory` call | It passed `memory: memory as unknown as Record<string, unknown>`; phase 3's `NewUserMemory` has **`items`**, no `memory`. | `items: verdict.items as …[]`, and the outcome's `items` count reads `verdict.items.length`. |
| 40 | Contract drift | **P5**, `base.test.ts` step 7a | The block still asserted ***five*** fenced blocks and its tag array **omitted `<waktu>`** — contradicting P5's own reconciliation ruling 2, its four quoted contract lines, and conflict #22, all of which say P5 writes the FINAL SIX. | Rewritten to six, `<waktu>` first. P5's Files row also corrected from *"fifth fenced block"* to sixth. |
| 41 | Deleted-then-used | **P9**, `chatPromptVersion` | P9's quoted hash array **omits `CHAT_TIME_VOCAB[locale]`**, which P2 appends — so landing P9's block as written would silently delete P2's entry. **The failure is invisible:** the function still compiles and still returns a plausible `chat-v1.xxxxxxxx`; it just stops moving when a weekday word changes, which is the one thing P2 added it for. | P9's block is re-quoted as the file looks **after** P2, with `REPAIR_WORDS` appended **last**, plus the note that the array's ORDER is part of the digest so reordering it reprices every `group by prompt_version` across the deploy. |
| 42 | Contract drift | **P7**, three places | The reconciliation block cancelled `PROFILE_TOPICS` / `localStampFor` and corrected the *"compiles on `main` today"* claim; the body's **Requires** and **Handoffs** sections still asserted all three, including the seven cancelled topic tokens and *"filed under `life`"*. P7's Requires also promised the item id is narrowed by `USER_MEMORY_ITEM_ID_RE` while `detectProfile` narrows **structurally** (non-empty, no `:`) — which is what lets P7's own fixtures use `i-food`. | The false claim is struck in place with the surviving half named (*no QUERY change is needed*); the topic prose is replaced by `USER_MEMORY_KINDS` + `profileKindOf` → `'other'`; the id wording now matches the code, with phase 3's RE recorded as the reason the `:` check can only ever fire on a hand-written row. The `new Date(` sentinel's comment now says it greps `material.ts`'s **own source**, so importing `resolveChatClock` is not a breach — or the first reader deletes the fence. |

**Checked and found already correct** (no edit): `wallclock.ts` / `WallClock` / `wallClockAt` /
`WALLCLOCK_VOCAB` appear only inside cancellation tables; the five `DayPart` tokens and their
boundaries agree in P1, P2, P7 and P8, and `late` starting at 22 does make P8's default quiet
window agree by construction; both fixture instants are the weekday their prose claims (2026-08-07
is a Friday at 14:05 WIB → `midday`; 2026-08-30 is a Sunday at 08:39 WIB → `morning`); the sign
convention; the six-block order and the `kelima` → `keenam` handover; `waktu` (P2) and `ingatan`
(P4) each have exactly one claimant in `DELIMITER` and P5 adds neither; **`0017` has one claimant
(P3)**; **the events ceiling moves 77 → 78 exactly once (P4)**; **the one net-neutral `CLAUDE.md`
edit has one owner (P9), P3's table count being a correction**; `/admin/chat`'s beat histogram is
owned (P9, Step 18); rule 12 survives P9 and `system.test.ts` still walks `[1 … 12]`; P9 keeps
P1's `CHAT_CLOCK`, P2's clock probe and P5's `CHAT_MEMORY_FIXTURE`; and the Files counts in the
phase table match the plans' own Files tables exactly (22, 17, 13, 21, 11, 14, 10, 10, 21).

**Volume (R3), re-checked line by line as instructed:** P9's rule 11 says **two to four beats** for
a proactive run in six places; P8's rewritten `maxPerDay` doc says the same and derives ~20 from
5 × 4; P7's `usedTimeOfDayToday` caps `time_of_day` at one run per querent per local day. The
three quote the same numbers. **One stale sentence was found and repaired rather than left:** P8's
retune table still defended the cap with the bare *"the cap is almost never the binding gate"* —
the premise conflict #14 falsified — with no mention of the brake that restores it. The cell now
names `usedTimeOfDayToday` and points at `maxPerDay`'s doc comment.

## Open Questions

**Empty is the good outcome, and this is close to it. Round 2 added none — every residue it found
had an answer inside the plans and none needed a guess. One item stands, and it is a measurement
rather than a decision:**

1. **Whether ~20 unprompted bubbles a day is the right number for a real person — nobody has
   measured it, and the plans cannot.** Conflict #15 restored the *argument* to the bound v0.7.0
   defended (a proactive run is two to four beats, at most five runs, at most one of them the
   calendar), so the release ships no volume nobody signed off. But **v0.7.0's own twenty was
   itself a judgement, not a measurement**, and Miftah's ruling covers tokens rather than message
   count. The one instrument is `/admin/chat`'s proactive reply rate over **weeks** — whose
   denominator is runs whose 24-hour window has CLOSED — plus `chat.proactive_skipped`'s
   `quiet_hours` rate, which says whether the window is too wide. **If the room reads as a
   notification machine after this release, `CHAT_PROACTIVE_MAX_PER_DAY` and
   `CHAT_PROACTIVE_MIN_GAP_SECONDS` are both environment variables and need no deploy.** Raised
   here rather than resolved because the honest answer needs production data.

2. **`lastSeen`'s accuracy when a querent has never had an offset reported** — a *consequence*
   of round 2's #36, stated so nobody reads it later as an oversight. `ExtractionMaterial.localDate`
   comes from `resolveChatClock`, whose `known: false` arm answers the SERVER's UTC day. For a
   Jakarta querent on an old bundle that is a day out between midnight and 07:00 local. **This is
   accepted, not open for debate, and the reason is that `lastSeen` is FOR CODE ONLY** (phase 3's
   docblock): it orders eviction at `USER_MEMORY_MAX_ITEMS` and it never reaches a prompt, a
   querent or a `material_key`. A worse eviction order is not a wrong bubble, and it heals the
   moment any browser reports. **It is named here because the same value in a `local_date` column
   would be a real bug, and the next person to touch this needs to know which of the two they are
   looking at.**

**Two things deliberately NOT raised as open questions, recorded so they are not re-opened:**

- **The `<jawaban>` name ban not extending to `<ingatan>`** is settled — phase 5 argued it, the
  plan index's invariant 4 was wrong and has been rewritten, and R3's own target sentence
  (*"gimana si bonjeng…"*) is the evidence. It is a ruling, not an omission.
- **The tombstone's known gap** — a fact reworded past `normalise` or refiled under a different
  `kind` can return — is a property of hashing text, is stated on the surface the querent reads
  (phase 6's copy must not promise permanence), and is mitigated in the extraction prompt. It is
  not a schema question.

## Rollback

**Per phase.** Phases 2, 5, 7, 8 and 9 are prompt-and-policy only: revert the commit. Phase 4's
flag (`off`) stops all extraction without a deploy; phase 8's `CHAT_PROACTIVE_ENABLED=0` stops
proactivity; phase 2 has no flag by design (a clock is not a feature to switch off) and rolls back
by revert. Phase 3's migration is additive — a revert of the code leaves an unused table, which
costs nothing and is the safe direction.

**As a whole.** `git revert` the merge; the only forward-only artifact is migration `0017`, and an
unread table is inert.

## Next

    /implement -f CHAT_TIME_AWARENESS_USER_MEMORY_PROACTIVE_PLAN.md

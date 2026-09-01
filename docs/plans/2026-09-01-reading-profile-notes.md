# Feeding the chat-distilled profile into every reading (card #34)

**Date** 2026-09-01 · **Card** [#34](https://github.com/miftahulmahfuzh/JMTarot/issues/34)
· **Branch** `task/34-feed-the-chat-distilled-user-profile` · **Round** 1

> make every card reading read the user profile that we distilled from the chat group…
> if the card reading can be tailored to each user's character and daily activities, we
> will increase the card reading quality. change user privacy policy if necessary. **this
> requirement takes precedence above everything else.**

---

## 1. What is being fed, exactly

R2's `user_memory.items` — short third-person sentences a model writes from what the querent
types in the group chat. Not the persona (V8), not the Lotus (W3); those two already reach a
reading and this one does not.

Established by reading the code rather than assumed:

- `items` is `UserMemoryItem[]` = `{ id, kind, text, lastSeen }`, `text` ≤ 140 chars, ≤ 32 items.
- **`text` is the only field that may reach a model.** `types.ts` says so in those words: a
  `lastSeen` in the block is the material that turns *"nasi padang lagi kan?"* into *"you told
  me on the 9th"*.
- **A deleted note is physically removed from `items`**, not merely tombstoned —
  `dismissUserMemoryItems` filters `items` *and* appends to `dismissed_ids` in one statement.
  So reading `items` honours the delete button, and `/privacy` 2.8's promise transfers to this
  path for free. This was checked, not assumed; it is the single fact the privacy amendment
  rests on.
- `<ingatan>` is **already** in `sanitize.ts`'s delimiter set (tag 10 of 10), so the fence is
  already stripped from user text. Nothing to add there.

## 2. Approaches considered

| | Convention | Scope | Verifiability | Reversibility |
|---|---|---|---|---|
| **A** fold the notes into the existing `<penanya>` block | high | smallest | **poor** | one commit |
| **B** new `<ingatan>` block + dynamic system instruction (W5's `memoryInstruction` shape) | high | medium | good | one commit |
| **C** *(chosen)* new `<ingatan>` block + one bullet in the **static** SAFETY section | high | medium | good | env var, no redeploy |

**A lost on two counts.** `renderLotusBlock` caps the whole block at `LOTUS_MAX_CHARS = 600`
with the rule *"the summary is what gets cut, never the nickname"* — so notes appended there
would silently truncate the Lotus summary. And it merges two provenances with opposite privacy
stories: `/privacy` 2.2 says *"In a reading, only an abstract summary ever reaches the language
model"* about the onboarding answers, and near-verbatim chat notes inside the same fence make
that sentence impossible to amend honestly. Separate fence = separate switch = separate
analytics = separate privacy sentence.

**B lost on where the rule lives.** W5 appends `memoryInstruction` dynamically and it is
deliberately *not* hashed into `prompt_version`, so two readings with different system prompts
share a version. W5 accepted that for `<riwayat>`, whose rule is editorial (*"refer back only if
there is a real thread"*). The `<ingatan>` rule is not editorial, it is a **surveillance** rule
— don't say how you know, don't make it the subject — and `base.id.ts`'s own header gives the
argument for the other side: the `<penanya>` rule *"is stated unconditionally, even for a
reading with no Lotus block, because this is the STATIC layer… a contract that changed depending
on whether a user had been distilled yet would give two readings the same version with different
rules."* A safety rule present only when its material is present is one refactor away from being
absent when it matters.

**C is `<penanya>`'s precedent applied verbatim**, which is the closest analogue: both are
background *about the person*, both carry the flattening risk (roadmap §10 — three readers all
writing about the querent instead of the cards) and the surveillance risk.

## 3. The narrow reading of "every card reading" (ambiguity call)

**Built:** the three reading services, i.e. everything that goes through `buildPrompt` —
`daily`, `spread3`, `yesno`.

**Not built, and why:** the *side* prompts (day summary, frequency verdict, gist) and the
persona. The frequency verdict is explicitly not in a reader's voice and renders before a reader
is chosen; the gist is a 15-word internal label nobody reads; the day summary summarises readings
rather than being one. The persona is the sharpest exclusion — `personaInputHash` would have to
change, which regenerates every stored `personas` row, and A5 makes that prompt structurally
incapable of receiving raw text by construction. If Miftah wanted the wider reading it is one
comment and a round 2.

## 4. Selection policy

**Amended after the first smoke run: 6 for `spread3`, 2 for `daily`, 1 for `yesno`**
(`PROFILE_NOTES_BY_SERVICE`). Six for everything produced recitation in `daily` — two notes per
reading, one restated nearly verbatim — and the fix is less material rather than a sterner rule,
because `daily` has half `spread3`'s paragraphs. The workstream notes carry the three runs.

Originally at most **6 notes**, total block ≤ **480 chars** (deliberately under `<penanya>`'s 600 — the
Lotus stays the larger of the two background blocks).

Ordering is a **stable partition, not a score**: `trait` and `habit` first, then everything else
in stored order. Those two kinds are literally the card's words — *"character and daily
activities"* — and `types.ts` sanctions kind-based selection by a consumer (*"Phase 7 decides
which kinds make a good opener"*). What is **not** done is ranking: `chat/context.ts` refuses to
sort because *"ranking twelve model-written sentences by a heuristic written here would give this
release its own second opinion about what matters, competing with the one the extractor already
formed."* A partition by declared kind is not that. Nothing is dropped, only ordered.

Every item goes through `isUserMemoryItem` first — `$type<>` is an assertion the driver is not
obliged to honour, and this column is written from model output.

## 5. Files

| File | Change |
|---|---|
| `src/lib/prompt/profile.ts` | **new.** `selectProfileNotes`, `renderProfileBlock`, the two caps |
| `src/lib/prompt/profile.read.ts` | **new.** `readingProfileEnabled()`, `getProfileNotes()` — swallows DB errors |
| `src/lib/prompt/build.ts` | third `PromptContext` field; render after `<penanya>`, before the cards |
| `src/lib/prompt/base.{id,en}.ts` | one bullet each in `KEAMANAN` / `SAFETY` |
| `src/app/api/reading/route.ts` | one read, one field, two props |
| `src/lib/analytics/events.ts` | two props folded onto `reading.requested` — no new name |
| `src/app/privacy/privacy.{id,en}.tsx` | four amendments (§7) |
| `src/lib/i18n/locales/{id,en}.ts` | `account.memory.hint` |
| `scripts/smoke-llm.ts` | `--profile` fixture, so the quality gate can be run |

## 6. The switch

`READING_PROFILE_ENABLED`, `!== '0'`, read in `profile.read.ts`.

**It does not go in `src/lib/llm/flags.ts` and that is not an oversight.** That file gates
*model calls*, `flagCoverage.test.ts` asserts its set is exactly its two tables, and the reading
has no flag by rule — the backbone gets a maintenance page, not an env var. This gates whether a
*block of material* is assembled, which is `CHAT_ANSWERS_ENABLED`'s shape exactly (in
`chat/model.ts`, not in `flags.ts`, for the same reason). Consulted before the database read, so
off costs zero queries.

## 7. Privacy (the half the card said takes precedence)

Both documents, same anchor set or `legal.test.ts` goes red. Four statements this falsifies:

1. **4.1's callout** — *"we send your question, the cards you drew, and the abstract summary of
   your opening answers"*. Amended by the C-D8 move: leave the callout exact and add a paragraph,
   rather than softening it into something true of neither surface.
2. **2.2's list item** — *"In a reading, only an abstract summary ever reaches the language
   model"*. Still true of the onboarding answers, now misleading about the reading as a whole.
   The load-bearing one.
3. **2.8** — *"not read by the readers in the next conversation"* → readings too. True because of
   §1's finding about `items`.
4. **Clause 3's purpose list** — a new purpose has to be named.

**`legal.test.ts` forbids the phrase this amendment most wants to reach for.** There is a test
named *"never says the notes personalise anything"* banning `menyesuaikan pengalaman` /
`personalise your experience` in either document, with the comment *"the sentence this project
exists not to write"*. So the amendment says what actually happens — the readers read the notes
when they write a reading — and never that we personalise an experience.

Plus `account.memory.hint` in both locales, on C-D8's finding that **nobody re-reads `/privacy`
and everybody reads the hint in front of them.** Its header lists three claims it must keep
stating (a model wrote it, it came from the group, it can be wrong); this adds a fourth without
dropping any, and must not soften into the banned phrase.

**Byte budget:** `prose.test.ts`'s `MAX_BYTES` moved 23,000 → 25,000 earlier today (card #33's
own commit), so `id` sits at ~23,036 with ~1,960 free. Measured before and after; the rule
*"shorten the copy, never raise the ceiling"* is not touched.

## 8. Verification

- `npm test`, `npm run typecheck`, `npm run build` (the TypeScript trap — a green typecheck is
  not a green build).
- New `profile.test.ts`: selection, the caps, the `isUserMemoryItem` filter, no `lastSeen` and no
  `kind` token inside the fence, a delimiter in a note cannot close the block early.
- `build.test.ts`: the block renders, is absent when null, sits between `<penanya>` and the cards,
  and `prompt_version` **moves once** with the contract bullet and is then stable regardless of
  whether a querent has notes.
- `legal.test.ts`: the four amendments, both locales.
- **The gate for quality is `npm run smoke -- --all --profile` diffed against `--all --fixed`,
  and the blind read.** The question is whether the tailored reading is *better*, not whether it
  is different. The failure to watch for is recitation — a paragraph spent listing habits is
  worse than the untailored reading, and if it appears the fix is the contract bullet, not the
  code.

## 9. Known limits, written down rather than solved

- **`/s/<slug>` publishes prose informed by these notes, and there is no gate.** This is an
  *increment* on an accepted risk, not a new class: `<penanya>` already puts the Lotus summary
  into readings that can be shared. Gating on shareability is not available — every reading is
  shareable, so the gate would mean never using the block. The mitigation is the contract bullet
  (at most one oblique use, never named, never the subject) and saying so in `/privacy`.
- **The 6/480 caps are a first guess**, chosen against `<penanya>`'s 600. Nothing has measured
  what the model does with six notes versus twelve.
- The reading model sees notes in whatever language the chat happened in. Covered by I23's
  existing rule (*"write in Indonesian even if the text you are reading is in another
  language"*) in both contracts — cited, not re-solved.

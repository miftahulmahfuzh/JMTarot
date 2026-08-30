# Phase 7: Two new proactive material kinds

**Plan set:** `CHAT_TIME_AWARENESS_USER_MEMORY_PROACTIVE_PLAN.md`
**Analysis:** `20260830-085616-B4K2_code_analyzer.md`
**Satisfies:** R3 — *"they will ask ice breaking questions… kamu weekend ini kemana aja? … gimana dinner lu tah? nasi padang lagi kan?"*
**Depends on:** Phase 1 (`clock.ts` and the offset), **Phase 2 (`CHAT_TIME_VOCAB`)**, Phase 3 (`user_memory` + `queries/memory.ts`), Phase 4 (the extractor fills it)
**Difficulty:** HARD
**Package:** `src/lib/chat/proactive`

---

## Reconciliation (round 1 — BINDING, overrides the body where they disagree)

**This phase asked for one clock vocabulary and got it — but it is phase 1's and phase 2's module,
not this one's.** Six rulings:

1. **`weekdayOf`, `Weekday`, `WEEKDAYS`, `DayPart`, `DAY_PARTS` and `partOf` MOVE TO
   `src/lib/chat/clock.ts` / `@/lib/chat/types` AND ARE IMPORTED HERE.** Phase 1 lands them.
   `partOf` is renamed `dayPartOf`; **its five tokens and its boundaries are this phase's and are
   unchanged** (`morning` 05–10, `midday` 11–14, `afternoon` 15–17, `evening` 18–21, `late`
   22–04) — they won over the competing set because they are the ones persisted inside a
   `material_key` and because `late` starting at 22 makes phase 8's default quiet window agree by
   construction. `weekdayOf`'s Sakamoto implementation moves verbatim, string-in, no `Date`.
2. **`localStampFor()`, `LocalStamp`, `civilFromDays` and `pad` ARE CANCELLED.**
   `resolveChatClock({ offsetMinutes, now })` already answers `localDate` (a STRING) and `part`,
   in the module where a `Date` is allowed. `material.ts` constructs no `Date` of its own, so
   Step 10's `clientBoundary.test.ts` sentinel extension still holds and still means what it says
   — the sentinel greps this file's source, and importing a module that uses `Date` is not what
   it forbids. Note that in the sentinel's comment so nobody reads the import as a violation.
3. **`WEEKDAY_WORDS_{ID,EN}` AND `DAY_PART_WORDS_{ID,EN}` ARE CANCELLED. Import
   `CHAT_TIME_VOCAB` from `@/lib/chat/clock`** (phase 2 writes the words there). This is exactly
   what this phase's own handoff to phase 2 asked for: *"a second table makes one prompt say
   'Monday morning' on one line and 'siang' on another."* `PROFILE_SUBJECT_{ID,EN}` stays here.
4. **`PROFILE_TOPICS`, `ProfileTopic` and `profileTopicOf` ARE CANCELLED. The closed token is
   `UserMemoryKind`** from `@/lib/memory/profile/types` — phase 3's zero-import leaf, so
   `material.ts` stays pure — and its seven members are `habit | taste | person | situation |
   place | trait | other`. `ProfileMaterial.topic: ProfileTopic` becomes
   `ProfileMaterial.kind: UserMemoryKind`, read through a local `profileKindOf(raw)` that maps
   anything unrecognised to `'other'` (which is what `'other'` is in that set for). **A
   `UserMemoryItem` carries no `topic` field and none is added** — two closed sets on one item is
   two sets that drift. Everything else about the seam is untouched: the material still carries
   **no text**, `material.test.ts` still asserts the key set exactly, and the fact still reaches
   the voice only, through phase 5's fenced `<ingatan>`. `PROFILE_SUBJECT_{ID,EN}` is re-keyed to
   the seven kinds; `taste` is the arm the *nasi padang* example lands in.
5. **THE `time_of_day` SUPPLY IS BOUNDED AT ONE RUN PER QUERENT PER LOCAL DAY.** This phase
   correctly identified that `tod:` is *"the only material in the set with unlimited supply"* and
   placed it last so it cannot starve the ladder. **`MATERIAL_ORDER` protects RANKING; it does
   not bound VOLUME** — and phase 8 raises the daily cap 2 → 5 on an argument that *"the cap is
   almost never the binding gate — `no_material` is"*, which unlimited supply falsifies. So
   `detectTimeOfDay` refuses when a `tod:` key has already been used for this querent on
   `clock.localDate` — the same probe `usedProfileKeys` already performs for `profile:`, applied
   to a prefix instead of an id. **This is the brake that keeps phase 8's number honest**, and it
   is recorded in both plans and in the index's Reconciliation Log.
6. **`DetectArgs` gains `clock: ChatClock` (required), NOT `utcOffsetMinutes`, and
   `DetectArgs.localDate` STAYS a `'YYYY-MM-DD'` STRING and stays the client's.** The birthday and
   anniversary detectors keep comparing `MM-DD` slices off `args.localDate`, deliberately and
   unchanged. **`detectTimeOfDay` alone uses `clock.localDate`**, for the reason this phase
   already wrote: the cron has no client, and for a Jakarta querent at 23:30 UTC the client-shaped
   string is *yesterday* while the offset says it is the following morning. Two day values in one
   args object is unusual and the comment on `localDate` must say why it is deliberate here.

**Shared-file sequencing:** this phase adds **one** local to `mint.ts` —
`const utcOffsetMinutes = thread?.utcOffsetMinutes ?? null;` — plus `const clock =
resolveChatClock({ offsetMinutes: utcOffsetMinutes, now });`, and threads `clock` into
`detectArgs`. **Phase 8 lands after and reuses `utcOffsetMinutes` for `quietHoursFor()`**; it does
not re-read the thread. `clientBoundary.test.ts` is written by phases 4, 6 and 7 in that order.

**One claim is now false and is corrected:** this phase said *"it compiles and passes today; it is
only useful once phase 1 ships the writer."* Under the reconciliation it imports `clock.ts` and
`CHAT_TIME_VOCAB`, so **phases 1 and 2 are hard build dependencies.** What remains true is the
half that mattered: `getThread`'s `.select()` already returns `utcOffsetMinutes` and phase 1 does
not narrow it, so no query change is needed here, and **a NULL offset stays a correct, silent
outcome — no `time_of_day` material, never an error.**

---

## Goal

`MaterialKind` goes from six to eight. A proactive run can now be **about the querent's own
wall clock** (`time_of_day` — Sunday afternoon, Monday morning) and **about something the room
already knows about them** (`profile` — their dinner, the annoying colleague). Both mint,
survive `chat_runs_user_material_uq`, rehydrate from `material_key` alone at plan time, and
render a `BAHAN:` line made of closed tokens and scalars. **No memory prose reaches the
director's prompt through any code path** — that is enforced by the shape of `ProfileMaterial`,
not by discipline.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**
- `MaterialKind` members `'profile'` and `'time_of_day'` (`proactive/material.ts:45`)
- `proactive/material.ts`: `DayShape`, `DAY_SHAPES`, `ProfileMaterial`, `TimeOfDayMaterial`,
  `shapeOf()`, `timeOfDayMaterial()`, `profileKindOf()`.
  **`Weekday`, `WEEKDAYS`, `DayPart`, `DAY_PARTS`, `weekdayOf` and `dayPartOf` are IMPORTED from
  `@/lib/chat/clock` / `@/lib/chat/types` (phase 1); `ProfileTopic` / `PROFILE_TOPICS` /
  `profileTopicOf` and `LocalStamp` / `localStampFor` are CANCELLED** — see the reconciliation.
- `proactive/notes.id.ts`: `PROFILE_SUBJECT_ID` (keyed by `UserMemoryKind`)
- `proactive/notes.en.ts`: `PROFILE_SUBJECT_EN` (keyed by `UserMemoryKind`).
  **The weekday and day-part WORDS come from `CHAT_TIME_VOCAB` in `@/lib/chat/clock`** (phase 2);
  `WEEKDAY_WORDS_*` / `DAY_PART_WORDS_*` are cancelled.
- `proactive/detect.ts`: `detectProfile`, `detectTimeOfDay` (module-private), `usedProfileKeys`
  and `usedTimeOfDayToday` (module-private)
- material key prefixes **`profile:`** and **`tod:`**

**Signature changes:**
- `DetectArgs` (`proactive/detect.ts:98`) gains a **required** `clock: ChatClock`.
  Every construction site must pass it. Today there are two: `mint.ts:194` and
  `detect.integration.test.ts:53`'s `args()` helper. Both are edited in this phase.
  **`DetectArgs.localDate` is unchanged and stays the client's `'YYYY-MM-DD'` string** — the
  birthday and anniversary detectors compare `MM-DD` slices off it deliberately.
- `MATERIAL_ORDER` becomes eight long, and the two new kinds are placed at index 3 (`profile`)
  and index 7, last (`time_of_day`).

**Deletes:** nothing.
**Renames:** nothing.

**Requires (from earlier phases):**
- **Phase 1** — `chat_threads.utc_offset_minutes` is actually **written** by the message /
  advance / state routes. The *read* needs nothing from phase 1: `getThread` already does
  `select()` over every column and its `ChatThread` return type already carries
  `utcOffsetMinutes: number | null` (`queries/chat.ts:147`, `schema.ts:1695`), and
  `ThreadTouch` already accepts the field (`queries/chat.ts:171`). **RECONCILED (round 2):
  the sentence that stood here — *"this phase compiles and passes today"* — is FALSE and is
  struck.** Under the reconciliation this phase imports `clock.ts` (phase 1) and
  `CHAT_TIME_VOCAB` (phase 2), so both are hard build dependencies; see the reconciliation
  block and the header's `Depends on`. **The half that was true survives: no QUERY change is
  needed here**, because `getThread` already projects `utcOffsetMinutes` and phase 1 is
  constrained not to narrow it. A NULL offset is a correct, silent outcome: no `time_of_day`
  material, never an error.
- **Phase 3** — `src/lib/db/queries/memory.ts` exports
  `getUserMemory(db: DbOrTx, userId: string)` resolving to `null` or to a row whose `items` is
  `UserMemoryItem[]`. This phase narrows each item structurally and imports **only the type**
  `UserMemoryKind` from `@/lib/memory/profile/types`, a zero-import leaf. **RECONCILED (round 2):
  `detectProfile` narrows STRUCTURALLY and applies no regular expression** — an item is usable
  when it has a non-empty string `id` that contains no `:` (the key's separator) and a non-empty
  string `text`. Phase 3's `USER_MEMORY_ITEM_ID_RE` (twelve lowercase hex) *guarantees* the `:`
  can never appear in a production id, so that check can only ever fire on a hand-written row;
  it is kept as the writer-side refusal `materialKey`'s grammar depends on, and it is what lets
  this file's own fixtures use readable ids like `i-food`. Importing the RE here would make the
  fixtures red for a reason that is not about this phase.
  **Phase 3 guarantees the id is CONTENT-DERIVED and stable across regenerations**, which is what
  makes `chat_runs_user_material_uq` do its job on a `profile:` key.
- **Phase 4** — the extractor fills those items. An item's `kind` is read through
  `profileKindOf()`, which maps an unrecognised or absent value to `'other'`, so a vocabulary
  mismatch costs precision and never a dropped item, a crash or a compile error.

**Shared file, additive edit (conflict zone with Phase 8):**
- `proactive/mint.ts` gains **three lines only** — a local
  `const utcOffsetMinutes = thread?.utcOffsetMinutes ?? null;` after the `[thread, openRun]`
  destructure, a `const clock = resolveChatClock({ offsetMinutes: utcOffsetMinutes, now });`
  beside it, and `clock,` inside `detectArgs`.
  **Phase 8 lands after this and reuses `utcOffsetMinutes` for `quietHoursFor()`; it must not
  re-read the thread.** Nothing in `state`, `common`, `minGapSeconds()`, `maxPerDay()`,
  `bumpProactiveCount` or `skip()` is touched here.

**Leaves alone (owned by others):**
- `proactive/eligibility.ts` — every gate, `REFUSAL_ORDER`, `inQuietHours`, `QuietHours` (Phase 8).
  **`time_of_day` deliberately covers all 24 hours, `late` included, so this phase implements no
  quiet hours in disguise.** Whether the room speaks at 03:00 is Phase 8's `quietHours` gate;
  what it *would be about* at 03:00 is this phase's `late` part. Two mechanisms, on purpose.
- `proactive/mint.ts`'s tuning constants and `vercel.json`'s cron (Phase 8).
- `direct/system.{id,en}.ts` rules — including **rule 11**, which today caps a proactive run at
  *"satu beat, kadang dua"*. See **Handoffs** for exactly what these two notes assume of it.
- `direct/caps.ts`, `prompt/base.{id,en}.ts`, `prompt/readers.{id,en}.ts` (Phase 9).
- `prompt/build.ts`, `context.ts` — including the `<ingatan>` block (Phase 5) and the `<waktu>`
  block (Phase 2).
- `src/lib/db/queries/memory.ts`, `src/lib/memory/profile/**` (Phases 3 and 4).

---

## Files

| File | Action | What changes |
|---|---|---|
| `src/lib/chat/proactive/material.ts` | modify | two `MaterialKind` members, two material types, `DAY_SHAPES`/`shapeOf`/`timeOfDayMaterial`, `profileKindOf`, two `materialKey` arms, two `MATERIAL_ORDER` entries, two `describeMaterial` arms. **Imports the calendar from `@/lib/chat/clock`; declares none** |
| `src/lib/chat/proactive/notes.id.ts` | modify | two note renderers plus `PROFILE_SUBJECT_ID`; weekday and day-part words come from `CHAT_TIME_VOCAB` |
| `src/lib/chat/proactive/notes.en.ts` | modify | the same two, **rewritten not translated**, plus `PROFILE_SUBJECT_EN` |
| `src/lib/chat/proactive/detect.ts` | modify | `DetectArgs.clock`, two `DETECTORS` entries, `detectProfile`, `usedProfileKeys`, `detectTimeOfDay`, `usedTimeOfDayToday` (the one-per-day brake) |
| `src/lib/chat/proactive/brief.ts` | modify | two `rehydrate` arms, `profileMaterial`, `timeOfDayFromKey` |
| `src/lib/chat/proactive/mint.ts` | modify | three lines: the offset local, the resolved clock, and threading it into `detectArgs` |
| `src/lib/chat/proactive/fixtures.ts` | modify | two `proactiveFixtures` entries, so the blind read prints all eight |
| `src/lib/chat/proactive/material.test.ts` | modify | two `FIXTURES` rows, the `MATERIAL_ORDER` assertion, and the new pure-function tests |
| `src/lib/chat/proactive/detect.integration.test.ts` | modify | `args()` gains an unknown `clock`; two new `describe` blocks with their nearest negatives, plus the one-`tod:`-per-day brake |
| `src/lib/clientBoundary.test.ts` | modify | extend the `new Date(` purity sentinel from `eligibility.ts` to `material.ts` |

No migration. No new file. `scripts/smoke-llm.ts` is **not** edited — `runProactive` iterates
`proactiveFixtures(locale)` generically (`smoke-llm.ts:3236`), so two more fixtures are two more
runs with no script change.

---

## The two design decisions, argued

### 1. The `material_key` grammar and its self-expiry

**`tod:<YYYY-MM-DD>:<part>`.** The prompt asks which granularity, and the two wrong answers are
instructive. `tod:monday-morning` fires **once in a lifetime** — the room asks *"udah senin
aja"* one Monday in September 2026 and never again, which is the failure `occasion:return:<day>`
was refined to avoid. `tod:2026-W36:monday-morning` fires once a week, which sounds tidy and is
wrong for a different reason: an ISO week number is a thing no querent lives in, and the run
would be keyed to a calendar the person receiving it does not use.

The day plus the part is the honest unit, and it is **exactly `occasion:return`'s shape refined
by one field**. `return` is keyed by the day because *coming back* happens whenever somebody
comes back; the shape of a day happens once per day, and *twice* on a day whose morning and
evening are different subjects — *"udah senin aja"* is a Monday-morning sentence and is simply
false by Monday evening. So the part is what makes the key name the subject rather than the
date. `materialKey`'s standing sentence — **"the gap gate and the daily cap are what bound it, not the
key"** — was written when the cap was 2 and the gap three hours. **Phase 8 moves them to 5 and one
hour, so it stops being true**, and the reconciler restored the premise inside this file rather
than inside the policy: `detectTimeOfDay` refuses a second `tod:` on the same local day
(`usedTimeOfDayToday`). Five parts a day remains the KEY's granularity — it is what makes *"udah
senin aja"* a Monday-morning sentence rather than a Monday one — while at most one of them is ever
minted. Ranking is `MATERIAL_ORDER`'s job; volume is this brake's.

**`profile:<itemId>:<YYYY-MM>`.** A remembered fact is a slow fact. `profile:<itemId>` alone
would let the room ask about your dinner **once ever**, which turns R2's whole table into a
one-shot list of maybe fifteen openers and then silence — the `tod:monday-morning` mistake in
the other kind. Keying on the memory row's `updated_at` is worse still: one re-extraction that
rewrote an unrelated line would re-open **every** item at once. The month is the granularity
that matches the subject: asking somebody about their dinner habit once a month is what a friend
does, and once a week is a survey. `args.localDate.slice(0, 7)` — **a string slice, following
the birthday detector's rule**, never a `Date`.

**Both rehydrate from the key alone.** `tod:` needs no query at all (`occasionMaterial`'s shape):
the date gives the weekday through a pure calendar function and the part is in the key, so
`shapeOf` reconstructs the whole subject. `profile:` re-reads the item by id — deliberately, and
for `lotusMaterial`'s stated reason: *"the honest direction… the readers should be reacting to
what they would see today."* It buys one property worth naming: **an item the querent deleted on
`/account` (phase 6) is gone from the material at plan time, not merely at mint time.** A run
minted this morning about their dinner, planned this evening after they deleted that line,
rehydrates to `null` and loses its `BAHAN:` line — which is exactly right, because phase 5's
`<ingatan>` will have lost it too and the voice would otherwise be pointed at a fact it can no
longer see.

### 2. The seam — how a remembered fact reaches a reader without reaching the director

**This is the decision the phase turns on.** The `BAHAN:` line carries *"a closed token and card
names, never free text"*, and the remembered fact **is** free text.

There is a precedent that argues the other way and it has to be dealt with head on:
`LotusMaterial` carries `summary: string` and the `lotus` note interpolates it — model prose,
in the note, today. `materialLine`'s header even licenses it: *"nothing that came out of a model
except the gist and the Lotus summary, both of which are already this app's own prose… already
through their own safety checks."* By that precedent a `user_memory` line could sit in the note
too.

**It must not, and the difference is the size of the surface.** The Lotus summary is generated
**once**, from six fixed onboarding answers, behind `lotusSafetyCheck`. `user_memory` is
generated **continuously, from arbitrary text the querent types into the room**. A querent who
wants a sentence of their own choosing into the director's *unfenced* header has one attempt at
the Lotus and unlimited attempts at the memory. The `BAHAN:` line sits in
`assemble.ts`'s `header()` — above `<obrolan>`, outside every fence — which is precisely where
`build.ts`'s rule says untrusted text may not go.

So:

- **`ProfileMaterial` has no text field.** Not "the text is omitted from `facts`" — the type has
  nowhere to put it. `describeMaterial` cannot leak what the object does not carry, and
  `material.test.ts` asserts the key set so a future `text:` is a red test rather than a review
  comment. This is `<sosok>`'s rule from V8: **enforced by construction, not by prompting.**
- **`facts` carry one closed token, `itemKind`**, from phase 3's `USER_MEMORY_KINDS` — read
  through `profileKindOf`, so an unexpected value maps to `'other'` and never becomes `undefined`
  in a prompt.
- **The note names the subject in the flattest register available** — *"hal yang sudah diketahui
  ruangan ini tentang penanya: kebiasaan makan penanya"* — and contains no memory prose.
- **The fact itself reaches the voice only, through phase 5's fenced `<ingatan>`.** The director
  writes an angle at topic level (*"tanya kabar soal makan malamnya"*); the voice, holding the
  memory, writes *"gimana dinner lu tah? nasi padang lagi kan? wkwk"*.

**The obvious counter-argument, and why it does not transfer.** The `recurring` note carries its
card name because of a *measurement*: with a generic note the director took `dominance` into its
angle and no card name reached the bubble. Why is `profile` not the same trap? Because there the
director's angle was the voice's **only** channel to the card name — nothing else in the voice
prompt names it. Here the voice has the fact independently, in `<ingatan>`. The measurement was
about a missing channel, and this kind has a second one.

**And the phase stands up without phase 5.** If `<ingatan>` slips, a `profile` run still produces
a coherent topic-level opener — *"gimana kabar makan-makannya?"* — thinner than the target, never
wrong, and never a leak. That is deliberate: phase 5 is **not** in this phase's `depends_on`, and
this seam is what keeps it out.

### 3. `MATERIAL_ORDER`, in the order's own terms

`MATERIAL_ORDER` refuses a score — *"a score is a number somebody tunes, a tuned number needs a
corpus, and there is no corpus"* — and encodes three judgements instead. Both new kinds are
placed against those judgements and against one structural fact about the ladder.

```
occasion, reading, unanswered, profile, recurring, orphan, lotus, time_of_day
                               ^^^^^^^                        ^^^^^^^^^^^^
```

**`profile` sits above `recurring` and below `unanswered`.** It does not decay, so it ranks below
the one that does (*"a question decays and a pattern does not"*). Against `recurring` the
existing second judgement decides it, one step further out: *a thing the querent did* beats *a
thing the app noticed*, and **a thing the querent said about their own life beats a thing the app
counted about their deck.** A friend asking how dinner went is a better reason to speak than a
tarot app reporting that The Moon keeps coming up — and R3 is a ruling about the room feeling
like friends.

**`time_of_day` is last, below `lotus`, and the argument is structural before it is aesthetic.**
Its key is fresh in every part of every day, so it is **the only material in the set with
unlimited supply**. `MATERIAL_ORDER` is walked lazily and stops at the first unused key: a
material with unlimited supply placed anywhere but last starves everything below it, and the
ladder stops being a ranking and becomes a monopoly. That alone settles it. The aesthetic
argument agrees: every other material is about a *thing that happened*; this one is about the
calendar, which is what a friend brings up when there is nothing else — the definition of an
ice-breaker.

The behaviour that falls out is the one the user asked for. The room goes quiet after the
querent's last word; `orphan` cannot fire (the last author is the querent); nothing else has
fresh material; `time_of_day` opens the day. After that run the last word is a reader's, so the
next tick finds `orphan` first and the two alternate instead of the room hammering the clock.

---

## Implementation Steps

### Step 1: The closed set, the time vocabulary, and the two material types

**File:** `src/lib/chat/proactive/material.ts:44-51` (the union), then insertions after `:160`
(the `LotusMaterial` block) and edits at `:162`, `:185`, `:215`, `:285`.

**Change:** widen `MaterialKind`; add the pure calendar/clock vocabulary; add the two material
types; extend `Material`, `MATERIAL_ORDER`, `materialKey` and `describeMaterial`.

**Code — replace lines 44-51 (`MaterialKind`):**

```ts
/** The closed set, in no particular order — `MATERIAL_ORDER` below is the ranking. */
export type MaterialKind =
  | 'reading'
  | 'unanswered'
  | 'orphan'
  | 'recurring'
  | 'occasion'
  | 'lotus'
  | 'profile'
  | 'time_of_day';
```

**Code — insert immediately after the `LotusMaterial` block (after line 160), before
`export type Material`:**

```ts
/**
 * M7 — something the room already knows about the querent, from `user_memory`.
 *
 * ── IT CARRIES NO TEXT, AND THAT IS THE WHOLE DESIGN ──────────────────────
 *
 * The remembered fact is prose a model wrote about a real person, distilled from text they
 * typed into this room. `materialLine`'s contract is *"a closed token and card names, never
 * free text"*, and the `BAHAN:` line sits in `assemble.ts`'s header — **above `<obrolan>`,
 * outside every fence**, which is exactly where `build.ts`'s rule says untrusted text may
 * not go.
 *
 * `LotusMaterial` interpolates its summary into its note and this one must not, and the
 * difference is the size of the surface: the Lotus is generated ONCE from six fixed
 * onboarding answers behind `lotusSafetyCheck`, while `user_memory` is rebuilt continuously
 * from whatever the querent types. One attempt versus unlimited attempts at the same
 * unfenced line.
 *
 * **So the type has nowhere to put the text.** `describeMaterial` cannot leak a field the
 * object does not carry, `material.test.ts` asserts this key set exactly, and the fact
 * reaches the reader through F3's fenced memory block instead — where the voice, not the
 * director, is the one that needs it. V8's `<sosok>` rule: enforced by construction rather
 * than by prompting.
 */
export type ProfileMaterial = {
  kind: 'profile';
  /**
   * The `user_memory` item's stable id — twelve hex characters, so it never contains `:` and
   * the key's grammar holds. **Stable across regenerations is phase 3's contract**, and it is
   * what makes `chat_runs_user_material_uq` able to stop one opener firing twice.
   */
  itemId: string;
  /**
   * The item's CLOSED kind token, phase 3's `UserMemoryKind`. An unrecognised or absent value
   * becomes `'other'` through `profileKindOf`, which is what `'other'` is in that set for.
   * **The type is imported from `@/lib/memory/profile/types`, a zero-import leaf**, so this
   * file stays pure.
   */
  itemKind: UserMemoryKind;
  /** The querent's month, `'YYYY-MM'`. **A STRING SLICE** (`[F5-3]`), never a `Date`. */
  month: string;
};

/**
 * M8 — what time it is where the querent is. **The ice-breaker.**
 *
 * *"kamu weekend ini kemana aja?"* (Sunday afternoon) and *"njir, udah senin aja. mager ga
 * lu ngantor?"* (Monday morning to noon) are the two examples this kind exists for, and
 * neither is derivable without R1's offset: without one, `nanti` and `tadi` are the bug
 * `08:39` / *"jam 5 nanti"* already proved.
 *
 * **EVERY FIELD IS A CLOSED TOKEN AND NOTHING HERE IS FREE TEXT** — which makes this the
 * easy half of the pair, and the one whose `facts` line is exactly what §6.3 describes.
 *
 * **`part` COVERS ALL TWENTY-FOUR HOURS, `late` INCLUDED, ON PURPOSE.** Whether a reader
 * may speak at 03:00 is `eligibility.ts`'s quiet-hours gate; what there would be to say at
 * 03:00 is this. Two mechanisms — a detector that quietly refused the small hours would be
 * quiet hours hidden inside a material, in a file that cannot be told to stop.
 */
export type TimeOfDayMaterial = {
  kind: 'time_of_day';
  /** The querent's day, `'YYYY-MM-DD'`. A STRING (`[F5-3]`). */
  localDate: string;
  weekday: Weekday;
  part: DayPart;
  shape: DayShape;
};

/*
 * **RECONCILED: THE CALENDAR IS IMPORTED, NOT DECLARED.** `Weekday`, `DayPart` (from
 * `@/lib/chat/types`), and `WEEKDAYS`, `DAY_PARTS`, `dayPartOf`, `weekdayOf` (from
 * `@/lib/chat/clock`) are phase 1's. This phase's `partOf` became `dayPartOf` with its five
 * tokens and its boundaries unchanged — `morning` 05–10, `midday` 11–14, `afternoon` 15–17,
 * `evening` 18–21, `late` 22–04 — and its `weekdayOf` (Sakamoto, string-in, no `Date`) moved
 * verbatim. `localStampFor`, `LocalStamp`, `civilFromDays` and `pad` are cancelled:
 * `resolveChatClock({ offsetMinutes, now })` already answers `localDate` (a STRING) and
 * `part`, in the module where a `Date` is allowed.
 *
 * **`ProfileTopic` / `PROFILE_TOPICS` / `profileTopicOf` are cancelled too.** The closed token
 * on a `profile:` material is `UserMemoryKind` — phase 3's set, `habit | taste | person |
 * situation | place | trait | other` — because two closed vocabularies describing one item is
 * two vocabularies that drift, and phase 3's is the one persisted in `user_memory.items`.
 */
import { DAY_PARTS, WEEKDAYS, dayPartOf, resolveChatClock, weekdayOf } from '../clock';
import type { ChatClock, DayPart, Weekday } from '../types';
import type { UserMemoryKind } from '@/lib/memory/profile/types';
import { USER_MEMORY_KINDS } from '@/lib/memory/profile/types';

/** `other` is the catch-all, so an unknown kind is filed rather than lost. */
export function profileKindOf(raw: unknown): UserMemoryKind {
  return typeof raw === 'string' && (USER_MEMORY_KINDS as readonly string[]).includes(raw)
    ? (raw as UserMemoryKind)
    : 'other';
}

/**
 * **THE JUDGEMENT, STATED BY CODE RATHER THAN INFERRED BY A MODEL.** `effectiveYesNo()`'s
 * rule again: a weekday name alone leaves *"is this the start of the working week"* to the
 * model, and the two shapes the querent's own examples name are exactly that judgement.
 */
export const DAY_SHAPES = ['week_start', 'weekend', 'weekend_close', 'ordinary'] as const;
export type DayShape = (typeof DAY_SHAPES)[number];

/**
 * The two shapes the querent's own examples name, plus the weekend and the ordinary day.
 *
 * Order matters: Monday morning is `week_start` before it is anything else, and Sunday
 * afternoon is `weekend_close` before it is `weekend`, because *"the weekend is nearly
 * over"* is the thing worth speaking about and *"it is the weekend"* is not.
 */
export function shapeOf(weekday: Weekday, part: DayPart): DayShape {
  if (weekday === 'mon' && (part === 'morning' || part === 'midday')) return 'week_start';
  if (weekday === 'sun' && (part === 'afternoon' || part === 'evening')) return 'weekend_close';
  if (weekday === 'sat' || weekday === 'sun') return 'weekend';
  return 'ordinary';
}

/*
 * **RECONCILED: `LocalStamp`, `localStampFor`, `pad` AND `civilFromDays` ARE CANCELLED.**
 *
 * The argument they were written for is accepted and unchanged, and it is worth restating
 * because the code that carried it is gone:
 *
 *   **WHY THIS MATERIAL DOES NOT USE `args.localDate`.** `[F5-3]` says the querent's day is
 *   the client's string and every other material obeys that. This one re-derives it, because
 *   **the cron has no client**: it passes `utcDateString()`, and for a Jakarta querent at
 *   23:30 UTC that string is *yesterday* while the offset says it is 06:30 the following
 *   morning. Every other material tolerates a day of error at the edge of a lookback; this
 *   one would ship *"Monday morning"* stamped Sunday, which is the class of bug R1 exists to
 *   delete. **One value, one source, and it stays a STRING throughout.**
 *
 * What changed is only where the derivation lives: `resolveChatClock({ offsetMinutes, now })`
 * in `@/lib/chat/clock` already answers `localDate` (a `'YYYY-MM-DD'` STRING) and `part`, has
 * phase 1's tests behind it, and applies `@/lib/analytics/utcoffset`'s real bounds (−720…+840)
 * rather than this file's looser ±16 hours. **`material.ts` still constructs no `Date` of its
 * own**, so Step 10's `clientBoundary.test.ts` sentinel is untouched and still means what it
 * says — it greps THIS file's source; importing a module that uses `Date` is not the thing it
 * forbids, and its comment must say so or somebody will read the import as a violation.
 */

/**
 * **THE ONE CONSTRUCTOR FOR M8, CALLED BY BOTH `detect.ts` AND `brief.ts`.**
 *
 * The mint and the plan are two requests hours apart and `brief.ts` rebuilds the subject
 * from `material_key` alone. Two independent derivations of `weekday` and `shape` is two
 * chances for them to disagree, and a run that changed what it was about between mint and
 * plan is the failure `brief.ts`'s header names by name. So there is one.
 */
export function timeOfDayMaterial(localDate: string, part: DayPart): Material | null {
  if (!(DAY_PARTS as readonly string[]).includes(part)) return null;
  const weekday = weekdayOf(localDate);
  if (weekday === null) return null;
  return { kind: 'time_of_day', localDate, weekday, part, shape: shapeOf(weekday, part) };
}
```

**Code — replace `export type Material` (line 162-168):**

```ts
export type Material =
  | ReadingMaterial
  | UnansweredMaterial
  | OrphanMaterial
  | RecurringMaterial
  | OccasionMaterial
  | LotusMaterial
  | ProfileMaterial
  | TimeOfDayMaterial;
```

**Code — replace `MATERIAL_ORDER` (lines 170-192), doc comment included:**

```ts
/**
 * THE ORDER THE DETECTORS RUN IN. **A FIXED ORDER, NOT A SCORE** (§4.2).
 *
 * A score is a number somebody tunes, a tuned number needs a corpus, and there is no
 * corpus — this feature has never run. The order encodes three judgements that do not
 * need tuning:
 *
 *   - an occasion is rarer and more welcome than anything else;
 *   - a thing the querent just did beats a thing the app noticed;
 *   - an unanswered question is more urgent than a pattern, **because a question decays
 *     and a pattern does not.**
 *
 * No tie-break is needed: the kinds are mutually exclusive at detection and the first
 * hit wins.
 *
 * ── WHERE THE TWO R3 KINDS GO, IN THOSE SAME TERMS ────────────────────────
 *
 * **`profile` is above `recurring` and below `unanswered`.** It does not decay, so it
 * ranks under the one that does. Against `recurring` the second judgement decides it one
 * step further out: *a thing the querent said about their own life beats a thing the app
 * counted about their deck.* A friend asking how dinner went is a better reason to speak
 * than a tarot app reporting that The Moon keeps coming up.
 *
 * **`time_of_day` IS LAST, AND THE ARGUMENT IS STRUCTURAL BEFORE IT IS AESTHETIC.** Its
 * key is fresh in every part of every day, so it is the only material in this set with
 * **unlimited supply** — and this list is walked lazily and stops at the first unused key.
 * A material with unlimited supply placed anywhere but last starves everything below it,
 * and the ladder stops being a ranking and becomes a monopoly. The aesthetic argument
 * agrees: every other material is about a thing that happened and this one is about the
 * calendar, which is what somebody brings up when there is nothing else — the definition
 * of an ice-breaker.
 */
export const MATERIAL_ORDER = [
  'occasion',
  'reading',
  'unanswered',
  'profile',
  'recurring',
  'orphan',
  'lotus',
  'time_of_day',
] as const satisfies readonly MaterialKind[];
```

**Code — add two arms to `materialKey` (inside the switch at line 216), and extend its doc
comment. The full replacement function:**

```ts
/**
 * THE DE-DUPLICATION KEY. *"Have I already messaged this person about this?"*
 *
 * **A UNIQUE CONSTRAINT ARBITRATES IT, NOT A CHECK-THEN-INSERT** (§4.5): the mint runs
 * from three entry points on three lambdas, and *"has this material been used"* asked
 * before an insert is a race with a window measured in milliseconds. `detect.ts` checks
 * the key as an **optimisation** — so that a used key falls through to the next
 * detector instead of costing the querent their whole run — and
 * `chat_runs_user_material_uq` is what actually settles it.
 *
 * **M4's KEY CONTAINS THE FINGERPRINT, WHICH IS WHAT MAKES IT SELF-EXPIRING.** The
 * verdict changes when the card counts change, the fingerprint moves, and a new key
 * becomes available. Until then the readers say nothing about it again, which is the
 * behaviour a person has.
 *
 * **`return` IS KEYED BY THE DAY AND THE OTHER TWO OCCASIONS BY THE YEAR**, which
 * refines §4.5's `occasion:<occasion>:<YYYY>`. A birthday happens once a year and a
 * greeting for it should too; *coming back* happens whenever somebody comes back, and a
 * once-a-year key would silently swallow the second return. The gap gate and the daily
 * cap are what bound it, not the key.
 *
 * **M8 IS `occasion:return`'s SHAPE REFINED BY ONE FIELD, AND THE PART IS WHY.** A key of
 * `tod:monday-morning` fires once in a lifetime — the room says *"udah senin aja"* one
 * Monday in 2026 and never again — and a key of `tod:<day>` alone would make a Monday
 * morning and a Monday evening the same subject, which they are not: *"udah senin aja"* is
 * false by six o'clock. The day plus the part is the smallest thing that names the subject,
 * and the same sentence as `return`'s covers the volume: **the gap gate and the daily cap
 * bound it, not the key.**
 *
 * **M7 IS KEYED BY THE ITEM AND THE MONTH.** By the item alone the room could ask about
 * your dinner *once ever*, which turns the whole memory into a one-shot list of openers and
 * then silence. By the memory row's `updated_at` a single re-extraction would re-open every
 * item at once. A month is the granularity of the subject: asking a friend about their
 * dinner habit once a month is what a friend does. **`month` is a STRING SLICE of the
 * querent's day** — the birthday detector's discipline, never a `Date`.
 */
export function materialKey(m: Material): string {
  switch (m.kind) {
    case 'reading':
      return `reading:${m.readingId}`;
    case 'unanswered':
      return `ask:${m.messageId}`;
    case 'orphan':
      return `orphan:${m.messageId}`;
    case 'recurring':
      return `freq:${m.window}:${m.fingerprint}`;
    case 'occasion':
      return m.occasion === 'return'
        ? `occasion:return:${m.localDate}`
        : `occasion:${m.occasion}:${m.localDate.slice(0, 4)}`;
    case 'lotus':
      return `lotus:${m.updatedAtIso}`;
    case 'profile':
      return `profile:${m.itemId}:${m.month}`;
    case 'time_of_day':
      return `tod:${m.localDate}:${m.part}`;
  }
}
```

**Code — add two arms to `describeMaterial`, immediately before the `default:` arm (line 351):**

```ts
    case 'profile':
      /*
       * **ONE CLOSED TOKEN AND NOTHING ELSE. THE REMEMBERED SENTENCE IS NOT HERE AND
       * CANNOT BE** — `ProfileMaterial` has no field to hold it, so this arm could not leak
       * it if somebody wanted it to. The fact reaches the VOICE through F3's fenced memory
       * block, where the reader who has to say it is the one who reads it; the director
       * needs to know the subject in order to cast, and knowing the sentence would buy it
       * nothing and put untrusted prose in an unfenced header.
       *
       * `month` is deliberately absent: it is a date the model could recite, for no
       * reader's benefit — `lotus`'s reason for adding no `length`.
       */
      return { kind: m.kind, facts: { kind: m.itemKind }, replyTo, note };
    case 'time_of_day':
      /*
       * **THREE CLOSED TOKENS AND NO FREE TEXT AT ALL** — the easy half of this phase, and
       * the shape §6.3 describes exactly. `shape` is the judgement code makes so the model
       * does not have to: *"is Monday morning the start of the working week"* is not a
       * question to leave to a director that may be reasoning about a locale it has no
       * calendar for.
       *
       * **THE DATE IS NOT A FACT.** It is in the key, where de-duplication needs it, and
       * out of the prompt, where it is a number a reader could recite at somebody who
       * already knows what day it is.
       */
      return {
        kind: m.kind,
        facts: { weekday: m.weekday, part: m.part, shape: m.shape },
        replyTo,
        note,
      };
```

**Impact:** `MaterialNotes` (a mapped type over `MaterialKind`) and `DETECTORS`
(`Record<MaterialKind, Detector>`) both become compile errors until steps 2–4 land. That is the
intended safety net; the tree does not build between steps.

---

### Step 2: The Indonesian notes

**File:** `src/lib/chat/proactive/notes.id.ts:26-83`

**Change:** import the three new types, export three word tables (phase 2 will want two of them
— see Handoffs), and add the two note renderers.

**Code — replace the import line and add the tables above the export:**

```ts
import { CHAT_TIME_VOCAB } from '../clock';
import type { DayPart, Weekday } from '../types';
import type { UserMemoryKind } from '@/lib/memory/profile/types';
import type { MaterialNotes } from './notes';

/**
 * THE DAY WORDS, EXPORTED. **One table, because two would drift.**
 *
 * Phase 2's `<waktu>` block states the querent's weekday and time to the voices and this
 * table states it to the director. Two independent lists is how the same run says *"Monday
 * morning"* in one line and *"siang"* in another, in one prompt, which reads to a model as
 * two different claims about the same clock.
 */
/* RECONCILED: cancelled. Use `CHAT_TIME_VOCAB['id'].weekdays[WEEKDAYS.indexOf(w)]`. */

/** Pagi 05–11, siang 11–15, sore 15–18, malam 18–22, larut 22–05. `partOf`'s divisions. */
/* RECONCILED: cancelled. Use `CHAT_TIME_VOCAB['id'].parts[p]`. */

/**
 * What a remembered fact is ABOUT, as a subject and never as a fact.
 *
 * Every line here names a topic; none of them says anything the room actually knows. That
 * is the seam: the sentence itself lives in F3's fenced memory block, in front of the
 * reader who has to say it.
 */
export const PROFILE_SUBJECT_ID: Record<UserMemoryKind, string> = {
  habit: 'rutinitas harian penanya',
  taste: 'apa yang disukai penanya',
  person: 'orang-orang di sekitar penanya',
  situation: 'hal yang sedang berjalan di hidup penanya',
  place: 'tempat yang sering didatangi penanya',
  trait: 'bagaimana penanya menggambarkan dirinya',
  other: 'sesuatu tentang penanya',
};
```

**Code — add the two renderers inside `MATERIAL_NOTES_ID`, after the `lotus` entry:**

```ts
  /*
   * **THE SUBJECT AND NOT THE FACT.** `ProfileMaterial` carries no text, so this line
   * cannot carry one either — and that is the point rather than a limitation. The director
   * casts on the subject; the reader who speaks reads the sentence itself out of the fenced
   * memory block and says it in their own words.
   *
   * *"sudah diketahui"* rather than *"catatan"* or *"data"*: a note that names a record is
   * a note a model will paraphrase as *"di catatanku tertulis…"*, and `C-D8`'s ban on
   * saying HOW you know is the difference between *"nasi padang lagi kan?"* and
   * surveillance.
   */
  profile: (m) =>
    `hal yang sudah diketahui ruangan ini tentang penanya: ${PROFILE_SUBJECT_ID[m.itemKind]}`,

  /*
   * **THE CLOCK AS A SUBJECT, NOT AS A GREETING.** The note states where in the week and
   * the day the querent is and stops; *"njir, udah senin aja"* is a sentence Adrian writes,
   * not one this table hands to three readers at once (`[F5-9]`).
   *
   * The second clause is the one piece of ladder state a note carries anywhere, and it
   * earns its place: this material is LAST in `MATERIAL_ORDER` precisely because it is what
   * is left when nothing happened, and a director told only *"it is Sunday afternoon"* will
   * hunt the transcript for a reason to speak. Saying there is no other reason is what
   * licenses an opener.
   */
  time_of_day: (m) => {
    const when = `${CHAT_TIME_VOCAB.id.weekdays[WEEKDAYS.indexOf(m.weekday)]} ${CHAT_TIME_VOCAB.id.parts[m.part]}`;
    const shape =
      m.shape === 'week_start'
        ? ', awal minggu kerja'
        : m.shape === 'weekend_close'
          ? ', akhir pekan hampir habis'
          : m.shape === 'weekend'
            ? ', akhir pekan'
            : '';
    return `jam setempat penanya: ${when}${shape}; belum ada bahan lain di ruangan ini`;
  },
```

**Impact:** both new strings are checked by `material.test.ts`'s existing Malay grep and its
imperative-opener grep. Neither opens with `bilang|katakan|tanya|tanyakan|sapa|ingatkan|sebutkan|jangan`,
and none of the eleven Malay words appears (`kerja` is not `kerjaya`; the grep is word-bounded).

---

### Step 3: The English notes — rewritten, not translated

**File:** `src/lib/chat/proactive/notes.en.ts:17-40`

**Change:** the same three tables and two renderers, taking a **different angle** on each line
(`## Localization` rule 3; `material.test.ts` asserts no line equals its Indonesian counterpart).
The Indonesian `time_of_day` note leads with the clock; this one leads with the **shape of the
week**, because that is the thing an English room actually remarks on. The Indonesian `profile`
note says *what is known*; this one says *how it got there — over time*.

**Code — replace the import line and add the tables above the export:**

```ts
import { CHAT_TIME_VOCAB } from '../clock';
import type { DayPart, Weekday } from '../types';
import type { UserMemoryKind } from '@/lib/memory/profile/types';
import type { MaterialNotes } from './notes';

/* RECONCILED: cancelled. Use `CHAT_TIME_VOCAB['en'].weekdays[WEEKDAYS.indexOf(w)]`. */

/**
 * The same five divisions as the Indonesian table, in English words. **`late` is *late at
 * night*, not *night*** — English splits the evening from the small hours where Indonesian
 * splits *malam* from *larut malam*, and the divisions are `partOf`'s, so the words follow
 * the divisions rather than the other way round.
 */
/* RECONCILED: cancelled. Use `CHAT_TIME_VOCAB['en'].parts[p]`. */

/**
 * The topics, as subjects. **Nothing here is a therapy word and nothing here is a fact** —
 * the English tic list binds a prompt as hard as it binds output, and this table is what
 * tells the director a subject is available at all.
 */
export const PROFILE_SUBJECT_EN: Record<UserMemoryKind, string> = {
  habit: 'the shape of the querent’s ordinary day',
  taste: 'what the querent likes',
  person: 'the people around the querent',
  situation: 'what is going on in the querent’s life',
  place: 'where the querent spends time',
  trait: 'how the querent describes themselves',
  other: 'something about the querent',
};
```

**Code — add the two renderers inside `MATERIAL_NOTES_EN`, after the `lotus` entry:**

```ts
  profile: (m) => `something this room has picked up about ${PROFILE_SUBJECT_EN[m.itemKind]} over time`,

  time_of_day: (m) => {
    const shape =
      m.shape === 'week_start'
        ? 'the working week has just started'
        : m.shape === 'weekend_close'
          ? 'the weekend is nearly over'
          : m.shape === 'weekend'
            ? 'it is the weekend'
            : 'it is an ordinary weekday';
    return `${shape}; where the querent is it is ${CHAT_TIME_VOCAB.en.weekdays[WEEKDAYS.indexOf(m.weekday)]} ${CHAT_TIME_VOCAB.en.parts[m.part]}, and nothing else in this room is new`;
  },
```

**Impact:** `THERAPY_EN` is grepped as a **substring** by `material.test.ts`, so `heal`,
`regulate` and `do the work` are the ones to watch. None of these strings contains any of them.
The typographic apostrophe (`’`) in `PROFILE_SUBJECT_EN` avoids escaping inside the single-quoted
literals and matches the codebase's use elsewhere in prose constants.

---

### Step 4: The two detectors

**File:** `src/lib/chat/proactive/detect.ts` — imports at `:46-69`, `DetectArgs` at `:98`,
`DETECTORS` at `:165`, and two new sections at the end of the detector blocks (after
`detectLotus`, before the `// The reads the predicate needs` divider at `:533`).

**Change:** thread the offset in, register the two detectors, implement them.

**Code — replace the drizzle import (line 46) and add two imports:**

```ts
import { and, desc, eq, gt, gte, isNotNull, isNull, like, lt, ne, sql } from 'drizzle-orm';
```

**Code — extend the `./material` import (lines 63-69):**

```ts
import { getUserMemory } from '@/lib/db/queries/memory';
import {
  MATERIAL_ORDER,
  materialKey,
  partOf,
  profileKindOf,
  timeOfDayMaterial,
  type Material,
  type MaterialKind,
  type OccasionKind,
} from './material';
```

**Code — add one field to `DetectArgs` (after `birthDate`, line 110):**

```ts
  /**
   * `chat_threads.utc_offset_minutes`, or null when no browser has ever reported one.
   *
   * **NULL IS A CORRECT OUTCOME AND NEVER AN ERROR.** It costs exactly one material — M8 —
   * and every other detector is unaffected, because the querent's calendar day still
   * arrives as `localDate`. An ice-breaker whose entire content is *"it is Monday morning
   * where you are"* is a false statement when we do not know where you are, and being
   * confidently wrong about the clock is the bug R1 exists to delete rather than to move.
   */
  /**
   * The querent's clock (phase 1), resolved once in `mint.ts` from
   * `chat_threads.utc_offset_minutes`. **REQUIRED**, so a construction site cannot forget it.
   *
   * **THIS DOES NOT REPLACE `localDate`, AND THE TWO ARE DELIBERATELY BOTH HERE.**
   * `localDate` stays the CLIENT's `'YYYY-MM-DD'` string and the birthday and anniversary
   * detectors keep comparing `MM-DD` slices off it, unchanged. Only `detectTimeOfDay` uses
   * `clock.localDate`, and only because the CRON HAS NO CLIENT: at 23:30 UTC a Jakarta
   * querent's client-shaped day is yesterday while their clock says it is the following
   * morning, and this is the one material whose entire content is which day it is.
   */
  clock: ChatClock;
```

**Code — replace `DETECTORS` (lines 165-172):**

```ts
const DETECTORS: Record<MaterialKind, Detector> = {
  occasion: detectOccasion,
  reading: detectReading,
  unanswered: detectUnanswered,
  profile: detectProfile,
  recurring: detectRecurring,
  orphan: detectOrphan,
  lotus: detectLotus,
  time_of_day: detectTimeOfDay,
};
```

**Code — append after `detectLotus` (line 531), before the
`// ---- The reads the predicate needs` divider:**

```ts
// ---------------------------------------------------------------------------
// M7 — something the room already knows about the querent
// ---------------------------------------------------------------------------

/**
 * A defensive bound on how much of a jsonb payload this walks. The extractor writes a
 * short list; a corrupted or runaway one must not turn a page view into a linear scan.
 */
const MAX_MEMORY_ITEMS_SCANNED = 64;

/**
 * The first remembered item whose key is unused **this month**.
 *
 * ── WHY THE DETECTOR FILTERS AND DOES NOT LEAVE IT TO `selectMaterial` ─────
 *
 * `selectMaterial` checks **one** candidate per kind and falls through on a used key. With
 * fifteen remembered items that would mean the whole kind losing its turn because the first
 * item happened to be spent — and then losing it again tomorrow, for as long as the list
 * kept starting with the same row. So the used keys for the month are read once and the
 * walk stops at the first item that is free. `materialKeyUsed`'s probe still runs
 * afterwards, and `chat_runs_user_material_uq` is still what arbitrates (§4.5).
 *
 * ── STORED ORDER, AND CORRECTNESS DOES NOT DEPEND ON IT ───────────────────
 *
 * The walk is in whatever order the extractor stored. If a future extraction reorders the
 * array the choice changes and nothing else does: the key check is what stops a repeat, not
 * the position.
 *
 * ── IT READS AN ITEM STRUCTURALLY AND IMPORTS NO TYPE ─────────────────────
 *
 * `brief.ts`'s rule for an unknown key prefix, applied to a payload: an item this deploy
 * does not understand is an item it cannot use, not a run it should fail. An id containing
 * `:` is refused **at the writer**, because it is what would make `profile:<id>:<month>`
 * ambiguous for the reader one file over.
 *
 * **NOT ONE BYTE OF `item.text` LEAVES THIS FUNCTION.** It is read only to decide that the
 * item is real; `ProfileMaterial` has nowhere to put it.
 */
async function detectProfile(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const month = args.localDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const memory = await getUserMemory(db, args.userId);
  const items: unknown[] = Array.isArray(memory?.items) ? [...memory.items] : [];
  if (items.length === 0) return null;

  const used = await usedProfileKeys(db, args.userId, month);

  for (const raw of items.slice(0, MAX_MEMORY_ITEMS_SCANNED)) {
    const item = raw as { id?: unknown; text?: unknown; kind?: unknown };
    const itemId = typeof item.id === 'string' ? item.id.trim() : '';
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (itemId === '' || itemId.includes(':') || text === '') continue;
    if (used.has(`profile:${itemId}:${month}`)) continue;
    return { kind: 'profile', itemId, itemKind: profileKindOf(item.kind), month };
  }
  return null;
}

/**
 * Every `profile:` key this querent has spent in the given month.
 *
 * The `LIKE` pattern is built from a `YYYY-MM` slice that has already passed a regex, so it
 * carries no user input and no `LIKE` metacharacter. It is an equality on `user_id` and a
 * prefix on `material_key`, which is the leading edge of `chat_runs_user_material_uq`.
 */
async function usedProfileKeys(
  db: DbOrTx,
  userId: string,
  month: string,
): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ key: chatRuns.materialKey })
    .from(chatRuns)
    .where(and(eq(chatRuns.userId, userId), like(chatRuns.materialKey, `profile:%:${month}`)));
  return new Set(rows.map((r) => r.key).filter((k): k is string => k !== null));
}

// ---------------------------------------------------------------------------
// M8 — what time it is where the querent is
// ---------------------------------------------------------------------------

/**
 * **THE ONLY DETECTOR THAT RUNS NO QUERY**, which is what makes it affordable at the bottom
 * of a ladder that is now eight deep: reaching it costs nothing extra, and it is reached
 * only when the seven above it found nothing.
 *
 * **THE DAY AND THE HOUR COME FROM ONE DERIVATION AND NEVER FROM TWO SOURCES.** Mixing
 * `args.localDate` (the client's string, or `utcDateString()` on the cron) with an
 * offset-derived hour ships *"Monday morning"* stamped Sunday for every Jakarta querent
 * between 00:00 and 07:00 WIB — `local_date`'s trap arriving on the one material whose
 * entire content is which day it is. `resolveChatClock` is that one derivation.
 *
 * **IT COVERS EVERY HOUR, `late` INCLUDED, AND IMPLEMENTS NO QUIET HOURS.** Whether a
 * reader may speak at 03:00 is `eligibility.ts`'s gate. A detector that silently returned
 * null in the small hours would be that gate hidden in a file the operator cannot switch,
 * and *"belum tidur?"* is a real thing a friend says at one in the morning.
 */
async function detectTimeOfDay(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const clock = args.clock;
  /* No offset reported yet: no time material, never an error. The production default. */
  if (!clock.known) return null;
  /*
   * **ONE `tod:` RUN PER QUERENT PER LOCAL DAY** (reconciliation, round 1). `MATERIAL_ORDER`
   * places this kind last so unlimited supply cannot STARVE the ladder, but ranking is not
   * volume — and phase 8 raises the daily cap to five on the argument that `no_material` is
   * the binding gate, which unlimited supply falsifies. `usedProfileKeys`' probe, applied to
   * a prefix instead of an id.
   */
  if (await usedTimeOfDayToday(args, clock.localDate)) return null;
  return timeOfDayMaterial(clock.localDate, clock.part);
}
```

**Impact:** `selectMaterial`'s worst case grows by two detectors — one of them free. `detectProfile`
costs two indexed reads and sits at position four, so it is paid only when the three above it miss.

---

### Step 5: The two rehydration arms

**File:** `src/lib/chat/proactive/brief.ts` — imports at `:44-50`, `rehydrate`'s switch at
`:101-116`, and two new functions after `lotusMaterial` (line 271).

**Change:** teach the key reader the two new prefixes.

**Code — replace the two import blocks (lines 44-50):**

```ts
import { getUserMemory } from '@/lib/db/queries/memory';
import { cardsFor } from './detect';
import {
  describeMaterial,
  materialLine,
  profileKindOf,
  timeOfDayMaterial,
  DAY_PARTS,
  type DayPart,
  type Material,
  type OccasionKind,
} from './material';
```

**Code — replace `rehydrate`'s switch (lines 101-116):**

```ts
  switch (prefix) {
    case 'reading':
      return readingMaterial(db, userId, rest);
    case 'ask':
      return messageMaterial(db, userId, rest, 'unanswered', now);
    case 'orphan':
      return messageMaterial(db, userId, rest, 'orphan', now);
    case 'freq':
      return recurringMaterial(db, userId, rest, locale, now);
    case 'occasion':
      return occasionMaterial(rest);
    case 'lotus':
      return lotusMaterial(db, userId, locale);
    case 'profile':
      return profileMaterial(db, userId, rest);
    case 'tod':
      return timeOfDayFromKey(rest);
    default:
      return null;
  }
```

**Code — append after `lotusMaterial` (line 271):**

```ts
/**
 * `profile:<itemId>:<YYYY-MM>`.
 *
 * **THE ITEM IS RE-READ RATHER THAN TRUSTED TO THE KEY**, which is `lotusMaterial`'s
 * argument and buys one property this release needs: a memory line the querent deleted on
 * `/account` between the mint and the plan is **gone from the material at plan time**, not
 * merely blocked from being minted again. F3's fenced memory block will have lost it too,
 * so a run that still named the subject would be pointing a reader at a fact they can no
 * longer see.
 *
 * **SPLIT FROM THE RIGHT.** The month contains no `:` and the writer refuses an id that
 * does, so `lastIndexOf` is the split that cannot be confused by an id from a future
 * extractor with a different id scheme.
 *
 * **AND THE TEXT STILL DOES NOT CROSS.** It is read here only to establish that the item is
 * real, exactly as in `detectProfile`; `ProfileMaterial` has no field for it.
 */
async function profileMaterial(
  db: DbOrTx,
  userId: string,
  rest: string,
): Promise<Material | null> {
  const cut = rest.lastIndexOf(':');
  if (cut < 0) return null;
  const itemId = rest.slice(0, cut);
  const month = rest.slice(cut + 1);
  if (itemId === '' || !/^\d{4}-\d{2}$/.test(month)) return null;

  const memory = await getUserMemory(db, userId);
  const items: unknown[] = Array.isArray(memory?.items) ? [...memory.items] : [];

  for (const raw of items) {
    const item = raw as { id?: unknown; text?: unknown; kind?: unknown };
    if (item.id !== itemId) continue;
    if (typeof item.text !== 'string' || item.text.trim() === '') return null;
    return { kind: 'profile', itemId, itemKind: profileKindOf(item.kind), month };
  }
  return null;
}

/**
 * `tod:<YYYY-MM-DD>:<part>`. **The second material that needs no query** —
 * `occasionMaterial`'s shape, and for the same reason: the key carries the whole fact.
 *
 * **AND IT REBUILDS THROUGH `timeOfDayMaterial`, NOT BY HAND.** The weekday and the shape
 * are derived, not stored, so deriving them a second way here is two chances for the plan
 * to disagree with the mint about which day it is — which is the failure this file's header
 * names: *a run must not change what it is about between being minted and being planned.*
 *
 * **THE CLOCK IS NOT CONSULTED.** A run minted on Sunday afternoon and planned on Monday
 * morning is still a run about Sunday afternoon; re-deriving from `now` would silently make
 * it a different run. `lotusMaterial` re-reads because the Lotus is a fact that moves; a
 * moment does not move.
 */
function timeOfDayFromKey(rest: string): Material | null {
  const cut = rest.lastIndexOf(':');
  if (cut < 0) return null;
  const localDate = rest.slice(0, cut);
  const part = rest.slice(cut + 1) as DayPart;
  if (!(DAY_PARTS as readonly string[]).includes(part)) return null;
  return timeOfDayMaterial(localDate, part);
}
```

**Impact:** `materialLineForRun` gains no round trip on the common path — `tod:` is pure and
`profile:` is one indexed read, on a path that is already six.

---

### Step 6: Thread the offset through the mint

**File:** `src/lib/chat/proactive/mint.ts:160-201`

**Change:** two lines. **Nothing else in this file is touched by this phase** — see the
Interface Contract's conflict note for Phase 8.

**Code — replace lines 160-201 (from the `Promise.all` through the close of `detectArgs`):**

```ts
    const [thread, openRun] = await Promise.all([
      getThread(db, input.userId),
      activeRunFor(db, input.userId),
    ]);

    /*
     * **READ ONCE, HERE, BECAUSE TWO CONSUMERS WANT IT AND MUST NOT DISAGREE.** F5's own
     * rule for `ThreadState` — *"read ONCE, by the caller, so that three entry points cannot
     * each decide differently what a missing thread means"* — extended to the offset. M8
     * needs it to know the querent's weekday and hour at all, and the quiet-hours gate needs
     * the same number for `QuietHours.offsetMinutes`. A second read would let the material
     * and the gate be built from two different answers about the same person.
     *
     * `null` when no browser has ever reported one, and `null` is an ordinary answer on both
     * sides: no time material, and never a mint-blocking unknown.
     */
    const utcOffsetMinutes = thread?.utcOffsetMinutes ?? null;
    /*
     * **PHASE 8 REUSES `utcOffsetMinutes` FOR `quietHoursFor()` AND MUST NOT RE-READ THE
     * THREAD.** One row, one offset, one clock, for every gate and every detector in this
     * mint.
     */
    const clock = resolveChatClock({ offsetMinutes: utcOffsetMinutes, now });

    const state = {
      lastReadAt: thread?.lastReadAt ?? null,
      lastUserMessageAt: thread?.lastUserMessageAt ?? null,
      lastReaderMessageAt: thread?.lastReaderMessageAt ?? null,
      lastProactiveAt: thread?.lastProactiveAt ?? null,
      proactiveCountToday: thread?.proactiveCountToday ?? 0,
      proactiveCountDate: thread?.proactiveCountDate ?? null,
      openRun: openRun !== null,
      erased: querent.erased,
    };

    const common = {
      source: input.source,
      thread: state,
      localDate: input.localDate,
      enabled,
      minGapSeconds: minGapSeconds(),
      maxPerDay: maxPerDay(),
      /* §5, Option A (`[R17]`). The predicate takes the input and ships it dead. */
      quietHours: null,
      now,
    };

    const probe = checkEligibility({ ...common, hasMaterial: true, materialKind: null });
    if (!probe.ok) return skip(db, input, probe.reason);

    const locale = input.locale ?? querent.locale;
    const detectArgs = {
      userId: input.userId,
      locale,
      localDate: input.localDate,
      lastProactiveAt: state.lastProactiveAt,
      lastUserMessageAt: state.lastUserMessageAt,
      now,
      birthDate: querent.birthDate,
      lastSeenAt: querent.lastSeenAt,
      clock,
    };
```

**Impact:** none behaviourally until phase 1 writes the column — every existing thread reads
`null` and M8 never fires, which is exactly what keeps `mint.integration.test.ts` green.

---

### Step 7: Two more fixtures, so the blind read prints all eight

**File:** `src/lib/chat/proactive/fixtures.ts:102-191`

**Change:** add the two runs, in `MATERIAL_ORDER` position. `runProactive` iterates
`proactiveFixtures(locale)` and reads `fixture.kind`, `fixture.trigger`, `fixture.room` and
`fixture.material` generically (`smoke-llm.ts:3236-3260`), so **no change to the smoke script**.

**Code — add the `import` and the two entries. First, extend the imports at line 32-35:**

```ts
import type { Locale, ReaderId } from '@/data/types';
import { frequencyMechanic } from '@/lib/memory/shadow';
import type { BeatIntent, RunTrigger } from '../types';
import { timeOfDayMaterial, type Material, type MaterialKind } from './material';
```

**Code — inside `proactiveFixtures`, add this immediately after the `mechanic` guard:**

```ts
  /*
   * **BUILT THROUGH THE REAL CONSTRUCTOR, NEVER WRITTEN OUT BY HAND.** `weekday` and
   * `shape` are derivations, and a fixture that stated them would be able to disagree with
   * the code the blind read is supposed to be judging. `2026-08-09` is a Sunday, which is
   * the querent's own example — *"kamu weekend ini kemana aja?"*.
   */
  const sundayAfternoon = timeOfDayMaterial('2026-08-09', 'afternoon');
  if (!sundayAfternoon) throw new Error('the time-of-day fixture no longer computes');
```

**Code — insert the `profile` entry between the `unanswered` and `recurring` entries (i.e.
after the object ending at line 154), keeping the array in `MATERIAL_ORDER`:**

```ts
    {
      kind: 'profile',
      /*
       * A tick, so its trigger is `idle_nudge` — `triggerFor`'s table: only `unanswered`
       * material renames a tick's trigger.
       */
      trigger: 'idle_nudge',
      room: 'quiet',
      /*
       * **THE FIXTURE CARRIES NO REMEMBERED SENTENCE BECAUSE THE TYPE HAS NOWHERE TO PUT
       * ONE.** The blind read will therefore show a director casting on a topic and a reader
       * saying nothing specific — which is the correct picture of this phase **alone**. The
       * *"nasi padang lagi kan?"* half arrives when F3's fenced memory block reaches the
       * voice; this run is the half that says which subject it is about.
       */
      material: {
        kind: 'profile',
        itemId: '44444444-4444-4444-8444-444444444444',
        itemKind: 'taste',
        month: '2026-08',
      },
    },
```

**Code — append the `time_of_day` entry last, after the `lotus` entry (line 189):**

```ts
    {
      kind: 'time_of_day',
      /*
       * The daily job is the source that most often finds nothing else, which is exactly
       * when this material is what is left. Stated rather than derived, per this type's own
       * note, so the run prints the `PEMICU:` line production would show.
       */
      trigger: 'cron',
      room: 'quiet',
      material: sundayAfternoon,
    },
```

**Impact:** `npm run smoke -- --chat --proactive` becomes eight runs per locale instead of six —
sixteen director calls per full run. The cost ruling licenses it and the blind read needs all of
them: *"the blind read's first question is 'guess what this run is about', and it cannot be asked
of a sample."*

---

### Step 8: The unit tests

**File:** `src/lib/chat/proactive/material.test.ts`

**Change:** two fixtures, the order assertion, and five new blocks. The existing tests then walk
eight kinds automatically (`KINDS` is `Object.keys(FIXTURES)`), which is what makes the Malay
grep, the therapy grep, the imperative grep, the scalar check and the rewritten-not-translated
check cover the new prose for free.

**Code — extend the import (lines 14-24):**

```ts
import {
  describeMaterial,
  materialKey,
  materialLine,
  materialReplyTo,
  partOf,
  shapeOf,
  timeOfDayMaterial,
  weekdayOf,
  DAY_PARTS,
  MATERIAL_ORDER,
  USER_MEMORY_KINDS,
  renderCards,
  WEEKDAYS,
  type Material,
  type MaterialKind,
} from './material';
```

**Code — add two entries to `FIXTURES` (after the `lotus` entry, line 76):**

```ts
  profile: {
    kind: 'profile',
    itemId: '44444444-4444-4444-8444-444444444444',
    itemKind: 'taste',
    month: '2026-08',
  },
  time_of_day: {
    kind: 'time_of_day',
    /* 2026-08-09 is a Sunday. The querent's own example. */
    localDate: '2026-08-09',
    weekday: 'sun',
    part: 'afternoon',
    shape: 'weekend_close',
  },
```

**Code — replace the `MATERIAL_ORDER` assertion (lines 90-97):**

```ts
    expect([...MATERIAL_ORDER]).toEqual([
      'occasion',
      'reading',
      'unanswered',
      'profile',
      'recurring',
      'orphan',
      'lotus',
      'time_of_day',
    ]);
```

**Code — append these blocks at the end of the file:**

```ts
describe('the two R3 kinds', () => {
  it('puts `time_of_day` LAST, because it is the one material with unlimited supply', () => {
    /*
     * Its key is fresh in every part of every day, and `selectMaterial` walks this list
     * lazily and stops at the first unused key. **A material with unlimited supply placed
     * anywhere but last starves everything below it** and the ladder stops being a ranking.
     * Asserted as an index rather than in prose, because that is the property a reorder
     * would break.
     */
    expect(MATERIAL_ORDER[MATERIAL_ORDER.length - 1]).toBe('time_of_day');
  });

  it('puts `profile` above `recurring`: their life beats their deck', () => {
    expect(MATERIAL_ORDER.indexOf('profile')).toBeLessThan(MATERIAL_ORDER.indexOf('recurring'));
    /* And below `unanswered`, because a question decays and a habit does not. */
    expect(MATERIAL_ORDER.indexOf('unanswered')).toBeLessThan(MATERIAL_ORDER.indexOf('profile'));
  });

  it('keys the day AND the part, so a Monday morning expires by Monday evening', () => {
    expect(materialKey(FIXTURES.time_of_day)).toBe('tod:2026-08-09:afternoon');
    const evening: Material = {
      ...(FIXTURES.time_of_day as Extract<Material, { kind: 'time_of_day' }>),
      part: 'evening',
      shape: 'weekend_close',
    };
    expect(materialKey(evening)).not.toBe(materialKey(FIXTURES.time_of_day));
    /* And a week later is a different key, which is what stops `tod:monday-morning`'s
     * once-in-a-lifetime failure. */
    const nextWeek = timeOfDayMaterial('2026-08-16', 'afternoon');
    expect(nextWeek).not.toBeNull();
    expect(materialKey(nextWeek as Material)).toBe('tod:2026-08-16:afternoon');
  });

  it('keys a remembered fact by the ITEM and the MONTH', () => {
    expect(materialKey(FIXTURES.profile)).toBe(
      'profile:44444444-4444-4444-8444-444444444444:2026-08',
    );
    const nextMonth: Material = {
      ...(FIXTURES.profile as Extract<Material, { kind: 'profile' }>),
      month: '2026-09',
    };
    expect(materialKey(nextMonth)).not.toBe(materialKey(FIXTURES.profile));
  });

  it('GIVES `ProfileMaterial` NOWHERE TO PUT THE REMEMBERED SENTENCE', () => {
    /*
     * **The whole seam, as one assertion.** The `BAHAN:` line sits in the director's
     * UNFENCED header, and `user_memory` is model prose distilled from whatever the querent
     * types — an unlimited number of attempts at the same line, where the Lotus summary
     * (which its note DOES interpolate) is one attempt from six fixed answers.
     *
     * So the type carries no text, `describeMaterial` cannot leak what the object does not
     * hold, and the sentence reaches the reader through F3's fenced memory block instead.
     * **If this assertion is edited to admit a `text` field, the fence is gone.**
     */
    expect(Object.keys(FIXTURES.profile).sort()).toEqual(['itemId', 'itemKind', 'kind', 'month']);
    for (const locale of LOCALES) {
      const brief = describeMaterial(FIXTURES.profile, locale);
      expect(Object.keys(brief.facts)).toEqual(['kind']);
      expect(USER_MEMORY_KINDS).toContain(brief.facts.itemKind);
    }
  });

  it('hands the director three closed tokens for the clock and no date', () => {
    for (const locale of LOCALES) {
      const brief = describeMaterial(FIXTURES.time_of_day, locale);
      expect(Object.keys(brief.facts).sort()).toEqual(['part', 'shape', 'weekday']);
      /* **THE DATE IS IN THE KEY AND OUT OF THE PROMPT.** A reader reciting the date at
       * somebody who already knows what day it is is the register `C-N1b` forbids. */
      expect(materialLine(brief)).not.toContain('2026-08-09');
    }
  });

  it('names every topic and every part distinctly, in both locales', () => {
    for (const locale of LOCALES) {
      const subjects = USER_MEMORY_KINDS.map((itemKind) =>
        MATERIAL_NOTES[locale].profile({
          kind: 'profile',
          itemId: 'x',
          topic,
          month: '2026-08',
        }),
      );
      expect(new Set(subjects).size, `${locale}/kinds`).toBe(USER_MEMORY_KINDS.length);

      const parts = DAY_PARTS.map((part) =>
        MATERIAL_NOTES[locale].time_of_day({
          kind: 'time_of_day',
          localDate: '2026-08-12',
          weekday: 'wed',
          part,
          shape: 'ordinary',
        }),
      );
      expect(new Set(parts).size, `${locale}/parts`).toBe(DAY_PARTS.length);
    }
  });
});

describe('the pure time vocabulary', () => {
  it('derives a weekday without ever touching a `Date`', () => {
    /*
     * The birthday detector's discipline: `getMonth()` on a server in UTC wishes a Jakarta
     * querent a happy birthday a day early, and the same trap eats a weekday on the one
     * material whose entire content is which day it is. Sakamoto's algorithm is arithmetic
     * over three integers and has no timezone to be wrong in.
     */
    expect(weekdayOf('2026-08-30')).toBe('sun');
    expect(weekdayOf('2026-08-31')).toBe('mon');
    expect(weekdayOf('2026-08-09')).toBe('sun');
    /* A leap day, because February is where a hand-rolled calendar breaks. */
    expect(weekdayOf('2024-02-29')).toBe('thu');
    expect(weekdayOf('2000-02-29')).toBe('tue');
    expect(weekdayOf('1900-03-01')).toBe('thu');
  });

  it('agrees with `Date` across a long stretch, which is the only honest oracle', () => {
    /* A `Date` is fine HERE and banned in `material.ts`; a test is where the two meet. */
    for (let i = 0; i < 4000; i += 7) {
      const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      expect({ iso, got: weekdayOf(iso) }).toEqual({ iso, got: WEEKDAYS[d.getUTCDay()] });
    }
  });

  it('refuses a malformed day rather than throwing on a prompt path', () => {
    for (const bad of ['', '2026-8-9', 'yesterday', '2026-13-01', '2026-01-00']) {
      expect({ bad, got: weekdayOf(bad) }).toEqual({ bad, got: null });
    }
    expect(timeOfDayMaterial('nonsense', 'morning')).toBeNull();
    expect(timeOfDayMaterial('2026-08-09', 'noon' as never)).toBeNull();
  });

  it('tiles all twenty-four hours, `late` included, and implements NO quiet hours', () => {
    /*
     * Whether a reader may speak at 03:00 is `eligibility.ts`'s gate; what there would be to
     * say at 03:00 is this. **A detector that quietly refused the small hours would be quiet
     * hours hidden inside a material, in a file the operator cannot switch off.**
     */
    const seen = new Set(Array.from({ length: 24 }, (_, h) => dayPartOf(h)));
    expect([...seen].sort()).toEqual([...DAY_PARTS].sort());
    expect(dayPartOf(2)).toBe('late');
    expect(dayPartOf(23)).toBe('late');
    expect(dayPartOf(8)).toBe('morning');
    expect(dayPartOf(12)).toBe('midday');
    expect(dayPartOf(16)).toBe('afternoon');
    expect(dayPartOf(20)).toBe('evening');
  });

  it('shapes the two days the querent’s own examples name', () => {
    /* "njir, udah senin aja. mager ga lu ngantor?" — Monday morning to noon. */
    expect(shapeOf('mon', 'morning')).toBe('week_start');
    expect(shapeOf('mon', 'midday')).toBe('week_start');
    expect(shapeOf('mon', 'evening')).toBe('ordinary');
    /* "kamu weekend ini kemana aja?" — Sunday afternoon. */
    expect(shapeOf('sun', 'afternoon')).toBe('weekend_close');
    expect(shapeOf('sun', 'evening')).toBe('weekend_close');
    expect(shapeOf('sun', 'morning')).toBe('weekend');
    expect(shapeOf('sat', 'evening')).toBe('weekend');
    expect(shapeOf('wed', 'morning')).toBe('ordinary');
  });

  /**
   * **THE BUG THIS MATERIAL EXISTS NOT TO REPRODUCE, ASSERTED THROUGH THE SHARED CLOCK.**
   * At 23:30 UTC a Jakarta querent is at 06:30 the NEXT morning, and the cron would
   * otherwise pair that hour with `utcDateString()`'s yesterday — shipping *"Monday
   * morning"* stamped Sunday. `resolveChatClock`'s own day/hour arithmetic is phase 1's and
   * is tested there against `Date`; what is asserted HERE is the composition this file
   * depends on.
   */
  it('reads the querent’s own day and part from ONE derivation', () => {
    const at = (iso: string, off: number) => resolveChatClock({ offsetMinutes: off, now: new Date(iso) });

    const jakarta = at('2026-08-30T23:30:00.000Z', 420);
    expect(jakarta.known && { date: jakarta.localDate, part: jakarta.part }).toEqual({
      date: '2026-08-31',
      part: 'morning',
    });

    const utc = at('2026-08-30T23:30:00.000Z', 0);
    expect(utc.known && { date: utc.localDate, part: utc.part }).toEqual({
      date: '2026-08-30',
      part: 'late',
    });

    /* West of Greenwich the day goes the other way. */
    const ny = at('2026-08-31T02:00:00.000Z', -300);
    expect(ny.known && { date: ny.localDate, part: ny.part }).toEqual({
      date: '2026-08-30',
      part: 'evening',
    });

    /* A nonsense offset degrades to `known: false`, so no material is minted. */
    expect(at('2026-08-30T23:30:00.000Z', 5000).known).toBe(false);
  });
});
```

**Impact:** the two round-trip properties (`materialKey` -> `rehydrate`) for the new kinds are
covered by the integration tests in step 9, because `profile:` needs a database.

---

### Step 9: The integration tests

**File:** `src/lib/chat/proactive/detect.integration.test.ts`

**Change:** the `args()` helper, plus two `describe` blocks each pairing the hit with its nearest
negative — this file's stated convention.

**Code — replace the `args()` helper (lines 53-66):**

```ts
function args(userId: string, over: Partial<Parameters<typeof selectMaterial>[1]> = {}) {
  return {
    userId,
    locale: 'id' as const,
    localDate: TODAY,
    lastProactiveAt: null,
    lastUserMessageAt: null,
    now: NOW,
    birthDate: null,
    lastSeenAt: null,
    /*
     * **NULL BY DEFAULT, AND EVERY EXISTING NEGATIVE DEPENDS ON IT.** M8 is last in
     * `MATERIAL_ORDER` and is available in every part of every day, so with an offset set it
     * would answer *every* case in this file that asserts `selectMaterial` finds nothing —
     * turning a suite full of honest negatives green for the wrong reason. Null is also the
     * production default until a browser has reported: no time material, never an error.
     */
    clock: resolveChatClock({ offsetMinutes: null }),
    ...over,
  };
}
```

**Code — append two blocks at the end of the file:**

```ts
// ---------------------------------------------------------------------------
// M7 — something the room already knows about the querent
// ---------------------------------------------------------------------------

describe('M7 — a remembered fact', () => {
  it('finds the first item whose key is free this month, and carries no text', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7');
      await putMemory(tx, userId, [
        { id: 'i-food', kind: 'taste', text: 'biasanya makan malam nasi padang' },
        { id: 'i-work', kind: 'situation', text: 'ada orang di kantornya yang bikin kesal' },
      ]);

      const found = await selectMaterial(tx, args(userId));
      expect(found?.kind).toBe('profile');
      expect(materialKey(found as Material)).toBe('profile:i-food:2026-08');
      /* **The seam, asserted from the database end**: nothing the extractor stored as prose
       * is anywhere in the material the director will be handed. */
      expect(JSON.stringify(found)).not.toContain('nasi padang');
    }));

  it('moves to the next item once this month’s key is spent, and not to the same one again', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7b');
      await putMemory(tx, userId, [
        { id: 'i-food', kind: 'taste', text: 'nasi padang' },
        { id: 'i-work', kind: 'situation', text: 'si bonjeng' },
      ]);
      await makeRun(tx, userId, { materialKey: 'profile:i-food:2026-08' });

      const found = await selectMaterial(tx, args(userId));
      expect(materialKey(found as Material)).toBe('profile:i-work:2026-08');
    }));

  it('comes back to a spent item NEXT MONTH, which is what stops a once-ever opener', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7c');
      await putMemory(tx, userId, [{ id: 'i-food', kind: 'taste', text: 'nasi padang' }]);
      await makeRun(tx, userId, { materialKey: 'profile:i-food:2026-08' });

      expect(await selectMaterial(tx, args(userId))).toBeNull();
      const next = await selectMaterial(tx, args(userId, { localDate: '2026-09-04' }));
      expect(materialKey(next as Material)).toBe('profile:i-food:2026-09');
    }));

  it('says nothing when an item has no text — an id alone is not a fact', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7d');
      await putMemory(tx, userId, [{ id: 'i-empty', kind: 'taste', text: '   ' }]);
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('files an unknown topic under `life` rather than dropping the item', () =>
    withRollback(async (tx) => {
      /* The extractor's vocabulary is another phase's, so a mismatch must cost precision
       * and never the feature. */
      const userId = await makeUser(tx, 'm7e');
      await putMemory(tx, userId, [{ id: 'i-x', kind: 'astrology', text: 'sesuatu' }]);
      const found = await selectMaterial(tx, args(userId));
      expect(found).toMatchObject({ kind: 'profile', itemKind: 'other' });
    }));

  it('rehydrates from the key alone, and loses the subject once the querent deletes it', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7f');
      await putMemory(tx, userId, [{ id: 'i-food', kind: 'taste', text: 'nasi padang' }]);
      const runId = await makeRun(tx, userId, {
        trigger: 'idle_nudge',
        status: 'pending',
        materialKey: 'profile:i-food:2026-08',
      });

      const line = await materialLineForRun(tx, { runId, userId, locale: 'id', now: NOW });
      expect(line).toContain('profile — ');
      expect(line).toContain('topic=food');
      expect(line).not.toContain('nasi padang');

      /* Phase 6's per-item delete, from the material's point of view. */
      await putMemory(tx, userId, []);
      expect(await materialLineForRun(tx, { runId, userId, locale: 'id', now: NOW })).toBeNull();
    }));
});

// ---------------------------------------------------------------------------
// M8 — what time it is where the querent is
// ---------------------------------------------------------------------------

describe('M8 — the clock', () => {
  it('says nothing at all when nobody has reported an offset', () =>
    withRollback(async (tx) => {
      /*
       * **THE NEAREST NEGATIVE, AND THE MOST IMPORTANT ONE IN THE FILE.** An ice-breaker
       * whose entire content is *"it is Monday morning where you are"* is a false statement
       * when we do not know where you are, and being confidently wrong about the clock is
       * the bug R1 exists to delete rather than to move.
       */
      const userId = await makeUser(tx, 'm8a');
      expect(await selectMaterial(tx, args(userId, { clock: resolveChatClock({ offsetMinutes: null }) }))).toBeNull();
    }));

  it('is the last thing tried, and it is what is left when nothing happened', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm8b');
      const found = await selectMaterial(tx, args(userId, { utcOffsetMinutes: 420 }));
      /* NOW is 2026-08-07T12:00Z; +7h is 19:00 on the Friday. */
      expect(found).toMatchObject({
        kind: 'time_of_day',
        localDate: '2026-08-07',
        weekday: 'fri',
        part: 'evening',
        shape: 'ordinary',
      });
      expect(materialKey(found as Material)).toBe('tod:2026-08-07:evening');
    }));

  it('loses to anything that actually happened', () =>
    withRollback(async (tx) => {
      /* The monopoly argument, as a test: M8 has unlimited supply, so the only thing keeping
       * it from eating every run is its position. */
      const userId = await makeUser(tx, 'm8c');
      await makeReading(tx, userId);
      const found = await selectMaterial(tx, args(userId, { utcOffsetMinutes: 420 }));
      expect(found?.kind).toBe('reading');
    }));

  it('reads the querent’s own day and not the caller’s, across the date line', () =>
    withRollback(async (tx) => {
      /*
       * The cron passes `utcDateString()`, which at 23:30 UTC is YESTERDAY for a Jakarta
       * querent already having breakfast. **RECONCILED: the one derivation is phase 1's
       * `resolveChatClock`, read for its `localDate`** (`localStampFor` is cancelled), so the
       * material follows the person rather than the caller. Note that `args.localDate` stays
       * the CALLER's day and only `detectTimeOfDay` reads `clock.localDate` -- two day values
       * in one args object, deliberately; see reconciliation ruling 6.
       */
      const userId = await makeUser(tx, 'm8d');
      const found = await selectMaterial(
        tx,
        args(userId, {
          now: new Date('2026-08-30T23:30:00.000Z'),
          localDate: '2026-08-30',
          utcOffsetMinutes: 420,
        }),
      );
      expect(found).toMatchObject({
        kind: 'time_of_day',
        localDate: '2026-08-31',
        weekday: 'mon',
        part: 'morning',
        shape: 'week_start',
      });
    }));

  it('rehydrates the moment it was minted for, and NOT the moment it is planned in', () =>
    withRollback(async (tx) => {
      /* `brief.ts`'s rule: a run must not change what it is about between mint and plan. */
      const userId = await makeUser(tx, 'm8e');
      const runId = await makeRun(tx, userId, {
        trigger: 'cron',
        status: 'pending',
        materialKey: 'tod:2026-08-09:afternoon',
      });
      const line = await materialLineForRun(tx, {
        runId,
        userId,
        locale: 'id',
        now: new Date('2026-08-10T03:00:00.000Z'),
      });
      expect(line).toContain('time_of_day — ');
      expect(line).toContain('weekday=sun');
      expect(line).toContain('part=afternoon');
      expect(line).toContain('shape=weekend_close');
    }));

  it('answers null on a key it cannot parse rather than failing the run', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm8f');
      const runId = await makeRun(tx, userId, {
        trigger: 'cron',
        status: 'pending',
        materialKey: 'tod:2026-08-09:teatime',
      });
      expect(await materialLineForRun(tx, { runId, userId, locale: 'id', now: NOW })).toBeNull();
    }));
});
```

**Code — the helper these blocks need, and the two imports. Add to the import block at the top:**

```ts
import { materialLineForRun } from './brief';
import { materialKey, type Material } from './material';
import { userMemory } from '@/lib/db/schema';
```

**Code — add the fixture writer beside `makeRun`:**

```ts
/**
 * A `user_memory` row, written directly. **The generator is phase 4's and this suite must
 * not depend on a model call** — F5's own rule for `frequencyMechanic`, one workstream over:
 * the detector's job is to find the row, not to have produced it.
 *
 * The column names follow phase 3's table; if they move, this helper is the one place.
 */
async function putMemory(
  tx: Tx | Db,
  userId: string,
  items: Array<{ id: string; topic?: string; text: string }>,
): Promise<void> {
  const now = new Date();
  await tx
    .insert(userMemory)
    .values({
      userId,
      items,
      inputHash: 'test',
      sourceVersion: 1,
      model: 'test',
      promptVersion: 'test',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userMemory.userId,
      set: { items, updatedAt: now },
    });
}
```

**Impact:** this helper is the **one** place phase 3's exact column names bind into this phase.
If the table's payload column is not `items`, or the extra columns differ, the reconciler fixes
this function and nothing else — `detectProfile` and `profileMaterial` go through
`getUserMemory` and never name a column.

---

### Step 10: Keep `material.ts`'s purity header true

**File:** `src/lib/clientBoundary.test.ts:293-317`

**Change:** the `new Date(` sentinel today covers `eligibility.ts` only. This phase puts the
first calendar arithmetic into `material.ts`, whose header says **PURE… NO CLOCK** — and the
tempting one-line version of a local-day derivation is `new Date(ms).toISOString().slice(0, 10)`.
The fence is what keeps that from landing. **RECONCILED: the sentinel greps `material.ts`'s OWN
SOURCE, so importing `resolveChatClock` — which is allowed a `Date`, in `clock.ts`, where it
belongs — is not what it forbids.** Say so in the comment, or the first person to read the
import concludes the fence is already breached and deletes it.

**Code — replace lines 311-317:**

```ts
    /*
     * **THE CLOCK SENTINEL COVERS TWO FILES SINCE v0.7.1, NOT ONE.** `material.ts` grew the
     * day-part and weekday material R3's ice-breaker needs, and the tempting implementation
     * of a local day is `new Date(ms).toISOString().slice(0, 10)` — which is correct, and
     * which would put a `Date` in the one proactive module every note test and the smoke
     * script import. `weekdayOf` (phase 1) is integer arithmetic for that reason, and this is
     * what keeps it that way.
     *
     * **IT GREPS THIS FILE'S OWN SOURCE, NOT ITS IMPORT GRAPH.** `material.ts` imports
     * `resolveChatClock` from `@/lib/chat/clock`, which constructs a `Date` — that is fine
     * and is the whole point of having one clock module. What is forbidden is a `new Date(`
     * written HERE.
     */
    for (const rel of ['lib/chat/proactive/eligibility.ts', 'lib/chat/proactive/material.ts']) {
      const source = readFileSync(join(ROOT, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect({ rel, date: source.includes('new Date(') }).toEqual({ rel, date: false });
    }

    // The stripper must not have eaten the code it is checking.
    const predicate = readFileSync(join(ROOT, 'lib/chat/proactive/eligibility.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(predicate).toContain('checkEligibility');
```

**Impact:** none on production code. `material.ts`'s existing sentinels (`import 'server-only'`,
`process.env`, `@/lib/db/`) are unaffected — `getUserMemory` is imported by `detect.ts` and
`brief.ts`, which are already `server-only`, and never by `material.ts`.

---

## Verification

**Build:** `export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH && npm run typecheck && npm run build`
(the TypeScript trap: a green typecheck is not evidence.)

**Tests:**
```sh
npm test -- proactive          # material, notes, the pure time vocabulary, the fences
npm test -- clientBoundary
npm test                       # the whole unit project
npm run db:up && npm run test:integration -- detect
npm run test:integration -- mint     # must be unchanged: every thread reads a null offset
```

**Manual check:**
```sh
npm run smoke -- --chat --proactive
```
Eight runs per locale instead of six. Read the two new `BAHAN:` lines specifically:

- the `time_of_day` line must read
  `time_of_day — jam setempat penanya: minggu sore, akhir pekan hampir habis; belum ada bahan lain di ruangan ini [weekday=sun; part=afternoon; shape=weekend_close]`
  — three closed tokens, **no date**, no sentence for a reader to say;
- the `profile` line must read
  `profile — hal yang sudah diketahui ruangan ini tentang penanya: kebiasaan makan penanya [topic=food]`
  — **and must contain no remembered sentence at all**, which is the phase's whole seam.

Then read the bubbles blind. The `time_of_day` run is the one to judge: it should sound like
somebody noticing it is Sunday afternoon, not like a scheduled greeting. The `profile` run will
be thin until phase 5 lands — a topic-level opener with no specific detail — and that is the
expected shape of this phase alone, not a defect.

**Exit criteria:**
1. `MaterialKind` has eight members; the two `AssertNever` guards and the `MaterialNotes`
   mapped type are satisfied without a cast.
2. `npm test` and `npm run test:integration` are green, and `mint.integration.test.ts` is
   green **unchanged**.
3. A `profile` run and a `time_of_day` run each mint, survive `chat_runs_user_material_uq`,
   and rehydrate from `material_key` alone hours later with the same subject.
4. `tod:` re-keys on the next part of the day and on the next week; `profile:` re-keys on the
   next month and never twice in one month.
5. `grep -n "nasi padang" ` over anything `describeMaterial` produces returns nothing — the
   remembered text does not exist in the director's prompt, by construction.
6. With `utcOffsetMinutes` null, behaviour is byte-identical to `main`.

---

## Handoffs

**To Phase 8 (`mint.ts`, `eligibility.ts`, the cron).**
- Reuse the `const utcOffsetMinutes` local this phase adds at `mint.ts:170` for
  `QuietHours.offsetMinutes`; do not read the thread a second time.
- **`orphan` is already the room's floor and now shares that role with `time_of_day`.** After
  any proactive run the last message is a reader's, so `orphan` is available on the next tick
  and `time_of_day` is reached only when the querent had the last word. That is the intended
  alternation. But a querent who never replies leaves `orphan` firing run after run on their own
  unanswered bubbles — a pre-existing property this phase does not introduce and does not fix.
  **If `/admin/chat`'s reply-rate panel shows runs stacking on unanswered reader bubbles, the
  repair is an age or consecutive-run bound on `orphan` in the policy, not a reorder of
  `MATERIAL_ORDER`.**
- **RECONCILED — `time_of_day` IS CAPPED AT ONE RUN PER QUERENT PER LOCAL DAY, IN
  `detectTimeOfDay`.** The original text here said the cap and the gap were what bounded it; at
  `CHAT_PROACTIVE_MAX_PER_DAY = 5` and a one-hour gap that is no longer true, and phase 8's
  defence of five rests on *"the cap is almost never the binding gate — `no_material` is"*, which
  a material with unlimited supply falsifies. `usedTimeOfDayToday` restores that premise: the
  ladder can still speak five times on a day it has five distinct things to say, and at most one
  of them is the calendar. **This brake is what makes phase 8's number honest and it must not be
  removed without moving that number.**

**To Phase 9 (`direct/system.{id,en}.ts`, the rules).**
- **These notes assume rule 11 stops capping a proactive run at *"satu beat, kadang dua"*.**
  Both new materials are openers: an ice-breaker that arrives as one bubble and stops is a
  notification, and *"kamu weekend ini kemana aja?"* wants a second reader to pick it up. **This
  phase changes no rule**; it adds material a one-beat cap will under-serve.
- Rule 11 already tells the director to *use* the `BAHAN:` line — measured, over six live runs
  twice, after the line shipped ahead of the rules and was read as an unexplained header.
  **Neither new kind adds a rule, and both depend on that one still being there.**
- `time_of_day`'s note ends *"belum ada bahan lain di ruangan ini"* / *"nothing else in this room
  is new"*. That clause is what licenses an opener rather than a hunt through the transcript for
  a pretext. If Phase 9 rewrites rule 11 to say the same thing generally, the clause can come out
  of the note — **but not before**, or the director gets a bare weekday and reaches for the
  window.

**To Phase 2 (`<waktu>`, the director's time header).**
- Phase 2's block and this material both put a weekday and a day-part in front of the director,
  and **that is not duplication to remove**: one is ambient (always present, whatever the run is
  about) and one is the subject (present only when the run is *about* the day). **But the words
  must agree.** **GRANTED, AND SETTLED THE OTHER WAY ROUND BY THE RECONCILER:** this phase
  declares no word table at all and imports `CHAT_TIME_VOCAB` from `@/lib/chat/clock`, which
  phase 2 writes. `dayPartOf`'s five divisions are the ones those words describe. A second table
  makes one prompt say *"Monday morning"* on one line and *"siang"* on another; there is now only
  one.

**To Phase 5 (`<ingatan>`).**
- **The other half of this phase's seam.** `ProfileMaterial` names the subject and carries no
  text; the sentence must reach the **voice** through the fenced memory block. §4.2's narrowing
  argument — *the director casts and orders and does not need the detail* — is what this phase
  assumed when it built `ProfileMaterial` without a text field, and the answer Phase 5 is asked
  to write down either way should record that this phase depends on it.
- ~~`PROFILE_TOPICS` is this phase's closed set…~~ **RECONCILED: cancelled.** The closed set is
  phase 3's `UserMemoryKind` and this phase declares none of its own. It is moot for phase 5
  anyway: `<ingatan>` renders `item.text` and nothing else — no `id`, no `kind`, no `lastSeen`
  (invariant 4) — so there is no grouping or labelling for a shared vocabulary to align.

**To Phase 3 / Phase 4 (`user_memory`).**
- Only two properties of an item are load-bearing here: **a stable `id` string that contains no
  `:`**, and a non-empty `text`. The `:` is the key's separator; a uuid or a slug is fine, a
  composite `topic:n` is not.
- **RECONCILED: there is ONE vocabulary and phase 3 owns it.** `USER_MEMORY_KINDS` =
  `habit | taste | person | situation | place | trait | other`; `profileKindOf()` maps anything
  unrecognised or absent to `'other'`, which is what `'other'` is in that set for. It is still
  not a compile-time requirement, and a divergence still costs the director a distinction
  rather than a run. (The cancelled draft named `food, routine, work, people, place, interest,
  life` and filed the unknown under `life`; `work` has no home in the merged set and files under
  `situation` — recorded as a real loss in conflict #13, not fixed by widening a closed set
  three phases index off.)
- If `getUserMemory`'s name or return shape differs, exactly three sites change:
  `detect.ts`'s import, `brief.ts`'s import, and `detect.integration.test.ts`'s `putMemory`.

**Found and deliberately not done.**
- `describeMaterial`'s `profile` arm could carry a `since_days` scalar (how long the room has
  known). It would need a per-item timestamp phase 3 has not committed to, and it is a number the
  director could recite — *"I've known that about you for three months"* is the surveillance
  register `C-D8` bans. Left out.
- `MATERIAL_ORDER` still refuses a score, and now with eight members the refusal is worth more,
  not less. Nothing here proposes one.

---

## Rollback

`git revert` the phase's commit. Nothing here is forward-only: no migration, no column, no
config, no environment variable, no new file. A `chat_runs` row already minted with a
`profile:` or `tod:` key survives the revert harmlessly — `rehydrate`'s `default: return null`
answers an unrecognised prefix with a missing `BAHAN:` line, which is documented as an ordinary
outcome (*"a key written by a future material this deploy does not know about is a run it cannot
describe, not a run it should fail"*), and `planFallback` covers the plan.

To disable the two kinds **without** a revert, delete their two entries from `MATERIAL_ORDER`
and leave everything else in place: the detectors are never reached, the keys are never written,
and `material.test.ts`'s `MATERIAL_ORDER === KINDS` assertion is the one line that then needs
relaxing. That is the cheapest kill switch available and it needs no deploy-time flag —
`CHAT_PROACTIVE_ENABLED=0` already stops all unprompted runs, which is the real one.

---

## Implementation round 1 — 2026-08-30

Written while building the phase against the tree as phases 1–6 actually left it. Every
deviation from the body above is here, with what it cost and what the alternative was.
**Where this section and the body disagree, this section is what shipped.**

### 1. The narrower is `isUserMemoryItem`, not a structural read

The reconciliation (Requires → Phase 3) ruled that `detectProfile` *"narrows STRUCTURALLY
and applies no regular expression"*, on the stated ground that importing
`USER_MEMORY_ITEM_ID_RE` *"would make the fixtures red for a reason that is not about this
phase."* **That ground is spent, and the ruling is reversed here.**

Phases 5 and 6 both landed on `isUserMemoryItem` as the one narrower over `user_memory.items`
— `context.ts:280` before an item reaches `<ingatan>`, `memoryView.ts:113` before it reaches
`/account` — and **phase 6 reversed its own plan's instruction to duplicate the regex**, in
its own header, citing this in those words: *"it makes what the querent reads and what the
readers were told the same set, which is the one property this whole surface exists to
provide. A looser narrower here would list a line the prompt never sees; a stricter one would
hide a line the prompt does see."*

A third, looser narrower in this phase breaks that sentence from the other end: the director
would be cast on a subject the voice's `<ingatan>` filtered out and `/account` never listed —
**a run about a fact nobody downstream can see**, which is precisely the failure
`profileMaterial`'s re-read (§ "Both rehydrate from the key alone") was built to prevent, one
step earlier in the pipeline.

The `:` check the reconciliation wanted is not dropped, it is strengthened:
`USER_MEMORY_ITEM_ID_RE` is `/^[0-9a-f]{12}$/`, so an id that could make
`profile:<id>:<month>` ambiguous is mechanically impossible rather than refused by an
`includes(':')` somebody could delete.

The cost is exactly the one the reconciler named and it is paid in the test fixtures: they
carry real twelve-hex ids (`f00d…`, `b04d…`) instead of readable `i-food`. A constant beside
them says which is which.

*Rejected:* structural in `detect.ts` and `isUserMemoryItem` in `brief.ts` — the worst of
both, since a run would mint and then silently lose its `BAHAN:` line at plan time.

### 2. The clock's own tests go to `clock.test.ts`

Step 8 lists a `describe('the pure time vocabulary')` block in `material.test.ts` covering
`weekdayOf`, `dayPartOf` and `resolveChatClock`. **Reconciliation ruling 1 moved all three to
`@/lib/chat/clock`, so their tests move with them** — `clock.test.ts` already tests
`weekdayOf`, and a leap-day oracle filed under *materials* is a test the next person looking
for it will not find. The Sakamoto cases, the 4000-day `Date` oracle and the malformed-string
refusal are added there.

`material.test.ts` keeps what is this phase's: `shapeOf`, `timeOfDayMaterial`, the two
`materialKey` arms, the two `describeMaterial` arms, `MATERIAL_ORDER`'s two positions, the two
note renderers — **and the composition test**, because *"the day and the hour come from ONE
derivation"* is a claim about how this phase uses the clock rather than about the clock.

### 3. `material.ts` imports two names, not five

Step 1's import line names `DAY_PARTS, WEEKDAYS, dayPartOf, resolveChatClock, weekdayOf`.
Only `DAY_PARTS` and `weekdayOf` are used in that file; `WEEKDAYS` is the notes' (they index
`CHAT_TIME_VOCAB` with it) and `dayPartOf` / `resolveChatClock` are nobody's here. Step 10's
sentinel comment is written against `weekdayOf` accordingly — the point it makes is unchanged
and is the one that matters: **the sentinel greps this file's own source, so importing a
module that constructs a `Date` is not what it forbids.**

### 4. Corrections to code the plan could not compile

Transcription-level, listed so a reviewer diffing against the body does not read them as
drift: `usedTimeOfDayToday` takes the handle first (the body's call site omitted `db`);
`partOf` is `dayPartOf` everywhere; the note-distinctness test maps `kind`, not the cancelled
`topic`; `USER_MEMORY_KINDS` and `WEEKDAYS` are imported from their real modules rather than
from `./material`; `putMemory`'s rows are `UserMemoryItem[]` and carry `lastSeen`, which
`isUserMemoryItem` requires; the M8 integration overrides pass `clock:
resolveChatClock({ offsetMinutes: 420, now })` rather than the cancelled `utcOffsetMinutes`.

The **Verification** section's two expected `BAHAN:` lines were written against the cancelled
`PROFILE_TOPICS` and read `[topic=food]` / *"kebiasaan makan penanya"*. Under ruling 4 the
token is `UserMemoryKind`, so the profile line reads
`profile — hal yang sudah diketahui ruangan ini tentang penanya: apa yang disukai penanya
[kind=taste]`. The `time_of_day` line is as written.

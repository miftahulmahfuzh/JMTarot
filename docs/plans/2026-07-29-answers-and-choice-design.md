# Your answers, and the choice verdict — design

**Date:** 2026-07-29
**Branch:** `feat/answers-and-choice`
**Rulings taken:** Miftah, 2026-07-29, on a phone (three answered questions below).

Two independent halves in one branch, because both were reported together and
neither touches the other's files:

- **Part A** — `/account`'s *Your answers* becomes a reveal-and-edit list.
- **Part B** — every reading gets 30% shorter, a multiple-choice question gets
  answered with **one** option, and that option gets the highlighted box the
  yes/no verdict already has.

---

## Part A — Your answers

### A0. What is being reversed, and by whom

`AccountAnswers`'s header says, in a box:

> **THE PAGE SHOWS WHICH ANSWERS EXIST AND NEVER WHAT IS IN THEM** … V8's answer
> to "until asked" is that it is never asked.

That is now reversed. **This is an amendment rather than a violation**, and the
distinction is worth writing down because the next session will read the old
header first: reconciliation §7.3's own requirement was *"show which answers
exist without showing their decrypted text **until asked**"*. V8 chose to make
"asked" unreachable. A tap on a question **is** asking, so the requirement is
being satisfied more completely, not bent.

What does **not** change:

- **Nothing is decrypted on a render path.** `/account`'s server component still
  calls `answerPresence`, which reads `answer_text IS NOT NULL` and decrypts
  nothing. `worst_thing` reaches a browser only in the response to a fetch the
  querent caused by tapping that one row.
- **`queries/onboarding.ts` stays the only module that encrypts or decrypts**
  this column. The new read is a function in that file.
- **A skip is `answer_text IS NULL`**, never an encrypted empty string. An edit
  to whitespace is a skip, which `normaliseAnswer` already decides.

**L13 is the rule that genuinely dies here.** *"The six are deletable and NOT
editable; the three facts are the other way round."* Its stated reason was that
editing them "turns a rite into a settings page and drains the conceit", and that
"the reader's sense of you changes under you". Miftah's ruling is that a querent
must be able to see and fix what they said. The conceit is protected the way V8
already protected it — the section sits below the persona, the rows are labelled
by question, and nothing is revealed until tapped.

### A1. The list

The row becomes one button, full width. Left: the question's own title from
`onboarding.q.<key>.title`, which the catalog already has. Right: a state icon
where the *Clear* button used to sit.

- answered → a check glyph
- not answered, or cleared → an empty circle

**The icon carries an `aria-label` and the visible state words are deleted.**
An icon with no accessible name is a row that says nothing to a screen reader,
and the two words being removed (`Saved` / `Not answered`) are exactly the
strings that name the state. So they move from text nodes to
`account.answers.state.{answered,empty}` and are read, not shown.

Deleted from both catalogs: `account.answers.answered`, `.empty`, `.cleared`,
`.clear`, `.clearing`, `.clearAria`.

**The `cleared` state disappears with its string, and that is correct now.** V8
tracked "just cleared" in component state for the life of the page, because a
row reverting to *Not answered* read as if the button had done nothing. With a
modal the feedback is immediate and local — the sheet closes, the icon changes —
so there is nothing to distinguish.

### A2. Reveal is a fetch, never a render

New: `GET /api/onboarding/answer/[key]`, beside the `DELETE` that is already
there.

```
GET  /api/onboarding/answer/worst_thing
  -> 200 { key, freeText: true,  text: "…" | null, choice: null, skipped: false }
  -> 200 { key, freeText: false, text: null, choice: "grey", skipped: false }
  -> 400 unknown key
  -> 401/403/429  onboardingGate
  -> 500
```

Rules on it:

1. **One key per request, and there is no bulk read.** A `GET /api/onboarding/answers`
   returning all six would put `worst_thing`'s plaintext in a response the
   querent asked for by opening a page, which is the render-path decryption this
   design is keeping out.
2. **`cache-control: private, no-store`.** It is the most sensitive response
   this app produces.
3. **`runtime = 'nodejs'`** — `decryptField` is `node:crypto`.
4. **An undecryptable row reads as a skip**, which is `getAnswers`' documented
   asymmetry: `decryptField` returns null on a rotated key or a wrong AAD, and
   roadmap §8 already requires the app to work without any given answer.
5. **The failure path logs no driver error.** A postgres error quotes its bound
   parameters and this statement binds a user id and a question key; the answer
   itself is never a parameter of a `select`, but the rule is unconditional in
   this codebase and this is not the file to make an exception in.

New query, in `queries/onboarding.ts`:

```ts
getAnswer(db, userId, key): Promise<OnboardingAnswer | null>
```

Reuses `answerAad(userId, key)` and `decryptField`, so the AAD is still
constructed in one file.

### A3. Two modal shapes, because there are two kinds of question

`isFreeText(key)` already splits them, and it is the split that decides the
control:

| keys | control | cap |
|---|---|---|
| `best_thing`, `worst_thing`, `most_loved`, `willow_wish` | textarea | `ONBOARDING_MAX_ANSWER_CHARS` = 500, counted client-side |
| `color` | three plates (`LOTUS_COLORS`) | closed set |
| `introversion` | slider, `INTROVERSION_STEP` = 5, 0–100 | closed set |

**The client counts and the server refuses.** `normaliseAnswer` throws on a
closed value outside its set and on prose sent to a closed question, and
`AnswerBody`'s zod schema rejects an over-cap string before anything is
sanitized. None of that changes; the modal is a second caller of the same
boundary.

### A4. Both writes already exist

- **Edit** → `POST /api/onboarding/answer`, unchanged. Its own comment says
  *"It earns its place on the EDIT path, from /account."* This is that path
  arriving. `upsertAnswer` is idempotent on `(user_id, question_key)`.
- **Remove** → `DELETE /api/onboarding/answer/[key]`, unchanged except for A6.

**No new write route, and that is the point.** A second endpoint writing
`answer_text` would break the property `queries/onboarding.ts`'s header sells:
that "does anything write this column in plaintext?" is answered by reading one
file.

### A5. The sheet

`CardDetail`'s bottom-sheet idiom, and **`returnFocusTo` as a prop, never
`document.activeElement`**. Safari does not focus a `<button>` when it is
tapped, so `activeElement` on the way in captures `<body>` on the one platform
this app is built for, and restoring focus to it drops the querent at the top of
the document. `AccountMenu` is the precedent: the opener is a ref owned by the
row.

The list is six rows and the sheet's opener is a row in it — the same shape as
`GalleryGrid`, where this was proven with loop 5 rather than assumed.

### A6. The Inner Lotus regenerates on the next open — and the Lotus block does not wait

**Ruling: defer the persona only.**

Two artifacts are built from the six answers and they have different
obligations:

| artifact | who reads it | when it regenerates |
|---|---|---|
| `lotus_avatars.summary` | **every reading prompt** | immediately, on the write path — unchanged |
| `personas.body` | the Inner Lotus block on `/account` | next `/account` open |

**The summary cannot wait, and the reason is erasure rather than freshness.** The
deleted material is *paraphrased* inside `lotus_avatars.summary`, which
`getLotusBlock` reads into every reading. Deferring it means a reading taken
between the edit and the next `/account` visit is still generated from the answer
the querent just deleted — and `/privacy` clause 3 promises otherwise, twice, in
both locales. `deleteAnswer`'s route comment already states this as
*"a delete button whose effect stops at one table is worse than no delete
button"*.

So the change to the two write routes is exactly one line each:

- `DELETE …/answer/[key]`: **drop `generatePersona`**, keep `generateLotus`.
- `POST …/answer`: keep `generateLotus`. Never had a persona call.

Net: one model call per edit instead of two, and **zero** persona calls for a
querent who edits three answers before reopening the page.

#### A6.1 The read path has to bypass `PERSONA_MIN_AGE_SECONDS`

`isPersonaStale` returns false when the hash differs but the row is younger than
the floor. `personaInputHash` covers the answers, so an edit moves the hash — and
the floor would then suppress the very regeneration the querent just caused.
CLAUDE.md states the rule in capitals: **it must never guard a user-caused
regeneration.** V8 satisfied it by calling `generatePersona` directly from the
write path; deferring means the *read* path now has to tell the two apart.

**The signal is two `updated_at` columns and there is no new state.**

```
userEdited  =  max(onboarding_answers.updated_at)  >  personas.updated_at
```

Both columns already exist and both are already maintained by hand —
`upsertAnswer` and `deleteAnswer` set theirs inside `onConflictDoUpdate` /
`update`, because Drizzle's `$onUpdate()` does not fire in a conflict branch, and
`upsertPersona` sets its own for the same reason. Nothing new to keep in step.

- New query: `answersUpdatedAt(db, userId): Promise<Date | null>` — one
  `max(updated_at)` aggregate, joining the `Promise.all` in `personaMaterial`
  that already reads this table.
- `isPersonaStale` gains a fourth arm: **a user edit is stale regardless of
  age.** Stated as its own clause, above the age comparison, so the floor is
  visibly not consulted.
- **The route regenerates synchronously on a user edit, not serve-stale.** The
  existing `row, stale` branch serves the old body and refreshes in `after()`,
  which would mean the querent refreshes once and *still* reads the old
  paragraph. That is the reported bug's shape, not its fix. A user edit takes the
  `no row` branch's behaviour: generate, then respond. The block already renders
  a `Reading…` state, so waiting is the designed experience rather than a new
  one.

#### A6.2 The idempotence hole, and the one line that closes it

`generatePersona` returns `unchanged` without touching `updated_at` when the hash
matches. If a querent edits an answer **to the same value**, the hash is
identical, the row is never touched, and `answersUpdatedAt > personas.updatedAt`
stays true **forever** — a regeneration attempt on every page view. Each is two
indexed reads and no model call, so it is cheap rather than expensive, but a
dirty flag that never clears is a bug that will be found later and misdiagnosed.

`touchPersona(db, userId)` — a bare `update … set updated_at = now()` — called
from the route when the outcome is `unchanged` and the run was user-caused.

**No schema delta for Part A.** Deliberate: CLAUDE.md routes new columns through
the reconciliation, and this half needs none.

### A7. Events

Declared here per S-D13 (*"every other workstream declares its events in its
plan"*), and folded into `events.ts` by transcription rather than by
paraphrase — the mistake S5 recorded.

```
account.answer_revealed  { question_key: string }
account.answer_edited    { question_key: string; length: number }
account.answer_cleared   { question_key: string }
```

**`length`, never text, and `question_key` is a closed set.**
`onboarding.question_answered` already carries exactly `{ question_key, length }`
and this is the same fact recorded from a different screen. `events` rows survive
account erasure with `user_id` nulled, which is only honest because
`sanitizeProps()` strips everything identifying — a revealed answer's *text* in a
prop would end that.

`account.answer_revealed` carries no length: a reveal is not a write, and the
length of `worst_thing` is a fact about its content.

---

## Part B — the prompts

### B1. Thirty percent shorter, four paragraphs kept

**Ruling: keep four paragraphs, tighten them.** The alternative was dropping the
synthesis paragraph, and `services.id.ts` forbids it in its own voice —
*"EMPAT paragraf, bukan tiga. Paragraf keempat wajib ada; tanpa penyatuan itu,
bacaan ini cuma tiga keterangan kartu yang berdiri sendiri."*

`LENGTH_BUDGET` × 0.7, both locales, ceilings **and** floors:

| service | maxParagraphWords | minTotal | maxTotal |
|---|---|---|---|
| `daily` | 55 → **39** | 50 → **35** | 115 → **81** |
| `spread3` | 40 → **28** | 105 → **74** | 155 → **109** |
| `yesno` | 70 → **49** | 30 → **21** | 50 → **50** |

**The floor scales too, and it has to.** A 105-word floor under a 4 × 28 = 112
ceiling leaves a 7-word band, so the smoke script would fail on correct output —
which is the one thing `budget.ts` says a check must never do.

Sentence counts come down with the ceilings, because the ceiling is the control
and a sentence count that cannot be met is noise:

- `daily` 2–4 → **2–3** sentences
- `spread3` 2–3 → **1–2** sentences
- `yesno` 3–4 → **2–3** sentences

**`MARGARET_MULTIPLIER = 1.3` is untouched.** Her extra length is a fact about
the reader, so it scales with the base: spread3 becomes 28 × 1.3 = **36**, which
is 30% below her current 52. Scaling the multiplier as well would cut her twice.

**`MAX_TOKENS` is untouched, and that is not an oversight.** `services.ts` calls
those numbers runaway guards at roughly double the target, *"because a reading
cut off mid-sentence is far worse than a few unused tokens"*. Lowering them buys
nothing — the word ceiling is the length control — and it would make the
`gpt-5.6-luna` failure mode worse, where reasoning tokens come out of the same
budget and roughly two readings in nine come back blank.

The smoke script asserts against `budgetFor`, so `npm run smoke -- --all`
re-measures all eighteen with no second copy of any number.

### B2. A multiple-choice question gets one option

New rule, in **`services.{id,en}.ts`** and not in the base contract. It reads as
a base-contract rule and is not one:

- It applies to `daily` and `spread3` and **must not** apply to `yesno`, whose
  answer is already forced by `effectiveYesNo()`. Two answer boxes on one reading
  is worse than none.
- The base contract is shared with the three side prompts (gist, summary,
  frequency verdict), which read no question at all.

One `CHOICE_RULE_ID` / `CHOICE_RULE_EN` const per locale file, interpolated into
the two cases. What it says:

1. If `<pertanyaan>` offers two or more explicit options, **choose exactly one.**
   Never both, never either, never "it depends", never "whichever feels right".
2. The cards choose; the reader reports. Keep the register — this is not advice.
3. **Name the chosen option in the prose.** The box is chrome; a querent whose
   box failed to render must still be able to read the answer.
4. Emit it as a machine line **first**, then a blank line, then the reading:

```
PILIHAN: Ayam

Yang udah lewat — The World (terbalik) …
```

5. No options in the question → no marker line, reading starts directly.

**`PILIHAN:` is one token in both locales**, the same call R17 made for
`<pertanyaan>` and `<riwayat>`: one thing to parse, one thing to test, and no way
to get a locale/token pairing wrong. It is model-facing vocabulary, so it lives
with the prompt layer and never in the message catalog.

Both `base.*` files stay byte-identical; `services.*` change, so
`promptVersion`'s hash moves for `daily` and `spread3` and
`__snapshots__/build.test.ts.snap` is regenerated in the same commit.

**`yesno` asked a choice question is a pre-existing wrong answer and stays one.**
"ayam atau ikan" on the yes/no service gets `Ya`, which is nonsense. Out of
scope; recorded so it is not mistaken for something this change caused.

### B3. Model picks, code validates

**Ruling: the box can only ever contain the querent's own words.**

New pure module, `src/lib/reading/choice.ts` — **no `server-only`**, because both
the browser and the `defer()` block run it, and no `process.env`:

```ts
CHOICE_MARKER      = 'PILIHAN:'
CHOICE_MAX_CHARS   = 40      // a box, not a sentence
MARKER_SCAN_LIMIT  = 96      // how far in we look before giving up

splitChoiceMarker(text): { choice: string | null; body: string; pending: boolean }
validateChoice(choice, question): string | null
```

`validateChoice` is the guarantee, and it is mechanical for the reason V2's
`namesIn` is mechanical — *"the prompt rule alone produced 'Pulan' for The
Moon"*. It returns null unless the candidate is:

- non-empty and ≤ `CHOICE_MAX_CHARS`;
- found in the sanitized question, **word-bounded and case-insensitive**;

and when it matches it returns **the slice of the question**, not the model's
copy. So the rendered box is literally a substring of what the querent typed. A
prompt injection cannot put arbitrary text in a highlighted box on the public
`/s/` page, because the only text that can appear there is text the querent
already wrote.

`question === null` → no box. There is nothing to have chosen between.

#### B3.1 Where it runs — twice, from one function

**There is no server-side stream transform, and there was nearly one.** The
tempting design puts a transform between `gated.stream` and `teeReading` so the
marker never crosses the wire. It cannot work: the client would then have no way
to learn the choice, because it arrives long after the response headers, and the
draw screen is where the querent actually reads their reading.

So the marker crosses the wire and **both consumers strip it with the same pure
function**:

- **`Draw.tsx`**, incrementally, in the one place it reads the stream. It holds
  leading bytes while they are still a prefix of the marker (`pending: true`) and
  releases them as soon as the line is decided — so the marker never renders.
- **`/api/reading`'s `defer()` block**, once, over the finished
  `outcome.body`. The stripped body is what reaches `persistReading`,
  `extractGist` **and** `detectCallback`; the marker must not reach
  `readings.body`, for the same reason `[Bacaan terputus…]` must not — W5 would
  quote it back at the querent in a later reading as if the reader had said it.

`teeReading` is untouched, which is the reason this shape was chosen: the two
branches of that fan-out have independent queues and coupling them was already
paid for once.

**The failure mode is a client bug rendering `PILIHAN: Ayam` above a reading**,
so `Draw.tsx`'s incremental path gets a test that feeds one known body in **every
possible chunk split** and asserts the marker never appears in any intermediate
render. Chunk-boundary bugs do not survive that and do not show up any other way.

#### B3.2 Storage and the surfaces

- **Schema:** `readings.choice text` — nullable, no default. Migration
  `0008_v11-readings-choice.sql`, generated with `drizzle-kit generate` and never
  `push`.
- `ReadingDetail` (`lib/history/types.ts`) and `PublicReading`
  (`lib/share/types.ts`) each gain `choice: string | null`. Both are
  client-reachable, so neither acquires a `@/lib/db` specifier — not even as
  `import type`.
- **`ReadingView` renders one box or the other, never two:**
  `reading.verdict` first, then `reading.choice`. A yes/no reading has a verdict
  and no choice by construction (B2 excludes the service), so the ordering is
  belt to that brace.
- **The box reuses `.verdict`'s styling.** It is the same object doing the same
  job, and the querent's praise was for that object.

#### B3.3 The choice is never translated

`readings.body` is translated and `readings.question` is not — every surface
shows the question as typed. **The choice is a fragment of the question, so it
follows the question.**

This is the one thing about the box that will look like an omission. It is not:
translating it would mean rendering `Chicken` in a box above prose that quotes
`ayam`, and it would mean `validateChoice`'s guarantee — that the box is a
substring of the question — stops being checkable. Documented beside
`ReadingView`'s rule 4, which is the invariant it sits next to.

#### B3.4 Events

```
reading.choice_offered  { reading_id: string; service_id: string; valid: boolean;
                          length: number }
```

`length`, never the chosen word — it is a fragment of the querent's question and
`sanitizeProps()`'s promise covers exactly this. **`valid` is the number that
matters**: it is the measured rate at which the model names something that is not
in the question, and it is the only way to see whether the prompt rule is working
in production. V2's *"if the measured invalid rate exceeds ~2%, fix the prompt,
not the architecture"* applies verbatim.

---

## Verification

| loop | what it answers |
|---|---|
| 1 — vitest | `splitChoiceMarker` over every chunk split; `validateChoice`'s word boundaries and its rejections; `isPersonaStale`'s new arm with a negative control; the catalog key set |
| 2 — integration | `getAnswer` round-trips through `encryptField`; a skip reads as a skip; `answersUpdatedAt`; `touchPersona` |
| 4 — `getBoundingClientRect` | the six rows and the sheet at 320/360/390. The icon must clear 44px. |
| 5 — CDP | tap a row, read the sheet, edit, confirm the request body agrees with the rendered value; refresh and confirm the persona actually changed |
| smoke | `npm run smoke -- --all` — eighteen readings against the new budget, plus hand-written choice questions in both locales |

**The check that matters most for Part B is a real choice question, read.** No
lint can tell whether a 28-word paragraph reads as terse or as clipped, and
reconciliation §8's *"no lint can tell whether a page is worth reading"* binds
this exactly as it bound the lore pages. The smoke script's blind read is the
instrument: if three readers stop being distinguishable at 28 words, the fix is
the persona paragraphs, not the number.

## Known costs, accepted

1. **28 words may read clipped, and Margaret at 36 is the one to watch.** The
   English `spread3` calibration was already unconverged at 157–243 words; this
   moves the target without converging it.
2. **The marker crosses the wire.** Mitigated by one pure function with two
   callers and a chunk-split test; not eliminated.
3. **`length_ms` for a choice reading is unchanged** — no server transform means
   TTFT is still measured at the model's first byte. The querent sees their first
   *prose* byte a few characters later. Not worth a second column.
4. **A `yesno` reading of a choice question still answers `Ya`.** Pre-existing.
5. **`account.details_viewed` still reports `from: 'direct'`** — V8's open item,
   untouched.

---

## What the implementation changed about this design

Written after the fact, because three parts of the plan above were wrong and the
failure mode of a design document is somebody reading it as the record.

**1. `MULTI_OPTION` IS NEW AND B3's GUARANTEE WAS INSUFFICIENT.** §B3 said the box
"can only ever contain the querent's own words" and treated that as the whole
guarantee. Measured live: three of eighteen readings answered the marker with a whole
clause — `PILIHAN: makan ayam atau ikan nanti siang` — which is a word-bounded
substring of the question, is inside the 40-character cap, and would have rendered
`makan ayam atau ikan` in the box. The guarantee had to become **one of the querent's
OPTIONS**, not merely their words.

**2. THE EVENTS PLAN WAS REFUSED BY THE CODEBASE AND THAT WAS RIGHT.** §B3.4 and §A7
declared four names. `events.test.ts` caps the taxonomy and says the answer is
"almost always a prop on one of the five above". `reading.choice_offered` became
`choice` + `choice_length` on `reading.completed` — a better query shape, numerator
and denominator in one scan. The two answer-write names became one
`account.answer_changed`. `account.answer_revealed` was dropped: request volume in the
platform log answers the privacy question and a look-and-close changes no decision.
**One name added for a change touching two features.**

**3. `answersUpdatedAt` NEEDED A HAND-WRITTEN CONVERSION.** §A6.1 said the signal was
"two `updated_at` columns and there is no new state", which is true, and implied the
read was trivial, which it was not: `sql<Date>` over `max(timestamptz)` returns a
string and the comparison silently misbehaved. See CLAUDE.md.

**4. `readings.choice` INHERITS `include_question`'s CONSENT.** Not in the plan at all.
The choice is a slice of the question, so `publicReadingQuery` selects both columns
under one ternary — otherwise a link that excluded the question would publish a
fragment of it through the field that reads as a verdict.

**5. THE 30% CUT LANDED FOR `spread3` AND NOT FOR `daily`.** §B1 treated the scaling as
mechanical. It is, and the model does not obey it evenly: `spread3` came in at 80–111
words against the old 130–200 with the synthesis intact, while Margaret's `daily`
wrote 53, 84 and 67-word openings against a 51 ceiling on identical hands. Recorded in
CLAUDE.md as unconverged rather than papered over.

**6. THE PROMPT RULE NEEDED TWO REVISIONS AND BOTH WERE MEASURED.** "Copy the option
exactly" produced whole clauses; adding *"ONE option, as short as it can be — if `atau`
is still on that line you have not chosen"* fixed the Indonesian half. "Name it in the
prose" produced readings that named the option they did **not** pick; it is now "name
it in your LAST paragraph".

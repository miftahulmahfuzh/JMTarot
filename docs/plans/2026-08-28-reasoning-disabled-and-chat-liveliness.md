# Task 4 — empty readings, glm-5.3, and a livelier room

**Card:** miftahulmahfuzh/JMTarot#4 · round 1 · 2026-08-28
**Branch:** `task/4-readings-return-empty-in-production` off `origin/main` @ `5d24ecf`

---

## 1. The bug, and what actually caused it

**Reported:** every card reading comes back empty. Found the night of 2026-08-27.
**Hypothesised on the card:** z.ai changed models.

**Measured, against the live production key, 2026-08-28.** The production deployment is
six days old and `● Ready` — nothing shipped when the behaviour changed. z.ai turned on
**reasoning-by-default for `glm-4.6`**, and two independent facts about this codebase turn
that into an empty page:

1. **`anthropic.ts` cannot see reasoning output.** The streaming path (`:147`) yields only
   `content_block_delta` where `delta.type === 'text_delta'`; the buffered path (`:197`)
   keeps only `block.type === 'text'`. A `thinking` block is neither, so it is discarded.
2. **Reasoning is billed from the same budget as the prose.** `MAX_TOKENS` is
   `{daily:500, spread3:650, yesno:350}`. In a non-streaming probe the thinking block alone
   consumed all 650 and truncated mid-word — the response carried **no `text` block at all**.

Streamed, on the real wire:

| Request | Events | Text the app would render |
|---|---|---|
| `glm-4.6`, exactly as production sends it | **552** `thinking_delta`, 97 `text_delta` | 295 chars, truncated |
| `glm-4.6` + `thinking:{type:'disabled'}` | 0 thinking, 132 `text_delta` | 417 chars, `end_turn` |

`src/lib/llm/types.ts:14-28` predicted this exact failure for the GPT-5 family and named
the symptom precisely: *"will spend all 650 on reasoning and return an EMPTY string."*
The prediction was right; only the provider was wrong.

### The second casualty: the moderation gate has been failing open

`glm-4.5-flash` at 350 tokens returns **329 thinking deltas, 19 text deltas, 66 truncated
chars** — not parseable as the classifier's JSON verdict. `gate.ts:239` documents the
consequence: *"classifier silent + blocklist CLEAN → fail OPEN, the reading proceeds."*

So W7's gate has been effectively off for as long as this has been live, silently, with
nothing alerting. It is fixed by the same one-line change, because every call site goes
through the same adapter.

---

## 2. Approaches considered

| # | Approach | Convention | Scope | Verifiability | Reversibility | Verdict |
|---|---|---|---|---|---|---|
| A | Send `thinking:{type:'disabled'}` on every request | matches `OPENAI_REASONING_EFFORT=none`'s existing precedent | one file, two call sites | measured on the wire, before and after | one line | **WINNER** |
| B | Accumulate `thinking` separately and raise `MAX_TOKENS` | no precedent | touches the length control, which is the product | blind read would move | multi-file | rejected |
| C | Switch model to glm-5.3 | — | — | — | — | rejected: **does not fix it** |

**Why B lost.** `MAX_TOKENS` is a runaway guard and `LENGTH_BUDGET` is the length control
(`budget.ts:22`). Raising the guard to make room for reasoning we then throw away pays for
tokens nobody reads and moves a number CLAUDE.md says not to move.

**Why C lost, and this is the important one.** Measured: `glm-5.3` *also* reasons by
default, spending 569 output tokens on one paragraph — over the `yesno` ceiling of 350.
Swapping the model without A would have left every reading blank and looked like a fix.

**Why this is not an env var.** `CHAT_PLANNER_MODEL`'s rule in CLAUDE.md: a knob whose only
effect is letting somebody re-break every reading at 2am and never notice. Reasoning tokens
always come out of the prose budget here; there is no setting of this the app wants.

---

## 3. glm-5.3

The card says replace `glm-4.6` → `glm-5.3` and `glm-5.2` → `glm-5.3`.

**No model name is hardcoded in the app.** `chatModel()` and `adminModel()` read
`process.env` and fall back to `LLM_MODEL`; the live values are Vercel environment
variables. So the code side of this change is: a `glm-5.3` row in `prices.ts`, the
`.env.example` reference, and the prose comments that name the old models.

**Ambiguity call (4c).** *"Replace all glm-4.6 to glm-5.3"* could mean "and change
production now". The narrower reading — ship code that supports and documents glm-5.3, and
leave the cutover as an explicit env change — is what is built here, for two reasons that
are evidence rather than caution:

- `LLM_MODEL`, `LLM_PROVIDER` and `LLM_BASE_URL` are typed **Sensitive** in Vercel. Their
  values cannot be read back by CLI or dashboard, so a change is not reversible from here.
- glm-5.3 emitted **markdown headings and an emoji** (`# The Moon 🌙`) into reader prose in
  testing. That needs `npm run smoke -- --all`'s blind read before it reaches a querent,
  and the readings are already fixed by §2 without it.

The other reading — cut production over in this commit — is recorded here as the one that
lost, and it is one comment on the card away from being done.

---

## 4. A livelier room

The card says the room only gives ~2 responses and asks for 4–6, with reader↔reader,
reader↔user, and a reader opening a new subject.

**The cap was never what limited it.** `CHAT_MAX_BEATS_DEFAULT` is already `4`. The limit is
the director's own prompt, `system.en.ts:93` / `system.id.ts:134`:

> At most 4 beats. **ONE or TWO is the ordinary answer.** … Three only when there really are
> three different things. 4 almost never. If you are unsure whether a THIRD beat is needed,
> it is not.

That is the "2". Raising the constant without rewriting rule 1 would have changed nothing —
which is exactly the trap the card would have walked into.

### What changes, and the ruling it reverses

`caps.ts` currently says, in as many words: **"LOWER IT TO MAKE THE ROOM QUIETER, NEVER RAISE
IT TO MAKE THE ROOM LIVELIER"**, and records `4` as `[R19]`, Miftah's own ruling. This task is
Miftah reversing it. Recorded rather than quietly overwritten, per this repo's convention for
every other reversed ruling (L13, VD9):

- **`CHAT_MAX_BEATS_DEFAULT` 4 → 6.** The card's number.
- **`MAX_BEATS_PER_READER` 2 → 3.** The "monologue" argument was written against a 4-beat cap,
  where 3 of 4 is 75% of the run. At 6 it is 50%, and the no-adjacent-repeat rule still stands.
  Left at 2, `A B C A B C` becomes the *only* legal six-beat shape, which is its own rigidity.
- **Rule 1 rewritten in both locales** to make three or four beats ordinary and to name the
  three interaction kinds the card asks for.

### What deliberately does not change

- **No seventh `BeatIntent`.** `types.ts:78` says adding a member is a reconciliation question,
  not an authoring convenience. "Start a new topic" is reachable today as `ask` or `react`
  carrying an `angle` that names a new subject, and the prompt is changed to say so.
- **`C-R6`/`C-R7` hold: a zero-beat plan stays valid and desirable.** "More active" must not
  become "always answers" — a silence rate of zero is the failure this release measures for.
- **`LLM_WINDOW_CHAT_CEILING` is untouched.** More beats per run means more calls per run;
  `deferred` shedding already bounds that, and a shed beat is not an error.

---

## 5. Verification

- `npm test` (unit) and `npm run typecheck` — the gate.
- `npm run smoke` — one live call: the reading is no longer empty.
- `npm run smoke -- --chat` — the blind read. If you cannot tell who is who, it is not done.

## 6. Rollback

One commit. `thinking:{type:'disabled'}` reverts independently of the chat constants.

---

## 7. Measured: raising the beat count degraded Margaret's voice, and the fix is in the prompt

**This was not predicted and it is the most useful thing this task learned.** With the caps
raised and rule 1 rewritten, two NEW check failures appeared across two consecutive
`npm run smoke -- --chat` runs, both Margaret and both about register:

```
FAIL  [en] CONTRACTIONS: margaret used some          (runs 1 and 2)
FAIL  [id] CROSSOVER: margaret used "nggak", which is their own forbidden vocabulary
```

**Isolated rather than assumed.** The chat edits were stashed — keeping the adapter fix, so
the room still spoke — and the same smoke re-run. On that baseline `REGISTER` and
`SHORTNESS` failed exactly as before, and **`CONTRACTIONS` and `CROSSOVER` did not appear
at all.** So those two were caused by this change and the other two were not.

**The mechanism.** Longer runs mean Margaret answers *Adrian* far more often than she used
to, and rule 1's new guidance actively asks readers to disagree with and needle each other.
Answering a casual voice pulled her into it. This is `CLAUDE.md`'s standing warning arriving
from a direction nobody was watching: *"If the three readers ever stop being distinguishable
with the names covered, fix those paragraphs, not the code."*

**The fix is one clause in rule 1, in both locales** — a reader answering another reader
keeps their own register, named concretely (Margaret stays formal, no contractions, never
`nggak`/`gue`/`lo`). Two further runs: both clean of all three register checks.

**The generalisation worth keeping: a change to HOW MUCH the readers talk is a change to
HOW they talk, and the voice proxies are the only instrument that can see it.** Any future
move of `CHAT_MAX_BEATS_DEFAULT` needs the same before/after isolation, not just a glance
at the transcript — the transcript looked good in every one of these runs.

### The one failure left, and why it is not this card's

`FAIL [en] SHORTNESS: the shortest bubble is N words, over 6` fails on the **baseline too**,
at 8 words, and at 8 words again on the final run here. Pre-existing, unmoved by this diff,
and left alone deliberately: it is `C-D19`/`[F3-25]`'s open calibration and fixing it means
editing the voice budgets, which is a different card.
